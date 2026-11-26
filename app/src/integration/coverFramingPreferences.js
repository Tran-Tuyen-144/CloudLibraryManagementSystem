import { normalizeCoverFraming } from "../data/coverFraming.js";

// Display preferences only. Business data and the original private-file URL
// remain server-owned; no signed URL/path or backend schema is rewritten.
const KEY = "cloudlibrary:cover-framing:ui:v1";
function readPreferences() {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || "{}");
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  } catch {
    return {};
  }
}
export function rememberDraftFraming(id, frame) {
  if (!id || !frame) return;
  const entries = Object.entries({
    ...readPreferences(),
    [id]: normalizeCoverFraming(frame),
  }).slice(-500);
  localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(entries)));
}
export function decorateCoverFraming(data) {
  const preferences = readPreferences();
  const decorate = (row, id) => {
    const frame = row.coverFraming || preferences[id];
    return frame ? { ...row, coverFraming: normalizeCoverFraming(frame) } : row;
  };
  return {
    ...data,
    books: (data.books || []).map((row) => decorate(row, row.manuscriptId)),
    authorManuscripts: (data.authorManuscripts || []).map((row) =>
      decorate(row, row.id),
    ),
  };
}
