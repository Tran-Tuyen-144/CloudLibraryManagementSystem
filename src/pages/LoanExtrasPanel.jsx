
import { useState } from "react";
import { BadgeCheck, CalendarClock, Search, Wallet } from "lucide-react";
import { useUiSettings } from "../ui/settings";
import {
  canRequestLoanRenewal,
  loanExtrasRules,
  loanExtrasService,
  loanFineInfo,
  useLoanExtras,
} from "../services/loanExtrasService";

const text = {
  vi: {
    readerTitle: "Gia hạn sách & tiền phạt của tôi",
    staffTitle: "Duyệt gia hạn & thu tiền phạt",
    policy: "Mỗi phiếu được gia hạn tối đa 1 lần, thêm 7 ngày nếu chưa quá hạn và sách không có người đặt trước. Phạt quá hạn 5.000 đ/ngày.",
    demo: "Chế độ demo trên trình duyệt; chưa thu tiền thật hoặc gọi AWS.",
    all: "Tất cả", active: "Đang mượn", history: "Đã trả", pending: "Chờ duyệt", fines: "Có tiền phạt",
    noRows: "Chưa có phiếu phù hợp.", search: "Tìm sách hoặc email độc giả...",
    borrowed: "Đang mượn", returned: "Đã trả", overdue: "Quá hạn", reader: "Độc giả",
    due: "Hạn trả", count: "Số lần gia hạn", status: "Gia hạn", fine: "Tiền phạt", estimated: "Dự tính đến hôm nay", unpaid: "Chưa thu", paid: "Đã thu", none: "Không phát sinh", days: "ngày trễ",
    request: "Xin gia hạn", approve: "Duyệt gia hạn", reject: "Từ chối", collect: "Xác nhận đã thu",
    renewalPending: "Đang chờ thủ thư duyệt", renewalApproved: "Đã duyệt", renewalRejected: "Đã từ chối",
    reason: "Lý do từ chối", reasonHint: "Ví dụ: Không đáp ứng điều kiện gia hạn", cancel: "Đóng",
    requestSuccess: "Đã gửi yêu cầu gia hạn.", approveSuccess: "Đã duyệt và cập nhật hạn trả.", rejectSuccess: "Đã từ chối gia hạn.", collectSuccess: "Đã xác nhận thu tiền phạt (demo).",
    confirmApprove: "Duyệt yêu cầu gia hạn phiếu này?", confirmCollect: "Xác nhận đã thu đủ {amount} tiền phạt? Đây chỉ là demo.",
    notFound: "Không tìm thấy phiếu mượn.", alreadyPending: "Đã có yêu cầu đang chờ duyệt.", notPending: "Yêu cầu gia hạn không còn chờ duyệt.",
    renewalNotAllowed: "Phiếu đã quá hạn, không đang mượn hoặc hết lượt gia hạn.", bookReserved: "Sách đã có người đặt trước, không thể gia hạn.", invalidDueDate: "Hạn trả không hợp lệ.", reasonRequired: "Vui lòng nhập lý do từ chối.",
    alreadyPaid: "Khoản phạt đã được thu.", fineNotCollectable: "Chỉ xác nhận thu sau khi đã trả sách và có tiền phạt.", storageFailed: "Không lưu được dữ liệu demo.", loginRequired: "Vui lòng đăng nhập.", forbidden: "Bạn không có quyền thực hiện thao tác này.", missingVersion: "Phiếu chưa có phiên bản API hợp lệ.", networkError: "Không kết nối được API.", serverError: "Không thực hiện được yêu cầu.", loading: "Đang tải dữ liệu...",
  },
  en: {
    readerTitle: "My renewals & fines", staffTitle: "Renewal approvals & fine collection",
    policy: "One renewal per loan, adding 7 days if not overdue and no reservation is waiting. Late fee: VND 5,000 per day.",
    demo: "Browser demo; no real payment or AWS call.",
    all: "All", active: "Borrowed", history: "Returned", pending: "Pending", fines: "Fines",
    noRows: "No matching loans.", search: "Search book title or reader email...",
    borrowed: "Borrowed", returned: "Returned", overdue: "Overdue", reader: "Reader",
    due: "Due date", count: "Renewals used", status: "Renewal", fine: "Fine", estimated: "Estimated today", unpaid: "Unpaid", paid: "Paid", none: "No fine", days: "days late",
    request: "Request renewal", approve: "Approve renewal", reject: "Reject", collect: "Confirm collection",
    renewalPending: "Pending approval", renewalApproved: "Approved", renewalRejected: "Rejected",
    reason: "Rejection reason", reasonHint: "E.g. Renewal conditions not met", cancel: "Close",
    requestSuccess: "Renewal request submitted.", approveSuccess: "Renewal approved; due date updated.", rejectSuccess: "Renewal rejected.", collectSuccess: "Fine collection confirmed (demo).",
    confirmApprove: "Approve this renewal?", confirmCollect: "Confirm receipt of {amount}? This is demo only.",
    notFound: "Loan not found.", alreadyPending: "Renewal is already pending.", notPending: "Renewal is no longer pending.",
    renewalNotAllowed: "Loan is overdue, inactive, or has no renewals left.", bookReserved: "Another reader has reserved this book.", invalidDueDate: "Invalid due date.", reasonRequired: "Please enter a rejection reason.",
    alreadyPaid: "Fine has already been collected.", fineNotCollectable: "Fines can only be collected after return.", storageFailed: "Cannot save demo data.", loginRequired: "Please sign in.", forbidden: "You cannot perform this action.", missingVersion: "The API loan version is missing.", networkError: "Cannot reach the API.", serverError: "Request failed.", loading: "Loading...",
  },
};

function formatMoney(amount, language) {
  return `${Number(amount || 0).toLocaleString(language === "en" ? "en-US" : "vi-VN")} đ`;
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .toLowerCase();
}

export default function LoanExtrasPanel({ staff = false }) {
  const { language } = useUiSettings();
  const copy = text[language] || text.vi;
  const { rows, books, isStaff, isDemo, loading, error, refresh } = useLoanExtras({ all: staff });
  const [tab, setTab] = useState(staff ? "pending" : "active");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [rejectId, setRejectId] = useState("");
  const [reason, setReason] = useState("");
  const [clock, setClock] = useState(() => new Date());

  if (staff && !isStaff) return null;

  const loans = rows.filter((loan) => ["borrowed", "returned"].includes(loan.status));
  const visible = loans
    .filter((loan) => {
      const matchesTab = tab === "all" ||
        (tab === "active" && loan.status === "borrowed") ||
        (tab === "history" && loan.status === "returned") ||
        (tab === "pending" && loan.renewalStatus === "pending") ||
        (tab === "fines" && loanFineInfo(loan, clock).amount > 0);
      const book = books.find((item) => item.id === loan.bookId);
      return matchesTab && normalize(`${book?.title || loan.title} ${loan.readerEmail || ""}`)
        .includes(normalize(search.trim()));
    })
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

  async function execute(action, payload, successKey) {
    if (busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      const result = await loanExtrasService[action](payload);
      setFeedback({
        ok: result.ok,
        message: result.ok
          ? copy[successKey]
          : copy[result.error] || result.message || copy.serverError,
      });
      if (result.ok) {
        setRejectId("");
        setReason("");
        refresh();
      }
    } finally {
      setBusy(false);
      setClock(new Date());
    }
  }

  function requestRenewal(loan) {
    execute("requestRenewal", { loan }, "requestSuccess");
  }

  function approveRenewal(loan) {
    if (!window.confirm(copy.confirmApprove)) return;
    execute("decideRenewal", { loan, approve: true }, "approveSuccess");
  }

  function rejectRenewal(loan) {
    if (!reason.trim()) {
      setFeedback({ ok: false, message: copy.reasonRequired });
      return;
    }
    execute("decideRenewal", { loan, approve: false, reason }, "rejectSuccess");
  }

  function collectFine(loan, amount) {
    if (!window.confirm(copy.confirmCollect.replace("{amount}", formatMoney(amount, language)))) return;
    execute("collectFine", { loan }, "collectSuccess");
  }

  return (
    <section className="reader-page loan-workspace" aria-label={staff ? copy.staffTitle : copy.readerTitle}>
      <div className="loan-panel">
        <div className="loan-panel-heading">
          <h2>
            <CalendarClock size={20} aria-hidden="true" style={{ verticalAlign: "middle" }} />{" "}
            {staff ? copy.staffTitle : copy.readerTitle}
          </h2>
          <span>{loans.length}</span>
        </div>
        <p className="reader-muted">{copy.policy}</p>
        {isDemo && <p className="loan-demo-note">{copy.demo}</p>}

        {staff && (
          <label className="loan-search">
            <Search size={18} aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={copy.search}
              aria-label={copy.search}
            />
          </label>
        )}

        <div className="loan-tabs" role="group" aria-label={staff ? copy.staffTitle : copy.readerTitle}>
          {(staff ? ["pending", "fines", "all"] : ["active", "history", "all"]).map((key) => (
            <button key={key} type="button" className={tab === key ? "is-active" : ""}
              aria-pressed={tab === key} onClick={() => setTab(key)}>
              {copy[key]}
            </button>
          ))}
        </div>

        {loading && <p className="reader-muted">{copy.loading}</p>}
        {error && <p className="loan-feedback" role="alert">{error}</p>}
        {feedback && (
          <p className="loan-feedback" role={feedback.ok ? "status" : "alert"}>
            {feedback.message}
          </p>
        )}
        {!loading && visible.length === 0 ? (
          <div className="loan-empty"><p>{copy.noRows}</p></div>
        ) : (
          <div className="loan-record-list">
            {visible.map((loan) => {
              const book = books.find((item) => item.id === loan.bookId);
              const fine = loanFineInfo(loan, clock);
              const policy = loanExtrasRules(loan);
              const pending = loan.renewalStatus === "pending";
              const canRequest = canRequestLoanRenewal(loan, clock);
              return (
                <article className="loan-record" key={`${loan.readerEmail}:${loan.id}`}>
                  <div className="loan-record-main">
                    <div className="loan-record-info">
                      <h3>{book?.title || loan.title}</h3>
                      {staff && <p className="loan-reader">{copy.reader}: {loan.readerEmail}</p>}
                      <p>
                        <span className={`loan-status is-${loan.status}`}>{copy[loan.status]}</span>{" "}
                        {loan.status === "borrowed" && fine.overdueDays > 0 &&
                          <span className="loan-status is-overdue">{copy.overdue}</span>}
                      </p>
                    </div>
                  </div>
                  <div className="loan-record-meta">
                    <span><small>{copy.due}</small><strong>{loan.dueDate || "—"}</strong></span>
                    <span><small>{copy.count}</small><strong>{Number(loan.renewalCount || 0)} / {policy.maxRenewals}</strong></span>
                    <span><small>{copy.status}</small>
                      <strong>{loan.renewalStatus ? (copy[`renewal${loan.renewalStatus[0].toUpperCase()}${loan.renewalStatus.slice(1)}`] || loan.renewalStatus) : "—"}</strong>
                    </span>
                    <span><small>{copy.fine}</small>
                      <strong>{fine.amount > 0 ? formatMoney(fine.amount, language) : copy.none}</strong>
                    </span>
                  </div>
                  {fine.amount > 0 && (
                    <p className="loan-record-note">
                      <Wallet size={15} aria-hidden="true" style={{ verticalAlign: "middle" }} />{" "}
                      {fine.isEstimate ? copy.estimated : fine.paid ? copy.paid : copy.unpaid}
                      {fine.overdueDays !== null ? ` · ${fine.overdueDays} ${copy.days}` : ""}
                    </p>
                  )}
                  {loan.renewalStatus === "rejected" && loan.renewalReason && (
                    <p className="loan-record-note">{copy.reason}: {loan.renewalReason}</p>
                  )}
                  <div className="loan-record-actions">
                    {!staff && canRequest && (
                      <button className="loan-button is-primary" type="button" disabled={busy}
                        onClick={() => requestRenewal(loan)}>{copy.request}</button>
                    )}
                    {staff && pending && (
                      <>
                        <button className="loan-button is-primary" type="button" disabled={busy}
                          onClick={() => approveRenewal(loan)}>
                          <BadgeCheck size={16} aria-hidden="true" />{" "}{copy.approve}
                        </button>
                        <button className="loan-button" type="button" disabled={busy}
                          onClick={() => { setRejectId(rejectId === loan.id ? "" : loan.id); setReason(""); }}>
                          {copy.reject}
                        </button>
                      </>
                    )}
                    {staff && fine.canCollect && (
                      <button className="loan-button is-primary" type="button" disabled={busy}
                        onClick={() => collectFine(loan, fine.amount)}>
                        {copy.collect} {formatMoney(fine.amount, language)}
                      </button>
                    )}
                  </div>
                  {staff && pending && rejectId === loan.id && (
                    <div className="borrow-form">
                      <label className="reader-field">
                        <span>{copy.reason}</span>
                        <textarea value={reason} onChange={(event) => setReason(event.target.value)}
                          maxLength={300} rows={2} placeholder={copy.reasonHint} />
                      </label>
                      <div className="loan-record-actions">
                        <button className="loan-button" type="button" onClick={() => setRejectId("")}>{copy.cancel}</button>
                        <button className="loan-button is-primary" type="button" disabled={busy || !reason.trim()}
                          onClick={() => rejectRenewal(loan)}>{copy.reject}</button>
                      </div>
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
