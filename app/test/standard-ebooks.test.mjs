import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  standardEditions,
  standardCatalog,
  syncStandardEditions,
} from "../server/standard-ebooks.mjs";
import manifest from "../server/data/standard-ebooks/manifest.json" with { type: "json" };
import { emptyState } from "../server/repository.mjs";
import { bundledBooks } from "../server/data/standard-ebooks/books.mjs";

test("refreshing the source timestamp does not invalidate an unchanged reading revision", () => {
  const revision = standardEditions()[0].publishedRevisionId;
  const original = bundledBooks[0].sourceFetchedAt;
  try {
    bundledBooks[0].sourceFetchedAt = "2026-11-22T00:00:00Z";
    assert.equal(standardEditions()[0].publishedRevisionId, revision);
  } finally {
    bundledBooks[0].sourceFetchedAt = original;
  }
});

test("all 12 editions contain complete ordered text and verified cover bytes from the new source", async () => {
  const books = standardEditions();
  assert.equal(books.length, 12);
  assert.equal(
    books.reduce((sum, book) => sum + book.chapters.length, 0),
    447,
  );
  for (const entry of manifest.books) {
    const book = books.find((item) => item.id === entry.id);
    const bytes = await readFile(
      new URL("../server/data/standard-ebooks/" + entry.file, import.meta.url),
    );
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      entry.sha256,
    );
    assert.equal(book.chapters.length, entry.spineFiles.length);
    assert.equal(
      new Set(book.chapters.map((chapter) => chapter.id)).size,
      book.chapters.length,
    );
    assert.ok(
      book.chapters.reduce((sum, chapter) => sum + chapter.content.length, 0) >
        50000,
    );
    assert.equal(book.totalCopies, 0);
    assert.equal(book.source, "standard-ebooks");
    assert.equal(book.sourceLicense, "CC0-1.0");
    assert.ok(
      book.sourceRepository.startsWith("https://github.com/standardebooks/"),
    );
    const cover = await readFile(
      new URL("../public" + book.cover, import.meta.url),
    );
    assert.equal(
      createHash("sha256").update(cover).digest("hex"),
      entry.coverSha256,
    );
    assert.deepEqual([...cover.subarray(0, 3)], [255, 216, 255]);
    for (const [index, chapter] of book.chapters.entries()) {
      assert.equal(chapter.content.length, entry.spineFiles[index].characters);
      assert.ok(!chapter.content.includes("<html"));
    }
  }
});

test("new catalog searches only readable books, paginates without duplicates and excludes drafts", () => {
  const state = emptyState();
  state.books = standardEditions();
  const first = standardCatalog(state),
    second = standardCatalog(state, { page: "2" });
  assert.equal(first.pagination.total, 12);
  assert.equal(first.data.length, 6);
  assert.equal(first.pagination.hasNext, true);
  assert.equal(second.pagination.hasNext, false);
  assert.equal(
    new Set([...first.data, ...second.data].map((book) => book.id)).size,
    12,
  );
  assert.ok(first.data.every((book) => book.hasChapters && !book.chapters));
  assert.equal(standardCatalog(state, { q: "Jane Austen" }).data.length, 4);
  assert.equal(standardCatalog(state, { q: "not-found-1234" }).data.length, 0);
  state.books[0].chapters[0].content = "";
  state.books[1].visibility = "draft";
  state.books[2].archived = true;
  assert.equal(standardCatalog(state).pagination.total, 9);
  for (const query of [
    { page: "-1" },
    { page: "2.5" },
    { q: "x".repeat(121) },
    { q: [] },
  ]) {
    assert.throws(() => standardCatalog(state, query), {
      code: "invalidQuery",
    });
  }
});

test("sync is repeatable and preserves user books, favorites and existing library choices", async () => {
  let state = emptyState(),
    mutations = 0;
  const oldEdition = standardEditions()[0];
  state.books = [
    { id: "private-existing-book", title: "Existing" },
    {
      ...oldEdition,
      sourceContentHash: "outdated",
      viewCount: 7,
      archived: true,
      totalCopies: 2,
      availableCopies: 1,
    },
  ];
  state.favoriteIdsByEmail = {
    "reader@example.invalid": ["private-existing-book"],
  };
  const repo = {
    read: async () => structuredClone(state),
    mutate: async (_actor, _key, _payload, transform) => {
      mutations++;
      const result = transform(structuredClone(state));
      state = result.state;
      return result;
    },
  };
  assert.equal((await syncStandardEditions(repo)).imported, 12);
  assert.equal(state.books.length, 13);
  assert.equal(
    state.books.find((book) => book.id === oldEdition.id).viewCount,
    7,
  );
  assert.equal(
    state.books.find((book) => book.id === oldEdition.id).archived,
    true,
  );
  assert.equal(
    state.books.find((book) => book.id === oldEdition.id).availableCopies,
    1,
  );
  assert.deepEqual(state.favoriteIdsByEmail["reader@example.invalid"], [
    "private-existing-book",
  ]);
  assert.equal((await syncStandardEditions(repo)).imported, 0);
  assert.equal(mutations, 1);
});
