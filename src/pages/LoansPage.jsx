import { useLibrarySettings } from "../ui/librarySettingsStore";
import { LibraryInfo } from "./LibrarySettingsPage";
import { useEffect, useRef, useState } from "react";
import LoanRecord from "../components/books/LoanRecord";
import { ACTIVE_STATUSES, isOverdue } from "../ui/borrowWorkflow";
import { getLoanMessages } from "../ui/loanMessages";
import { BookCover } from "../components/books/HomeSections";
import { useUiSettings } from "../ui/settings";
import { borrowMessages } from "../ui/borrowMessages";

import "./ReaderPages.css";
import "./BorrowFlow.css";
import "./LoanWorkspace.css";

export default function LoansPage({
  books,
  requests,
  onCreateRequest,
  onCancelRequest,
  initialBookId = null,
  initialRequestId = null,
  onBrowse,
}) {
  const { language } = useUiSettings();
  const settings = useLibrarySettings();

  const copy = {
    ...borrowMessages[language],
    ...getLoanMessages(language, settings),
  };

  const [selectedId, setSelectedId] = useState(
    initialBookId === null ? "" : String(initialBookId),
  );

  const [note, setNote] = useState("");
  const [activeTab, setActiveTab] = useState(
    initialRequestId ? "all" : "pending",
  );
  const [message, setMessage] = useState("");

  const target = useRef(null);

  useEffect(() => {
    if (!initialRequestId || !target.current) return;

    target.current.focus({ preventScroll: true });
    target.current.scrollIntoView({ block: "center" });
  }, [initialRequestId]);

  const pending = requests.filter((request) => request.status === "pending");

  const active = requests.filter((request) =>
    ACTIVE_STATUSES.includes(request.status),
  );

  const borrowed = requests.filter((request) => request.status === "borrowed");

  const selectableBooks = books.filter(
    (book) =>
      !book.archived &&
      book.availableCopies > 0 &&
      !active.some((request) => request.bookId === book.id),
  );

  const selectedBook = selectableBooks.find(
    (book) => String(book.id) === selectedId,
  );

  const visibleRequests = requests.filter(
    (request) =>
      activeTab === "all" ||
      (activeTab === "history"
        ? !ACTIVE_STATUSES.includes(request.status)
        : activeTab === "overdue"
          ? isOverdue(request)
          : request.status === activeTab),
  );

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
    const result = onCancelRequest(requestId);

    setMessage(result.ok ? "cancelSuccess" : result.error);
  }

  return (
    <section
      className="reader-page borrow-page loan-workspace"
      aria-label={copy.page}
    >
      <p className="reader-note">{copy.readerNote}</p>

      <LibraryInfo />

      <div className="reader-stats">
        <div className="reader-stat">
          <span>{copy.active}</span>
          <strong>{active.length}</strong>
        </div>

        <div className="reader-stat">
          <span>{copy.borrowed}</span>
          <strong>{borrowed.length}</strong>
        </div>

        <div className="reader-stat">
          <span>{borrowMessages[language].available}</span>

          <strong>
            {
              books.filter((book) => !book.archived && book.availableCopies > 0)
                .length
            }
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
              disabled={
                !selectedBook || active.length >= settings.maxActiveLoans
              }
            >
              {copy.submit}
            </button>

            <span>{copy.limitHint}</span>
          </div>
        </form>

        {active.length >= settings.maxActiveLoans && (
          <p className="reader-muted">{copy.limit}</p>
        )}

        {selectableBooks.length === 0 && (
          <p className="reader-muted">{copy.noBooks}</p>
        )}

        <p className="reader-status" role="status">
          {message ? copy[message] : ""}
        </p>
      </div>

      <div className="loan-panel">
        <div className="loan-panel-heading">
          <h2>{copy.readerHistory}</h2>

          <span>
            {visibleRequests.length} / {requests.length} {copy.results}
          </span>
        </div>

        <div className="loan-tabs" role="group" aria-label={copy.filter}>
          {["pending", "approved", "borrowed", "overdue", "history", "all"].map(
            (status) => (
              <button
                type="button"
                key={status}
                className={activeTab === status ? "is-active" : ""}
                aria-pressed={activeTab === status}
                onClick={() => setActiveTab(status)}
              >
                {copy[status]}
                {status === "pending" ? ` (${pending.length})` : ""}
              </button>
            ),
          )}
        </div>

        {visibleRequests.length === 0 ? (
          <div className="loan-empty">
            <h3>{copy.empty}</h3>
            <p>{copy.emptyHint}</p>
          </div>
        ) : (
          <div className="loan-record-list">
            {visibleRequests.map((request) => (
              <div
                key={request.id}
                data-request-id={request.id}
                ref={request.id === initialRequestId ? target : null}
                tabIndex={request.id === initialRequestId ? -1 : undefined}
                className={
                  request.id === initialRequestId
                    ? "loan-notification-target"
                    : undefined
                }
              >
                <LoanRecord
                  request={request}
                  book={books.find((book) => book.id === request.bookId)}
                >
                  {["pending", "approved"].includes(request.status) && (
                    <button
                      className="loan-button"
                      type="button"
                      onClick={() => handleCancel(request.id)}
                    >
                      {copy.cancelRequest}
                    </button>
                  )}
                </LoanRecord>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
