import { normalizeReaderBookmark, readerChapters } from "../data/readerContent.js";
export function readPath(id) {
  if (typeof id !== "string" || !id || id === "." || id === "..") throw new Error("Invalid book ID");
  return `/books/${encodeURIComponent(id)}`;
}
export function readingPayload(book, record, turning) {
  const current = normalizeReaderBookmark(record,readerChapters(book),Boolean(book.localPdfUrl));
  if (typeof book.revisionId !== "string" || !book.revisionId) throw new Error("Missing revision");
  return {...current, revisionId:book.revisionId, turning};
}
export async function loadReading(api, bookId, signal) {
  const path = readPath(bookId);
  const [access,progress] = await Promise.all([api(`${path}/read-access`,{signal}),api(`/me/progress/${encodeURIComponent(bookId)}`,{signal})]);
  const book=access?.data;
  if (book?.id !== bookId || typeof book.revisionId !== "string") throw new Error("Invalid read access");
  let pdf = null;
  if (book.pdfUrl) {
    const url = new URL(book.pdfUrl, globalThis.location?.origin || "http://127.0.0.1:5173");
    if (url.origin !== (globalThis.location?.origin || "http://127.0.0.1:5173") || url.pathname !== `/api/v1${path}/content` || url.search || url.hash) throw new Error("Invalid local PDF endpoint");
    try {
      pdf=await api(`${path}/content`,{responseType:"blob",signal,timeoutMs:60000});
      if (!(pdf instanceof Blob) || pdf.type.split(";")[0] !== "application/pdf") throw new Error("Invalid PDF response");
    } catch(e) { pdf=null; if (!readerChapters(book).length || signal?.aborted) throw e; }
  }
  if (!pdf && !readerChapters(book).length) throw new Error("Không có nội dung đọc hỗ trợ trong local.");
  return {book,pdf,progress:progress?.data?.revisionId===book.revisionId?progress.data:{},settings:progress?.settings||{}};
}
