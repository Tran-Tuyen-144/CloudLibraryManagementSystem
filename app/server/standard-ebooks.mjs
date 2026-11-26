import { createHash, randomUUID } from "node:crypto";
import { bundledBooks } from "./data/standard-ebooks/books.mjs";
import manifest from "./data/standard-ebooks/manifest.json" with { type: "json" };
import { ensure, normalize, ServiceError } from "./errors.mjs";
import { isPublicBook, publicCatalogBook } from "./library.mjs";

// Full text is bundled from the public Standard Ebooks repositories. Reading
// never redirects to an external website or depends on its current uptime.
export function standardEditions() {
  return bundledBooks.map((book, index) => {
    const entry = manifest.books.find((item) => item.id === book.id);
    ensure(
      entry &&
        book.chapters.length === entry.chapterCount &&
        book.chapters.every(
          (chapter) =>
            typeof chapter.content === "string" && chapter.content.trim(),
        ) &&
        book.chapters.reduce(
          (sum, chapter) => sum + chapter.content.length,
          0,
        ) === entry.characters,
      "invalidSourceBook",
      "Bản sách Standard Ebooks chưa đủ nội dung.",
      500,
    );
    return {
      ...structuredClone(book),
      sourceOrder: index,
      sourceContentHash: entry.sha256,
      visibility: "published",
      archived: false,
      isFeatured: true,
      totalCopies: 0,
      availableCopies: 0,
      viewCount: 0,
      publishedAt: book.sourceFetchedAt,
      publishedRevisionId:
        "se-" +
        createHash("sha256")
          .update(JSON.stringify(book.chapters))
          .digest("hex")
          .slice(0, 32),
    };
  });
}

export async function syncStandardEditions(repo) {
  const editions = standardEditions();
  const before = await repo.read();
  const changed = editions.filter((book) => {
    const previous = before.books.find((old) => old.id === book.id);
    return (
      previous?.sourceContentHash !== book.sourceContentHash ||
      previous?.publishedRevisionId !== book.publishedRevisionId
    );
  });
  if (!changed.length)
    return { source: "Standard Ebooks", imported: 0, total: editions.length };
  await repo.mutate(
    "standard-ebooks-connector",
    randomUUID(),
    { action: "standard-ebooks.sync", ids: changed.map((book) => book.id) },
    (state) => {
      for (const book of changed) {
        const old = state.books.find((item) => item.id === book.id);
        const updated = {
          ...book,
          // Updating a source edition must preserve reader and librarian actions.
          viewCount: old?.viewCount ?? 0,
          archived: old?.archived ?? false,
          isFeatured: old?.isFeatured ?? true,
          publishedAt: old?.publishedAt || book.publishedAt,
          totalCopies: old?.totalCopies ?? 0,
          availableCopies: old?.availableCopies ?? 0,
        };
        state.books = [
          ...state.books.filter((item) => item.id !== book.id),
          updated,
        ];
        if (
          !state.categories.some((category) => category.name === book.category)
        ) {
          state.categories.push({
            id: "category-standard-literature",
            name: book.category,
            aliases: [],
          });
        }
      }
      return { state };
    },
  );
  return {
    source: "Standard Ebooks",
    imported: changed.length,
    total: editions.length,
  };
}

export function standardCatalog(state, query = {}) {
  if (
    (query.q !== undefined && typeof query.q !== "string") ||
    (query.page !== undefined && typeof query.page !== "string")
  ) {
    throw new ServiceError(
      "invalidQuery",
      "Thông tin tìm sách không hợp lệ.",
      400,
    );
  }
  const q = (query.q || "").trim();
  const rawPage = query.page || "1";
  if (q.length > 120 || !/^[1-9]\d{0,3}$/.test(rawPage)) {
    throw new ServiceError(
      "invalidQuery",
      "Từ khóa tối đa 120 ký tự; số trang phải là số nguyên dương.",
      400,
    );
  }
  const words = normalize(q).split(" ").filter(Boolean);
  const books = state.books
    .filter(
      (book) =>
        book.source === "standard-ebooks" &&
        isPublicBook(book) &&
        book.chapters?.length &&
        book.chapters.every((chapter) => chapter.content?.trim()) &&
        words.every((word) =>
          normalize(book.title + " " + book.author).includes(word),
        ),
    )
    .sort((a, b) => a.sourceOrder - b.sourceOrder);
  const page = Number(rawPage),
    limit = 6,
    start = (page - 1) * limit;
  return {
    data: books
      .slice(start, start + limit)
      .map((book) => publicCatalogBook(state, book)),
    pagination: {
      page,
      total: books.length,
      hasNext: start + limit < books.length,
    },
    source: { name: "Standard Ebooks", locallyAvailable: true },
  };
}
