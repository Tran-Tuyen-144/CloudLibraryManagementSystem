import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createBooksApi } from "../scripts/books-api.mjs";
import { bundledBooks } from "../server/data/standard-ebooks/books.mjs";

let server, base;
before(async () => {
  server = createBooksApi().listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

test("standalone books API lists and searches the public book bundle without a database", async () => {
  const health = await (await fetch(base + "/api/v1/health")).json();
  assert.equal(health.database, false);
  assert.equal(health.mode, "books-api-test");
  assert.equal(health.progressSaved, false);
  const list = await (await fetch(base + "/api/v1/books")).json();
  assert.equal(list.total, 12);
  assert.ok(list.data.every((book) => !book.chapters && book.chapterCount > 0));
  const search = await (
    await fetch(base + "/api/v1/books?q=Jane%20Austen")
  ).json();
  assert.equal(search.total, 4);
});

test("every bundled book exposes its full first and final chapter via the test API", async () => {
  for (const book of bundledBooks) {
    const details = await (
      await fetch(base + "/api/v1/books/" + book.id)
    ).json();
    assert.equal(details.data.chapters.length, book.chapters.length);
    for (const index of [0, book.chapters.length - 1]) {
      const result = await (
        await fetch(base + details.data.chapters[index].href)
      ).json();
      assert.equal(result.data.content, book.chapters[index].content);
      assert.equal(result.data.bookId, book.id);
    }
  }
});

test("preview page, formatter and covers are served as local assets", async () => {
  const page = await fetch(base);
  assert.match(page.headers.get("content-type"), /text\/html/);
  assert.ok((await page.text()).includes("Không dùng database"));
  const formatter = await fetch(base + "/assets/book-description.js");
  assert.match(formatter.headers.get("content-type"), /javascript/);
  for (const book of bundledBooks) {
    const cover = await fetch(base + book.cover);
    assert.equal(cover.status, 200);
    assert.match(cover.headers.get("content-type"), /^image\/jpeg/);
  }
});

test("test API is read only, restricts static files, and rejects missing book/chapter ids", async () => {
  assert.equal(
    (await fetch(base + "/api/v1/books", { method: "POST" })).status,
    405,
  );
  assert.equal(
    (await fetch(base + "/api/v1/books?q=" + "x".repeat(121))).status,
    400,
  );
  assert.equal((await fetch(base + "/api/v1/books/missing")).status, 404);
  assert.equal(
    (
      await fetch(
        base + "/api/v1/books/" + bundledBooks[0].id + "/chapters/missing",
      )
    ).status,
    404,
  );
  assert.equal((await fetch(base + "/server/config.mjs")).status, 404);
  assert.equal(
    (await fetch(base + "/covers/standard-ebooks/missing.jpg")).status,
    404,
  );
});
