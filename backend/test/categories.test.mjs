import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyState } from "../server/repository.mjs";
import {
  executeLibraryCommand,
  projectState,
  catalog,
} from "../server/library.mjs";

test("dynamic categories normalize names, propagate renames and preserve references when merged", async () => {
  let state = emptyState();
  state.accounts.push({
    id: "admin",
    email: "admin@example.invalid",
    role: "admin",
    status: "active",
  });
  const write = async (command, input) => {
    const next = await executeLibraryCommand(state, "admin", command, input);
    state = next.state;
    return next;
  };
  await write("category.create", { name: "Điện toán mới" });
  const original = state.categories[0];
  await assert.rejects(
    write("category.create", { name: "dien TOAN moi" }),
    (e) => e.code === "duplicateCategory",
  );
  state.books.push({
    id: "category-book",
    title: "Sách thử thể loại",
    author: "Tác giả",
    category: original.name,
    visibility: "published",
    availableCopies: 1,
  });
  await write("category.update", {
    id: original.id,
    expectedName: original.name,
    name: "Kiến thức nền",
  });
  assert.equal(projectState(state, null).categories[0].name, "Kiến thức nền");
  assert.equal(catalog(state, { category: "Kiến thức nền" }).total, 1);
  await assert.rejects(
    write("category.delete", {
      id: original.id,
      expectedName: "Kiến thức nền",
    }),
    (e) => e.code === "categoryInUse",
  );
  await write("category.create", { name: "Tổng hợp" });
  const replacement = state.categories.find((c) => c.name === "Tổng hợp");
  await write("category.delete", {
    id: original.id,
    expectedName: "Kiến thức nền",
    replacementId: replacement.id,
  });
  assert.equal(state.books[0].category, "Tổng hợp");
  assert.equal(state.categories.length, 1);
});
