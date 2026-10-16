import { useState } from "react";
import { BookCover } from "../components/books/HomeSections";
import { useUiSettings } from "../ui/settings";
import { borrowMessages } from "../ui/borrowMessages";
import "./ReaderPages.css";
import "./BorrowFlow.css";

export default function LoansPage({
  books,
  requests,
  onCreateRequest,
  onCancelRequest,
  initialBookId = null,
  onBrowse,
}) {
  const { language } = useUiSettings();
  const copy = borrowMessages[language];

  const [selectedId, setSelectedId] = useState(
    initialBookId === null ? "" : String(initialBookId),
  );

  const [note, setNote] = useState("");
  const [activeTab, setActiveTab] = useState("pending");
  const [message, setMessage] = useState("");

  const pending = requests.filter((request) => request.status === "pending");

  const cancelled = requests.filter(
    (request) => request.status === "cancelled",
  );

  const selectableBooks = books.filter(
    (book) =>
      book.availableCopies > 0 &&
      !pending.some((request) => request.bookId === book.id),
  );

  const selectedBook = selectableBooks.find(
    (book) => String(book.id) === selectedId,
  );

  const visibleRequests = activeTab === "pending" ? pending : cancelled;

  function formatDate(value) {
    return new Date(value).toLocaleDateString(
      language === "en" ? "en-GB" : "vi-VN",
    );
  }

  function submitRequest(event) {
    event.preventDefault();

    const result = onCreateRequest(selectedBook, note);

    if (!result.ok) {
      setMessage(result.error);
      return;
    }

    setSelectedId("");
    setNote("");
    setActiveTab("pending");
    setMessage("created");
  }

  function handleCancel(requestId) {
    onCancelRequest(requestId);
    setMessage("cancelSuccess");
  }

  return (
    <section className="reader-page borrow-page" aria-label={copy.page}>
      <p className="reader-note">{copy.note}</p>

      <div className="reader-stats">
        <div className="reader-stat">
          <span>{copy.pending}</span>
          <strong>{pending.length}</strong>
        </div>

        <div className="reader-stat">
          <span>{copy.cancelled}</span>
          <strong>{cancelled.length}</strong>
        </div>

        <div className="reader-stat">
          <span>{copy.available}</span>
          <strong>
            {books.filter((book) => book.availableCopies > 0).length}
          </strong>
        </div>
      </div>

      <div className="reader-panel">
        <div className="reader-panel-heading">
          <h2>{copy.heading}</h2>

          <button className="reader-link" type="button" onClick={onBrowse}>
            {copy.browse}
          </button>
        </div>

        <form className="borrow-form" onSubmit={submitRequest}>
          <label className="reader-field">
            <span>{copy.choose}</span>

            <select
              value={selectedId}
              onChange={(event) => {
                setSelectedId(event.target.value);
                setMessage("");
              }}
              required
            >
              <option value="">{copy.placeholder}</option>

              {selectableBooks.map((book) => (
                <option key={book.id} value={String(book.id)}>
                  {book.title} — {book.author}
                </option>
              ))}
            </select>
          </label>

          {selectedBook && (
            <div className="borrow-selection">
              <div className="reader-small-cover">
                <BookCover book={selectedBook} />
              </div>

              <div>
                <h3>{selectedBook.title}</h3>
                <p>{selectedBook.author}</p>
                <p>
                  {copy.copies}: {selectedBook.availableCopies}
                </p>
              </div>
            </div>
          )}

          <label className="reader-field">
            <span>{copy.requestNote}</span>

            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={copy.notePlaceholder}
              maxLength={300}
              rows={3}
            />
          </label>

          <div className="borrow-submit-row">
            <button
              className="borrow-button"
              type="submit"
              disabled={!selectedBook || pending.length >= 3}
            >
              {copy.submit}
            </button>

            <span>{copy.limitHint}</span>
          </div>
        </form>

        {pending.length >= 3 && <p className="reader-muted">{copy.limit}</p>}

        {selectableBooks.length === 0 && (
          <p className="reader-muted">{copy.noBooks}</p>
        )}

        <p className="reader-status" role="status">
          {message ? copy[message] : ""}
        </p>
      </div>

      <div className="reader-panel">
        <div className="reader-tabs" role="group" aria-label={copy.filter}>
          <button
            type="button"
            className={activeTab === "pending" ? "is-active" : ""}
            aria-pressed={activeTab === "pending"}
            onClick={() => setActiveTab("pending")}
          >
            {copy.pending} ({pending.length})
          </button>

          <button
            type="button"
            className={activeTab === "cancelled" ? "is-active" : ""}
            aria-pressed={activeTab === "cancelled"}
            onClick={() => setActiveTab("cancelled")}
          >
            {copy.cancelled} ({cancelled.length})
          </button>
        </div>

        {visibleRequests.length === 0 ? (
          <div className="reader-empty">
            <h3>
              {activeTab === "pending"
                ? copy.emptyPending
                : copy.emptyCancelled}
            </h3>

            <p>{copy.emptyHint}</p>
          </div>
        ) : (
          <div className="reader-request-list">
            {visibleRequests.map((request) => {
              const book = books.find((item) => item.id === request.bookId);

              return (
                <article className="reader-request" key={request.id}>
                  {book && (
                    <div className="reader-small-cover">
                      <BookCover book={book} />
                    </div>
                  )}

                  <div className="reader-request-info">
                    <h3>{book?.title || request.title}</h3>

                    {book && <p>{book.author}</p>}

                    <p>
                      {copy.createdAt}: {formatDate(request.createdAt)}
                    </p>

                    {request.cancelledAt && (
                      <p>
                        {copy.cancelledAt}: {formatDate(request.cancelledAt)}
                      </p>
                    )}

                    {request.note && (
                      <p className="borrow-request-note">
                        {copy.requestNote}: {request.note}
                      </p>
                    )}

                    <span className="reader-badge">
                      {request.status === "pending"
                        ? copy.pendingBadge
                        : copy.cancelledBadge}
                    </span>
                  </div>

                  {request.status === "pending" && (
                    <button
                      className="reader-button reader-button-secondary"
                      type="button"
                      onClick={() => handleCancel(request.id)}
                    >
                      {copy.cancel}
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
