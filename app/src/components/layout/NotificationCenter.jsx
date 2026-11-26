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
    login: "Đăng nhập để xem thông báo của bạn.",

    approved: "Yêu cầu mượn đã được duyệt",
    borrowed: "Đã nhận sách từ thư viện",
    returned: "Thư viện đã ghi nhận trả sách",
    cancelled: "Yêu cầu mượn đã được hủy",
    rejected: "Yêu cầu mượn bị từ chối",
    dueSoon: "Sách sắp đến hạn trả",
    dueInFive: "Sách sắp đến hạn trả (trong 5 ngày)",
    dueTomorrow: "Ngày mai đến hạn trả sách",
    dueToday: "Sách đến hạn trả hôm nay",
    overdue: "Sách đã quá hạn trả",

    reservationReady: "Sách đặt trước đã sẵn sàng nhận",
    reservationExpiring: "Sắp hết thời gian giữ sách",
    reservationExpired: "Yêu cầu giữ sách đã hết hạn",
    reservationCancelled: "Đã hủy đặt trước",
    reservationCollected: "Đã xác nhận nhận sách đặt trước",

    renewalRequested: "Đã gửi yêu cầu gia hạn",
    renewalApproved: "Gia hạn mượn sách được duyệt",
    renewalRejected: "Yêu cầu gia hạn bị từ chối",

    fineDue: "Có tiền phạt sau khi trả sách",
    finePaid: "Đã ghi nhận thu tiền phạt",

    due: "Hạn trả",
    expiry: "Hạn giữ sách",
    amount: "Tiền phạt",
    reason: "Lý do",

    view: "Xem phiếu mượn",
    viewReservation: "Xem đặt trước",

    stale: "Thông báo đã thay đổi. Vui lòng kiểm tra lại danh sách.",

    storageFailed:
      "Chưa lưu được trạng thái đã đọc. Kiểm tra dung lượng trình duyệt.",

    hint: "Thông báo trong ứng dụng được tổng hợp từ dữ liệu demo; không phải email, SMS hoặc thông báo đẩy AWS.",
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
    login: "Sign in to view your notifications.",

    approved: "Loan request approved",
    borrowed: "Book collected from library",
    returned: "Book return recorded",
    cancelled: "Loan request cancelled",
    rejected: "Loan request rejected",
    dueSoon: "Book due soon",
    dueInFive: "Book due within 5 days",
    dueTomorrow: "Book due tomorrow",
    dueToday: "Book due today",
    overdue: "Book overdue",

    reservationReady: "Reserved book is ready for pickup",
    reservationExpiring: "Reservation hold is about to expire",
    reservationExpired: "Reservation hold has expired",
    reservationCancelled: "Book reservation cancelled",
    reservationCollected: "Reserved book collection recorded",

    renewalRequested: "Renewal request submitted",
    renewalApproved: "Loan renewal approved",
    renewalRejected: "Loan renewal rejected",

    fineDue: "Fine due after return",
    finePaid: "Fine payment recorded",

    due: "Due date",
    expiry: "Hold expires",
    amount: "Fine amount",
    reason: "Reason",

    view: "View loan",
    viewReservation: "View reservation",

    stale: "Notification has changed. Please check the list again.",

    storageFailed: "Could not save read status. Check browser storage.",

    hint: "In-app demo notifications are derived from library records; no AWS push, email or SMS is sent.",
  },
};

function formatExpiry(value, language) {
  if (!value) return "—";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString(language === "en" ? "en-US" : "vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        dateStyle: "short",
        timeStyle: "short",
      });
}

export default function NotificationCenter(props) {
  return props.local ? (
    <NotificationView
      {...props}
      items={props.local.notifications}
      unread={props.local.notifications.filter((row) => !row.read).length}
      mark={(id, items) =>
        props.local.command("notification.read", {
          ids: id ? [id] : items.map((row) => row.id),
          ...(id ? { id } : {}),
        })
      }
    />
  ) : (
    <DemoNotificationView {...props} />
  );
}
function DemoNotificationView(props) {
  const data = useReaderNotifications();
  return <NotificationView {...props} {...data} mark={markNotificationsRead} />;
}
function NotificationView({ user, onOpenRequest, items, unread, mark, local }) {
  const { language } = useUiSettings();
  const copy = messages[language] || messages.vi;

  const [onlyUnread, setOnlyUnread] = useState(false);

  const [limit, setLimit] = useState(20);

  const [error, setError] = useState("");

  const dialog = useRef(null);
  const titleId = useId();

  const filtered = onlyUnread ? items.filter((item) => !item.read) : items;

  function open() {
    setError("");
    setLimit(20);

    dialog.current?.showModal();
  }

  async function view(item) {
    const result = await mark(item.id, items);

    if (!result.ok) {
      setError(
        result.error === "storageFailed" ? copy.storageFailed : copy.stale,
      );

      return;
    }

    setError("");
    dialog.current?.close();

    // Đặt trước cũng nằm trên trang
    // Sách đang mượn từ bước 1–2.
    // null = mở trang, không chọn phiếu cụ thể.
    onOpenRequest?.(item.target === "reservations" ? null : item.requestId);
  }

  async function markAll() {
    const result = await mark(null, items);

    setError(
      result.ok
        ? ""
        : result.error === "storageFailed"
          ? copy.storageFailed
          : copy.stale,
    );
  }

  return (
    <div className="notification-center">
      <button
        type="button"
        className="notification-bell"
        onClick={open}
        aria-label={`${copy.title}${
          unread ? ` (${unread} ${copy.unread})` : ""
        }`}
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
            onClick={() => dialog.current?.close()}
            aria-label={copy.close}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        {!user ? (
          <p className="notification-empty">{copy.login}</p>
        ) : (
          <>
            <p className="notification-hint">
              {local
                ? language === "en"
                  ? "Notifications for your account. This list is separate from email and SMS."
                  : "Thông báo trong ứng dụng của tài khoản. Danh sách này tách biệt với email và SMS."
                : copy.hint}
            </p>

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

              <button type="button" disabled={!unread} onClick={markAll}>
                <CheckCheck size={16} aria-hidden="true" /> {copy.markAll}
              </button>
            </div>

            {error && (
              <p className="notification-error" role="alert">
                {error}
              </p>
            )}

            {filtered.length === 0 ? (
              <p className="notification-empty">
                {onlyUnread ? copy.caughtUp : copy.empty}
              </p>
            ) : (
              <ul className="notification-list">
                {filtered.slice(0, limit).map((item) => (
                  <li
                    key={item.id}
                    className={`${
                      item.read ? "is-read" : "is-unread"
                    } is-${item.type}`}
                  >
                    <button
                      type="button"
                      className="notification-entry"
                      onClick={() => view(item)}
                    >
                      <strong>{copy[item.type] || item.type}</strong>

                      <span className="notification-book">{item.title}</span>
                      {local && item.message && <span>{item.message}</span>}

                      {item.reason &&
                        ["rejected", "renewalRejected"].includes(item.type) && (
                          <span>
                            {copy.reason}: {item.reason}
                          </span>
                        )}

                      {item.dueDate &&
                        [
                          "borrowed",
                          "dueSoon",
                          "dueInFive",
                          "dueTomorrow",
                          "dueToday",
                          "overdue",
                          "renewalApproved",
                        ].includes(item.type) && (
                          <span>
                            {copy.due}: {formatLoanDate(item.dueDate, language)}
                          </span>
                        )}

                      {item.expiresAt &&
                        ["reservationReady", "reservationExpiring"].includes(
                          item.type,
                        ) && (
                          <span>
                            {copy.expiry}:{" "}
                            {formatExpiry(item.expiresAt, language)}
                          </span>
                        )}

                      {Number(item.amount) > 0 &&
                        ["fineDue", "finePaid"].includes(item.type) && (
                          <span>
                            {copy.amount}:{" "}
                            {Number(item.amount).toLocaleString(
                              language === "en" ? "en-US" : "vi-VN",
                            )}{" "}
                            đ
                          </span>
                        )}

                      <time dateTime={item.at}>
                        {formatLoanDate(item.at, language)}
                      </time>

                      <span className="notification-view">
                        {item.target === "reservations"
                          ? copy.viewReservation
                          : copy.view}{" "}
                        →
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
                onClick={() => setLimit((value) => value + 20)}
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
