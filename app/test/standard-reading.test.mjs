import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { createRepository } from "../server/repository.mjs";
import { createApp } from "../server/app.mjs";
import { seedRepository } from "../server/seed.mjs";
import { config } from "../server/config.mjs";
import {
  standardEditions,
  syncStandardEditions,
} from "../server/standard-ebooks.mjs";

const options = {
  ...config,
  mode: "local",
  endpoint: "http://127.0.0.1:8010",
  table: "CloudLibraryTests",
  partition: "STANDARD#" + randomUUID(),
  localDir: path.resolve(".local/standard-test-content"),
};
const repo = createRepository(options);
let server, base, token;
const fetchImpl = globalThis.fetch;
async function api(route, { method = "GET", body, authenticated = true } = {}) {
  const response = await fetch(base + route, {
    method,
    headers: {
      ...(authenticated ? { Authorization: "Bearer " + token } : {}),
      ...(body
        ? {
            "Content-Type": "application/json",
            "Idempotency-Key": randomUUID(),
          }
        : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json() };
}
before(async () => {
  // Source reading must work with all external fetch requests blocked.
  globalThis.fetch = (url, init) => {
    assert.equal(
      new URL(url).hostname,
      "127.0.0.1",
      "reading attempted an external fetch",
    );
    return fetchImpl(url, init);
  };
  await repo.initialize();
  await seedRepository(repo, options);
  await syncStandardEditions(repo);
  server = createApp(repo, options).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
  token = (
    await api("/auth/login", {
      method: "POST",
      authenticated: false,
      body: { email: "reader@cloudlibrary.demo", password: "ReaderDemo123!" },
    })
  ).body.accessToken;
  assert.ok(token);
});
after(async () => {
  globalThis.fetch = fetchImpl;
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  repo.client.destroy();
});

test("every new edition opens its full text through the real read-access API without external networking", async () => {
  for (const expected of standardEditions()) {
    const result = await api(`/books/${expected.id}/read-access`, {
      method: "POST",
    });
    assert.equal(result.status, 200, expected.title);
    assert.equal(result.body.data.chapters.length, expected.chapters.length);
    assert.deepEqual(result.body.data.chapters, expected.chapters);
    assert.equal(result.body.data.revisionId, expected.publishedRevisionId);
    assert.equal(result.body.data.pdfUrl, "");
  }
});

test("new source API serves metadata and search, while public snapshots withhold full text", async () => {
  const first = await api("/sources/standard-ebooks", { authenticated: false });
  assert.equal(first.status, 200);
  assert.equal(first.body.pagination.total, 12);
  assert.ok(
    first.body.data.every((book) => book.hasChapters && !book.chapters),
  );
  const search = await api("/sources/standard-ebooks?q=Jane%20Austen", {
    authenticated: false,
  });
  assert.equal(search.body.data.length, 4);
  const second = await api("/sources/standard-ebooks?page=2", {
    authenticated: false,
  });
  assert.equal(
    new Set([...first.body.data, ...second.body.data].map((book) => book.id))
      .size,
    12,
  );
  const snapshot = await api("/snapshot", { authenticated: false });
  const books = snapshot.body.data.books.filter(
    (book) => book.source === "standard-ebooks",
  );
  assert.equal(books.length, 12);
  assert.ok(
    books.every((book) => book.hasChapters && book.chapters.length === 0),
  );
  assert.equal(
    (await api("/sources/gutendex", { authenticated: false })).status,
    404,
  );
  assert.equal(
    (await api("/sources/standard-ebooks?page=-1", { authenticated: false }))
      .status,
    400,
  );
  assert.equal(
    (
      await api(`/books/${books[0].id}/read-access`, {
        method: "POST",
        authenticated: false,
      })
    ).status,
    401,
  );
});

test("new editions use the existing revision-bound reading progress flow", async () => {
  const book = standardEditions()[0];
  const saved = await api(`/me/progress/${book.id}`, {
    method: "PUT",
    body: {
      mode: "text",
      page: 1,
      chapterId: book.chapters[2].id,
      textScroll: 0.3,
      revisionId: book.publishedRevisionId,
    },
  });
  assert.equal(saved.status, 200);
  const progress = await api(`/me/progress/${book.id}`);
  assert.equal(progress.body.data.chapterId, book.chapters[2].id);
  assert.equal(progress.body.data.textScroll, 0.3);
  assert.equal((await syncStandardEditions(repo)).imported, 0);
  assert.equal(
    (await api(`/me/progress/${book.id}`)).body.data.chapterId,
    book.chapters[2].id,
  );
});
