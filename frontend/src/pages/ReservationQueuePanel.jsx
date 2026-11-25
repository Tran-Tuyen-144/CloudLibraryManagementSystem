
import { useState } from "react";
import { BookMarked, Clock3 } from "lucide-react";

import useDemoAuth from "../hooks/useDemoAuth";
import { useUiSettings } from "../ui/settings";

import {
  reservationService,
  useReservations,
} from "../services/reservationService";

const ACTIVE = new Set(["waiting", "ready"]);

const ACTIVE_LOANS = new Set([
  "pending",
  "approved",
  "borrowed",
]);

const messages = {
  vi: {
    title: "Đặt trước sách",
    description:
      "Sách hết bản có thể đặt trước để tham gia hàng chờ.",
    demo:
      "Dữ liệu demo được lưu trên trình duyệt.",
    choose: "Chọn sách cần đặt trước",
    placeholder: "-- Chọn sách đang hết bản --",
    submit: "Gửi yêu cầu đặt trước",
    emptyBooks: "Không có sách phù hợp để đặt trước.",
    historyTitle: "Yêu cầu đặt trước của tôi",
    empty: "Bạn chưa có yêu cầu phù hợp.",
    active: "Đang hoạt động",
    history: "Lịch sử",
    all: "Tất cả",
    waiting: "Đang chờ sách",
    ready: "Sẵn sàng nhận",
    collected: "Đã nhận sách",
    cancelled: "Đã hủy",
    expired: "Hết hạn giữ",
    created: "Ngày tạo",
    position: "Vị trí hàng chờ",
    expiry: "Giữ đến",
    cancel: "Hủy yêu cầu",
    confirm: "Bạn muốn hủy đặt trước sách này?",
    success: "Đã tạo yêu cầu đặt trước.",
    cancelSuccess: "Đã hủy yêu cầu.",
    unavailable: "Sách không thể đặt trước.",
    invalidBook: "Không tìm thấy sách.",
    duplicate: "Bạn đã đặt trước sách này.",
    activeLoan: "Bạn đang có phiếu mượn sách này.",
    storageFailed: "Không lưu được dữ liệu.",
    notFound: "Không tìm thấy yêu cầu.",
    cannotCancel: "Không thể hủy yêu cầu này.",
    loginRequired: "Bạn cần đăng nhập.",
    loading: "Đang tải dữ liệu...",
    serverError: "Không thực hiện được yêu cầu.",
  },
  en: {
    title: "Book reservations",
    description:
      "Join the waiting queue for out-of-stock books.",
    demo: "Demo data is stored in this browser.",
    choose: "Choose a book",
    placeholder: "-- Select an unavailable book --",
    submit: "Place reservation",
    emptyBooks: "No eligible books.",
    historyTitle: "My reservations",
    empty: "No matching reservations.",
    active: "Active",
    history: "History",
    all: "All",
    waiting: "Waiting",
    ready: "Ready for pickup",
    collected: "Collected",
    cancelled: "Cancelled",
    expired: "Expired",
    created: "Created",
    position: "Queue position",
    expiry: "Hold expires",
    cancel: "Cancel reservation",
    confirm: "Cancel this reservation?",
    success: "Reservation created.",
    cancelSuccess: "Reservation cancelled.",
    unavailable: "Book cannot be reserved.",
    invalidBook: "Book not found.",
    duplicate: "Reservation already exists.",
    activeLoan: "You already have an active loan.",
    storageFailed: "Could not save data.",
    notFound: "Reservation not found.",
    cannotCancel: "Cannot cancel this reservation.",
    loginRequired: "Please sign in.",
    loading: "Loading...",
    serverError: "Request failed.",
  },
};

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

export default function ReservationQueuePanel(props) {
  return props.local ? <ReservationView {...props} user={props.user} data={{rows:props.local.reservations,allRows:props.local.reservations,isDemo:false,loading:false,error:"",refresh:()=>{}}} service={{
    canReserveBook:book=>!book.archived && book.availableCopies===0 && book.totalCopies>0,
    getPosition:(_rows,row)=>row.position ?? null,
    create:({book})=>props.local.command("reservation.create",{bookId:book.id}),
    cancel:({id})=>props.local.command("reservation.cancel",{id}),
  }} /> : <DemoReservationView {...props} />;
}
function DemoReservationView(props) {
  const {user}=useDemoAuth();
  const data=useReservations({readerEmail:user?.email||""});
  return <ReservationView {...props} user={user} data={data} service={reservationService} />;
}
function ReservationView({books=[],requests=[],user,data,service}) {
  const { language } = useUiSettings();
  const copy = messages[language] || messages.vi;
  const email = user?.email || "";
  const {rows,allRows,isDemo,loading,error,refresh}=data;

  const [selectedId, setSelectedId] = useState("");
  const [tab, setTab] = useState("active");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const activeBookIds = new Set(
    rows
      .filter((item) => ACTIVE.has(item.status))
      .map((item) => item.bookId),
  );

  const activeLoanIds = new Set(
    requests
      .filter((item) => ACTIVE_LOANS.has(item.status))
      .map((item) => item.bookId),
  );

  const reservableBooks = books.filter(
    (book) =>
      service.canReserveBook(book) &&
      !activeBookIds.has(book.id) &&
      !activeLoanIds.has(book.id),
  );

  const selectedBook = reservableBooks.find(
    (book) => book.id === selectedId,
  );

  const visibleRows = rows
    .filter(
      (item) =>
        tab === "all" ||
        (tab === "active"
          ? ACTIVE.has(item.status)
          : !ACTIVE.has(item.status)),
    )
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

  async function handleCreate(event) {
    event.preventDefault();

    if (!selectedBook || busy) return;

    setBusy(true);
    setFeedback(null);

    try {
      const result = await service.create({
        readerEmail: email,
        book: selectedBook,
        requests,
      });

      setFeedback({
        ok: result.ok,
        text: resultText(result, "success"),
      });

      if (result.ok) {
        setSelectedId("");
        setTab("active");
        refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel(id) {
    if (busy || !window.confirm(copy.confirm)) {
      return;
    }

    setBusy(true);
    setFeedback(null);

    try {
      const result = await service.cancel({
        readerEmail: email,
        id,
      });

      setFeedback({
        ok: result.ok,
        text: resultText(result, "cancelSuccess"),
      });

      if (result.ok) refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="reader-panel">
        <div className="reader-panel-heading">
          <h2>
            <BookMarked
              size={19}
              aria-hidden="true"
              style={{ verticalAlign: "middle" }}
            />{" "}
            {copy.title}
          </h2>
        </div>

        <p className="reader-muted">
          {copy.description}
        </p>

        {isDemo && (
          <p className="reader-muted">{copy.demo}</p>
        )}

        <form
          className="borrow-form"
          onSubmit={handleCreate} data-testid="reservation-create"
        >
          <label className="reader-field">
            <span>{copy.choose}</span>

            <select
              value={selectedBook?.id || ""}
              disabled={loading || busy}
              onChange={(event) => {
                setSelectedId(event.target.value);
                setFeedback(null);
              }}
              required
            >
              <option value="">
                {copy.placeholder}
              </option>

              {reservableBooks.map((book) => (
                <option key={book.id} value={book.id}>
                  {book.title} — {book.author}
                </option>
              ))}
            </select>
          </label>

          {selectedBook && (
            <div className="borrow-selection">
              <div>
                <h3>{selectedBook.title}</h3>
                <p>{selectedBook.author}</p>
              </div>
            </div>
          )}

          <div className="borrow-submit-row">
            <button
              type="submit"
              className="borrow-button"
              disabled={!selectedBook || busy || loading}
            >
              {copy.submit}
            </button>
          </div>
        </form>

        {reservableBooks.length === 0 && (
          <p className="reader-muted">
            {copy.emptyBooks}
          </p>
        )}

        {feedback && (
          <p
            className="reader-status"
            role={feedback.ok ? "status" : "alert"}
          >
            {feedback.text}
          </p>
        )}
      </div>

      <div className="loan-panel" data-testid="reservation-history">
        <div className="loan-panel-heading">
          <h2>{copy.historyTitle}</h2>
          <span>{rows.length}</span>
        </div>

        <div
          className="loan-tabs"
          role="group"
          aria-label={copy.historyTitle}
        >
          {["active", "history", "all"].map((key) => (
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
          <p className="reader-muted">{copy.loading}</p>
        )}

        {error && (
          <p className="reader-status" role="alert">
            {error}
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
                service.getPosition(
                  allRows,
                  item,
                );

              return (
                <article
                  className="loan-record"
                  key={item.id}
                >
                  <div className="loan-record-info">
                    <h3>
                      {book?.title || item.title}
                    </h3>

                    <p>
                      <strong>
                        {copy[item.status] ||
                          item.status}
                      </strong>
                    </p>

                    <p>
                      <Clock3
                        size={14}
                        aria-hidden="true"
                        style={{
                          verticalAlign: "middle",
                        }}
                      />{" "}
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

                    {ACTIVE.has(item.status) && (
                      <button
                        type="button"
                        className="loan-button"
                        disabled={busy}
                        onClick={() =>
                          handleCancel(item.id)
                        }
                      >
                        {copy.cancel}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
