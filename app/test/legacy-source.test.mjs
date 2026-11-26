import { test } from "node:test";
import assert from "node:assert/strict";
import { legacyTextBook } from "../server/legacy-source.mjs";
test("legacy text preserves source metadata and stable revisions without inventing physical inventory", () => {
  const text =
    "Title: Existing title\nAuthor: Existing author\n\n" +
    "A paragraph from the existing file.\n\n".repeat(2200);
  const book = legacyTextBook("BOOK_PG_1661", text);
  assert.equal(book.title, "Existing title");
  assert.equal(book.author, "Existing author");
  assert.equal(book.totalCopies, 0);
  assert.ok(book.chapters.length > 1);
  assert.equal(
    book.publishedRevisionId,
    legacyTextBook("BOOK_PG_1661", text).publishedRevisionId,
  );
});
