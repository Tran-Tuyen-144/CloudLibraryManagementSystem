import { ApiError } from "./client.js";
import { libraryApi } from "./libraryApi.js";

const invalid = () =>
  new ApiError(
    "invalidResponse",
    "Dữ liệu danh mục không hợp lệ.",
  );

const count = (value) =>
  Number.isInteger(value) && value >= 0;

export function mapApiBook(value) {
  if (
    !value ||
    typeof value.id !== "string" ||
    !value.id.trim() ||
    typeof value.title !== "string" ||
    !value.title.trim() ||
    typeof value.author !== "string" ||
    !value.author.trim() ||
    !count(value.totalCopies) ||
    !count(value.availableCopies) ||
    value.availableCopies > value.totalCopies ||
    (value.archived !== undefined &&
      value.archived !== false)
  ) {
    throw invalid();
  }

  for (const key of [
    "reservedCopies",
    "borrowedCopies",
  ]) {
    if (
      value[key] !== undefined &&
      !count(value[key])
    ) {
      throw invalid();
    }
  }

  if (
    value.reservedCopies !== undefined &&
    value.borrowedCopies !== undefined &&
    value.totalCopies -
      value.reservedCopies -
      value.borrowedCopies !==
      value.availableCopies
  ) {
    throw invalid();
  }

  let cover = "";

  if (
    typeof value.coverUrl === "string" &&
    value.coverUrl
  ) {
    try {
      const url = new URL(value.coverUrl);

      if (
        ["http:", "https:"].includes(url.protocol)
      ) {
        cover = url.href;
      }
    } catch {
      // Dùng bìa mặc định khi URL không hợp lệ.
    }
  }

  return {
    id: value.id,
    title: value.title,
    author: value.author,
    category:
      typeof value.category === "string"
        ? value.category
        : "",
    isbn:
      typeof value.isbn === "string"
        ? value.isbn
        : "",
    description:
      typeof value.description === "string"
        ? value.description
        : "",
    cover,
    totalCopies: value.totalCopies,
    availableCopies: value.availableCopies,
    archived: false,
  };
}

export function parseCatalogPage(payload) {
  if (
    !payload ||
    !Array.isArray(payload.data)
  ) {
    throw invalid();
  }

  if (
    payload.pagination != null &&
    (typeof payload.pagination !== "object" ||
      Array.isArray(payload.pagination))
  ) {
    throw invalid();
  }

  const cursor =
    payload.pagination?.nextCursor ?? null;

  const total =
    payload.pagination?.total ?? null;

  if (
    cursor !== null &&
    (typeof cursor !== "string" ||
      !cursor ||
      cursor.length > 4096)
  ) {
    throw invalid();
  }

  if (total !== null && !count(total)) {
    throw invalid();
  }

  const items = payload.data.map(mapApiBook);

  if (
    total !== null &&
    total < items.length
  ) {
    throw invalid();
  }

  if (
    new Set(items.map((book) => book.id)).size !==
    items.length
  ) {
    throw invalid();
  }

  return {
    items,
    nextCursor: cursor,
    total,
  };
}

export function mergeCatalogBooks(previous, next) {
  return [
    ...new Map(
      [...previous, ...next].map((book) => [
        book.id,
        book,
      ]),
    ).values(),
  ];
}

export async function fetchCatalogPage(
  query,
  { signal } = {},
) {
  const payload = await libraryApi.books.list(
    {
      q: query.q?.trim() || undefined,

      category:
        query.category === "all"
          ? undefined
          : query.category?.trim() || undefined,

      availability:
        query.availability === "all"
          ? undefined
          : query.availability,

      sort: query.sort || "title-asc",
      cursor: query.cursor || undefined,
      limit: 24,
    },
    { signal },
  );

  return parseCatalogPage(payload);
}