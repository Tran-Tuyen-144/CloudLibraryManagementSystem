import { test } from "node:test";
import assert from "node:assert/strict";
import {
  knowledgeDocuments,
  syncKnowledgeLibrary,
} from "../server/knowledge.mjs";

test("knowledge sync excludes drafts and private records, withdraws sources and retries failed ingestion", async () => {
  const state = {
    settings: { version: 1, maxActiveLoans: 3 },
    knowledgeSources: [
      {
        id: "faq",
        title: "Quy định",
        content: "Nguồn đã duyệt",
        version: 1,
        approved: true,
      },
      { id: "private", content: "Không được chỉ mục", approved: false },
    ],
    books: [
      { id: "public", title: "Sách xuất bản", version: 1 },
      { id: "draft", title: "Bản nháp riêng tư", visibility: "draft" },
      { id: "archived", archived: true },
    ],
    accounts: [{ password: "never-index-this" }],
  };
  const docs = knowledgeDocuments(state);
  assert.deepEqual(
    docs.map((d) => d.id),
    ["book-public", "loan-policy", "source-faq"],
  );
  assert.ok(!JSON.stringify(docs).includes("never-index-this"));
  const objects = new Map();
  let manifest = null;
  let calls = 0;
  const tokens = [];
  let ingestionStatus = "COMPLETE";
  const repo = {
    namespace: "test",
    read: async () => structuredClone(state),
    getSecret: async () => manifest,
    putSecret: async (_pk, _sk, value) => {
      manifest = value;
    },
    storage: {
      put: async (key, value) => objects.set(key, value),
      remove: async (key) => objects.delete(key),
    },
  };
  const options = {
    mode: "aws",
    region: "ap-southeast-1",
    knowledgeBaseId: "test-kb",
    dataSourceId: "test-source",
  };
  const services = {
    start: async (input) => {
      calls++;
      tokens.push(input.clientToken);
      return { ingestionJob: { ingestionJobId: "job-" + calls } };
    },
    get: async () => ({ ingestionJob: { status: ingestionStatus } }),
  };
  assert.equal(
    (await syncKnowledgeLibrary(repo, options, services)).status,
    "submitted",
  );
  assert.equal(objects.size, 6);
  await syncKnowledgeLibrary(repo, options, services);
  assert.equal(calls, 1);
  ingestionStatus = "FAILED";
  await syncKnowledgeLibrary(repo, options, services);
  assert.equal(calls, 2);
  assert.notEqual(tokens[0], tokens[1]);
  state.knowledgeSources[0].approved = false;
  const previousManifest = manifest;
  await assert.rejects(
    syncKnowledgeLibrary(repo, options, {
      ...services,
      start: async () => {
        throw new Error("busy");
      },
    }),
  );
  assert.equal(manifest, previousManifest);
  await syncKnowledgeLibrary(repo, options, services);
  assert.equal(objects.size, 4);
  assert.equal(calls, 3);
});
