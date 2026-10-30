export function readerPdfUrl(
  value,
  base = globalThis.location?.href || "http://localhost/",
) {
  if (typeof value !== "string" || !value.trim()) return "";

  try {
    const url = new URL(value.trim(), base);

    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password
    ) {
      return "";
    }

    url.hash = "";

    return url.href;
  } catch {
    return "";
  }
}

export function readerChapters(book) {
  const seen = new Set();

  return (Array.isArray(book?.chapters) ? book.chapters : []).flatMap(
    (chapter, index) => {
      if (
        !chapter ||
        typeof chapter.content !== "string" ||
        !chapter.content.trim()
      ) {
        return [];
      }

      let id =
        typeof chapter.id === "string" && chapter.id.trim()
          ? chapter.id.trim()
          : `chapter-${index + 1}`;

      const baseId = id;
      let suffix = 1;

      while (seen.has(id)) {
        id = `${baseId}-${index + 1}-${suffix++}`;
      }

      seen.add(id);

      return [
        {
          id,
          title: typeof chapter.title === "string" ? chapter.title.trim() : "",
          content: chapter.content.replace(/\r\n?/g, "\n").trim(),
        },
      ];
    },
  );
}

export function canReadBook(book) {
  return Boolean(readerPdfUrl(book?.pdfUrl) || readerChapters(book).length);
}

export function readerStorageKey(email, bookId) {
  return `cloudlibrary:reading:${encodeURIComponent(email.trim().toLowerCase())}:${encodeURIComponent(bookId)}:v1`;
}

export const clampReaderNumber = (value, min, max, fallback) => {
  const number = Number(value);

  return Number.isFinite(number)
    ? Math.min(max, Math.max(min, number))
    : fallback;
};

export function normalizeReaderSettings(value, theme = "dark") {
  const source = value && typeof value === "object" ? value : {};

  return {
    turning: ["buttons", "swipe", "scroll"].includes(source.turning)
      ? source.turning
      : "buttons",

    font: ["serif", "sans", "mono"].includes(source.font)
      ? source.font
      : "serif",

    fontSize: Math.round(clampReaderNumber(source.fontSize, 14, 30, 18)),

    lineHeight: clampReaderNumber(source.lineHeight, 1.4, 2.2, 1.8),

    pageTheme: ["light", "sepia", "dark"].includes(source.pageTheme)
      ? source.pageTheme
      : theme === "dark"
        ? "dark"
        : "sepia",

    width: ["comfortable", "wide"].includes(source.width)
      ? source.width
      : "comfortable",
  };
}

export function readerSwipeDirection(start, end) {
  if (!start || !end || end.time - start.time > 1200) return 0;

  const dx = end.x - start.x;
  const dy = end.y - start.y;

  return Math.abs(dx) >= 60 && Math.abs(dx) > Math.abs(dy) * 1.8
    ? dx < 0
      ? 1
      : -1
    : 0;
}

export function normalizeReaderBookmark(value, chapters = [], hasPdf = true) {
  const source = value && typeof value === "object" ? value : {};
  const matching = chapters.find((chapter) => chapter.id === source.chapterId);
  const chapter = matching || chapters[0];

  return {
    mode: !hasPdf || source.mode === "text" ? "text" : "pdf",

    page: Math.floor(clampReaderNumber(source.page, 1, 100000, 1)),

    chapterId: chapter?.id || null,

    textScroll:
      chapters.length && !matching
        ? 0
        : clampReaderNumber(source.textScroll, 0, 1, 0),

    updatedAt:
      typeof source.updatedAt === "string" &&
      Number.isFinite(Date.parse(source.updatedAt))
        ? source.updatedAt
        : null,
  };
}

export function readerUnitKey(bookmark, hasChapters) {
  return bookmark.mode === "text" && hasChapters
    ? `text:chapter:${bookmark.chapterId}`
    : `${bookmark.mode}:page:${bookmark.page}`;
}

export function pdfTextParagraphs(items = []) {
  let text = "";

  for (const item of items) {
    if (typeof item.str !== "string") continue;

    text += item.str + (item.hasEOL ? "\n" : " ");
  }

  return text
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}