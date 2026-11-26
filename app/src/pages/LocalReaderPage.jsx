import { useEffect, useState } from "react";
import ReaderPage from "./ReaderPage";
import { useUiSettings } from "../ui/settings.js";
import { request } from "../api/runtime.js";
export default function ServerReaderPage({ book, user, onBack }) {
  const { language } = useUiSettings();
  const [content, setContent] = useState(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    request(`/books/${encodeURIComponent(book.id)}/read-access`, { method: "POST", signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setContent(result.data); })
      .catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [book.id, attempt]);
  if (!content) return <section className="online-reader"><h2>{book.title}</h2>
    <p role="status">{error || (language === "en" ? "Loading protected content…" : "Đang tải nội dung được bảo vệ…")}</p>
    {error && <button className="online-reader-button" onClick={() => { setError(""); setAttempt(n => n + 1); }}>{language === "en" ? "Retry" : "Thử lại"}</button>}
    <button className="online-reader-button" onClick={onBack}>{language === "en" ? "Back" : "Quay lại"}</button>
  </section>;
  return <ReaderPage book={content} user={user} onBack={onBack} />;
}
