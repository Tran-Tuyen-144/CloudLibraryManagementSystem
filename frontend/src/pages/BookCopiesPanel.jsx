
import {
  useMemo,
  useState,
} from "react";

import {
  Barcode,
  BookCopy,
  Search,
  Wrench,
} from "lucide-react";

import { useUiSettings } from "../ui/settings";

import {
  bookCopiesService,
  useBookCopies,
} from "../services/bookCopiesService.js";

import "./ReaderPages.css";
import "./LoanWorkspace.css";

const messages = {
  vi: {
    title: "Tra cứu và quản lý từng bản sách",

    description:
      "Mỗi bản sách có một mã riêng. Có thể nhập hoặc quét mã vạch bằng máy quét hoạt động như bàn phím.",

    demo:
      "Mã CL-... là mã mô phỏng ổn định theo đầu sách và vị trí. Phiếu mượn hiện tại chưa lưu mã bản sách thực; trạng thái được suy ra từ phiếu.",

    reservationNote:
      "Giữ sách READY ở bước 2 vẫn là demo, chưa liên kết mã bản sách. Trạng thái HELD thật sẽ do Backend quản lý.",

    api:
      "Chế độ API: trạng thái và mã bản sách được trả về từ Backend.",

    search:
      "Nhập hoặc quét mã bản sách, tên sách, ISBN...",

    status: "Trạng thái",
    all: "Tất cả",
    available: "Còn sẵn",
    reserved: "Đang giữ để bàn giao",
    borrowed: "Đang mượn",
    held: "Giữ cho đặt trước",
    maintenance: "Bảo trì",
    retired: "Ngừng lưu hành",
    total: "Tổng số bản",
    inUse: "Đang giữ / đang mượn",
    book: "Đầu sách",
    reader: "Độc giả",
    loan: "Mã phiếu",
    none: "Không tìm thấy bản sách phù hợp.",
    results: "bản sách",
    more: "Xem thêm",

    makeMaintenance: "Đưa vào bảo trì",
    makeAvailable: "Đưa vào phục vụ",

    confirmMaintenance:
      "Chuyển bản sách này sang bảo trì? Bản này sẽ không còn được tính là còn sẵn.",

    confirmAvailable:
      "Đưa bản sách này trở lại phục vụ?",

    updated: "Đã cập nhật trạng thái bản sách.",
    invalidStatus: "Trạng thái không hợp lệ.",

    copyInUse:
      "Bản sách đang giữ hoặc đang mượn, không thể đổi trạng thái.",

    notFound: "Không tìm thấy bản sách.",
    alreadyUpdated:
      "Bản sách đã ở trạng thái này.",

    forbidden:
      "Tài khoản không có quyền quản lý bản sách.",

    storageFailed:
      "Không lưu được dữ liệu demo.",

    networkError:
      "Không kết nối được API.",

    serverError:
      "Không thể cập nhật bản sách.",

    loading: "Đang tải bản sách...",

    viewOnly:
      "Thủ thư được tra cứu; chỉ admin được chuyển bản sách vào/ra bảo trì trong bản demo.",
  },

  en: {
    title: "Individual book copy inventory",

    description:
      "Each physical copy has a code. A keyboard-style barcode scanner can type directly into the search field.",

    demo:
      "CL-... codes are stable demo IDs. Current loan records do not store physical copy IDs; statuses are derived from loans.",

    reservationNote:
      "Step 2's READY reservations are not linked to physical copies. The backend will manage real HELD states.",

    api:
      "API mode: physical copy IDs and statuses are provided by the backend.",

    search:
      "Type or scan a copy code, book title, ISBN...",

    status: "Status",
    all: "All",
    available: "Available",
    reserved: "Reserved for handover",
    borrowed: "Borrowed",
    held: "Held for reservation",
    maintenance: "Maintenance",
    retired: "Retired",
    total: "Total copies",
    inUse: "Reserved / borrowed",
    book: "Book",
    reader: "Reader",
    loan: "Loan ID",
    none: "No matching copies.",
    results: "copies",
    more: "Show more",

    makeMaintenance: "Send to maintenance",
    makeAvailable: "Return to circulation",

    confirmMaintenance:
      "Send this copy to maintenance? It will no longer count as available.",

    confirmAvailable:
      "Return this copy to circulation?",

    updated: "Copy status updated.",
    invalidStatus: "Invalid status.",

    copyInUse:
      "This copy is in use and cannot be changed.",

    notFound: "Copy not found.",
    alreadyUpdated:
      "Copy already has this status.",

    forbidden:
      "Not authorized to manage copies.",

    storageFailed:
      "Unable to save demo data.",

    networkError:
      "Cannot connect to API.",

    serverError:
      "Could not update copy.",

    loading: "Loading book copies...",

    viewOnly:
      "Librarians can search; only administrators can change maintenance status in demo mode.",
  },
};

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .toLowerCase();
}

export default function BookCopiesPanel(props) {
  return props.local ? <CopiesView data={{rows:props.local.copies,books:props.books,canRead:true,canMaintain:props.user?.role==="admin",isDemo:false,loading:false,error:"",refresh:()=>{}}} service={{update:({id,status})=>props.local.command("copy.update",{id,status})}} /> : <DemoCopiesView />;
}
function DemoCopiesView() {
  const data=useBookCopies();
  return <CopiesView data={data} service={bookCopiesService} />;
}
function CopiesView({data,service}) {
  const { language }=useUiSettings();
  const copy=messages[language]||messages.vi;
  const {rows,books,canRead,canMaintain,isDemo,loading,error,refresh}=data;

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [limit, setLimit] = useState(60);
  const [busyId, setBusyId] = useState("");
  const [feedback, setFeedback] = useState(null);

  const bookById = useMemo(
    () =>
      new Map(
        books.map(
          (book) => [book.id, book],
        ),
      ),
    [books],
  );

  const counts = {
    total: rows.length,

    available: rows.filter(
      (item) =>
        item.status === "available",
    ).length,

    inUse: rows.filter(
      (item) =>
        [
          "reserved",
          "borrowed",
          "held",
        ].includes(item.status),
    ).length,

    maintenance: rows.filter(
      (item) =>
        item.status === "maintenance",
    ).length,
  };

  const keyword = normalize(query.trim());

  const visible = rows.filter((item) => {
    const book = bookById.get(item.bookId);

    return (
      (status === "all" ||
        item.status === status) &&
      normalize(
        `${item.code} ${book?.title || ""} ${
          book?.isbn || ""
        } ${item.readerEmail || ""}`,
      ).includes(keyword)
    );
  });

  async function changeStatus(item) {
    if (busyId || !canMaintain) {
      return;
    }

    const nextStatus =
      item.status === "available"
        ? "maintenance"
        : "available";

    const message =
      nextStatus === "maintenance"
        ? copy.confirmMaintenance
        : copy.confirmAvailable;

    if (!window.confirm(message)) {
      return;
    }

    setBusyId(item.id);
    setFeedback(null);

    try {
      const result =
        await service.update({
          id: item.id,
          bookId: item.bookId,
          slot: item.slot,
          status: nextStatus,
        });

      setFeedback({
        ok: result.ok,

        message: result.ok
          ? copy.updated
          : copy[result.error] ||
            result.message ||
            copy.serverError,
      });

      if (result.ok) {
        refresh();
      }
    } finally {
      setBusyId("");
    }
  }

  if (!canRead) {
    return null;
  }

  return (
    <section
      className="reader-page loan-workspace"
      aria-label={copy.title} data-testid="copy-inventory"
    >
      <div className="loan-panel">
        <div className="loan-panel-heading">
          <h2>
            <BookCopy
              size={21}
              aria-hidden="true"
              style={{
                verticalAlign: "middle",
              }}
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

        {isDemo && (
          <p className="reader-muted">
            {copy.reservationNote}
          </p>
        )}

        <p className="reader-muted">
          {isDemo ? copy.viewOnly : (language === "en" ? "Copy maintenance is restricted to authorized administrators." : "Chỉ quản trị viên có quyền mới được đổi trạng thái bảo trì.")}
        </p>

        <div className="loan-stats">
          {[
            ["total", counts.total],
            ["available", counts.available],
            ["inUse", counts.inUse],
            ["maintenance", counts.maintenance],
          ].map(([key, value]) => (
            <div
              className="loan-stat"
              key={key}
            >
              <span className="loan-stat-label">
                {copy[key]}
              </span>

              <strong>{value}</strong>
            </div>
          ))}
        </div>
      </div>

      <div className="loan-panel">
        <div className="loan-panel-heading">
          <h2>
            <Barcode
              size={20}
              aria-hidden="true"
              style={{
                verticalAlign: "middle",
              }}
            />{" "}
            {copy.results}
          </h2>

          <span>
            {visible.length} / {rows.length}{" "}
            {copy.results}
          </span>
        </div>

        <label className="loan-search">
          <Search
            size={18}
            aria-hidden="true"
          />

          <input
            type="search"
            value={query}
            placeholder={copy.search}
            aria-label={copy.search}
            onChange={(event) => {
              setQuery(event.target.value);
              setLimit(60);
            }}
          />
        </label>

        <label className="reader-field">
          <span>{copy.status}</span>

          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setLimit(60);
            }}
          >
            {[
              "all",
              "available",
              "reserved",
              "borrowed",
              "held",
              "maintenance",
              "retired",
            ].map((key) => (
              <option
                key={key}
                value={key}
              >
                {copy[key]}
              </option>
            ))}
          </select>
        </label>

        {loading && (
          <p className="reader-muted">
            {copy.loading}
          </p>
        )}

        {error && (
          <p
            className="loan-feedback"
            role="alert"
          >
            {error}
          </p>
        )}

        {feedback && (
          <p
            className="loan-feedback"
            role={
              feedback.ok
                ? "status"
                : "alert"
            }
          >
            {feedback.message}
          </p>
        )}

        {!loading && visible.length === 0 ? (
          <div className="loan-empty">
            <p>{copy.none}</p>
          </div>
        ) : (
          <div className="loan-record-list">
            {visible
              .slice(0, limit)
              .map((item) => {
                const book = bookById.get(
                  item.bookId,
                );

                const canToggle =
                  canMaintain &&
                  [
                    "available",
                    "maintenance",
                  ].includes(item.status);

                return (
                  <article
                    className="loan-record"
                    key={item.id}
                  >
                    <div className="loan-record-main">
                      <div className="loan-record-info">
                        <h3>{item.code}</h3>

                        <p>
                          {copy.book}:{" "}
                          {book?.title ||
                            item.bookId}
                        </p>

                        <p>
                          <span
                            className={`loan-status is-${item.status}`}
                          >
                            {copy[item.status]}
                          </span>
                        </p>

                        {item.readerEmail && (
                          <p>
                            {copy.reader}:{" "}
                            {item.readerEmail}
                          </p>
                        )}

                        {item.loanId && (
                          <p>
                            {copy.loan}:{" "}
                            {item.loanId}
                          </p>
                        )}
                      </div>
                    </div>

                    {canToggle && (
                      <div className="loan-record-actions">
                        <button
                          type="button"
                          className="loan-button is-primary"
                          disabled={Boolean(busyId)}
                          onClick={() =>
                            changeStatus(item)
                          }
                        >
                          <Wrench
                            size={16}
                            aria-hidden="true"
                          />{" "}
                          {item.status ===
                          "available"
                            ? copy.makeMaintenance
                            : copy.makeAvailable}
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
          </div>
        )}

        {visible.length > limit && (
          <div className="loan-record-actions">
            <button
              type="button"
              className="loan-button"
              onClick={() =>
                setLimit(
                  (value) => value + 60,
                )
              }
            >
              {copy.more} (
              {visible.length - limit})
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
