import { randomUUID } from "node:crypto";
import {
  allLoans,
  executeLibraryCommand,
  projectState,
  requireActor,
} from "./library.mjs";
import { ensure } from "./errors.mjs";
import { PERMISSIONS as P } from "../src/data/libraryPermissions.js";
import { libraryReport } from "../src/data/libraryReports.js";
import {
  validateDraftUpload,
  validateApplicationEvidence,
} from "./uploads.mjs";

// These REST routes and the UI command endpoint use the same server-side rules.
export function installRestRoutes(app, repo, actorFor) {
  const route = (method, path, handler) =>
    app[method]("/api/v1" + path, (req, res, next) =>
      Promise.resolve(handler(req, res)).catch(next),
    );
  async function stateFor(req, permission) {
    const actor = await actorFor(req);
    const state = await repo.read();
    requireActor(state, actor.id, permission);
    return { actor, state };
  }
  async function write(req, res, command, input) {
    const actor = await actorFor(req);
    if (command === "draft.save") await validateDraftUpload(repo, actor, input);
    if (command === "application.submit")
      await validateApplicationEvidence(repo, actor, input);
    const key = req.get("Idempotency-Key");
    ensure(key, "invalidRequest", "Thiếu Idempotency-Key.");
    const outcome = await repo.mutate(
      actor.id,
      key,
      { command, input },
      (state) => executeLibraryCommand(state, actor.id, command, input),
    );
    res.json({
      ...outcome.result,
      version: outcome.state.version,
      replayed: Boolean(outcome.replayed),
    });
  }
  route("get", "/me/loans", async (req, res) => {
    const { actor, state } = await stateFor(req);
    res.json({
      items: allLoans(state).filter((l) => l.readerEmail === actor.email),
      nextCursor: null,
    });
  });
  route("get", "/management/loans", async (req, res) => {
    const { state } = await stateFor(req, P.LOANS_READ);
    let items = allLoans(state);
    if (req.query.status)
      items = items.filter((l) => l.status === req.query.status);
    res.json({ items, nextCursor: null });
  });
  route("get", "/loans/:id", async (req, res) => {
    const { actor, state } = await stateFor(req);
    const loan = allLoans(state).find((l) => l.id === req.params.id);
    ensure(
      loan &&
        (loan.readerEmail === actor.email ||
          ["admin", "librarian"].includes(actor.role)),
      "notFound",
      "Không tìm thấy phiếu mượn.",
      404,
    );
    res.json({ data: loan });
  });
  route("post", "/loans", async (req, res) =>
    write(req, res, "loan.create", req.body),
  );
  route("post", "/loans/:id/cancel", async (req, res) =>
    write(req, res, "loan.action", {
      ...req.body,
      id: req.params.id,
      action: "cancel",
      version: req.body.expectedVersion ?? req.body.version,
    }),
  );
  route("post", "/management/loans/:id/:action", async (req, res) =>
    write(req, res, "loan.action", {
      ...req.body,
      id: req.params.id,
      action: req.params.action,
      version: req.body.expectedVersion ?? req.body.version,
    }),
  );
  route("patch", "/me", async (req, res) =>
    write(req, res, "profile.update", req.body),
  );
  route("get", "/me/favorites", async (req, res) => {
    const { actor, state } = await stateFor(req);
    const ids = state.favoriteIdsByEmail[actor.email] || [];
    res.json({
      items: projectState(state, actor).books.filter((b) => ids.includes(b.id)),
      nextCursor: null,
    });
  });
  route("put", "/me/favorites/:id", async (req, res) =>
    write(req, res, "favorite.toggle", {
      id: req.params.id,
      ensureSaved: true,
    }),
  );
  route("delete", "/me/favorites/:id", async (req, res) =>
    write(req, res, "favorite.remove", { id: req.params.id }),
  );
  route("post", "/author-applications", async (req, res) =>
    write(req, res, "application.submit", req.body),
  );
  route("get", "/me/author-applications", async (req, res) => {
    const { actor, state } = await stateFor(req);
    res.json({
      items: state.authorApplications.filter(
        (a) => a.readerEmail === actor.email,
      ),
    });
  });
  route("get", "/me/author-profile", async (req, res) => {
    const { actor, state } = await stateFor(req, P.AUTHOR_WORKSPACE);
    res.json({
      data: state.authorApplications.find(
        (a) => a.readerEmail === actor.email && a.status === "approved",
      ),
    });
  });
  route("patch", "/me/author-profile", async (req, res) =>
    write(req, res, "author.profile", req.body),
  );
  route("get", "/author/books", async (req, res) => {
    const { actor, state } = await stateFor(req, P.AUTHOR_WORKSPACE);
    res.json({
      items: state.authorManuscripts.filter(
        (m) => m.authorEmail === actor.email,
      ),
      nextCursor: null,
    });
  });
  route("post", "/author/books", async (req, res) =>
    write(req, res, "draft.save", req.body),
  );
  route("patch", "/author/books/:id", async (req, res) =>
    write(req, res, "draft.save", { ...req.body, id: req.params.id }),
  );
  route("post", "/author/books/:id/revisions", async (req, res) =>
    write(req, res, "draft.revise", { id: req.params.id }),
  );
  route("post", "/author/books/:id/submit", async (req, res) =>
    write(req, res, "draft.submit", { ...req.body, id: req.params.id }),
  );
  route("get", "/management/reviews", async (req, res) => {
    const { state } = await stateFor(req, P.MANUSCRIPTS_REVIEW);
    res.json({
      applications: state.authorApplications.filter(
        (a) => a.status === "pending",
      ),
      manuscripts: state.authorManuscripts.filter(
        (m) => m.status === "pending",
      ),
    });
  });
  route(
    "post",
    "/management/author-applications/:id/decision",
    async (req, res) =>
      write(req, res, "application.review", { ...req.body, id: req.params.id }),
  );
  route("post", "/management/books/:id/decision", async (req, res) =>
    write(req, res, "draft.review", { ...req.body, id: req.params.id }),
  );
  route("post", "/management/books", async (req, res) =>
    write(req, res, "book.save", req.body),
  );
  route("patch", "/management/books/:id", async (req, res) =>
    write(req, res, "book.save", { ...req.body, id: req.params.id }),
  );
  route("post", "/management/categories", async (req, res) =>
    write(req, res, "category.create", req.body),
  );
  route("patch", "/management/categories/:id", async (req, res) =>
    write(req, res, "category.update", { ...req.body, id: req.params.id }),
  );
  route("get", "/management/settings", async (req, res) => {
    const { state } = await stateFor(req, P.SETTINGS_MANAGE);
    res.json({ data: state.settings });
  });
  route("put", "/management/settings", async (req, res) =>
    write(req, res, "settings.save", req.body),
  );
  route("get", "/management/statistics", async (req, res) => {
    const { state } = await stateFor(req, P.DASHBOARD);
    res.json({ data: libraryReport(state, req.query) });
  });
  route("get", "/management/activity-logs", async (req, res) => {
    const { state } = await stateFor(req, P.AUDIT_ALL);
    res.json({ items: state.auditLogs, nextCursor: null });
  });
  route("post", "/chat/sessions", async (req, res) => {
    const actor = await actorFor(req);
    const id = randomUUID();
    const saved = await repo.mutate(
      actor.id,
      req.get("Idempotency-Key"),
      { action: "chat.create", title: req.body.title || "" },
      (state) => {
        state.chatSessions.push({
          id,
          userId: actor.id,
          title: String(req.body.title || "Hội thoại mới").slice(0, 80),
          messages: [],
          createdAt: new Date().toISOString(),
        });
        return { state, result: { id } };
      },
    );
    res.json(saved.result);
  });
  route("get", "/chat/sessions/:id/messages", async (req, res) => {
    const { actor, state } = await stateFor(req);
    const chat = state.chatSessions.find(
      (c) => c.id === req.params.id && c.userId === actor.id,
    );
    ensure(chat, "notFound", "Không tìm thấy hội thoại.", 404);
    res.json({ items: chat.messages, nextCursor: null });
  });
}
