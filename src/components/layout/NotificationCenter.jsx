import { useId, useRef, useState } from "react";
import { Bell, CheckCheck, X } from "lucide-react";
import { useUiSettings } from "../../ui/settings";
import { formatLoanDate } from "../../ui/loanMessages";
import {
  markNotificationsRead,
  useReaderNotifications,
} from "../../ui/notificationStore";
import "./NotificationCenter.css";

const messages = {
  vi: {
    title: "Thông báo",
    unread: "chưa đọc",
    all: "Tất cả",
    onlyUnread: "Chưa đọc",
    markAll: "Đánh dấu tất cả đã đọc",
    close: "Đóng",
    more: "Xem thêm",
    empty: "Bạn chưa có thông báo nào.",
    caughtUp: "Bạn đã đọc hết thông báo rồi.",
    login: "Đăng nhập để xem thông báo mượn sách của bạn.",
    approved: "Yêu cầu mượn đã được duyệt",
    rejected: "Yêu cầu mượn bị từ chối",
    dueSoon: "Sách sắp đến hạn trả",
    overdue: "Sách đã quá hạn trả",
    due: "Hạn trả",
    reason: "Lý do",
    view: "Xem phiếu mượn",
    stale: "Thông báo đã thay đổi. Vui lòng kiểm tra lại danh sách.",
    hint: "Nhắc hạn trước 3 ngày. Trạng thái hiện tại nằm trong phiếu mượn.",
  },
  en: {
    title: "Notifications",
    unread: "unread",
    all: "All",
    onlyUnread: "Unread",
    markAll: "Mark all as read",
    close: "Close",
    more: "Show more",
    empty: "You have no notifications yet.",
    caughtUp: "You're all caught up.",
    login: "Sign in to view your loan notifications.",
    approved: "Loan request approved",
    rejected: "Loan request rejected",
    dueSoon: "Book due soon",
    overdue: "Book overdue",
    due: "Due date",
    reason: "Reason",
    view: "View loan request",
    stale: "This notification has changed. Please check the list again.",
    hint: "Reminders start 3 days before the due date. View the request for its current status.",
  },
};

export default function NotificationCenter({ user, onOpenRequest }) {
  const { language } = useUiSettings();
  const copy = messages[language];

  const { items, unread } = useReaderNotifications();

  const [onlyUnread, setOnlyUnread] = useState(false);
  const [limit, setLimit] = useState(20);
  const [error, setError] = useState("");

  const dialog = useRef(null);
  const titleId = useId();

  const filtered = onlyUnread
    ? items.filter((item) => !item.read)
    : items;

  function open() {
    setError("");
    setLimit(20);
    dialog.current.showModal();
  }

  function view(item) {
    if (!markNotificationsRead(item.id).ok) {
      setError(copy.stale);
      return;
    }

    dialog.current.close();
    onOpenRequest(item.requestId);
  }

  return (
    <div className="notification-center">
      <button
        type="button"
        className="notification-bell"
        onClick={open}
        aria-label={`${copy.title}${unread ? ` (${unread} ${copy.unread})` : ""}`}
        aria-haspopup="dialog"
        title={copy.title}
      >
        <Bell size={20} aria-hidden="true" />

        {unread > 0 && (
          <span className="notification-badge" aria-hidden="true">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      <dialog
        ref={dialog}
        className="notification-dialog"
        aria-labelledby={titleId}
      >
        <div className="notification-heading">
          <div>
            <h2 id={titleId}>{copy.title}</h2>

            <p role="status">
              {unread} {copy.unread}
            </p>
          </div>

          <button
            type="button"
            onClick={() => dialog.current.close()}
            aria-label={copy.close}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        {!user ? (
          <p className="notification-empty">{copy.login}</p>
        ) : (
          <>
            <p className="notification-hint">{copy.hint}</p>

            <div className="notification-tools">
              <div role="group" aria-label={copy.title}>
                {[false, true].map((value) => (
                  <button
                    key={String(value)}
                    type="button"
                    aria-pressed={onlyUnread === value}
                    onClick={() => {
                      setOnlyUnread(value);
                      setLimit(20);
                    }}
                  >
                    {value ? copy.onlyUnread : copy.all}
                  </button>
                ))}
              </div>

              <button
                type="button"
                disabled={!unread}
                onClick={() => markNotificationsRead()}
              >
                <CheckCheck size={16} aria-hidden="true" />
                {copy.markAll}
              </button>
            </div>

            {error && <p role="alert">{error}</p>}

            {filtered.length === 0 ? (
              <p className="notification-empty">
                {onlyUnread ? copy.caughtUp : copy.empty}
              </p>
            ) : (
              <ul className="notification-list">
                {filtered.slice(0, limit).map((item) => (
                  <li
                    key={item.id}
                    className={`${item.read ? "is-read" : "is-unread"} is-${item.type}`}
                  >
                    <button
                      type="button"
                      className="notification-entry"
                      onClick={() => view(item)}
                    >
                      <strong>{copy[item.type]}</strong>

                      <span className="notification-book">
                        {item.title}
                      </span>

                      {item.type === "rejected" && item.reason && (
                        <span>
                          {copy.reason}: {item.reason}
                        </span>
                      )}

                      {["dueSoon", "overdue"].includes(item.type) && (
                        <span>
                          {copy.due}:{" "}
                          {formatLoanDate(item.dueDate, language)}
                        </span>
                      )}

                      <time dateTime={item.at}>
                        {formatLoanDate(item.at, language)}
                      </time>

                      <span className="notification-view">
                        {copy.view} →
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {filtered.length > limit && (
              <button
                type="button"
                className="notification-more"
                onClick={() => setLimit(limit + 20)}
              >
                {copy.more}
              </button>
            )}
          </>
        )}
      </dialog>
    </div>
  );
}