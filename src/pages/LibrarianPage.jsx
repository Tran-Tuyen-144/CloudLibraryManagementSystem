import { useEffect, useRef, useState } from "react";

import {
  BookCheck,
  BookOpen,
  ClipboardList,
  Clock3,
  Search,
  X,
} from "lucide-react";

import LoanRecord from "../components/books/LoanRecord";

import {
  dateKey,
  futureDate,
  isOverdue,
} from "../ui/borrowWorkflow";

import { getLoanMessages } from "../ui/loanMessages";
import { useLibrarySettings } from "../ui/librarySettingsStore";
import { useUiSettings } from "../ui/settings";

import "./ReaderPages.css";
import "./LoanWorkspace.css";

function normalize(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .trim();
}

function ActionDialog({
  request,
  action,
  onProcess,
  onClose,
}) {
  const { language } = useUiSettings();
  const settings = useLibrarySettings();
  const copy = getLoanMessages(language, settings);

  const dialog = useRef(null);
  const [reason, setReason] = useState("");

  const [dueDate, setDueDate] = useState(() =>
    futureDate(settings.loanDays),
  );

  const [error, setError] = useState("");

  useEffect(() => {
    const element = dialog.current;
    element.showModal();

    return () => element.close();
  }, []);

  function submit(event) {
    event.preventDefault();

    const result = onProcess({
      readerEmail: request.readerEmail,
      id: request.id,
      action,
      reason,
      dueDate,
    });

    if (!result.ok) setError(result.error);
  }

  return (
    <dialog
      ref={dialog}
      className="loan-dialog"
      aria-labelledby="loan-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <form onSubmit={submit}>
        <div className="loan-dialog-heading">
          <h2 id="loan-dialog-title">{copy[action]}</h2>

          <button
            className="loan-icon-button"
            type="button"
            aria-label={copy.cancel}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>

        <div className="loan-dialog-summary">
          <strong>{request.title}</strong>
          <span>{request.readerEmail}</span>
        </div>

        {action === "reject" && (
          <label className="reader-field">
            <span>{copy.reason}</span>

            <textarea
              value={reason}
              onChange={(event) =>
                setReason(event.target.value)
              }
              placeholder={copy.reasonHint}
              required
              maxLength={300}
              rows={3}
            />
          </label>
        )}

        {action === "handover" && (
          <>
            <p>{copy.handoverHint}</p>

            <label className="reader-field">
              <span>{copy.dueDate}</span>

              <input
                type="date"
                value={dueDate}
                onChange={(event) =>
                  setDueDate(event.target.value)
                }
                min={dateKey()}
                max={futureDate(60)}
                required
              />
            </label>
          </>
        )}

        {action === "return" && <p>{copy.returnHint}</p>}

        <p className="loan-feedback" role="status">
          {copy[error] || ""}
        </p>

        <div className="loan-dialog-actions">
          <button
            type="button"
            className="loan-button"
            onClick={onClose}
          >
            {copy.cancel}
          </button>

          <button
            type="submit"
            className="loan-button is-primary"
          >
            {copy.confirm}
          </button>
        </div>
      </form>
    </dialog>
  );
}

export default function LibrarianPage({
  books,
  requests,
  onProcess,
  onCreateDemo,
  initialTab = "pending",
  embedded = false,
}) {
  const { language } = useUiSettings();
  const settings = useLibrarySettings();
  const copy = getLoanMessages(language, settings);

  const [tab, setTab] = useState(initialTab);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [selection, setSelection] = useState(null);

  const counts = Object.fromEntries(
    ["pending", "approved", "borrowed"].map((status) => [
      status,
      requests.filter(
        (request) => request.status === status,
      ).length,
    ]),
  );

  const overdueCount = requests.filter(
    (request) => isOverdue(request),
  ).length;

  const keyword = normalize(query);

  const matchesTab = (request) =>
    tab === "all" ||
    (tab === "overdue"
      ? isOverdue(request)
      : tab === "history"
        ? ["returned", "cancelled", "rejected"].includes(
            request.status,
          )
        : request.status === tab);

  const visible = requests.filter((request) => {
    const book = books.find(
      (item) => item.id === request.bookId,
    );

    return (
      matchesTab(request) &&
      normalize(
        `${book?.title || request.title} ${
          request.readerName || ""
        } ${request.readerEmail}`,
      ).includes(keyword)
    );
  });

  const selectedRequest =
    selection &&
    requests.find(
      (request) =>
        request.id === selection.id &&
        request.readerEmail === selection.readerEmail,
    );

  function process(values) {
    const result = onProcess(values);

    setMessage(
      result.ok
        ? `${values.action}Success`
        : result.error,
    );

    if (result.ok) setSelection(null);

    return result;
  }

  return (
    <section
      className="reader-page loan-workspace"
      aria-label={copy.staffTitle}
    >
      {!embedded && (
        <>
          <div className="loan-hero">
            <div>
              <span className="loan-eyebrow">
                CLOUD LIBRARY · {copy.demo}
              </span>

              <h2>{copy.staffTitle}</h2>
              <p>{copy.staffIntro}</p>
            </div>

            <span
              className="loan-hero-icon"
              aria-hidden="true"
            >
              <BookOpen size={36} strokeWidth={1.4} />
            </span>
          </div>

          <p className="loan-demo-note">
            {copy.staffNote}
          </p>
        </>
      )}

      <div className="loan-stats">
        {[
          {
            id: "pending",
            count: counts.pending,
            Icon: ClipboardList,
          },
          {
            id: "approved",
            count: counts.approved,
            Icon: BookCheck,
          },
          {
            id: "borrowed",
            count: counts.borrowed,
            Icon: BookOpen,
          },
          {
            id: "overdue",
            count: overdueCount,
            Icon: Clock3,
          },
        ].map(({ id, count, Icon }) => (
          <button
            type="button"
            key={id}
            className={`loan-stat ${
              tab === id ? "is-active" : ""
            }`}
            onClick={() => setTab(id)}
            aria-pressed={tab === id}
          >
            <span className="loan-stat-label">
              <Icon size={18} aria-hidden="true" />
              {copy[id]}
            </span>

            <strong>{count}</strong>
          </button>
        ))}
      </div>

      <div className="loan-panel">
        <div className="loan-panel-heading">
          <h2>{copy.queue}</h2>

          <span>
            {visible.length} / {requests.length}{" "}
            {copy.results}
          </span>
        </div>

        <label className="loan-search">
          <Search size={18} aria-hidden="true" />

          <span className="loan-sr-only">
            {copy.search}
          </span>

          <input
            type="search"
            value={query}
            placeholder={copy.searchHint}
            onChange={(event) =>
              setQuery(event.target.value)
            }
          />
        </label>

        <div
          className="loan-tabs"
          role="group"
          aria-label={copy.filter}
        >
          {[
            "pending",
            "approved",
            "borrowed",
            "overdue",
            "history",
            "all",
          ].map((id) => (
            <button
              type="button"
              key={id}
              className={tab === id ? "is-active" : ""}
              onClick={() => setTab(id)}
              aria-pressed={tab === id}
            >
              {copy[id]}
            </button>
          ))}
        </div>

        <p className="loan-feedback" role="status">
          {copy[message] || ""}
        </p>

        {visible.length === 0 ? (
          <div className="loan-empty">
            <ClipboardList
              size={32}
              strokeWidth={1.3}
              aria-hidden="true"
            />

            <h3>{copy.empty}</h3>
            <p>{copy.emptyHint}</p>

            {requests.length === 0 && onCreateDemo && (
              <>
                <p>{copy.seedHint}</p>

                <button
                  type="button"
                  className="loan-button is-primary"
                  onClick={() => {
                    const result = onCreateDemo();

                    setMessage(
                      result.ok ? "seeded" : result.error,
                    );
                  }}
                >
                  {copy.seed}
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="loan-record-list">
            {visible.map((request) => {
              const book = books.find(
                (item) => item.id === request.bookId,
              );

              const openAction = (action) => {
                setMessage("");

                setSelection({
                  id: request.id,
                  readerEmail: request.readerEmail,
                  action,
                });
              };

              return (
                <LoanRecord
                  key={request.readerEmail + request.id}
                  request={request}
                  book={book}
                  showReader
                >
                  {request.status === "pending" && (
                    <>
                      <span className="loan-stock">
                        {copy.available}:{" "}
                        {book?.availableCopies ?? 0}
                      </span>

                      <button
                        className="loan-button"
                        type="button"
                        onClick={() => openAction("reject")}
                      >
                        {copy.reject}
                      </button>

                      <button
                        className="loan-button is-primary"
                        type="button"
                        disabled={
                          !book ||
                          book.archived ||
                          book.availableCopies < 1
                        }
                        onClick={() =>
                          process({
                            readerEmail: request.readerEmail,
                            id: request.id,
                            action: "approve",
                          })
                        }
                      >
                        {copy.approve}
                      </button>
                    </>
                  )}

                  {request.status === "approved" && (
                    <button
                      className="loan-button is-primary"
                      type="button"
                      onClick={() => openAction("handover")}
                    >
                      {copy.handover}
                    </button>
                  )}

                  {request.status === "borrowed" && (
                    <button
                      className="loan-button is-primary"
                      type="button"
                      onClick={() => openAction("return")}
                    >
                      {copy.return}
                    </button>
                  )}
                </LoanRecord>
              );
            })}
          </div>
        )}
      </div>

      {selectedRequest && (
        <ActionDialog
          key={selection.id + selection.action}
          request={selectedRequest}
          action={selection.action}
          onProcess={process}
          onClose={() => setSelection(null)}
        />
      )}
    </section>
  );
}