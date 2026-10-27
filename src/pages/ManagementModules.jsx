import { useEffect, useId, useRef, useState } from "react";
import { Plus, Search, X } from "lucide-react";
import { createDemoCredential } from "../data/demoCredentials";
import { currentLibraryUser } from "../data/libraryData";
import { hasPermission, PERMISSIONS as P } from "../data/libraryPermissions";
import {
  archiveManagedBook,
  managedAccounts,
  saveManagedAccount,
  saveManagedBook,
} from "../data/managementActions";
import { availableBooks, flattenRequests } from "../ui/borrowWorkflow";
import {
  getLibrarySnapshot,
  runLibraryCommand,
  useLibraryData,
} from "../ui/libraryStore";
import { formatLoanDate, loanMessages } from "../ui/loanMessages";
import { useUiSettings } from "../ui/settings";
import "./ManagementModules.css";

const messages = {
  vi: {
    books: "Kho sách",
    readers: "Độc giả",
    staff: "Nhân sự",
    addBook: "Thêm sách",
    addStaff: "Thêm nhân sự",
    bookHint:
      "Quản lý số bản và các sách đang phục vụ. Ẩn sách vẫn giữ nguyên phiếu mượn cũ.",
    readerHint:
      "Thủ thư được xem thông tin nhận diện và phiếu đang xử lý; admin được sửa tên, khóa hoặc mở tài khoản.",
    staffHint:
      "Cấp tài khoản đăng nhập cho admin và thủ thư. Quyền được xác định từ tài khoản.",
    search: "Tìm kiếm",
    searchHint: "Nhập tên, email, tác giả hoặc ISBN…",
    all: "Tất cả",
    active: "Đang hoạt động",
    locked: "Đã khóa",
    listed: "Đang hiển thị",
    archived: "Đã ẩn",
    status: "Trạng thái",
    title: "Tên sách",
    author: "Tác giả",
    category: "Thể loại",
    isbn: "ISBN",
    cover: "URL ảnh bìa",
    description: "Mô tả",
    availableCopies: "Tổng số bản",
    held: "Giữ chỗ / đang mượn",
    available: "Còn sẵn",
    name: "Họ và tên",
    email: "Email",
    role: "Vai trò",
    admin: "Quản trị viên",
    librarian: "Thủ thư",
    reader: "Bạn đọc",
    activeLoans: "Phiếu đang xử lý",
    borrowed: "Đang mượn",
    actions: "Thao tác",
    edit: "Chỉnh sửa",
    details: "Xem phiếu",
    hide: "Ẩn sách",
    restore: "Hiện lại",
    save: "Lưu thay đổi",
    cancel: "Hủy",
    close: "Đóng",
    working: "Đang lưu…",
    password: "Mật khẩu đăng nhập",
    passwordHint:
      "8–128 ký tự. Ghi lại và cung cấp cho nhân sự; hệ thống không hiển thị lại mật khẩu.",
    stockHint:
      "Tổng số bản gồm cả bản đang giữ chỗ và đang cho mượn. Không thể giảm dưới số bản này.",
    saved: "Đã lưu thay đổi.",
    created:
      "Đã tạo tài khoản. Nhân sự có thể đăng nhập bằng email và mật khẩu vừa cấp.",
    hidden: "Đã ẩn sách khỏi danh mục bạn đọc.",
    restored: "Đã hiển thị lại sách.",
    empty: "Không có kết quả phù hợp.",
    noLoans: "Chưa có phiếu phù hợp.",
    due: "Hạn trả",
    viewOnly: "Quyền xem",
    createTitle: "Cấp tài khoản nhân sự",
    editAccount: "Sửa tài khoản",
    invalidBook:
      "Nhập đủ tên sách, tác giả, thể loại và số bản nguyên từ 0 đến 100.000.",
    invalidUrl: "Ảnh bìa cần là URL http hoặc https hợp lệ.",
    duplicateIsbn: "ISBN này đã thuộc về một đầu sách khác, kể cả sách đã ẩn.",
    stockBelowLoans:
      "Tổng số bản phải đủ cho các phiếu đã duyệt và sách đang mượn.",
    invalidAccount: "Kiểm tra họ tên, email, vai trò và trạng thái.",
    accountExists: "Email này đã tồn tại. Hãy dùng email khác.",
    invalidPassword: "Mật khẩu cần từ 8 đến 128 ký tự.",
    lastAdmin: "Cần giữ ít nhất một tài khoản admin đang hoạt động.",
    forbidden: "Bạn không có quyền thực hiện thao tác này.",
    loginRequired: "Vui lòng đăng nhập lại.",
    accountChanged: "Phiên đăng nhập vừa thay đổi. Hãy thử lại.",
    cryptoUnavailable:
      "Không thể tạo mã băm mật khẩu. Hãy mở bằng localhost hoặc HTTPS.",
    failure: "Chưa lưu được. Hãy thử lại.",
  },

  en: {
    books: "Book inventory",
    readers: "Readers",
    staff: "Staff",
    addBook: "Add book",
    addStaff: "Add staff",
    bookHint:
      "Manage inventory and listed books. Hiding a book preserves its loan records.",
    readerHint:
      "Librarians see identity and active loans; admins can edit names and lock or unlock accounts.",
    staffHint:
      "Create administrator and librarian sign-in accounts. Permissions follow the account.",
    search: "Search",
    searchHint: "Name, email, author or ISBN…",
    all: "All",
    active: "Active",
    locked: "Locked",
    listed: "Listed",
    archived: "Hidden",
    status: "Status",
    title: "Title",
    author: "Author",
    category: "Category",
    isbn: "ISBN",
    cover: "Cover image URL",
    description: "Description",
    availableCopies: "Total copies",
    held: "Reserved / on loan",
    available: "Available",
    name: "Full name",
    email: "Email",
    role: "Role",
    admin: "Administrator",
    librarian: "Librarian",
    reader: "Reader",
    activeLoans: "Active records",
    borrowed: "On loan",
    actions: "Actions",
    edit: "Edit",
    details: "View loans",
    hide: "Hide book",
    restore: "Restore",
    save: "Save changes",
    cancel: "Cancel",
    close: "Close",
    working: "Saving…",
    password: "Sign-in password",
    passwordHint:
      "8–128 characters. Give this password to the staff member; it cannot be displayed again.",
    stockHint:
      "Total includes reserved and borrowed copies. It cannot be lower than that count.",
    saved: "Changes saved.",
    created:
      "Account created. Staff can sign in with the assigned email and password.",
    hidden: "Book hidden from the reader catalog.",
    restored: "Book restored to the catalog.",
    empty: "No matching results.",
    noLoans: "No matching loan records.",
    due: "Due date",
    viewOnly: "View only",
    createTitle: "Create staff account",
    editAccount: "Edit account",
    invalidBook:
      "Enter title, author, category and an integer copy count between 0 and 100,000.",
    invalidUrl: "The cover needs a valid http or https URL.",
    duplicateIsbn: "This ISBN belongs to another book, including hidden books.",
    stockBelowLoans:
      "Total copies must cover approved reservations and active loans.",
    invalidAccount: "Check name, email, role and status.",
    accountExists: "This email already exists. Use another email.",
    invalidPassword: "Passwords must contain 8–128 characters.",
    lastAdmin: "At least one active administrator must remain.",
    forbidden: "You do not have permission for this action.",
    loginRequired: "Please sign in again.",
    accountChanged: "Your session has changed. Please retry.",
    cryptoUnavailable:
      "Password hashing is unavailable. Open via localhost or HTTPS.",
    failure: "Unable to save. Please retry.",
  },
};

const normalize = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .trim();

function ModuleDialog({ title, copy, onClose, children, busy = false }) {
  const ref = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const element = ref.current;
    element.showModal();

    return () => element.close();
  }, []);

  return (
    <dialog
      ref={ref}
      className="manage-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="manage-dialog-heading">
        <h2 id={titleId}>{title}</h2>

        <button
          type="button"
          className="loan-icon-button"
          disabled={busy}
          onClick={onClose}
          aria-label={copy.close}
        >
          <X size={20} />
        </button>
      </div>

      {children}
    </dialog>
  );
}

function Editor({ kind, item, copy, onClose, onSave }) {
  const book = kind === "books";
  const creating = !item;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(null);

  useEffect(() => () => pending.current?.abort(), []);

  async function submit(event) {
    event.preventDefault();

    if (pending.current) return;

    const values = Object.fromEntries(new FormData(event.currentTarget));

    const controller = new AbortController();
    pending.current = controller;

    setBusy(true);
    setError("");

    try {
      const result = await onSave(
        {
          ...values,
          id: item?.id,
          create: creating,
        },
        controller.signal,
      );

      if (!controller.signal.aborted) {
        if (result.ok) onClose();
        else setError(result.error);
      }
    } catch {
      if (!controller.signal.aborted) setError("failure");
    } finally {
      pending.current = null;

      if (!controller.signal.aborted) setBusy(false);
    }
  }

  const field = (name, type = "text", required = true, maxLength = 100) => (
    <label className="manage-field" key={name}>
      <span>{copy[name]}</span>

      <input
        name={name}
        type={type}
        defaultValue={item?.[name] ?? ""}
        required={required}
        maxLength={maxLength}
        {...(type === "number" ? { min: 0, max: 100000, step: 1 } : {})}
      />
    </label>
  );

  return (
    <ModuleDialog
      title={
        book
          ? creating
            ? copy.addBook
            : copy.edit
          : creating
            ? copy.createTitle
            : copy.editAccount
      }
      copy={copy}
      onClose={onClose}
      busy={busy}
    >
      <form onSubmit={submit} aria-busy={busy}>
        <fieldset disabled={busy} className="manage-fields">
          {book ? (
            <>
              {field("title", "text", true, 200)}
              {field("author", "text", true, 150)}
              {field("category")}
              {field("isbn", "text", false, 32)}
              {field("availableCopies", "number")}
              {field("cover", "url", false, 2000)}

              <label className="manage-field manage-wide">
                <span>{copy.description}</span>

                <textarea
                  name="description"
                  defaultValue={item?.description || ""}
                  maxLength={4000}
                  rows={4}
                />
              </label>

              <p className="manage-wide manage-muted">{copy.stockHint}</p>
            </>
          ) : (
            <>
              {field("fullName")}

              <label className="manage-field">
                <span>{copy.email}</span>

                <input
                  name="email"
                  type="email"
                  defaultValue={item?.email || ""}
                  readOnly={!creating}
                  required
                  maxLength={254}
                  autoComplete="off"
                />
              </label>

              {kind === "staff" && (
                <label className="manage-field">
                  <span>{copy.role}</span>

                  <select name="role" defaultValue={item?.role || "librarian"}>
                    <option value="librarian">{copy.librarian}</option>
                    <option value="admin">{copy.admin}</option>
                  </select>
                </label>
              )}

              <label className="manage-field">
                <span>{copy.status}</span>

                <select name="status" defaultValue={item?.status || "active"}>
                  <option value="active">{copy.active}</option>
                  <option value="locked">{copy.locked}</option>
                </select>
              </label>

              {creating && (
                <label className="manage-field manage-wide">
                  <span>{copy.password}</span>

                  <input
                    name="password"
                    type="password"
                    required
                    minLength={8}
                    maxLength={128}
                    autoComplete="new-password"
                  />

                  <small>{copy.passwordHint}</small>
                </label>
              )}
            </>
          )}
        </fieldset>

        {error && (
          <p role="alert" className="manage-error">
            {copy[error] || copy.failure}
          </p>
        )}

        <div className="manage-dialog-actions">
          <button
            className="loan-button"
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            {copy.cancel}
          </button>

          <button
            className="loan-button is-primary"
            type="submit"
            disabled={busy}
          >
            {busy ? copy.working : copy.save}
          </button>
        </div>
      </form>
    </ModuleDialog>
  );
}

export default function ManagementModules({ kind }) {
  const { language } = useUiSettings();
  const copy = messages[language];

  const data = useLibraryData();
  const user = currentLibraryUser(data);
  const bookMode = kind === "books";

  const permission = bookMode
    ? P.BOOKS_MANAGE
    : kind === "staff"
      ? P.ACCOUNTS_MANAGE
      : P.READERS_MANAGE;

  const canEdit = hasPermission(user, permission);

  const canRead = hasPermission(
    user,
    bookMode
      ? P.CATALOG
      : kind === "staff"
        ? P.ACCOUNTS_MANAGE
        : P.READERS_READ,
  );

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [dialog, setDialog] = useState(null);
  const [notice, setNotice] = useState("");
  const [failed, setFailed] = useState(false);

  const rows = flattenRequests(data.requestsByEmail);
  const inventory = availableBooks(data.books, rows);

  const items = !canRead
    ? []
    : bookMode
      ? data.books
      : managedAccounts(data, kind);

  const visible = items.filter((item) => {
    const state = bookMode
      ? item.archived
        ? "archived"
        : "listed"
      : item.status;

    return (
      (status === "all" || state === status) &&
      normalize(
        bookMode
          ? `${item.title} ${item.author} ${item.isbn} ${item.category}`
          : `${item.fullName} ${item.email}`,
      ).includes(normalize(query))
    );
  });

  function feedback(result, success) {
    setNotice(result.ok ? success : result.error);
    setFailed(!result.ok);
    return result;
  }

  async function save(input, signal) {
    if (signal.aborted) {
      return { ok: false, error: "cancelled" };
    }

    let credential;

    if (!bookMode && input.create) {
      const actorEmail = user?.email;

      try {
        credential = await createDemoCredential(input.password);
      } catch (error) {
        return { ok: false, error: error.message };
      }

      if (signal.aborted) {
        return { ok: false, error: "cancelled" };
      }

      if (currentLibraryUser(getLibrarySnapshot())?.email !== actorEmail) {
        return { ok: false, error: "accountChanged" };
      }
    }

    return feedback(
      runLibraryCommand(permission, (state) =>
        bookMode
          ? saveManagedBook(state, input)
          : saveManagedAccount(state, input, kind, credential),
      ),
      !bookMode && input.create ? "created" : "saved",
    );
  }

  const selectedAccount =
    dialog?.type === "loans" &&
    managedAccounts(data, kind).find(
      (account) => account.email === dialog.email,
    );

  const accountLoans = selectedAccount
    ? rows.filter(
        (request) =>
          request.readerEmail === selectedAccount.email &&
          (canEdit ||
            ["pending", "approved", "borrowed"].includes(request.status)),
      )
    : [];

  if (!canRead) {
    return <p role="alert">{copy.forbidden}</p>;
  }

  return (
    <section className="manage-module loan-workspace" aria-label={copy[kind]}>
      <div className="manage-module-heading">
        <div>
          <h2>{copy[kind]}</h2>

          <p>
            {
              copy[
                bookMode
                  ? "bookHint"
                  : kind === "readers"
                    ? "readerHint"
                    : "staffHint"
              ]
            }
          </p>
        </div>

        {canEdit && kind !== "readers" ? (
          <button
            className="loan-button is-primary"
            type="button"
            onClick={() => {
              setNotice("");
              setDialog({ type: "edit", item: null });
            }}
          >
            <Plus size={18} aria-hidden="true" />
            {copy[bookMode ? "addBook" : "addStaff"]}
          </button>
        ) : (
          !canEdit && <span className="manage-badge">{copy.viewOnly}</span>
        )}
      </div>

      <div className="manage-toolbar">
        <label className="manage-search">
          <Search size={18} aria-hidden="true" />
          <span className="loan-sr-only">{copy.search}</span>

          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={copy.searchHint}
          />
        </label>

        <label className="manage-filter">
          <span>{copy.status}</span>

          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            {[
              "all",
              ...(bookMode ? ["listed", "archived"] : ["active", "locked"]),
            ].map((value) => (
              <option value={value} key={value}>
                {copy[value]}
              </option>
            ))}
          </select>
        </label>

        <span className="manage-muted">
          {visible.length} / {items.length}
        </span>
      </div>

      <p
        className={failed ? "manage-error" : "manage-feedback"}
        role={failed ? "alert" : "status"}
      >
        {copy[notice] || (notice ? copy.failure : "")}
      </p>

      <div
        className="manage-table-scroll"
        tabIndex={0}
        role="region"
        aria-label={copy[kind]}
      >
        <table className="manage-table">
          <thead>
            <tr>
              {(bookMode
                ? [
                    "title",
                    "category",
                    "availableCopies",
                    "held",
                    "available",
                    "status",
                    ...(canEdit ? ["actions"] : []),
                  ]
                : [
                    "name",
                    "role",
                    "status",
                    "activeLoans",
                    "borrowed",
                    "actions",
                  ]
              ).map((key) => (
                <th scope="col" key={key}>
                  {copy[key]}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {visible.map((item) => {
              const available =
                inventory.find((book) => book.id === item.id)
                  ?.availableCopies ?? 0;

              return (
                <tr key={item.id}>
                  {bookMode ? (
                    <>
                      <th scope="row">
                        <strong>{item.title}</strong>
                        <small>{item.author}</small>
                        <small>ISBN: {item.isbn || "—"}</small>
                      </th>

                      <td>{item.category}</td>
                      <td>{item.availableCopies}</td>
                      <td>{item.availableCopies - available}</td>
                      <td>{available}</td>

                      <td>
                        <span className="manage-badge">
                          {copy[item.archived ? "archived" : "listed"]}
                        </span>
                      </td>

                      {canEdit && (
                        <td>
                          <div className="manage-row-actions">
                            <button
                              type="button"
                              className="loan-button"
                              onClick={() =>
                                setDialog({
                                  type: "edit",
                                  item,
                                })
                              }
                            >
                              {copy.edit}
                            </button>

                            <button
                              type="button"
                              className="loan-button"
                              onClick={() =>
                                feedback(
                                  runLibraryCommand(P.BOOKS_MANAGE, (state) =>
                                    archiveManagedBook(
                                      state,
                                      item.id,
                                      !item.archived,
                                    ),
                                  ),
                                  item.archived ? "restored" : "hidden",
                                )
                              }
                            >
                              {copy[item.archived ? "restore" : "hide"]}
                            </button>
                          </div>
                        </td>
                      )}
                    </>
                  ) : (
                    <>
                      <th scope="row">
                        <strong>{item.fullName}</strong>
                        <small>{item.email}</small>
                      </th>

                      <td>{copy[item.role]}</td>

                      <td>
                        <span className="manage-badge">
                          {copy[item.status]}
                        </span>
                      </td>

                      <td>{item.activeLoans}</td>
                      <td>{item.borrowed}</td>

                      <td>
                        <div className="manage-row-actions">
                          {canEdit && (
                            <button
                              type="button"
                              className="loan-button"
                              onClick={() =>
                                setDialog({
                                  type: "edit",
                                  item,
                                })
                              }
                            >
                              {copy.edit}
                            </button>
                          )}

                          {kind === "readers" && (
                            <button
                              type="button"
                              className="loan-button"
                              onClick={() =>
                                setDialog({
                                  type: "loans",
                                  email: item.email,
                                })
                              }
                            >
                              {copy.details}
                            </button>
                          )}
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>

        {visible.length === 0 && <p className="manage-empty">{copy.empty}</p>}
      </div>

      {canEdit && dialog?.type === "edit" && (
        <Editor
          key={dialog.item?.id || "new"}
          kind={kind}
          item={dialog.item}
          copy={{ ...copy, fullName: copy.name }}
          onClose={() => setDialog(null)}
          onSave={save}
        />
      )}

      {selectedAccount && (
        <ModuleDialog
          title={selectedAccount.fullName}
          copy={copy}
          onClose={() => setDialog(null)}
        >
          <p className="manage-muted">{selectedAccount.email}</p>

          {accountLoans.length ? (
            <ul className="manage-loans">
              {accountLoans.map((request) => (
                <li key={request.id}>
                  <strong>
                    {data.books.find((book) => book.id === request.bookId)
                      ?.title || request.title}
                  </strong>

                  <span>{loanMessages[language][request.status]}</span>

                  {request.dueDate && (
                    <small>
                      {copy.due}: {formatLoanDate(request.dueDate, language)}
                    </small>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p>{copy.noLoans}</p>
          )}
        </ModuleDialog>
      )}
    </section>
  );
}
