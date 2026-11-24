
import { useState } from "react";

import {
  BookMarked,
  Clock3,
  Search,
  CheckCircle2,
} from "lucide-react";

import { useUiSettings } from "../ui/settings";

import {
  reservationService,
  useReservations,
} from "../services/reservationService";

const messages = {
  vi: {
    title: "Quản lý đặt trước & hàng chờ",
    description:
      "Theo dõi và xử lý các yêu cầu đặt trước sách.",
    demo:
      "Chế độ demo: giả lập có sách trả về và giữ cho người đầu hàng chờ trong 48 giờ.",
    api:
      "Chế độ API: Backend quyết định phân bổ bản sách và xử lý hết hạn.",
    waiting: "Đang chờ",
    ready: "Sẵn sàng nhận",
    collected: "Đã nhận",
    cancelled: "Đã hủy",
    expired: "Hết hạn",
    history: "Lịch sử",
    all: "Tất cả",
    search: "Tìm tên sách hoặc email độc giả...",
    empty: "Không có yêu cầu phù hợp.",
    reader: "Độc giả",
    created: "Ngày tạo",
    position: "Vị trí chờ",
    expiry: "Giữ đến",
    markReady: "Giả lập có sách trả về",
    collect: "Xác nhận đã nhận",
    expireAction: "Xử lý giữ sách hết hạn",
    confirmReady:
      "Giả lập có một bản sách được trả về và giữ cho độc giả này trong 48 giờ?",
    confirmCollect:
      "Xác nhận độc giả đã nhận sách? Chưa tạo phiếu mượn thật.",
    readySuccess:
      "Đã chuyển sang sẵn sàng nhận (demo).",
    collectSuccess:
      "Đã ghi nhận nhận sách (demo).",
    expireSuccess: "Đã xử lý {count} yêu cầu.",
    noExpired: "Không có yêu cầu hết hạn.",
    notFound: "Không tìm thấy yêu cầu.",
    notWaiting: "Yêu cầu không còn chờ.",
    notFirst:
      "Chỉ người đầu hàng chờ được nhận bản sách.",
    alreadyHeld:
      "Sách đang được giữ cho độc giả khác.",
    notReady: "Yêu cầu chưa sẵn sàng nhận.",
    holdExpired: "Thời gian giữ sách đã hết.",
    storageFailed: "Không lưu được dữ liệu.",
    managedByBackend: "Chức năng do Backend xử lý.",
    notImplemented: "Chưa tích hợp API tương ứng.",
    serverError: "Không thực hiện được yêu cầu.",
    loading: "Đang tải dữ liệu...",
    forbidden: "Bạn không có quyền truy cập.",
  },
  en: {
    title: "Reservation queue management",
    description:
      "Monitor and process book reservations.",
    demo:
      "Demo mode: simulate a returned copy and a 48-hour hold.",
    api:
      "API mode: Backend manages allocation and expiry.",
    waiting: "Waiting",
    ready: "Ready",
    collected: "Collected",
    cancelled: "Cancelled",
    expired: "Expired",
    history: "History",
    all: "All",
    search: "Search title or reader email...",
    empty: "No matching reservations.",
    reader: "Reader",
    created: "Created",
    position: "Queue position",
    expiry: "Hold expires",
    markReady: "Simulate returned copy",
    collect: "Confirm collection",
    expireAction: "Process expired holds",
    confirmReady:
      "Simulate a returned copy and hold it for 48 hours?",
    confirmCollect:
      "Confirm collection? No real loan is created.",
    readySuccess: "Reservation marked ready.",
    collectSuccess: "Collection confirmed.",
    expireSuccess: "Processed {count} requests.",
    noExpired: "No expired holds.",
    notFound: "Reservation not found.",
    notWaiting: "Reservation is not waiting.",
    notFirst: "Only the first reader may be selected.",
    alreadyHeld: "The book is already held.",
    notReady: "Reservation is not ready.",
    holdExpired: "Hold expired.",
    storageFailed: "Unable to save data.",
    managedByBackend: "Handled by Backend.",
    notImplemented: "API integration is unavailable.",
    serverError: "Request failed.",
    loading: "Loading...",
    forbidden: "Access denied.",
  },
};

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .toLowerCase();
}

function formatDate(value, language) {
  if (!value) return "—";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString(
        language === "en" ? "en-US" : "vi-VN",
        {
          dateStyle: "short",
          timeStyle: "short",
          timeZone: "Asia/Ho_Chi_Minh",
        },
      );
}

export default function ManagementReservationsPanel({
  user,
  books = [],
}) {
  const { language } = useUiSettings();
  const copy = messages[language] || messages.vi;

  const {
    rows,
    loading,
    error,
    refresh,
    isDemo,
  } = useReservations({
    readerEmail: user?.email || "",
    all: true,
  });

  const [tab, setTab] = useState("waiting");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  const allowed =
    user?.status === "active" &&
    ["admin", "librarian"].includes(user.role);

  if (!allowed) {
    return <p role="alert">{copy.forbidden}</p>;
  }

  const waitingCount = rows.filter(
    (item) => item.status === "waiting",
  ).length;

  const readyCount = rows.filter(
    (item) => item.status === "ready",
  ).length;

  const expiredCount = rows.filter(
    (item) =>
      item.status === "ready" &&
      item.expiresAt &&
      Date.parse(item.expiresAt) <= now,
  ).length;

  const visibleRows = rows
    .filter((item) => {
      const matchesTab =
        tab === "all" ||
        item.status === tab ||
        (tab === "history" &&
          ["collected", "cancelled", "expired"].includes(
            item.status,
          ));

      const book = books.find(
        (entry) => entry.id === item.bookId,
      );

      const matchesSearch = normalize(
        `${book?.title || item.title} ${item.readerEmail}`,
      ).includes(normalize(search.trim()));

      return matchesTab && matchesSearch;
    })
    .sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );

  function resultText(result, successKey) {
    return result.ok
      ? copy[successKey]
      : copy[result.error] ||
          result.message ||
          copy.serverError;
  }

  async function runAction(action, id, successKey) {
    if (busy) return;

    setBusy(true);
    setFeedback(null);

    try {
      const result = await reservationService[action]({
        id,
        staffEmail: user.email,
      });

      setFeedback({
        ok: result.ok,
        text: resultText(result, successKey),
      });

      if (result.ok) refresh();
    } finally {
      setBusy(false);
      setNow(Date.now());
    }
  }

  function handleReady(id) {
    if (!window.confirm(copy.confirmReady)) return;

    runAction("markReady", id, "readySuccess");
  }

  function handleCollect(id) {
    if (!window.confirm(copy.confirmCollect)) {
      return;
    }

    runAction("collect", id, "collectSuccess");
  }

  async function handleExpire() {
    if (busy) return;

    setBusy(true);
    setFeedback(null);

    try {
      const result = await reservationService.expire({
        staffEmail: user.email,
      });

      const successText =
        result.count === 0
          ? copy.noExpired
          : copy.expireSuccess.replace(
              "{count}",
              String(result.count ?? 0),
            );

      setFeedback({
        ok: result.ok,
        text: result.ok
          ? successText
          : copy[result.error] ||
            result.message ||
            copy.serverError,
      });

      if (result.ok) refresh();
    } finally {
      setBusy(false);
      setNow(Date.now());
    }
  }

  return (
    <section
      className="reader-page loan-workspace"
      aria-label={copy.title}
    >
      <div className="loan-panel">
        <div className="loan-panel-heading">
          <h2>
            <BookMarked
              size={21}
              aria-hidden="true"
              style={{ verticalAlign: "middle" }}
            />{" "}
            {copy.title}
          </h2>
        </div>

        <p className="reader-muted">
          {copy.description}
        </p>

        <p className="loan-demo-note">
          {isDemo ? copy.demo : copy.api}
        </p>

        <div className="loan-stats">
          {[
            ["waiting", waitingCount],
            ["ready", readyCount],
            ["all", rows.length],
            ["expired", expiredCount],
          ].map(([key, count]) => (
            <div className="loan-stat" key={key}>
              <span className="loan-stat-label">
                {copy[key]}
              </span>

              <strong>{count}</strong>
            </div>
          ))}
        </div>
      </div>

      <div className="loan-panel">
        <div className="loan-panel-heading">
          <h2>{copy.title}</h2>

          {isDemo && (
            <button
              type="button"
              className="loan-button"
              disabled={busy}
              onClick={handleExpire}
            >
              <Clock3
                size={16}
                aria-hidden="true"
              />{" "}
              {copy.expireAction}
            </button>
          )}
        </div>

        <label className="loan-search">
          <Search
            size={18}
            aria-hidden="true"
          />

          <input
            type="search"
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
            placeholder={copy.search}
          />
        </label>

        <div
          className="loan-tabs"
          role="group"
          aria-label={copy.title}
        >
          {[
            "waiting",
            "ready",
            "history",
            "all",
          ].map((key) => (
            <button
              key={key}
              type="button"
              className={tab === key ? "is-active" : ""}
              aria-pressed={tab === key}
              onClick={() => setTab(key)}
            >
              {copy[key]}
            </button>
          ))}
        </div>

        {loading && (
          <p className="reader-muted">
            {copy.loading}
          </p>
        )}

        {error && (
          <p className="loan-demo-note" role="alert">
            {error}
          </p>
        )}

        {feedback && (
          <p
            className="loan-feedback"
            role={feedback.ok ? "status" : "alert"}
          >
            {feedback.text}
          </p>
        )}

        {!loading && visibleRows.length === 0 ? (
          <div className="loan-empty">
            <p>{copy.empty}</p>
          </div>
        ) : (
          <div className="loan-record-list">
            {visibleRows.map((item) => {
              const book = books.find(
                (entry) => entry.id === item.bookId,
              );

              const position =
                reservationService.getPosition(
                  rows,
                  item,
                );

              const anotherReady = rows.some(
                (entry) =>
                  entry.bookId === item.bookId &&
                  entry.status === "ready",
              );

              const canMarkReady =
                item.status === "waiting" &&
                position === 1 &&
                !anotherReady;

              const canCollect =
                item.status === "ready" &&
                Boolean(item.expiresAt) &&
                Date.parse(item.expiresAt) > now;

              return (
                <article
                  className="loan-record"
                  key={item.id}
                >
                  <div className="loan-record-main">
                    <div className="loan-record-info">
                      <h3>
                        {book?.title || item.title}
                      </h3>

                      <p className="loan-reader">
                        {copy.reader}:{" "}
                        {item.readerEmail}
                      </p>

                      <p>
                        <strong>
                          {copy[item.status] ||
                            item.status}
                        </strong>
                      </p>

                      <p>
                        {copy.created}:{" "}
                        {formatDate(
                          item.createdAt,
                          language,
                        )}
                      </p>

                      {position !== null && (
                        <p>
                          {copy.position}: {position}
                        </p>
                      )}

                      {item.expiresAt && (
                        <p>
                          {copy.expiry}:{" "}
                          {formatDate(
                            item.expiresAt,
                            language,
                          )}
                        </p>
                      )}
                    </div>
                  </div>

                  {isDemo && (
                    <div className="loan-record-actions">
                      {item.status === "waiting" && (
                        <button
                          type="button"
                          className="loan-button is-primary"
                          disabled={busy || !canMarkReady}
                          title={
                            !canMarkReady
                              ? copy[
                                  anotherReady
                                    ? "alreadyHeld"
                                    : "notFirst"
                                ]
                              : ""
                          }
                          onClick={() =>
                            handleReady(item.id)
                          }
                        >
                          {copy.markReady}
                        </button>
                      )}

                      {item.status === "ready" && (
                        <button
                          type="button"
                          className="loan-button is-primary"
                          disabled={busy || !canCollect}
                          onClick={() =>
                            handleCollect(item.id)
                          }
                        >
                          <CheckCircle2
                            size={16}
                            aria-hidden="true"
                          />{" "}
                          {copy.collect}
                        </button>
                      )}
                    </div>
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
