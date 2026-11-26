import { useContext, useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { request } from "../../api/runtime.js";
import { ReadContext } from "../../ui/ReadContext";
import { useUiSettings } from "../../ui/settings";
import { canReadBook } from "../../data/readerContent";
import { bookDescriptionText } from "../../data/bookDescription.js";
import BookCarousel from "./BookCarousel";
import "./ApiBookDiscovery.css";

function SourceCover({ book }) {
  const [failed, setFailed] = useState(false);
  return !failed && book.cover ? (
    <img
      src={book.cover}
      alt={book.title}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  ) : (
    <span className="home-cover-fallback">
      <strong>{book.title}</strong>
      <small>{book.author}</small>
    </span>
  );
}

function SourceDetails({ book, onClose, english }) {
  const dialog = useRef(null);
  const onRead = useContext(ReadContext);
  useEffect(() => {
    dialog.current.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="book-modal source-book-dialog"
      aria-labelledby="source-book-title"
      onClose={onClose}
    >
      <button
        type="button"
        className="book-modal-close"
        aria-label={english ? "Close" : "Đóng"}
        onClick={() => dialog.current.close()}
      >
        <X size={22} />
      </button>
      <div className="book-modal-content">
        <div className="book-modal-cover">
          <SourceCover key={book.id} book={book} />
        </div>
        <div>
          <p className="home-eyebrow">Standard Ebooks</p>
          <h2 id="source-book-title">{book.title}</h2>
          <p className="home-author">{book.author}</p>
          <p>
            {english ? "Language" : "Ngôn ngữ"}: {book.language || "—"}
          </p>
          <p className="home-description">
            {bookDescriptionText(book.description) ||
              (english
                ? "View the original source for details."
                : "Xem thông tin chi tiết tại nguồn sách.")}
          </p>
          <div className="source-book-actions">
            <button
              type="button"
              className="borrow-button"
              disabled={!canReadBook(book)}
              onClick={() => {
                dialog.current.close();
                onRead?.(book.id);
              }}
            >
              {english ? "Read in Cloud Library" : "Đọc trong Cloud Library"}
            </button>
          </div>
          <p className="source-book-note">
            {english
              ? "Full text available · Standard Ebooks edition · CC0"
              : "Đã có toàn văn · Bản Standard Ebooks · CC0"}
          </p>
        </div>
      </div>
    </dialog>
  );
}

export default function ApiBookDiscovery() {
  const { language } = useUiSettings();
  const english = language === "en";
  const [input, setInput] = useState("");
  const [query, setQuery] = useState({ q: "", page: 1, retry: 0 });
  const [resource, setResource] = useState(null);
  const [selectedBook, setSelectedBook] = useState(null);
  const key = JSON.stringify(query);
  const loading = resource?.key !== key;
  const books = resource?.result?.data || [];
  const pagination = resource?.result?.pagination;

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      q: query.q,
      page: String(query.page),
    });
    request(`/sources/standard-ebooks?${params}`, {
      auth: false,
      signal: controller.signal,
    })
      .then((result) => {
        if (!controller.signal.aborted)
          setResource({ key, result, error: null });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setResource((old) => ({ ...old, key, error: error.message }));
      });
    return () => controller.abort();
  }, [key, query.q, query.page]);

  function search(event) {
    event.preventDefault();
    setQuery((old) => ({ q: input.trim(), page: 1, retry: old.retry + 1 }));
  }

  return (
    <div className="discovery-page source-discovery">
      {!query.q && books.length > 0 && (
        <BookCarousel books={books} onOpenBook={setSelectedBook} />
      )}
      <section
        className="home-panel source-books-panel"
        aria-labelledby="source-books-heading"
        aria-busy={loading}
      >
        <div className="home-panel-header">
          <div>
            <p className="home-eyebrow">Standard Ebooks</p>
            <h2 id="source-books-heading">
              {english
                ? "Read books from Standard Ebooks"
                : "Sách đọc trực tuyến — Standard Ebooks"}
            </h2>
            <p className="section-subtitle">
              {english
                ? "Every book on this shelf can be read inside Cloud Library."
                : "Các tác phẩm trên kệ đều có nội dung để đọc ngay trong Cloud Library."}
            </p>
          </div>
        </div>
        <form className="source-book-search" role="search" onSubmit={search}>
          <label htmlFor="source-book-query">
            {english ? "Find a readable book" : "Tìm sách đọc trực tuyến"}
          </label>
          <div>
            <input
              id="source-book-query"
              type="search"
              maxLength={120}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={
                english ? "Title or author…" : "Tên sách hoặc tác giả…"
              }
            />
            <button type="submit" className="borrow-button" disabled={loading}>
              <Search size={18} aria-hidden="true" />
              {english ? "Search" : "Tìm sách"}
            </button>
          </div>
        </form>
        <div className="source-book-status" role="status" aria-live="polite">
          {loading ? (
            english ? (
              "Loading books…"
            ) : (
              "Đang tải sách và bìa…"
            )
          ) : resource?.error ? (
            <>
              <span>
                {english
                  ? "Could not load this page. Please try again."
                  : resource.error}
              </span>{" "}
              <button
                type="button"
                onClick={() =>
                  setQuery((old) => ({ ...old, retry: old.retry + 1 }))
                }
              >
                {english ? "Retry" : "Thử lại"}
              </button>
            </>
          ) : (
            <>
              {pagination?.total.toLocaleString(english ? "en-US" : "vi-VN")}{" "}
              {english ? "books ready to read" : "sách có thể đọc ngay"}
            </>
          )}
        </div>
        {books.length > 0 ? (
          <div className="source-book-grid">
            {books.map((book) => (
              <article className="book-tile" key={book.id}>
                <button
                  type="button"
                  className="book-tile-button"
                  onClick={() => setSelectedBook(book)}
                  aria-label={
                    (english ? "View details: " : "Xem chi tiết: ") + book.title
                  }
                >
                  <span className="book-tile-cover">
                    <SourceCover book={book} />
                  </span>
                  <strong className="book-tile-title" title={book.title}>
                    {book.title}
                  </strong>
                  <span className="book-tile-author" title={book.author}>
                    {book.author}
                  </span>
                  <span className="source-book-origin">
                    {english ? "Read online" : "Đọc trực tuyến"}
                  </span>
                </button>
              </article>
            ))}
          </div>
        ) : (
          !loading &&
          !resource?.error && (
            <p role="status">
              {english
                ? "No matching books found."
                : "Không tìm thấy sách phù hợp. Thử tên sách hoặc tác giả khác nha."}
            </p>
          )
        )}
        {pagination && (
          <nav
            className="source-pagination"
            aria-label={
              english ? "Standard Ebooks pages" : "Trang sách Standard Ebooks"
            }
          >
            <button
              type="button"
              disabled={
                loading || pagination.page <= 1 || Boolean(resource?.error)
              }
              onClick={() =>
                setQuery((old) => ({ ...old, page: pagination.page - 1 }))
              }
            >
              {english ? "Previous" : "Trang trước"}
            </button>
            <span>
              {english ? "Page" : "Trang"} {pagination.page}
            </span>
            <button
              type="button"
              disabled={
                loading || !pagination.hasNext || Boolean(resource?.error)
              }
              onClick={() =>
                setQuery((old) => ({ ...old, page: pagination.page + 1 }))
              }
            >
              {english ? "Next" : "Xem thêm sách"}
            </button>
          </nav>
        )}
      </section>
      {selectedBook && (
        <SourceDetails
          key={selectedBook.id}
          book={selectedBook}
          onClose={() => setSelectedBook(null)}
          english={english}
        />
      )}
    </div>
  );
}
