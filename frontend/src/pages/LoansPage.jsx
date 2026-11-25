
import { useLibrarySettings } from "../ui/librarySettingsStore";
import { LibraryInfo } from "./LibrarySettingsPage";
import { useEffect, useRef, useState } from "react";
import LoanRecord from "../components/books/LoanRecord";
import ReservationQueuePanel from "./ReservationQueuePanel";
import LoanExtrasPanel from "./LoanExtrasPanel";
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
  live = false,
  local,
  user,
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
      (book.availableCopies > 0 || (live && local.reservations.some(row=>row.bookId===book.id && row.status==="ready"))) &&
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

  async function submitRequest(event) {
    event.preventDefault();
    const result = await onCreateRequest(selectedBook, note);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    setSelectedId("");
    setNote("");
    setActiveTab("pending");
    setMessage("created");
  }

  async function handleCancel(requestId) {
    const result = await onCancelRequest(requestId);
    setMessage(result.ok ? "cancelSuccess" : result.error);
  }

  return (
    <section className="reader-page borrow-page loan-workspace" aria-label={copy.page}>
      <LibraryInfo liveSettings={live ? local.settings : undefined} />

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
          <strong>{books.filter((book) => !book.archived && book.availableCopies > 0).length}</strong>
        </div>
      </div>

      <div className="reader-panel">
        <div className="reader-panel-heading">
          <h2>{copy.heading}</h2>
          <button className="reader-link" type="button" onClick={onBrowse}>
            {copy.browse}
          </button>
        </div>
        <form className="borrow-form" data-testid="loan-create" onSubmit={submitRequest}>
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
              <div className="reader-small-cover"><BookCover book={selectedBook} /></div>
              <div>
                <h3>{selectedBook.title}</h3>
                <p>{selectedBook.author}</p>
                <p>{copy.copies}: {selectedBook.availableCopies}</p>
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
              disabled={!selectedBook || (!live && active.length >= settings.maxActiveLoans)}
            >
              {copy.submit}
            </button>
            <span>{live ? (language === "en" ? "The server enforces loan limits." : "Máy chủ kiểm tra giới hạn mượn.") : copy.limitHint}</span>
          </div>
        </form>
        {!live && active.length >= settings.maxActiveLoans && (
          <p className="reader-muted">{copy.limit}</p>
        )}
        {selectableBooks.length === 0 && (
          <p className="reader-muted">{copy.noBooks}</p>
        )}
        <p className="reader-status" role="status">
          {message ? (copy[message] || (language === "en" ? "Request failed. Check API status." : "Yêu cầu không thành công. Kiểm tra API.")) : ""}
        </p>
      </div>

      {/* Bước 1–2: giữ nguyên giao diện đặt trước của độc giả. */}
      <ReservationQueuePanel books={books} requests={requests} local={local} user={user} />

      {/* Bước 3: gia hạn và xem tiền phạt, lấy dữ liệu từ cùng kho phiếu mượn. */}
      <LoanExtrasPanel local={local} requests={requests} books={books} />

      <div className="loan-panel" data-testid="loan-history">
        <div className="loan-panel-heading">
          <h2>{copy.readerHistory}</h2>
          <span>{visibleRequests.length} / {requests.length} {copy.results}</span>
        </div>
        <div className="loan-tabs" role="group" aria-label={copy.filter}>
          {["pending", "approved", "borrowed", "overdue", "history", "all"].map((status) => (
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
          ))}
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
                className={request.id === initialRequestId ? "loan-notification-target" : undefined}
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
