export const CHAPTER_LIMITS = Object.freeze({
  count: 100,
  title: 160,
  content: 50000,
  total: 500000,
});

export function safeCoverUrl(value) {
  if (typeof value !== "string" || !value.trim()) return "";

  try {
    const url = new URL(value.trim());

    return ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      value.trim().length <= 2000
      ? url.href
      : "";
  } catch {
    return "";
  }
}

export function manuscriptContent(input, { publishing = false } = {}) {
  const cover = String(input.cover ?? "").trim();
  const pdfUrl = String(input.pdfUrl ?? "").trim();

  if (cover && !safeCoverUrl(cover)) {
    return { ok: false, error: "invalidCover" };
  }

  if (pdfUrl) {
    try {
      const url = new URL(pdfUrl);

      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        pdfUrl.length > 1000
      ) {
        throw new Error("invalidUrl");
      }
    } catch {
      return { ok: false, error: "invalidUrl" };
    }
  }

  const rows = input.chapters ?? [];

  if (!Array.isArray(rows) || rows.length > CHAPTER_LIMITS.count) {
    return { ok: false, error: "invalidChapters" };
  }

  const chapters = [];
  const ids = new Set();

  let total = 0;

  for (const [index, row] of rows.entries()) {
    if (
      !row ||
      typeof row !== "object" ||
      typeof row.title !== "string" ||
      typeof row.content !== "string"
    ) {
      return { ok: false, error: "invalidChapters" };
    }

    const id =
      typeof row.id === "string" && row.id.trim()
        ? row.id.trim()
        : `chapter-${index + 1}`;

    const title = row.title.trim();
    const content = row.content.replace(/\r\n?/g, "\n").trim();

    total += content.length;

    if (
      id.length > 160 ||
      ids.has(id) ||
      title.length > CHAPTER_LIMITS.title ||
      content.length > CHAPTER_LIMITS.content ||
      total > CHAPTER_LIMITS.total
    ) {
      return { ok: false, error: "invalidChapters" };
    }

    if (publishing && (!title || !content)) {
      return { ok: false, error: "incompleteChapters" };
    }

    ids.add(id);
    chapters.push({ id, title, content });
  }

  if (publishing && !pdfUrl && !chapters.length) {
    return { ok: false, error: "incompleteManuscript" };
  }

  return { ok: true, cover, pdfUrl, chapters };
}

export function moveManuscriptChapter(chapters, id, direction) {
  const index = chapters.findIndex((chapter) => chapter.id === id);
  const target = index + direction;

  if (
    ![-1, 1].includes(direction) ||
    index < 0 ||
    target < 0 ||
    target >= chapters.length
  ) {
    return chapters;
  }

  const next = [...chapters];

  [next[index], next[target]] = [next[target], next[index]];

  return next;
}

export function manuscriptPreviewBook(item) {
  return {
    id: `preview:${item.id || item.editorKey || "new"}`,
    title: item.title || "",
    author: item.authorName || "",
    category: item.category || "",
    description: item.description || "",
    cover: safeCoverUrl(item.cover),
    pdfUrl: item.pdfUrl || "",
    chapters: Array.isArray(item.chapters) ? item.chapters : [],
    availableCopies: 0,
  };
}