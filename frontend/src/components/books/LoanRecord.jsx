import { BookCover } from "./HomeSections";
import { useUiSettings } from "../../ui/settings";
import { formatLoanDate, loanMessages } from "../../ui/loanMessages";
import { isOverdue } from "../../ui/borrowWorkflow";

export default function LoanRecord({
  request,
  book,
  showReader = false,
  children,
}) {
  const { language } = useUiSettings();
  const copy = loanMessages[language];
  const overdue = isOverdue(request);

  return (
    <article className={`loan-record ${overdue ? "is-overdue" : ""}`}>
      <div className="loan-record-main">
        {book && (
          <div className="reader-small-cover">
            <BookCover book={book} />
          </div>
        )}

        <div className="loan-record-info">
          <div className="loan-record-heading">
            <span className={`loan-status is-${request.status}`}>
              {copy[request.status]}
            </span>

            {overdue && (
              <span className="loan-status is-overdue">{copy.overdue}</span>
            )}

            <span className="loan-record-id">
              #{request.id.slice(0, 8).toUpperCase()}
            </span>
          </div>

          <h3>{book?.title || request.title || copy.unknownBook}</h3>

          {book && <p>{book.author}</p>}

          {showReader && (
            <p className="loan-reader">
              <strong>{request.readerName || copy.reader}</strong>
              <span>{request.readerEmail}</span>
            </p>
          )}
        </div>
      </div>

      <div className="loan-record-meta">
        {[
          "createdAt",
          "approvedAt",
          "borrowedAt",
          "dueDate",
          "returnedAt",
          "rejectedAt",
          "cancelledAt",
        ]
          .filter((key) => request[key])
          .map((key) => (
            <span key={key}>
              <small>{copy[key]}</small>
              <strong>{formatLoanDate(request[key], language)}</strong>
            </span>
          ))}
      </div>

      {request.note && (
        <p className="loan-record-note">
          {copy.note}: {request.note}
        </p>
      )}

      {request.rejectionReason && (
        <p className="loan-record-note">
          {copy.reason}: {request.rejectionReason}
        </p>
      )}

      {children && <div className="loan-record-actions">{children}</div>}
    </article>
  );
}
