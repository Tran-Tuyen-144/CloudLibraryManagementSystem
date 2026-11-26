import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { createRepository } from "../server/repository.mjs";
import { createApp } from "../server/app.mjs";
import { seedRepository } from "../server/seed.mjs";
import { config } from "../server/config.mjs";
import { runReminders } from "../server/workers.mjs";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { readFile } from "node:fs/promises";
import { businessDay, fineAmount } from "../server/errors.mjs";
import { processAudio } from "../server/audio.mjs";
import { promoteReservation, available } from "../server/library.mjs";

const options = {
  ...config,
  mode: "local",
  endpoint: "http://127.0.0.1:8010",
  table: "CloudLibraryTests",
  partition: "TEST#" + randomUUID(),
  localDir: path.resolve(".local/test-content"),
};
const repo = createRepository(options);
let server, base;
const tokens = {};
async function api(route, { token, method = "GET", body, key, ...rest } = {}) {
  const response = await fetch(base + route, {
    method,
    headers: {
      ...(token
        ? { Authorization: `Bearer ${token}` }
        : { Accept: "application/json" }),
      ...(body !== undefined && !(body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    body:
      body === undefined
        ? undefined
        : body instanceof FormData
          ? body
          : JSON.stringify(body),
    ...rest,
  });
  const type = response.headers.get("content-type");
  return {
    status: response.status,
    data: type?.includes("json")
      ? await response.json()
      : await response.arrayBuffer(),
    headers: response.headers,
  };
}
async function command(who, command, input, key = randomUUID()) {
  return api("/commands", {
    token: tokens[who],
    method: "POST",
    body: { command, input },
    key,
  });
}
async function snapshot(who) {
  return (await api("/snapshot", { token: tokens[who] })).data.data;
}
async function newReader(label) {
  const result = await api("/auth/register", {
    method: "POST",
    body: {
      email: `${label}-${randomUUID()}@example.invalid`,
      password: "ReaderTest123!",
      fullName: label,
      role: "admin",
    },
  });
  assert.equal(result.status, 200);
  tokens[label] = result.data.accessToken;
  return result.data.user;
}
before(async () => {
  await repo.initialize();
  await seedRepository(repo, options);
  server = createApp(repo, options).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
  for (const [name, email, password] of [
    ["admin", "admin@cloudlibrary.demo", "AdminDemo123!"],
    ["staff", "librarian@cloudlibrary.demo", "LibraryDemo123!"],
    ["reader", "reader@cloudlibrary.demo", "ReaderDemo123!"],
    ["author", "author@cloudlibrary.demo", "AuthorDemo123!"],
  ]) {
    const result = await api("/auth/login", {
      method: "POST",
      body: { email, password },
    });
    assert.equal(result.status, 200, JSON.stringify(result.data));
    tokens[name] = result.data.accessToken;
  }
});
after(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
  repo.client.destroy();
});

test("public snapshot exposes metadata only, and content requires authentication", async () => {
  const result = await api("/snapshot");
  assert.equal(result.status, 200);
  assert.equal(result.data.data.accounts.length, 0);
  assert.equal(result.data.data.books[0].chapters.length, 0);
  assert.equal(result.data.data.authorApplications.length, 0);
  assert.equal((await api("/books/library-guide/content")).status, 401);
  const read = await api("/books/library-guide/read-access", {
    method: "POST",
    token: tokens.reader,
  });
  assert.equal(read.status, 200);
  assert.ok(read.data.data.chapters.length > 0);
  const pdf = await api("/books/library-guide/content", {
    token: tokens.reader,
    headers: { Authorization: `Bearer ${tokens.reader}`, Range: "bytes=0-20" },
  });
  assert.equal(pdf.status, 206);
  assert.equal(Buffer.from(pdf.data).subarray(0, 5).toString(), "%PDF-");
});
test("registration cannot request admin and reader/staff cannot call administrative commands", async () => {
  const user = await newReader("roles");
  assert.equal(user.role, "reader");
  assert.equal(
    (
      await command("reader", "knowledge.save", {
        title: "Test",
        content: "A sufficiently long source text.",
        approved: true,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await command("staff", "application.review", {
        id: "anything",
        decision: "approve",
      })
    ).status,
    403,
  );
  const state = await snapshot("staff");
  assert.equal(state.auditLogs.length, 0);
  assert.equal(state.authorApplications.length, 0);
});
test("catalog search, format and cursor retain all matching books", async () => {
  const result = await api("/books?q=dien%20toan&limit=1");
  assert.equal(result.status, 200);
  assert.equal(result.data.items[0].id, "aws-foundations");
  const first = (await api("/books?limit=1")).data;
  assert.ok(first.nextCursor);
  const second = (
    await api("/books?limit=1&cursor=" + encodeURIComponent(first.nextCursor))
  ).data;
  assert.notEqual(first.items[0].id, second.items[0].id);
  assert.equal(
    (await api("/books?format=pdf")).data.items.some(
      (b) => b.id === "library-guide",
    ),
    true,
  );
  assert.equal(
    (await api("/books?q=other&cursor=" + encodeURIComponent(first.nextCursor)))
      .status,
    422,
  );
});
test("two simultaneous approvals for the final copy reserve it only once", async () => {
  await newReader("raceA");
  await newReader("raceB");
  const a = await command("raceA", "loan.create", { bookId: "data-design" });
  const b = await command("raceB", "loan.create", { bookId: "data-design" });
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  const results = await Promise.all([
    command("staff", "loan.action", {
      id: a.data.record.id,
      version: 1,
      action: "approve",
    }),
    command("staff", "loan.action", {
      id: b.data.record.id,
      version: 1,
      action: "approve",
    }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  const data = await snapshot("admin");
  const active = Object.values(data.requestsByEmail)
    .flat()
    .filter((l) => l.bookId === "data-design" && l.status === "approved");
  assert.equal(active.length, 1);
});
test("loan duplicate guard, handover, return replay, and counters remain consistent", async () => {
  const created = await command("reader", "loan.create", {
    bookId: "library-guide",
  });
  assert.equal(created.status, 200);
  const id = created.data.record.id;
  assert.equal(
    (await command("reader", "loan.create", { bookId: "library-guide" }))
      .status,
    409,
  );
  assert.equal(
    (
      await command("staff", "loan.action", {
        id,
        version: 1,
        action: "approve",
      })
    ).status,
    200,
  );
  const handover = await command("staff", "loan.action", {
    id,
    version: 2,
    action: "handover",
    dueDate: "2099-01-01",
  });
  assert.equal(handover.status, 200);
  assert.notEqual(handover.data.record.dueDate, "2099-01-01");
  const key = randomUUID();
  const returned = await command(
    "staff",
    "loan.action",
    { id, version: 3, action: "return" },
    key,
  );
  assert.equal(returned.status, 200);
  const replay = await command(
    "staff",
    "loan.action",
    { id, version: 3, action: "return" },
    key,
  );
  assert.equal(replay.status, 200);
  assert.equal(replay.data.replayed, true);
  assert.equal(
    (
      await command("staff", "loan.action", {
        id,
        version: 3,
        action: "return",
      })
    ).status,
    409,
  );
  const state = await repo.read();
  assert.equal(
    state.bookCopies.filter(
      (c) => c.bookId === "library-guide" && c.status === "available",
    ).length,
    2,
  );
});
test("idempotency rejects the same key with a changed payload", async () => {
  const key = randomUUID();
  assert.equal(
    (await command("reader", "favorite.toggle", { id: "library-guide" }, key))
      .status,
    200,
  );
  assert.equal(
    (await command("reader", "favorite.toggle", { id: "aws-foundations" }, key))
      .status,
    409,
  );
});
test("views count at most once per account and business day", async () => {
  const first = await api("/books/library-guide/views", {
    method: "POST",
    token: tokens.reader,
  });
  const second = await api("/books/library-guide/views", {
    method: "POST",
    token: tokens.reader,
  });
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(second.data.replayed, true);
  assert.equal(first.data.viewCount, second.data.viewCount);
});
test("progress is private, revision bound, and clearing history preserves progress", async () => {
  const body = {
    mode: "text",
    page: 1,
    chapterId: "guide-2",
    textScroll: 0.45,
    revisionId: "library-guide-v1",
  };
  assert.equal(
    (
      await api("/me/progress/library-guide", {
        token: tokens.reader,
        method: "PUT",
        body,
        key: randomUUID(),
      })
    ).status,
    200,
  );
  const other = await api("/me/progress/library-guide", {
    token: tokens.author,
  });
  assert.equal(other.data.data, null);
  assert.equal(
    (
      await api("/me/progress/library-guide", {
        token: tokens.reader,
        method: "PUT",
        body: { ...body, revisionId: "wrong" },
        key: randomUUID(),
      })
    ).status,
    409,
  );
  await api("/me/history", {
    token: tokens.reader,
    method: "DELETE",
    key: randomUUID(),
  });
  assert.equal(
    (await api("/me/history", { token: tokens.reader })).data.items.length,
    0,
  );
  assert.equal(
    (await api("/me/progress/library-guide", { token: tokens.reader })).data
      .data.chapterId,
    "guide-2",
  );
});
test("author publication supports rights confirmation, changes requested, revisions and old content", async () => {
  const input = {
    title: "Tác phẩm kiểm thử phiên bản",
    category: "Lập trình",
    description:
      "Giới thiệu đủ dài để gửi tác phẩm đến quản trị viên xét duyệt.",
    chapters: [
      {
        id: "ch-1",
        title: "Chương một",
        content: "Nội dung bản công khai đầu tiên.",
      },
    ],
  };
  const draft = await command("author", "draft.save", input);
  assert.equal(draft.status, 200, JSON.stringify(draft.data));
  let item = draft.data.record;
  assert.equal(
    (
      await command("author", "draft.submit", {
        id: item.id,
        expectedRevision: item.revision,
      })
    ).status,
    422,
  );
  let submit = await command("author", "draft.submit", {
    id: item.id,
    expectedRevision: item.revision,
    rightsConfirmed: true,
  });
  assert.equal(submit.status, 200);
  item = submit.data.data.authorManuscripts.find((m) => m.id === item.id);
  const published = await command("admin", "draft.review", {
    id: item.id,
    expectedRevision: item.revision,
    decision: "publish",
  });
  assert.equal(published.status, 200, JSON.stringify(published.data));
  item = published.data.data.authorManuscripts.find((m) => m.id === item.id);
  const bookId = item.publishedBookId;
  const revise = await command("author", "draft.revise", { id: item.id });
  assert.equal(revise.status, 200);
  let revision = revise.data.record;
  const edited = await command("author", "draft.save", {
    ...input,
    id: revision.id,
    expectedRevision: revision.revision,
    chapters: [
      {
        id: "ch-1",
        title: "Chương một",
        content: "Nội dung bản sửa đang chờ xét duyệt.",
      },
    ],
  });
  assert.equal(edited.status, 200);
  revision = edited.data.record;
  const stillOld = await api(
    `/books/${encodeURIComponent(bookId)}/read-access`,
    { method: "POST", token: tokens.reader },
  );
  assert.equal(
    stillOld.data.data.chapters[0].content,
    "Nội dung bản công khai đầu tiên.",
  );
  const sent = await command("author", "draft.submit", {
    id: revision.id,
    expectedRevision: revision.revision,
    rightsConfirmed: true,
  });
  revision = sent.data.data.authorManuscripts.find((m) => m.id === revision.id);
  const changes = await command("admin", "draft.review", {
    id: revision.id,
    expectedRevision: revision.revision,
    decision: "changes_requested",
    reason: "Bổ sung thêm phần kết luận.",
  });
  assert.equal(changes.status, 200);
  assert.equal(
    changes.data.data.authorManuscripts.find((m) => m.id === revision.id)
      .status,
    "changes_requested",
  );
});
test("unapproved draft identifiers do not grant another reader content access", async () => {
  const author = await snapshot("author");
  assert.ok(author.authorManuscripts.length);
  assert.equal((await snapshot("reader")).authorManuscripts.length, 0);
  const target = author.authorManuscripts.find(
    (m) => m.status === "changes_requested",
  );
  assert.equal(
    (
      await command("reader", "draft.save", {
        id: target.id,
        expectedRevision: target.revision,
      })
    ).status,
    403,
  );
});
test("blocked account is rejected even with an existing access token", async () => {
  const user = await newReader("locked");
  assert.equal(
    (
      await command("admin", "account.save", {
        email: user.email,
        fullName: user.fullName,
        role: "reader",
        status: "locked",
      })
    ).status,
    200,
  );
  assert.equal((await api("/me", { token: tokens.locked })).status, 403);
});
test("business dates use Vietnam timezone and four overdue days cost 20,000", () => {
  assert.equal(businessDay("2026-11-18T18:30:00Z"), "2026-11-19");
  assert.equal(
    fineAmount(
      {
        dueDate: "2026-10-15",
        returnedAt: "2026-10-19T04:00:00Z",
        dailyFineVnd: 5000,
      },
      {},
    ),
    20000,
  );
});

test("reservation queue holds a returned copy for the first reader and expires to the next", async () => {
  const first = await newReader("queueA");
  const second = await newReader("queueB");
  assert.equal(
    (await command("queueA", "reservation.create", { bookId: "data-design" }))
      .status,
    200,
  );
  assert.equal(
    (await command("queueB", "reservation.create", { bookId: "data-design" }))
      .status,
    200,
  );
  let state = await snapshot("admin");
  const winner = Object.values(state.requestsByEmail)
    .flat()
    .find((l) => l.bookId === "data-design" && l.status === "approved");
  assert.equal(
    (
      await command("staff", "loan.action", {
        id: winner.id,
        version: winner.version,
        action: "handover",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await command("staff", "loan.action", {
        id: winner.id,
        version: winner.version + 1,
        action: "return",
      })
    ).status,
    200,
  );
  state = await repo.read();
  assert.equal(
    state.reservations.find((r) => r.readerEmail === first.email).status,
    "ready",
  );
  assert.equal(
    state.reservations.find((r) => r.readerEmail === second.email).status,
    "waiting",
  );
  assert.equal(
    (await api("/books?q=thi%E1%BA%BFt%20k%E1%BA%BF")).data.items[0]
      .availableCopies,
    0,
  );
  await repo.mutate(
    "test",
    randomUUID(),
    { action: "expire-fixture" },
    (data) => {
      data.reservations.find((r) => r.readerEmail === first.email).expiresAt =
        new Date(Date.now() - 60000).toISOString();
      return { state: data };
    },
  );
  await runReminders(repo, options);
  state = await repo.read();
  assert.equal(
    state.reservations.find((r) => r.readerEmail === first.email).status,
    "expired",
  );
  assert.equal(
    state.reservations.find((r) => r.readerEmail === second.email).status,
    "ready",
  );
  assert.equal(
    (await command("reader", "loan.create", { bookId: "data-design" })).status,
    409,
  );
  assert.equal(
    (await command("queueB", "loan.create", { bookId: "data-design" })).status,
    200,
  );
});
test("renewal is reviewed by staff and cannot exceed the configured limit", async () => {
  await newReader("renew");
  const created = await command("renew", "loan.create", {
    bookId: "aws-foundations",
  });
  const id = created.data.record.id;
  await command("staff", "loan.action", { id, version: 1, action: "approve" });
  const handed = await command("staff", "loan.action", {
    id,
    version: 2,
    action: "handover",
  });
  const oldDue = handed.data.record.dueDate;
  assert.equal(
    (
      await command("renew", "loan.action", {
        id,
        version: 3,
        action: "renew-request",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await command("renew", "loan.action", {
        id,
        version: 4,
        action: "renew-approve",
      })
    ).status,
    403,
  );
  const renewed = await command("staff", "loan.action", {
    id,
    version: 4,
    action: "renew-approve",
  });
  assert.equal(renewed.status, 200);
  assert.equal(renewed.data.record.renewalCount, 1);
  assert.equal(
    (Date.parse(renewed.data.record.dueDate) - Date.parse(oldDue)) / 86400000,
    7,
  );
  assert.equal(
    (
      await command("renew", "loan.action", {
        id,
        version: 5,
        action: "renew-request",
      })
    ).status,
    409,
  );
});
test("reminders use an outbox and repeated ticks do not send the same reminder twice", async () => {
  await repo.mutate(
    "test",
    randomUUID(),
    { action: "overdue-fixture" },
    (state) => {
      const loan = Object.values(state.requestsByEmail)
        .flat()
        .find((l) => l.bookId === "aws-foundations" && l.status === "borrowed");
      loan.dueDate = "2020-01-01";
      return { state };
    },
  );
  const tick = new Date(Date.now() + 120000);
  await runReminders(repo, options, tick);
  await runReminders(repo, options, tick);
  const state = await repo.read();
  const reminders = state.notifications.filter((n) => n.type === "overdue");
  assert.ok(reminders.length > 0);
  assert.equal(new Set(reminders.map((n) => n.id)).size, reminders.length);
  assert.ok(reminders.every((n) => n.deliveryStatus === "local"));
});
test("chat is persisted per owner, grounded in sources and deletable without affecting other sessions", async () => {
  const id = randomUUID();
  const reply = await api(`/chat/sessions/${id}/messages`, {
    method: "POST",
    token: tokens.reader,
    body: { content: "Mượn tối đa bao nhiêu cuốn?" },
    key: randomUUID(),
  });
  assert.equal(reply.status, 200);
  assert.equal(reply.data.provider, "local-search");
  assert.ok(reply.data.sources.length > 0);
  const own = await api("/chat/sessions", { token: tokens.reader });
  assert.equal(own.data.items.find((c) => c.id === id).messages.length, 2);
  const other = await api("/chat/sessions", { token: tokens.author });
  assert.equal(
    other.data.items.some((c) => c.id === id),
    false,
  );
  assert.equal(
    (
      await api(`/chat/sessions/${id}`, {
        method: "DELETE",
        token: tokens.author,
        key: randomUUID(),
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await api(`/chat/sessions/${id}`, {
        method: "DELETE",
        token: tokens.reader,
        key: randomUUID(),
      })
    ).status,
    200,
  );
  assert.equal(
    (await api("/chat/sessions", { token: tokens.reader })).data.items.some(
      (c) => c.id === id,
    ),
    false,
  );
});
test("file upload validates PDF contents and enforces private draft ownership", async () => {
  const bad = new FormData();
  bad.append("purpose", "content");
  bad.append(
    "file",
    new File(["not a pdf"], "fake.pdf", { type: "application/pdf" }),
  );
  assert.equal(
    (await api("/uploads", { method: "POST", token: tokens.author, body: bad }))
      .status,
    422,
  );
  const form = new FormData();
  form.append("purpose", "content");
  form.append(
    "file",
    new File(
      [
        await readFile(
          new URL(
            "../server/fixtures/cloud-library-guide.pdf",
            import.meta.url,
          ),
        ),
      ],
      "guide.pdf",
      { type: "application/pdf" },
    ),
  );
  const uploaded = await api("/uploads", {
    method: "POST",
    token: tokens.author,
    body: form,
  });
  assert.equal(uploaded.status, 200);
  assert.ok(uploaded.data.complete);
  assert.equal((await api(`/files/${uploaded.data.id}`)).status, 401);
  assert.equal(
    (await api(`/files/${uploaded.data.id}`, { token: tokens.reader })).status,
    403,
  );
  assert.equal(
    (await api(`/files/${uploaded.data.id}`, { token: tokens.author })).status,
    200,
  );
});
test("reset password consumes the code and invalidates old local sessions", async () => {
  const user = await newReader("reset");
  await api("/auth/forgot", { method: "POST", body: { email: user.email } });
  const outbox = await repo.db.send(
    new QueryCommand({
      TableName: repo.table,
      KeyConditionExpression: "PK = :pk",
      ExpressionAttributeValues: { ":pk": "OUTBOX" },
    }),
  );
  const mail = outbox.Items.find((m) => m.email === user.email);
  const code = mail.text.match(/\d{6}/)[0];
  const result = await api("/auth/reset", {
    method: "POST",
    body: { email: user.email, code, password: "ChangedTest456!" },
  });
  assert.equal(result.status, 200);
  assert.equal((await api("/me", { token: tokens.reset })).status, 401);
  assert.equal(
    (
      await api("/auth/reset", {
        method: "POST",
        body: { email: user.email, code, password: "ChangedAgain789!" },
      })
    ).status,
    422,
  );
  assert.equal(
    (
      await api("/auth/login", {
        method: "POST",
        body: { email: user.email, password: "ChangedTest456!" },
      })
    ).status,
    200,
  );
});

test("REST aliases preserve permissions, favorite set semantics and chat creation idempotency", async () => {
  assert.equal(
    (await api("/management/settings", { token: tokens.staff })).status,
    403,
  );
  for (const name of [
    "book.save",
    "book.archive",
    "category.update",
    "draft.review",
    "application.review",
  ])
    assert.equal((await command("reader", name, {})).status, 403, name);
  const route = "/me/favorites/library-guide";
  const key = randomUUID();
  assert.equal(
    (await api(route, { method: "PUT", token: tokens.author, key, body: {} }))
      .status,
    200,
  );
  assert.equal(
    (await api(route, { method: "PUT", token: tokens.author, key, body: {} }))
      .data.replayed,
    true,
  );
  const favorites = await api("/me/favorites", { token: tokens.author });
  assert.equal(
    favorites.data.items.filter((b) => b.id === "library-guide").length,
    1,
  );
  assert.equal(
    (
      await api(route, {
        method: "DELETE",
        token: tokens.author,
        key: randomUUID(),
        body: {},
      })
    ).status,
    200,
  );
  const chatKey = randomUUID();
  const body = { title: "REST session" };
  const first = await api("/chat/sessions", {
    method: "POST",
    token: tokens.author,
    key: chatKey,
    body,
  });
  const again = await api("/chat/sessions", {
    method: "POST",
    token: tokens.author,
    key: chatKey,
    body,
  });
  assert.equal(first.status, 200);
  assert.equal(again.data.id, first.data.id);
  assert.equal(
    (
      await api(`/chat/sessions/${first.data.id}/messages`, {
        token: tokens.reader,
      })
    ).status,
    404,
  );
});

test("twenty parallel authenticated reads return coherent shared data", async () => {
  const responses = await Promise.all(
    Array.from({ length: 20 }, () => api("/snapshot", { token: tokens.admin })),
  );
  assert.ok(responses.every((r) => r.status === 200));
  assert.equal(new Set(responses.map((r) => r.data.data.version)).size, 1);
});

test("an expired audio worker lease is recovered and duplicate deliveries synthesize only once", async () => {
  const id = randomUUID();
  const actor = (await repo.read()).accounts.find(
    (a) => a.role === "reader" && a.status === "active",
  );
  await repo.storage.put(
    `audio/transcripts/${id}.json`,
    JSON.stringify({
      results: { transcripts: [{ transcript: "Quy định mượn sách" }] },
    }),
  );
  await repo.mutate(
    "test",
    randomUUID(),
    { action: "audio-fixture", id },
    (state) => {
      state.audioJobs.push({
        id,
        userId: actor.id,
        status: "answering",
        leaseId: "expired-worker",
        leaseExpiresAt: Date.now() - 1,
        language: "vi-VN",
        createdAt: new Date().toISOString(),
      });
      return { state };
    },
  );
  let calls = 0;
  const services = {
    transcription: async () => ({
      TranscriptionJob: { TranscriptionJobStatus: "COMPLETED" },
    }),
    answer: async () => ({
      text: "Nội quy thư viện",
      sources: [{ id: "loan-policy" }],
    }),
    speak: async () => {
      calls++;
      return "audio/output/fixture.mp3";
    },
  };
  await Promise.all([
    processAudio(repo, id, options, services),
    processAudio(repo, id, options, services),
  ]);
  const job = (await repo.read()).audioJobs.find((j) => j.id === id);
  assert.equal(job.status, "completed");
  assert.equal(calls, 1);
  assert.equal(job.transcript, "Quy định mượn sách");
  await processAudio(repo, id, options, services);
  assert.equal(calls, 1);
});

test("a book after the first catalog page has complete, private-safe public details", async () => {
  await repo.mutate(
    "test",
    randomUUID(),
    { action: "catalog-pages" },
    (state) => {
      for (let i = 0; i < 30; i++)
        state.books.push({
          id: "page-test-" + i,
          title: "ZZ sách " + String(i).padStart(2, "0"),
          author: "Tác giả",
          authorEmail: "private@example.invalid",
          category: "Hướng dẫn sử dụng",
          description: "Mô tả đầy đủ ngoài trang đầu",
          availableCopies: 1,
          totalCopies: 1,
          visibility: "published",
          pdfKey: "private/key",
          chaptersKey: "",
          chapters: [],
        });
      return { state };
    },
  );
  const detail = await api("/books/page-test-29");
  assert.equal(detail.status, 200);
  assert.equal(detail.data.data.description, "Mô tả đầy đủ ngoài trang đầu");
  assert.equal(detail.data.data.availableCopies, 1);
  assert.equal(detail.data.data.hasPdf, true);
  assert.equal(detail.data.data.pdfKey, undefined);
  assert.equal(detail.data.data.authorEmail, undefined);
  const guest = (await api("/snapshot")).data.data;
  assert.ok(
    guest.books.every(
      (b) =>
        b.pdfKey === undefined &&
        b.chaptersKey === undefined &&
        b.authorEmail === undefined,
    ),
  );
  assert.ok(guest.publicAuthors.every((a) => a.readerEmail === undefined));
});

test("hidden visibility blocks metadata, content, views, progress and new loan requests", async () => {
  await repo.mutate(
    "test",
    randomUUID(),
    { action: "hidden-fixture" },
    (state) => {
      state.books.push({
        id: "hidden-test",
        title: "Không công khai",
        visibility: "hidden",
        archived: false,
        availableCopies: 2,
        chapters: [{ id: "secret", title: "Riêng", content: "Nội dung ẩn" }],
      });
      return { state };
    },
  );
  assert.equal((await api("/books/hidden-test")).status, 404);
  assert.equal(
    (await api("/books/hidden-test/content", { token: tokens.reader })).status,
    404,
  );
  assert.equal(
    (
      await api("/books/hidden-test/read-access", {
        token: tokens.reader,
        method: "POST",
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await api("/books/hidden-test/views", {
        method: "POST",
        token: tokens.reader,
      })
    ).status,
    404,
  );
  assert.equal(
    (await command("reader", "loan.create", { bookId: "hidden-test" })).status,
    404,
  );
  assert.ok(
    !(await snapshot("reader")).books.some((b) => b.id === "hidden-test"),
  );
});

test("uploaded author evidence is owner-only and rejected applications can be resubmitted and approved", async () => {
  const user = await newReader("applicant");
  const another = await newReader("proof-visitor");
  const form = new FormData();
  form.append("purpose", "evidence");
  form.append(
    "file",
    new File(
      [
        await readFile(
          new URL(
            "../server/fixtures/cloud-library-guide.pdf",
            import.meta.url,
          ),
        ),
      ],
      "proof.pdf",
      { type: "application/pdf" },
    ),
  );
  const upload = await api("/uploads", {
    method: "POST",
    token: tokens.applicant,
    body: form,
  });
  assert.equal(upload.status, 200);
  const input = {
    fullName: "Người nộp hồ sơ",
    penName: "Bút danh thử",
    phone: "0901234567",
    bio: "Giới thiệu hợp lệ cho hồ sơ tác giả được kiểm tra kỹ.",
    confirmation: true,
    evidenceUploadId: upload.data.id,
  };
  assert.equal(
    (await command("proof-visitor", "application.submit", input)).status,
    422,
  );
  let sent = await command("applicant", "application.submit", input);
  assert.equal(sent.status, 200);
  let record = sent.data.record;
  assert.equal(
    (await api("/files/" + upload.data.id, { token: tokens["proof-visitor"] }))
      .status,
    403,
  );
  assert.equal(
    (await api("/files/" + upload.data.id, { token: tokens.admin })).status,
    200,
  );
  assert.equal(
    (
      await command("admin", "application.review", {
        id: record.id,
        expectedSubmittedAt: record.submittedAt,
        decision: "reject",
        reason: "Cần bổ sung thông tin.",
      })
    ).status,
    200,
  );
  sent = await command("applicant", "application.submit", input);
  assert.equal(sent.status, 200);
  record = sent.data.record;
  assert.equal(
    (await command("applicant", "application.submit", input)).status,
    409,
  );
  assert.equal(
    (
      await command("admin", "application.review", {
        id: record.id,
        expectedSubmittedAt: record.submittedAt,
        decision: "approve",
      })
    ).status,
    200,
  );
  assert.equal(
    (await api("/me", { token: tokens.applicant })).data.data.role,
    "author",
  );
  assert.ok(user.id && another.id);
});

test("revoked author rights block publication of a pending revision and publishing supersedes the prior version", async () => {
  const data = await snapshot("author");
  let item = data.authorManuscripts.find(
    (m) => m.status === "changes_requested",
  );
  let result = await command("author", "draft.save", {
    ...item,
    id: item.id,
    expectedRevision: item.revision,
  });
  assert.equal(result.status, 200);
  item = result.data.record;
  result = await command("author", "draft.submit", {
    id: item.id,
    expectedRevision: item.revision,
    rightsConfirmed: true,
  });
  assert.equal(result.status, 200);
  item = result.data.data.authorManuscripts.find((m) => m.id === item.id);
  const account = (await repo.read()).accounts.find(
    (a) => a.email === "author@cloudlibrary.demo",
  );
  await command("admin", "account.save", {
    email: account.email,
    fullName: account.fullName,
    status: "active",
    role: "reader",
  });
  const review = {
    id: item.id,
    expectedRevision: item.revision,
    decision: "publish",
  };
  assert.equal(
    (await command("admin", "draft.review", review)).data.error.code,
    "authorUnavailable",
  );
  await command("admin", "account.save", {
    email: account.email,
    fullName: account.fullName,
    status: "active",
    role: "author",
  });
  assert.equal((await command("admin", "draft.review", review)).status, 200);
  const revisions = (await repo.read()).revisions.filter(
    (r) => r.bookId === item.publishedBookId,
  );
  assert.equal(revisions.filter((r) => r.status === "published").length, 1);
  assert.ok(revisions.some((r) => r.status === "superseded"));
});

test("reading turning mode survives persistence and invalid policy changes are rejected", async () => {
  const book = (await repo.read()).books.find((b) => b.id === "library-guide");
  const body = {
    mode: "text",
    page: 1,
    chapterId: book.chapters[1].id,
    textScroll: 0.3,
    turning: "swipe",
    revisionId: book.publishedRevisionId || "initial",
  };
  assert.equal(
    (
      await api("/me/progress/library-guide", {
        token: tokens.reader,
        method: "PUT",
        body,
        key: randomUUID(),
      })
    ).status,
    200,
  );
  assert.equal(
    (await api("/me/progress/library-guide", { token: tokens.reader })).data
      .data.turning,
    "swipe",
  );
  const settings = (await repo.read()).settings;
  assert.equal(
    (await command("admin", "settings.save", { ...settings, holdHours: 0 }))
      .status,
    422,
  );
  assert.equal(
    (await command("admin", "settings.save", { ...settings, extensionDays: 0 }))
      .status,
    422,
  );
});

test("queue skips locked accounts instead of holding the returned copy for them", () => {
  const state = {
    accounts: [
      { email: "locked", status: "locked" },
      { email: "active", status: "active" },
    ],
    books: [{ id: "queue", visibility: "published", totalCopies: 1 }],
    settings: { holdHours: 48 },
    bookCopies: [{ id: "copy", bookId: "queue", status: "available" }],
    reservations: [
      {
        id: "first",
        bookId: "queue",
        readerEmail: "locked",
        status: "waiting",
        createdAt: "2026-01-01",
        version: 1,
      },
      {
        id: "second",
        bookId: "queue",
        readerEmail: "active",
        status: "waiting",
        createdAt: "2026-01-02",
        version: 1,
      },
    ],
    notifications: [],
    requestsByEmail: {},
  };
  promoteReservation(state, "queue");
  assert.equal(state.reservations[0].status, "cancelled");
  assert.equal(state.reservations[1].status, "ready");
  assert.equal(available(state, "queue"), 0);
});

test("administration preserves the last active admin and prevents reducing stock below held copies", async () => {
  assert.equal(
    (
      await command("admin", "account.save", {
        email: "admin@cloudlibrary.demo",
        fullName: "Admin",
        role: "reader",
        status: "active",
      })
    ).data.error.code,
    "lastAdmin",
  );
  assert.equal(
    (
      await command("admin", "account.save", {
        email: "missing-password@example.invalid",
        fullName: "New staff",
        role: "librarian",
        status: "active",
        create: true,
      })
    ).data.error.code,
    "invalidPassword",
  );
  const state = await repo.read();
  const book = state.books.find((b) => b.id === "aws-foundations");
  const result = await command("admin", "book.save", {
    ...book,
    availableCopies: 0,
    expectedVersion: book.version || 0,
  });
  assert.equal(result.status, 409);
  assert.equal(
    (await repo.read()).books.find((b) => b.id === book.id).totalCopies,
    book.totalCopies,
  );
});
