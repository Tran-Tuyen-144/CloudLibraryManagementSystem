import { useContext, useState } from "react";
import { ArrowRight, MoreVertical } from "lucide-react";
import { BookCover } from "./HomeSections";
import { ReadContext } from "../../ui/ReadContext";
import { useUiSettings } from "../../ui/settings";
import "./ReadingHistory.css";

const messages = {
  vi: {
    title: "Tiếp tục đọc",
    subtitle: "Tối đa 6 tài liệu có mốc đọc được lưu gần nhất.",
    page: "Trang đã lưu",
    saved: "Ngày lưu",
    resume: "Đọc tiếp",
    remove: "Xóa mốc đọc",
    more: "Tùy chọn mốc đọc",
    empty: "Chưa có mốc đọc",
    emptyHint: "Mở tài liệu, nhập số trang và bấm lưu mốc để tiếp tục từ đây.",
    removed: "Đã xóa mốc đọc.",
    failed: "Không thể xóa mốc đọc trên trình duyệt.",
    unavailable: "Chưa kết nối trình đọc",
  },

  en: {
    title: "Continue reading",
    subtitle: "Up to 6 documents with your most recently saved bookmarks.",
    page: "Saved page",
    saved: "Saved",
    resume: "Continue reading",
    remove: "Clear bookmark",
    more: "Bookmark options",
    empty: "No bookmarks yet",
    emptyHint:
      "Open a document, enter a page number and save a bookmark to continue here.",
    removed: "Bookmark cleared.",
    failed: "Could not clear this bookmark in your browser.",
    unavailable: "Reader is not connected",
  },
};

function loadBookmarks(email) {
  if (!email) return [];

  const prefix =
    "cloudlibrary:reading:" + encodeURIComponent(email.toLowerCase()) + ":";

  const records = [];

  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);

      if (!key?.startsWith(prefix) || !key.endsWith(":v1")) {
        continue;
      }

      try {
        const value = JSON.parse(localStorage.getItem(key));
        const page = Number(value?.page);
        const timestamp = Date.parse(value?.updatedAt);

        if (
          !Number.isInteger(page) ||
          page < 1 ||
          !Number.isFinite(timestamp)
        ) {
          continue;
        }

        const bookId = decodeURIComponent(key.slice(prefix.length, -3));

        records.push({
          key,
          bookId,
          page,
          timestamp,
        });
      } catch {
        continue;
      }
    }
  } catch {
    return [];
  }

  return records.sort((a, b) => b.timestamp - a.timestamp);
}

export default function ReadingHistory({ user, books = [] }) {
  const { language } = useUiSettings();
  const copy = messages[language];

  const onRead = useContext(ReadContext);

  const [records, setRecords] = useState(() => loadBookmarks(user?.email));

  const [message, setMessage] = useState("");

  if (!user) return null;

  const visibleRecords = records
    .map((record) => ({
      ...record,
      book: books.find((book) => String(book.id) === record.bookId),
    }))
    .filter(
      (record) =>
        typeof record.book?.pdfUrl === "string" && record.book.pdfUrl.trim(),
    )
    .slice(0, 6);

  function removeBookmark(key) {
    try {
      localStorage.removeItem(key);

      setRecords((current) => current.filter((record) => record.key !== key));

      setMessage("removed");
    } catch {
      setMessage("failed");
    }
  }

  return (
    <section
      className="reading-history"
      aria-labelledby="reading-history-title"
    >
      <div className="reading-history-heading">
        <h2 id="reading-history-title">{copy.title}</h2>
        <p>{copy.subtitle}</p>
      </div>

      {visibleRecords.length === 0 ? (
        <div className="reading-history-empty">
          <h3>{copy.empty}</h3>
          <p>{copy.emptyHint}</p>
        </div>
      ) : (
        <div className="reading-history-grid">
          {visibleRecords.map(({ key, book, page, timestamp }) => (
            <article className="reading-history-card" key={key}>
              <div className="reading-history-cover">
                <BookCover book={book} />
              </div>

              <div className="reading-history-info">
                <h3 title={book.title}>{book.title}</h3>

                <p>{book.author}</p>

                <span className="reading-history-page">
                  {copy.page}: {page}
                </span>

                <small>
                  {copy.saved}:{" "}
                  {new Date(timestamp).toLocaleDateString(
                    language === "en" ? "en-GB" : "vi-VN",
                  )}
                </small>

                <div className="reading-history-actions">
                  <button
                    type="button"
                    className="reading-history-resume"
                    disabled={typeof onRead !== "function"}
                    title={
                      typeof onRead !== "function"
                        ? copy.unavailable
                        : undefined
                    }
                    onClick={() => onRead(book.id)}
                  >
                    {copy.resume}
                    <ArrowRight size={16} aria-hidden="true" />
                  </button>

                  <details className="reading-history-menu">
                    <summary
                      aria-label={copy.more + ": " + book.title}
                      title={copy.more}
                    >
                      <MoreVertical size={20} aria-hidden="true" />
                    </summary>
                    <button
                      type="button"
                      className="reading-history-remove"
                      onClick={() => removeBookmark(key)}
                      aria-label={copy.remove + ": " + book.title}
                    >
                      {copy.remove}
                    </button>
                  </details>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <p className="reading-history-status" role="status">
        {message ? copy[message] : ""}
      </p>
    </section>
  );
}
