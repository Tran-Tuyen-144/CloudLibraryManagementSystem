import {
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import { Clock3, Search, X } from "lucide-react";

import {
  historyChanges,
  libraryHistory,
} from "../data/libraryHistory";

import { useLibraryData } from "../ui/libraryStore";
import { authMessages } from "../ui/authMessages";
import { loanMessages } from "../ui/loanMessages";
import { useUiSettings } from "../ui/settings";

import "./HistoryPage.css";

const messages = {
  vi: {
    audit: "Lịch sử thao tác",
    access: "Lịch sử truy cập",
    allScope: "Toàn bộ tài khoản",
    ownScope: "Chỉ tài khoản của bạn",

    intro:
      "Nhật ký demo lưu trong trình duyệt này. Thời gian hiển thị theo thiết bị.",

    accessHint:
      "Gồm đăng nhập, đăng xuất, mở trang quản trị và truy cập bị từ chối. Chỉ có sự kiện được ghi từ khi tính năng tương ứng hoạt động.",

    auditHint:
      "Xem thao tác mượn trả, thay đổi sách và tài khoản, cùng dữ liệu trước và sau khi sửa.",

    search: "Tìm trong nhật ký",
    searchHint: "Tên, email, tên sách hoặc mã đối tượng…",
    from: "Từ ngày",
    to: "Đến ngày",
    result: "Kết quả",
    action: "Sự kiện",
    sort: "Sắp xếp",
    all: "Tất cả",
    newest: "Mới nhất trước",
    oldest: "Cũ nhất trước",
    reset: "Đặt lại",
    success: "Thành công",
    failed: "Thất bại",
    denied: "Bị từ chối",
    matches: "Kết quả phù hợp",
    total: "Sự kiện được phép xem",
    issues: "Thất bại / từ chối",
    time: "Thời gian",
    actor: "Người thực hiện",
    target: "Đối tượng",
    details: "Chi tiết",
    close: "Đóng",

    empty: "Chưa có sự kiện phù hợp",
    emptyHint:
      "Thử đổi bộ lọc hoặc thực hiện thao tác rồi quay lại xem.",

    previous: "Trang trước",
    next: "Trang sau",
    page: "Trang",
    unknown: "Chưa xác thực",
    attemptedEmail: "Email thử đăng nhập",
    identifier: "Mã đối tượng",
    error: "Lý do",
    changes: "Dữ liệu thay đổi",
    field: "Trường",
    before: "Trước",
    after: "Sau",

    noChanges:
      "Sự kiện này không có dữ liệu thay đổi được ghi lại.",

    yes: "Có",
    no: "Không",

    invalidRange:
      "Chọn khoảng ngày hợp lệ; ngày bắt đầu không được sau ngày kết thúc.",

    forbidden: "Bạn không có quyền xem nhật ký này.",
    invalidPolicy: "Quy định mượn trả không hợp lệ.",
    invalidLibraryInfo: "Thông tin thư viện không hợp lệ.",
    invalidContact: "Thông tin liên hệ không hợp lệ.",
    settingsConflict:
      "Cài đặt đã được cập nhật ở phiên khác.",
    invalidBook: "Thông tin sách không hợp lệ.",
    invalidAccount: "Thông tin tài khoản không hợp lệ.",
    duplicateIsbn: "ISBN đã tồn tại.",
    stockBelowLoans:
      "Số bản thấp hơn số đang giữ chỗ hoặc đang mượn.",
    lastAdmin:
      "Cần giữ ít nhất một admin đang hoạt động.",
    invalidPassword: "Mật khẩu không hợp lệ.",
    invalidUrl: "URL không hợp lệ.",
    loginRequired: "Cần đăng nhập.",

    admin: "Quản trị viên",
    librarian: "Thủ thư",
    reader: "Bạn đọc",
    active: "Đang hoạt động",
    locked: "Đã khóa",

    pages: {
      overview: "Tổng quan",
      settings: "Cài đặt thư viện",
      loans: "Mượn trả",
      books: "Kho sách",
      readersPage: "Độc giả",
      staff: "Nhân sự",
      permissions: "Quyền tài khoản",
      audit: "Lịch sử thao tác",
      access: "Lịch sử truy cập",
      session: "Phiên đăng nhập",
      library: "Thư viện",
      "sample-records": "Dữ liệu mẫu",
    },

    events: {
      "login.success": "Đăng nhập",
      "login.failed": "Đăng nhập thất bại",
      logout: "Đăng xuất",
      "page.view": "Mở trang quản trị",
      "access.denied": "Truy cập bị từ chối",
      "loans.create.own": "Gửi yêu cầu mượn",
      "loans.cancel.own": "Hủy yêu cầu của mình",
      "loans.cancel.any": "Hủy phiếu mượn",
      "loans.approve": "Duyệt yêu cầu",
      "loans.reject": "Từ chối yêu cầu",
      "loans.handover": "Bàn giao sách",
      "loans.return": "Nhận trả sách",
      "book.create": "Thêm sách",
      "book.update": "Sửa sách",
      "book.archive": "Ẩn sách",
      "book.restore": "Hiện lại sách",
      "books.manage": "Quản lý sách",
      "account.create": "Tạo tài khoản nhân sự",
      "account.update": "Sửa tài khoản",
      "accounts.manage": "Quản lý nhân sự",
      "readers.manage": "Quản lý độc giả",
      "profile.update.own": "Sửa hồ sơ cá nhân",
      "demo.seed": "Tạo dữ liệu mẫu",
      "settings.manage": "Sửa cài đặt",
      "reports.export": "Xuất báo cáo CSV",
    },

    fields: {
      title: "Tên sách",
      author: "Tác giả",
      category: "Thể loại",
      isbn: "ISBN",
      cover: "URL ảnh bìa",
      description: "Mô tả",
      availableCopies: "Tổng số bản",
      archived: "Đã ẩn",
      email: "Email",
      fullName: "Họ tên",
      role: "Vai trò",
      status: "Trạng thái",
      bookId: "Mã sách",
      readerName: "Tên độc giả",
      dueDate: "Hạn trả",
      createdAt: "Ngày tạo",
      approvedAt: "Ngày duyệt",
      borrowedAt: "Ngày giao",
      returnedAt: "Ngày trả",
      rejectedAt: "Ngày từ chối",
      cancelledAt: "Ngày hủy",
      rejectionReason: "Lý do từ chối",
      maxActiveLoans: "Giới hạn phiếu",
      loanDays: "Số ngày mượn",
      libraryName: "Tên thư viện",
      address: "Địa chỉ nhận sách",
      contactEmail: "Email liên hệ",
      phone: "Điện thoại",
      openingHours: "Giờ phục vụ",
    },
  },

  en: {
    audit: "Activity history",
    access: "Access history",
    allScope: "All accounts",
    ownScope: "Your account only",

    intro:
      "Demo logs are saved in this browser. Times use your device's timezone.",

    accessHint:
      "Includes sign-ins, sign-outs, management page visits and denied access. Events are recorded from when each feature became available.",

    auditHint:
      "Review loan processing, book and account updates, and recorded before/after changes.",

    search: "Search logs",
    searchHint: "Name, email, book title or target ID…",
    from: "From date",
    to: "To date",
    result: "Result",
    action: "Event",
    sort: "Sort",
    all: "All",
    newest: "Newest first",
    oldest: "Oldest first",
    reset: "Reset",
    success: "Successful",
    failed: "Failed",
    denied: "Denied",
    matches: "Matching events",
    total: "Visible events",
    issues: "Failed / denied",
    time: "Time",
    actor: "Actor",
    target: "Target",
    details: "Details",
    close: "Close",

    empty: "No matching events",
    emptyHint:
      "Change filters, or perform an action and return here.",

    previous: "Previous",
    next: "Next",
    page: "Page",
    unknown: "Unauthenticated",
    attemptedEmail: "Attempted sign-in email",
    identifier: "Target ID",
    error: "Reason",
    changes: "Recorded changes",
    field: "Field",
    before: "Before",
    after: "After",

    noChanges:
      "No changed data was recorded for this event.",

    yes: "Yes",
    no: "No",

    invalidRange:
      "Choose valid dates; the start date must not be after the end date.",

    forbidden:
      "You do not have permission to view these logs.",

    invalidPolicy: "Invalid borrowing rules.",
    invalidLibraryInfo: "Invalid library information.",
    invalidContact: "Invalid contact information.",
    settingsConflict:
      "Settings changed in another session.",
    invalidBook: "Invalid book details.",
    invalidAccount: "Invalid account details.",
    duplicateIsbn: "ISBN already exists.",
    stockBelowLoans:
      "Total copies cannot cover reservations and loans.",
    lastAdmin:
      "At least one active administrator must remain.",
    invalidPassword: "Invalid password.",
    invalidUrl: "Invalid URL.",
    loginRequired: "Sign-in required.",

    admin: "Administrator",
    librarian: "Librarian",
    reader: "Reader",
    active: "Active",
    locked: "Locked",

    pages: {
      overview: "Overview",
      settings: "Library settings",
      loans: "Loans",
      books: "Book inventory",
      readersPage: "Readers",
      staff: "Staff",
      permissions: "Account permissions",
      audit: "Activity history",
      access: "Access history",
      session: "Sign-in session",
      library: "Library",
      "sample-records": "Sample records",
    },

    events: {
      "login.success": "Sign in",
      "login.failed": "Failed sign-in",
      logout: "Sign out",
      "page.view": "Open management page",
      "access.denied": "Access denied",
      "loans.create.own": "Request a book",
      "loans.cancel.own": "Cancel own request",
      "loans.cancel.any": "Cancel loan record",
      "loans.approve": "Approve request",
      "loans.reject": "Reject request",
      "loans.handover": "Hand over book",
      "loans.return": "Record return",
      "book.create": "Add book",
      "book.update": "Edit book",
      "book.archive": "Hide book",
      "book.restore": "Restore book",
      "books.manage": "Manage books",
      "account.create": "Create staff account",
      "account.update": "Edit account",
      "accounts.manage": "Manage staff",
      "readers.manage": "Manage readers",
      "profile.update.own": "Edit own profile",
      "demo.seed": "Create sample data",
      "settings.manage": "Edit settings",
      "reports.export": "Export CSV report",
    },

    fields: {
      title: "Title",
      author: "Author",
      category: "Category",
      isbn: "ISBN",
      cover: "Cover URL",
      description: "Description",
      availableCopies: "Total copies",
      archived: "Hidden",
      email: "Email",
      fullName: "Full name",
      role: "Role",
      status: "Status",
      bookId: "Book ID",
      readerName: "Reader name",
      dueDate: "Due date",
      createdAt: "Created at",
      approvedAt: "Approved at",
      borrowedAt: "Handed over at",
      returnedAt: "Returned at",
      rejectedAt: "Rejected at",
      cancelledAt: "Cancelled at",
      rejectionReason: "Rejection reason",
      maxActiveLoans: "Active record limit",
      loanDays: "Loan duration",
      libraryName: "Library name",
      address: "Collection address",
      contactEmail: "Contact email",
      phone: "Phone",
      openingHours: "Opening hours",
    },
  },
};

const initialFilters = {
  query: "",
  from: "",
  to: "",
  result: "all",
  action: "all",
  sort: "newest",
};

const pageSize = 20;

function formatTime(value, language) {
  const date = new Date(value);

  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(
        language === "vi" ? "vi-VN" : "en-GB",
        {
          dateStyle: "medium",
          timeStyle: "medium",
        },
      ).format(date)
    : "—";
}

function eventLabel(log, copy) {
  const key = log.operation || log.action;
  return copy.events[key] || key;
}

function targetLabel(log, copy) {
  return (
    log.after?.title ||
    log.before?.title ||
    log.after?.fullName ||
    log.before?.fullName ||
    copy.pages[log.targetId] ||
    log.targetId ||
    "—"
  );
}

function displayValue(value, field, copy, language) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return "—";
  }

  if (typeof value === "boolean") {
    return value ? copy.yes : copy.no;
  }

  if (field.endsWith("At")) {
    return formatTime(value, language);
  }

  if (["role", "status"].includes(field)) {
    return (
      copy[value] ||
      loanMessages[language][value] ||
      String(value)
    );
  }

  return String(value);
}

function HistoryDialog({
  log,
  copy,
  language,
  onClose,
}) {
  const dialog = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const element = dialog.current;
    element.showModal();

    return () => element.close();
  }, []);

  const changes = historyChanges(log);

  const reason =
    copy[log.error] ||
    authMessages[language][log.error] ||
    loanMessages[language][log.error] ||
    log.error;

  const details = [
    [copy.time, formatTime(log.at, language)],

    [
      copy.actor,
      [log.actorName, log.actorEmail]
        .filter(Boolean)
        .join(" · ") || copy.unknown,
    ],

    [
      copy.result,
      copy[log.result] || log.result || "—",
    ],

    [copy.target, targetLabel(log, copy)],
    [copy.identifier, log.targetId || "—"],

    ...(log.attemptedEmail
      ? [[copy.attemptedEmail, log.attemptedEmail]]
      : []),

    ...(reason ? [[copy.error, reason]] : []),
  ];

  return (
    <dialog
      ref={dialog}
      className="history-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="history-dialog-heading">
        <h2 id={titleId}>
          {eventLabel(log, copy)}
        </h2>

        <button
          type="button"
          onClick={onClose}
          aria-label={copy.close}
        >
          <X size={20} />
        </button>
      </div>

      <dl className="history-detail-list">
        {details.map(([name, value]) => (
          <div key={name}>
            <dt>{name}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      <h3>{copy.changes}</h3>

      {changes.length ? (
        <div
          className="history-table-scroll"
          tabIndex={0}
          role="region"
          aria-label={copy.changes}
        >
          <table className="history-table history-changes">
            <thead>
              <tr>
                {[
                  copy.field,
                  copy.before,
                  copy.after,
                ].map((label) => (
                  <th scope="col" key={label}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {changes.map(({ field, before, after }) => (
                <tr key={field}>
                  <th scope="row">
                    {copy.fields[field] || field}
                  </th>

                  <td>
                    {displayValue(
                      before,
                      field,
                      copy,
                      language,
                    )}
                  </td>

                  <td>
                    {displayValue(
                      after,
                      field,
                      copy,
                      language,
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="history-muted">
          {copy.noChanges}
        </p>
      )}
    </dialog>
  );
}

export default function HistoryPage({ kind }) {
  const { language } = useUiSettings();
  const copy = messages[language];
  const data = useLibraryData();

  const [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState(null);

  const view = libraryHistory(data, kind, filters);

  const pageCount = Math.max(
    1,
    Math.ceil(view.rows.length / pageSize),
  );

  const currentPage = Math.min(page, pageCount);

  const visible = view.rows.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  const selected =
    selectedId &&
    libraryHistory(data, kind).rows.find(
      (row) => row.id === selectedId,
    );

  function change(name, value) {
    setFilters((current) => ({
      ...current,
      [name]: value,
    }));

    setPage(1);
  }

  if (!view.allowed) {
    return <p role="alert">{copy.forbidden}</p>;
  }

  return (
    <section
      className="history-page loan-workspace"
      aria-label={copy[kind]}
    >
      <div className="history-heading">
        <div>
          <h2>
            <Clock3 size={23} aria-hidden="true" />
            {copy[kind]}
          </h2>

          <p>
            {
              copy[
                kind === "audit"
                  ? "auditHint"
                  : "accessHint"
              ]
            }
          </p>
        </div>

        <span className="history-scope">
          {copy[view.all ? "allScope" : "ownScope"]}
        </span>
      </div>

      <p className="history-muted">{copy.intro}</p>

      <div className="history-stats">
        {[
          [copy.matches, view.rows.length],
          [copy.total, view.total],
          [
            copy.issues,
            view.rows.filter((row) =>
              ["failed", "denied"].includes(row.result),
            ).length,
          ],
        ].map(([label, count]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{count}</strong>
          </div>
        ))}
      </div>

      <div className="history-filters">
        <label className="history-field history-search">
          <span>
            <Search size={15} aria-hidden="true" />
            {copy.search}
          </span>

          <input
            type="search"
            value={filters.query}
            placeholder={copy.searchHint}
            onChange={(event) =>
              change("query", event.target.value)
            }
          />
        </label>

        {["from", "to"].map((name) => (
          <label className="history-field" key={name}>
            <span>{copy[name]}</span>

            <input
              type="date"
              value={filters[name]}
              onChange={(event) =>
                change(name, event.target.value)
              }
            />
          </label>
        ))}

        <label className="history-field">
          <span>{copy.result}</span>

          <select
            aria-label={copy.result}
            value={filters.result}
            onChange={(event) =>
              change("result", event.target.value)
            }
          >
            {[
              "all",
              "success",
              "failed",
              "denied",
            ].map((value) => (
              <option key={value} value={value}>
                {copy[value]}
              </option>
            ))}
          </select>
        </label>

        <label className="history-field">
          <span>{copy.action}</span>

          <select
            aria-label={copy.action}
            value={filters.action}
            onChange={(event) =>
              change("action", event.target.value)
            }
          >
            <option value="all">{copy.all}</option>

            {view.actions.map((value) => (
              <option key={value} value={value}>
                {copy.events[value] || value}
              </option>
            ))}
          </select>
        </label>

        <label className="history-field">
          <span>{copy.sort}</span>

          <select
            aria-label={copy.sort}
            value={filters.sort}
            onChange={(event) =>
              change("sort", event.target.value)
            }
          >
            {["newest", "oldest"].map((value) => (
              <option key={value} value={value}>
                {copy[value]}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className="loan-button"
          onClick={() => {
            setFilters(initialFilters);
            setPage(1);
          }}
        >
          {copy.reset}
        </button>
      </div>

      {view.error && (
        <p className="history-error" role="alert">
          {copy[view.error]}
        </p>
      )}

      <div
        className="history-table-scroll"
        tabIndex={0}
        role="region"
        aria-label={copy[kind]}
      >
        <table className="history-table">
          <thead>
            <tr>
              {[
                copy.time,
                copy.actor,
                copy.action,
                copy.target,
                copy.result,
                copy.details,
              ].map((label) => (
                <th scope="col" key={label}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {visible.map((log) => (
              <tr key={log.id}>
                <td>
                  <time dateTime={log.at || undefined}>
                    {formatTime(log.at, language)}
                  </time>
                </td>

                <td>
                  <strong>
                    {log.actorName ||
                      log.actorEmail ||
                      copy.unknown}
                  </strong>

                  {log.actorEmail && (
                    <small>{log.actorEmail}</small>
                  )}

                  {log.actorRole && (
                    <small>
                      {copy[log.actorRole] || log.actorRole}
                    </small>
                  )}

                  {log.attemptedEmail && (
                    <small>
                      {copy.attemptedEmail}:{" "}
                      {log.attemptedEmail}
                    </small>
                  )}
                </td>

                <th scope="row">
                  {eventLabel(log, copy)}
                </th>

                <td>{targetLabel(log, copy)}</td>

                <td>
                  <span
                    className={`history-result is-${
                      [
                        "success",
                        "failed",
                        "denied",
                      ].includes(log.result)
                        ? log.result
                        : "unknown"
                    }`}
                  >
                    {copy[log.result] ||
                      log.result ||
                      "—"}
                  </span>
                </td>

                <td>
                  <button
                    className="loan-button"
                    type="button"
                    aria-label={`${
                      copy.details
                    }: ${eventLabel(
                      log,
                      copy,
                    )} · ${formatTime(
                      log.at,
                      language,
                    )} · ${
                      log.actorEmail || copy.unknown
                    }`}
                    onClick={() => setSelectedId(log.id)}
                  >
                    {copy.details}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {!visible.length && (
          <div className="history-empty">
            <h3>{copy.empty}</h3>
            <p>{copy.emptyHint}</p>
          </div>
        )}
      </div>

      <nav
        className="history-pagination"
        aria-label={copy.page}
      >
        <button
          className="loan-button"
          type="button"
          disabled={currentPage <= 1}
          onClick={() => setPage(currentPage - 1)}
        >
          {copy.previous}
        </button>

        <span role="status">
          {copy.page} {currentPage} / {pageCount}
        </span>

        <button
          className="loan-button"
          type="button"
          disabled={currentPage >= pageCount}
          onClick={() => setPage(currentPage + 1)}
        >
          {copy.next}
        </button>
      </nav>

      {selected && (
        <HistoryDialog
          key={selected.id}
          log={selected}
          copy={copy}
          language={language}
          onClose={() => setSelectedId(null)}
        />
      )}
    </section>
  );
}