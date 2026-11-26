import { categoryKey, findCategory } from "./libraryCategories.js";

export const VIEW_COOLDOWN_MS = 30 * 60 * 1000;

export function bookViewCount(book) {
  const count = Number(book?.viewCount);

  return Number.isSafeInteger(count) && count >= 0 ? count : 0;
}

export function bookAddedTime(book) {
  for (const value of [book?.publishedAt, book?.addedAt, book?.createdAt]) {
    const time = typeof value === "string" ? Date.parse(value) : NaN;

    if (Number.isFinite(time)) return time;
  }

  return 0;
}

export function normalizeBookViewHistory(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([, rows]) => rows && typeof rows === "object" && !Array.isArray(rows),
      )
      .map(([viewer, rows]) => [
        viewer,
        Object.fromEntries(
          Object.entries(rows).filter(
            ([, time]) => Number.isFinite(time) && time > 0,
          ),
        ),
      ]),
  );
}

export function discoveryCategories(categories = [], books = []) {
  const names = [
    ...categories.map((item) => item.name),
    ...books.map((book) => book.category),
  ];

  const unique = new Map();

  for (const value of names) {
    const name =
      findCategory(categories, value)?.name || String(value || "").trim();

    if (name) {
      unique.set(categoryKey(name), name);
    }
  }

  return [...unique.values()].sort((a, b) => a.localeCompare(b, "vi"));
}

export function compareDiscoveryBooks(a, b, sort = "title-asc") {
  const title = () =>
    a.title.localeCompare(b.title, "vi") || a.id.localeCompare(b.id);

  if (sort === "newest") {
    return bookAddedTime(b) - bookAddedTime(a) || title();
  }

  if (sort === "most-viewed") {
    return (
      bookViewCount(b) - bookViewCount(a) ||
      bookAddedTime(b) - bookAddedTime(a) ||
      title()
    );
  }

  if (sort === "title-desc") {
    return b.title.localeCompare(a.title, "vi") || a.id.localeCompare(b.id);
  }

  if (sort === "author") {
    return a.author.localeCompare(b.author, "vi") || title();
  }

  return title();
}

export function recordBookView(state, bookId, viewerKey, now = Date.now()) {
  const book = state.books.find((item) => item.id === bookId && !item.archived);

  if (!book || !viewerKey || !Number.isFinite(now) || now <= 0) {
    return state;
  }

  const history = state.bookViewHistory || {};
  const previous = history[viewerKey] || {};
  const last = previous[bookId];

  if (Number.isFinite(last) && now - last < VIEW_COOLDOWN_MS) {
    return state;
  }

  return {
    ...state,

    books: state.books.map((item) =>
      item.id === bookId
        ? {
            ...item,
            viewCount: Math.min(
              Number.MAX_SAFE_INTEGER,
              bookViewCount(item) + 1,
            ),
          }
        : item,
    ),

    bookViewHistory: {
      ...history,
      [viewerKey]: {
        ...previous,
        [bookId]: now,
      },
    },
  };
}

export function recommendDiscoveryBooks(
  books,
  favoriteIds = [],
  history = {},
  categories = [],
  now = Date.now(),
) {
  const key = (book) =>
    categoryKey(findCategory(categories, book.category)?.name || book.category);

  const preferences = new Map();
  const favorites = new Set(favoriteIds);

  const add = (book, weight) => {
    const category = key(book);

    if (category) {
      preferences.set(category, (preferences.get(category) || 0) + weight);
    }
  };

  books
    .filter((book) => favorites.has(book.id))
    .forEach((book) => add(book, 3));

  books
    .filter(
      (book) =>
        Number.isFinite(history[book.id]) &&
        now - history[book.id] >= 0 &&
        now - history[book.id] < 30 * 86400000,
    )
    .sort((a, b) => history[b.id] - history[a.id])
    .slice(0, 10)
    .forEach((book) => add(book, 1));

  const unsaved = books.filter((book) => !favorites.has(book.id));

  const candidates = unsaved.length ? unsaved : books;

  const score = (book) =>
    (preferences.get(key(book)) || 0) +
    (book.availableCopies > 0 || book.pdfUrl ? 0.25 : 0);

  return [...candidates]
    .sort(
      (a, b) =>
        score(b) - score(a) || compareDiscoveryBooks(a, b, "most-viewed"),
    )
    .slice(0, 8);
}
