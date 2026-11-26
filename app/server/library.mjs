import { randomUUID } from "node:crypto";
import { createLibraryLog, publicAccount } from "../src/data/libraryData.js";
import {
  saveManagedBook,
  archiveManagedBook,
} from "../src/data/managementActions.js";
import { saveAuthorDraft } from "../src/data/authorWorkspace.js";
import {
  submitAuthorManuscript,
  reviewAuthorManuscript,
} from "../src/data/manuscriptWorkflow.js";
import { reviewAuthorApplication } from "../src/data/authorActions.js";
import {
  createCategory,
  updateCategory,
  deleteCategory,
} from "../src/data/categoryActions.js";
import { validateLibrarySettings } from "../src/data/librarySettings.js";
import {
  hasPermission,
  PERMISSIONS as P,
} from "../src/data/libraryPermissions.js";
import {
  ensure,
  ServiceError,
  businessDay,
  addDays,
  fineAmount,
  nowIso,
  activeStatuses,
  normalize,
} from "./errors.mjs";

export const allLoans = (state) =>
  Object.entries(state.requestsByEmail).flatMap(([readerEmail, rows]) =>
    rows.map((row) => ({ ...row, readerEmail })),
  );
export const isPublicBook = (book) =>
  Boolean(
    book &&
    !book.archived &&
    (!book.visibility || book.visibility === "published"),
  );
export function available(state, bookId, forEmail) {
  const book = state.books.find((b) => b.id === bookId);
  if (!book) return 0;
  const held = allLoans(state).filter(
    (l) => l.bookId === bookId && ["approved", "borrowed"].includes(l.status),
  ).length;
  const reservations = state.reservations.filter(
    (r) =>
      r.bookId === bookId && r.status === "ready" && r.readerEmail !== forEmail,
  ).length;
  const maintenance = state.bookCopies.filter(
    (c) => c.bookId === bookId && c.status === "maintenance",
  ).length;
  return Math.max(
    0,
    (book.totalCopies ?? book.availableCopies) -
      held -
      reservations -
      maintenance,
  );
}
export function requireActor(state, id, permission) {
  const actor = state.accounts.find((a) => a.id === id);
  ensure(
    actor?.status === "active",
    "accountLocked",
    "Tài khoản đã bị khóa.",
    403,
  );
  if (permission)
    ensure(
      hasPermission(actor, permission),
      "forbidden",
      "Bạn không có quyền thực hiện thao tác này.",
      403,
    );
  state.session = { email: actor.email, sessionVersion: 2 };
  return actor;
}
function accept(result) {
  if (!result.ok)
    throw new ServiceError(
      result.error,
      result.error,
      [
        "staleDraft",
        "staleManuscript",
        "staleApplication",
        "duplicate",
        "unavailable",
        "duplicatePublication",
        "stockBelowLoans",
      ].includes(result.error)
        ? 409
        : result.error === "forbidden"
          ? 403
          : 422,
    );
  return result;
}
function audit(state, actor, action, target, details = {}) {
  const compact = (value) =>
    value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value)
            .filter(
              ([key, item]) =>
                ![
                  "credential",
                  "password",
                  "chapters",
                  "content",
                  "portfolioUrl",
                  "evidenceKey",
                ].includes(key) &&
                (item === null ||
                  ["string", "number", "boolean"].includes(typeof item)),
            )
            .map(([key, item]) => [
              key,
              typeof item === "string" ? item.slice(0, 500) : item,
            ]),
        )
      : value;
  details = {
    ...details,
    ...(details.before ? { before: compact(details.before) } : {}),
    ...(details.after ? { after: compact(details.after) } : {}),
  };
  state.auditLogs.unshift(
    createLibraryLog(actor, action, target, "success", details),
  );
}
export function notify(state, email, type, title, message, targetId) {
  state.notifications.push({
    id: randomUUID(),
    readerEmail: email,
    type,
    title,
    message,
    targetId,
    createdAt: nowIso(),
    read: false,
    deliveryStatus: "pending",
  });
}
export function syncCopies(state, book) {
  const total = book.totalCopies ?? book.availableCopies;
  const copies = state.bookCopies.filter(
    (c) => c.bookId === book.id && c.status !== "retired",
  );
  if (copies.length < total)
    for (let n = copies.length; n < total; n++)
      state.bookCopies.push({
        id: randomUUID(),
        bookId: book.id,
        code: `CL-${randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase()}`,
        status: "available",
        createdAt: nowIso(),
      });
  if (copies.length > total) {
    const free = copies.filter((c) => c.status === "available");
    ensure(
      free.length >= copies.length - total,
      "stockBelowLoans",
      "Không thể giảm số bản đang giữ hoặc đang mượn.",
      409,
    );
    free.slice(0, copies.length - total).forEach((c) => {
      c.status = "retired";
    });
  }
}
export function promoteReservation(state, bookId) {
  const waiting = state.reservations
    .filter((r) => r.bookId === bookId && r.status === "waiting")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const next of waiting) {
    if (
      !state.accounts.some(
        (a) => a.email === next.readerEmail && a.status === "active",
      )
    ) {
      next.status = "cancelled";
      next.version++;
      next.cancellationReason = "Tài khoản không còn hoạt động.";
      continue;
    }
    if (!isPublicBook(state.books.find((b) => b.id === bookId))) break;
    const copy = state.bookCopies.find(
      (c) => c.bookId === bookId && c.status === "available",
    );
    if (!copy) break;
    next.status = "ready";
    next.copyId = copy.id;
    next.expiresAt = new Date(
      Date.now() + (state.settings.holdHours ?? 48) * 3600000,
    ).toISOString();
    next.version++;
    copy.status = "held";
    copy.reservationId = next.id;
    notify(
      state,
      next.readerEmail,
      "reservationReady",
      "Sách đặt trước đã sẵn sàng",
      `Thư viện giữ sách cho bạn đến ${next.expiresAt}.`,
      next.id,
    );
  }
}
export function createLoan(state, actor, input) {
  ensure(
    ["reader", "author", "admin", "librarian"].includes(actor.role),
    "forbidden",
    "Chưa có quyền mượn.",
    403,
  );
  const book = state.books.find(
    (b) => b.id === input.bookId && isPublicBook(b),
  );
  ensure(book, "invalidBook", "Không tìm thấy sách đang lưu hành.", 404);
  ensure(
    available(state, book.id, actor.email) > 0,
    "unavailable",
    "Sách đã hết bản. Bạn có thể đặt trước.",
    409,
  );
  const active = allLoans(state).filter(
    (l) => l.readerEmail === actor.email && activeStatuses.includes(l.status),
  );
  ensure(
    !active.some((l) => l.bookId === book.id),
    "duplicate",
    "Bạn đã có phiếu đang hoạt động cho sách này.",
    409,
  );
  ensure(
    active.length < state.settings.maxActiveLoans,
    "limit",
    "Bạn đã đạt giới hạn phiếu đang hoạt động.",
    409,
  );
  const loan = {
    id: randomUUID(),
    bookId: book.id,
    title: book.title,
    readerId: actor.id,
    readerName: actor.fullName,
    createdAt: nowIso(),
    note: String(input.note || "").slice(0, 300),
    status: "pending",
    version: 1,
    renewalCount: 0,
    fineAmount: 0,
    finePaymentStatus: "not_assessed",
  };
  (state.requestsByEmail[actor.email] ||= []).unshift(loan);
  return loan;
}
export function loanAction(state, actor, input) {
  const row = allLoans(state).find((l) => l.id === input.id);
  ensure(row, "notFound", "Không tìm thấy phiếu mượn.", 404);
  const loan = state.requestsByEmail[row.readerEmail].find(
    (l) => l.id === row.id,
  );
  const permission = {
    approve: P.LOAN_APPROVE,
    reject: P.LOAN_REJECT,
    handover: P.LOAN_HANDOVER,
    return: P.LOAN_RETURN,
    "renew-approve": P.LOAN_APPROVE,
    "renew-reject": P.LOAN_REJECT,
    "collect-fine": P.LOAN_RETURN,
  }[input.action];
  if (permission)
    ensure(
      hasPermission(actor, permission),
      "forbidden",
      "Chỉ thủ thư hoặc quản trị viên được xử lý.",
      403,
    );
  else
    ensure(
      row.readerEmail === actor.email || actor.role === "admin",
      "forbidden",
      "Bạn chỉ được thao tác phiếu của mình.",
      403,
    );
  ensure(
    Number(input.version) === loan.version,
    "staleRequest",
    "Phiếu đã thay đổi. Hãy tải lại.",
    409,
  );
  const book = state.books.find((b) => b.id === loan.bookId);
  const copy = state.bookCopies.find((c) => c.id === loan.copyId);
  const at = nowIso();
  const today = businessDay();
  if (input.action === "approve") {
    ensure(
      loan.status === "pending",
      "staleRequest",
      "Phiếu không còn chờ duyệt.",
      409,
    );
    ensure(
      isPublicBook(book) && available(state, book.id, row.readerEmail) > 0,
      "unavailable",
      "Không còn bản sách để duyệt.",
      409,
    );
    syncCopies(state, book);
    const reservation = state.reservations.find(
      (r) =>
        r.bookId === book.id &&
        r.readerEmail === row.readerEmail &&
        r.status === "ready",
    );
    const chosen = reservation
      ? state.bookCopies.find((c) => c.id === reservation.copyId)
      : state.bookCopies.find(
          (c) => c.bookId === book.id && c.status === "available",
        );
    ensure(chosen, "unavailable", "Bản sách đã được giữ bởi người khác.", 409);
    if (reservation) {
      reservation.status = "collected";
      reservation.version++;
    }
    chosen.status = "reserved";
    chosen.loanId = loan.id;
    delete chosen.reservationId;
    Object.assign(loan, {
      copyId: chosen.id,
      copyCode: chosen.code,
      status: "approved",
      approvedAt: at,
      approvedBy: actor.id,
    });
  } else if (input.action === "handover") {
    ensure(
      loan.status === "approved" && copy?.status === "reserved",
      "staleRequest",
      "Phiếu chưa sẵn sàng bàn giao.",
      409,
    );
    Object.assign(loan, {
      status: "borrowed",
      borrowedAt: at,
      handedOverBy: actor.id,
      dueDate: addDays(today, state.settings.loanDays),
      dailyFineVnd: state.settings.dailyFineVnd,
      loanDays: state.settings.loanDays,
    });
    copy.status = "borrowed";
  } else if (input.action === "return") {
    ensure(
      loan.status === "borrowed" && copy?.status === "borrowed",
      "staleRequest",
      "Phiếu không ở trạng thái đang mượn.",
      409,
    );
    Object.assign(loan, {
      status: "returned",
      returnedAt: at,
      returnedBy: actor.id,
    });
    loan.fineAmount = fineAmount(loan, state.settings);
    loan.finePaymentStatus = loan.fineAmount > 0 ? "unpaid" : "not_required";
    copy.status = "available";
    delete copy.loanId;
    promoteReservation(state, loan.bookId);
  } else if (input.action === "cancel" || input.action === "reject") {
    ensure(
      (input.action === "reject"
        ? ["pending"]
        : ["pending", "approved"]
      ).includes(loan.status),
      "staleRequest",
      "Không thể hủy/từ chối phiếu ở trạng thái này.",
      409,
    );
    if (input.action === "reject")
      ensure(
        String(input.reason || "").trim().length >= 5,
        "reasonRequired",
        "Nhập lý do từ chối ít nhất 5 ký tự.",
      );
    Object.assign(loan, {
      status: input.action === "reject" ? "rejected" : "cancelled",
      [input.action === "reject" ? "rejectedAt" : "cancelledAt"]: at,
      rejectionReason: input.reason || "",
    });
    if (copy?.status === "reserved") {
      copy.status = "available";
      delete copy.loanId;
      promoteReservation(state, loan.bookId);
    }
  } else if (input.action === "renew-request") {
    ensure(
      loan.status === "borrowed" &&
        loan.dueDate >= today &&
        loan.renewalCount < state.settings.maxRenewals &&
        loan.renewalStatus !== "pending",
      "renewalUnavailable",
      "Phiếu chưa đủ điều kiện gia hạn.",
      409,
    );
    ensure(
      !state.reservations.some(
        (r) =>
          r.bookId === loan.bookId && ["waiting", "ready"].includes(r.status),
      ),
      "reservationExists",
      "Sách đang có người đặt trước.",
      409,
    );
    loan.renewalStatus = "pending";
    loan.renewalRequestedAt = at;
  } else if (
    input.action === "renew-approve" ||
    input.action === "renew-reject"
  ) {
    ensure(
      loan.status === "borrowed" && loan.renewalStatus === "pending",
      "staleRequest",
      "Không có yêu cầu gia hạn đang chờ.",
      409,
    );
    if (input.action === "renew-approve") {
      ensure(
        loan.dueDate >= today &&
          loan.renewalCount < state.settings.maxRenewals &&
          !state.reservations.some(
            (r) =>
              r.bookId === loan.bookId &&
              ["waiting", "ready"].includes(r.status),
          ),
        "renewalUnavailable",
        "Không đủ điều kiện gia hạn.",
        409,
      );
      loan.dueDate = addDays(loan.dueDate, state.settings.extensionDays);
      loan.renewalCount++;
      loan.renewalStatus = "approved";
    } else {
      ensure(
        String(input.reason || "").trim().length >= 5,
        "reasonRequired",
        "Nhập lý do từ chối.",
      );
      loan.renewalStatus = "rejected";
      loan.renewalReason = input.reason;
    }
    loan.renewalReviewedBy = actor.id;
  } else if (input.action === "collect-fine") {
    ensure(
      loan.status === "returned" && loan.finePaymentStatus === "unpaid",
      "staleRequest",
      "Phiếu không có tiền phạt chưa thu.",
      409,
    );
    loan.finePaymentStatus = "paid";
    loan.fineCollectedBy = actor.id;
    loan.fineCollectedAt = at;
  } else throw new ServiceError("invalidAction", "Thao tác không hợp lệ.");
  loan.version++;
  loan.updatedAt = at;
  notify(
    state,
    row.readerEmail,
    loan.status,
    `Phiếu mượn: ${book?.title || loan.title}`,
    `Trạng thái: ${loan.status}. ${loan.dueDate ? `Hạn trả: ${loan.dueDate}.` : ""}`,
    loan.id,
  );
  return loan;
}

export async function executeLibraryCommand(
  state,
  actorId,
  command,
  input = {},
) {
  const actor = requireActor(state, actorId);
  let result = { ok: true };
  let changed;
  if (command === "loan.create")
    result.record = createLoan(state, actor, input);
  else if (command === "loan.action")
    result.record = loanAction(state, actor, input);
  else if (command === "book.save") {
    const existing = state.books.find((book) => book.id === input.id);
    if (existing && input.expectedVersion !== undefined)
      ensure(
        Number(input.expectedVersion) === (existing.version || 0),
        "staleRequest",
        "Sách đã được cập nhật ở phiên khác. Hãy tải lại.",
        409,
      );
    changed = accept(saveManagedBook(state, input));
    state = changed.state;
    const book = state.books.find((b) => b.id === changed.targetId);
    book.totalCopies = book.availableCopies;
    book.isFeatured = input.isFeatured === true || input.isFeatured === "true";
    book.visibility ||= "published";
    book.version = (book.version || 0) + 1;
    syncCopies(state, book);
    promoteReservation(state, book.id);
    result.record = book;
  } else if (command === "book.archive") {
    changed = accept(archiveManagedBook(state, input.id, input.archived));
    state = changed.state;
    if (!input.archived) promoteReservation(state, input.id);
  } else if (command === "category.create") {
    changed = accept(createCategory(state, input.name));
    state = changed.state;
  } else if (command === "category.update") {
    changed = accept(updateCategory(state, input));
    state = changed.state;
  } else if (command === "category.delete") {
    changed = accept(deleteCategory(state, input));
    state = changed.state;
  } else if (command === "application.submit") {
    ensure(
      actor.role === "reader",
      "forbidden",
      "Chỉ độc giả chưa có quyền tác giả được nộp hồ sơ.",
      403,
    );
    ensure(
      !state.authorApplications.some(
        (a) => a.readerEmail === actor.email && a.status !== "rejected",
      ),
      "alreadySubmitted",
      "Bạn đã có hồ sơ đang xử lý.",
      409,
    );
    ensure(
      String(input.fullName || "").trim().length >= 2 &&
        String(input.penName || "").trim().length >= 2 &&
        String(input.bio || "").trim().length >= 30 &&
        /^\+?[\d\s().-]{9,20}$/.test(input.phone || "") &&
        input.confirmation === true,
      "invalidApplication",
      "Kiểm tra họ tên, bút danh, liên hệ, giới thiệu và xác nhận.",
    );
    ensure(
      /^https:\/\/[^\s]+$/.test(input.portfolioUrl || "") || input.evidenceKey,
      "invalidEvidence",
      "Cần minh chứng hợp lệ.",
    );
    const application = {
      id: randomUUID(),
      readerEmail: actor.email,
      fullName: input.fullName.trim(),
      penName: input.penName.trim(),
      bio: input.bio.trim(),
      phone: input.phone,
      portfolioUrl: input.portfolioUrl || "",
      evidenceKey: input.evidenceKey || "",
      evidenceUploadId: input.evidenceUploadId || "",
      submittedAt: nowIso(),
      status: "pending",
      version: 1,
    };
    state.authorApplications.push(application);
    result.record = application;
  } else if (command === "application.review") {
    changed = accept(reviewAuthorApplication(state, input));
    state = changed.state;
  } else if (command === "author.profile") {
    ensure(
      actor.role === "author",
      "forbidden",
      "Bạn chưa có quyền tác giả.",
      403,
    );
    const profile = state.authorApplications.find(
      (a) => a.readerEmail === actor.email && a.status === "approved",
    );
    ensure(profile, "notFound", "Chưa có hồ sơ đã duyệt.", 404);
    ensure(
      String(input.penName || "").trim().length >= 2 &&
        String(input.bio || "").trim().length >= 30,
      "invalidProfile",
      "Bút danh và giới thiệu chưa hợp lệ.",
    );
    profile.penName = input.penName.trim().slice(0, 100);
    profile.bio = input.bio.trim().slice(0, 2000);
    profile.updatedAt = nowIso();
  } else if (command === "draft.save") {
    changed = accept(saveAuthorDraft(state, input));
    state = changed.state;
    result.record = state.authorManuscripts.find(
      (m) => m.id === changed.targetId,
    );
  } else if (command === "draft.submit") {
    changed = accept(submitAuthorManuscript(state, input));
    state = changed.state;
  } else if (command === "draft.revise") {
    const before = state.authorManuscripts.find((m) => m.id === input.id);
    ensure(
      before &&
        before.authorEmail === actor.email &&
        before.status === "published",
      "forbidden",
      "Chỉ chủ tác phẩm đã xuất bản được tạo bản sửa.",
      403,
    );
    ensure(
      !state.authorManuscripts.some(
        (m) =>
          m.publishedBookId === before.publishedBookId &&
          ["draft", "pending", "changes_requested"].includes(m.status),
      ),
      "duplicateRevision",
      "Đã có phiên bản đang chỉnh sửa.",
      409,
    );
    const revision = {
      ...structuredClone(before),
      id: randomUUID(),
      status: "draft",
      revision: randomUUID(),
      previousManuscriptId: before.id,
      reviewHistory: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
      rightsConfirmed: false,
    };
    state.authorManuscripts.push(revision);
    result.record = revision;
  } else if (command === "draft.review") {
    changed = accept(reviewAuthorManuscript(state, input));
    state = changed.state;
  } else if (command === "profile.update") {
    ensure(
      String(input.fullName || "").trim().length >= 2,
      "invalidProfile",
      "Nhập họ tên hợp lệ.",
    );
    Object.assign(actor, {
      fullName: input.fullName.trim().slice(0, 100),
      phone: String(input.phone || "").slice(0, 30),
      interest: String(input.interest || "").slice(0, 200),
      updatedAt: nowIso(),
    });
  } else if (command === "account.save") {
    requireActor(state, actorId, P.ACCOUNTS_MANAGE);
    let account = state.accounts.find(
      (a) => a.email === String(input.email).trim().toLowerCase(),
    );
    ensure(
      String(input.fullName || "").trim().length >= 2 &&
        ["reader", "author", "librarian", "admin"].includes(
          input.role || account?.role,
        ) &&
        ["active", "locked"].includes(input.status),
      "invalidAccount",
      "Thông tin tài khoản không hợp lệ.",
    );
    if (input.create) {
      ensure(
        !account && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email),
        "accountExists",
        "Email đã tồn tại hoặc không hợp lệ.",
      );
      account = {
        id: randomUUID(),
        email: input.email.trim().toLowerCase(),
        createdAt: nowIso(),
      };
      state.accounts.push(account);
    }
    ensure(account, "notFound", "Không tìm thấy tài khoản.", 404);
    Object.assign(account, {
      fullName: input.fullName.trim().slice(0, 100),
      role: input.role || account.role,
      status: input.status,
    });
    ensure(
      state.accounts.some((a) => a.role === "admin" && a.status === "active"),
      "lastAdmin",
      "Cần giữ ít nhất một quản trị viên hoạt động.",
      409,
    );
    result.account = publicAccount(account);
  } else if (command === "settings.save") {
    requireActor(state, actorId, P.SETTINGS_MANAGE);
    if (input.expectedVersion !== undefined)
      ensure(
        Number(input.expectedVersion) === (state.settings.version || 0),
        "settingsConflict",
        "Cài đặt đã thay đổi. Hãy tải cấu hình mới.",
        409,
      );
    const valid = accept(validateLibrarySettings(input));
    for (const [name, max] of Object.entries({
      dailyFineVnd: 1000000,
      maxRenewals: 10,
      extensionDays: 60,
      holdHours: 168,
    })) {
      const v = Number(input[name] ?? state.settings[name]);
      ensure(
        Number.isInteger(v) &&
          v >= (["extensionDays", "holdHours"].includes(name) ? 1 : 0) &&
          v <= max,
        "invalidPolicy",
        "Quy định không hợp lệ.",
      );
      valid.settings[name] = v;
    }
    state.settings = {
      ...state.settings,
      ...valid.settings,
      version: (state.settings.version || 0) + 1,
      updatedAt: nowIso(),
      updatedBy: actor.id,
    };
  } else if (command === "favorite.toggle") {
    ensure(
      state.books.some((b) => b.id === input.id && isPublicBook(b)),
      "notFound",
      "Sách không còn công khai.",
      404,
    );
    const ids = new Set(state.favoriteIdsByEmail[actor.email] || []);
    if (ids.has(input.id) && !input.ensureSaved) ids.delete(input.id);
    else ids.add(input.id);
    state.favoriteIdsByEmail[actor.email] = [...ids];
  } else if (command === "favorite.remove") {
    state.favoriteIdsByEmail[actor.email] = (
      state.favoriteIdsByEmail[actor.email] || []
    ).filter((id) => id !== input.id);
  } else if (command === "notification.read") {
    const ids = new Set(state.notificationReads[actor.email] || []);
    for (const id of input.ids || []) {
      ensure(typeof id === "string" && id.length < 200, "invalidInput");
      ids.add(id);
    }
    state.notificationReads[actor.email] = [...ids].slice(-1000);
    state.notifications
      .filter(
        (n) =>
          n.readerEmail === actor.email && (!input.id || n.id === input.id),
      )
      .forEach((n) => {
        n.read = true;
      });
  } else if (command === "reservation.create") {
    const book = state.books.find(
      (b) => b.id === input.bookId && isPublicBook(b),
    );
    ensure(book, "notFound", "Không tìm thấy sách.", 404);
    ensure(
      available(state, book.id) === 0,
      "bookAvailable",
      "Sách đang còn bản. Hãy gửi yêu cầu mượn.",
    );
    ensure(
      !state.reservations.some(
        (r) =>
          r.readerEmail === actor.email &&
          r.bookId === book.id &&
          ["waiting", "ready"].includes(r.status),
      ) &&
        !allLoans(state).some(
          (l) =>
            l.readerEmail === actor.email &&
            l.bookId === book.id &&
            activeStatuses.includes(l.status),
        ),
      "duplicate",
      "Bạn đã có yêu cầu cho sách này.",
      409,
    );
    state.reservations.push({
      id: randomUUID(),
      readerEmail: actor.email,
      bookId: book.id,
      title: book.title,
      status: "waiting",
      createdAt: nowIso(),
      version: 1,
    });
  } else if (command === "reservation.cancel") {
    const reservation = state.reservations.find((r) => r.id === input.id);
    ensure(
      reservation &&
        (reservation.readerEmail === actor.email ||
          ["admin", "librarian"].includes(actor.role)),
      "forbidden",
      "Không có quyền với đặt trước này.",
      403,
    );
    ensure(
      ["waiting", "ready"].includes(reservation.status),
      "staleRequest",
      "Đặt trước đã kết thúc.",
      409,
    );
    reservation.status = "cancelled";
    reservation.version++;
    const copy = state.bookCopies.find(
      (c) => c.reservationId === reservation.id,
    );
    if (copy) {
      copy.status = "available";
      delete copy.reservationId;
    }
    promoteReservation(state, reservation.bookId);
  } else if (command === "copy.update") {
    requireActor(state, actorId, P.BOOKS_MANAGE);
    const copy = state.bookCopies.find((c) => c.id === input.id);
    ensure(copy, "notFound", "Không tìm thấy bản sách.", 404);
    ensure(
      ["available", "maintenance"].includes(copy.status) &&
        ["available", "maintenance"].includes(input.status),
      "copyInUse",
      "Bản sách đang được giữ hoặc đang mượn.",
      409,
    );
    copy.status = input.status;
    if (copy.status === "available") promoteReservation(state, copy.bookId);
  } else if (command === "knowledge.save") {
    requireActor(state, actorId, P.SETTINGS_MANAGE);
    ensure(
      String(input.title || "").trim().length >= 2 &&
        String(input.content || "").trim().length >= 20,
      "invalidInput",
      "Nhập tiêu đề và nội dung nguồn.",
    );
    const old = state.knowledgeSources.find((k) => k.id === input.id);
    const source = {
      id: old?.id || randomUUID(),
      title: input.title.trim().slice(0, 160),
      content: input.content.trim().slice(0, 50000),
      approved: input.approved === true,
      version: (old?.version || 0) + 1,
      updatedAt: nowIso(),
      updatedBy: actor.id,
    };
    state.knowledgeSources = [
      ...state.knowledgeSources.filter((k) => k.id !== source.id),
      source,
    ];
    result.record = source;
  } else if (command === "access.visit" || command === "reports.export") {
    if (command === "reports.export")
      requireActor(state, actorId, P.REPORTS_EXPORT);
    state.accessLogs.unshift(
      createLibraryLog(
        actor,
        command,
        String(input.page || "reports").slice(0, 80),
      ),
    );
  } else
    throw new ServiceError("invalidCommand", "Thao tác chưa được hỗ trợ.", 404);
  const freshActor = state.accounts.find((a) => a.id === actorId) || actor;
  audit(
    state,
    freshActor,
    command,
    changed?.targetId || input.id || result.record?.id || "library",
    changed?.details || {},
  );
  delete state.session;
  return { state, result };
}

export function projectState(state, actor) {
  const management = actor && ["admin", "librarian"].includes(actor.role);
  const admin = actor?.role === "admin";
  const published = state.books.filter((b) => management || isPublicBook(b));
  const books = published.map((book) => {
    const {
      chapters,
      pdfUrl,
      pdfKey: _pdfKey,
      chaptersKey: _chaptersKey,
      authorEmail,
      ...metadata
    } = book;
    const otherHeld = management
      ? 0
      : allLoans(state).filter(
          (l) =>
            l.bookId === book.id &&
            ["approved", "borrowed"].includes(l.status) &&
            l.readerEmail !== actor?.email,
        ).length;
    return {
      ...metadata,
      authorId: state.authorApplications.find(
        (a) => a.readerEmail === authorEmail && a.status === "approved",
      )?.id,
      ...(management || actor?.email === authorEmail ? { authorEmail } : {}),
      hasChapters: Boolean(chapters?.length),
      hasPdf: Boolean(book.pdfKey || pdfUrl),
      pdfUrl:
        book.pdfKey || pdfUrl
          ? `/api/v1/books/${encodeURIComponent(book.id)}/content`
          : "",
      chapters: [],
      availableCopies: (book.totalCopies ?? book.availableCopies) - otherHeld,
      maintenanceCopies: state.bookCopies.filter(
        (c) => c.bookId === book.id && c.status === "maintenance",
      ).length,
      reservationHeldCopies: state.reservations.filter(
        (r) => r.bookId === book.id && r.status === "ready",
      ).length,
    };
  });
  const visibleLoans = management
    ? state.requestsByEmail
    : actor
      ? { [actor.email]: state.requestsByEmail[actor.email] || [] }
      : {};
  const projectedLoans = Object.fromEntries(
    Object.entries(visibleLoans).map(([email, rows]) => [
      email,
      rows.map((loan) => ({
        ...loan,
        fineAmount:
          loan.status === "borrowed" && loan.dueDate
            ? fineAmount(loan, state.settings)
            : loan.fineAmount || 0,
      })),
    ]),
  );
  const snapshot = {
    schemaVersion: 3,
    version: state.version,
    books,
    categories: state.categories,
    accounts: admin
      ? state.accounts.map(publicAccount)
      : management
        ? state.accounts.map((a) => ({
            id: a.id,
            email: a.email,
            fullName: a.fullName,
            role: a.role,
            status: a.status,
          }))
        : actor
          ? [publicAccount(actor)]
          : [],
    session: actor ? { email: actor.email, sessionVersion: 2 } : null,
    settings: state.settings,
    requestsByEmail: projectedLoans,
    authorApplications: admin
      ? state.authorApplications
      : actor
        ? state.authorApplications.filter((a) => a.readerEmail === actor.email)
        : [],
    authorManuscripts: admin
      ? state.authorManuscripts
      : actor?.role === "author"
        ? state.authorManuscripts.filter((m) => m.authorEmail === actor.email)
        : [],
    publicAuthors: state.authorApplications
      .filter((a) => a.status === "approved")
      .map((a) => ({
        id: a.id,
        penName: a.penName,
        bio: a.bio,
        bookIds: state.books
          .filter((b) => isPublicBook(b) && b.authorEmail === a.readerEmail)
          .map((b) => b.id),
      })),
    auditLogs: admin ? state.auditLogs : [],
    accessLogs: admin ? state.accessLogs : [],
    bookCopies: management ? state.bookCopies : [],
    reservations: (management
      ? state.reservations
      : state.reservations.filter((r) => r.readerEmail === actor?.email)
    ).map((r) => ({
      ...r,
      position:
        r.status === "waiting"
          ? state.reservations.filter(
              (other) =>
                other.bookId === r.bookId &&
                other.status === "waiting" &&
                other.createdAt < r.createdAt,
            ).length + 1
          : undefined,
    })),
    notifications: state.notifications.filter(
      (n) => n.readerEmail === actor?.email,
    ),
    knowledgeSources: admin
      ? state.knowledgeSources
      : state.knowledgeSources
          .filter((k) => k.approved)
          .map((k) => ({ id: k.id, title: k.title, version: k.version })),
    audioJobs: admin
      ? state.audioJobs
      : state.audioJobs.filter((j) => j.userId === actor?.id),
  };
  for (const map of [
    "favoriteIdsByEmail",
    "notificationReads",
    "readingData",
    "readerSettings",
    "readingHistory",
    "bookViewHistory",
  ])
    snapshot[map] = actor
      ? {
          [actor.email]:
            state[map][actor.email] ||
            (map === "favoriteIdsByEmail" ||
            map === "notificationReads" ||
            map === "readingHistory"
              ? []
              : {}),
        }
      : {};
  return snapshot;
}

export function publicCatalogBook(state, book) {
  const {
    chapters,
    pdfUrl,
    pdfKey,
    chaptersKey: _chaptersKey,
    authorEmail,
    ...metadata
  } = book;
  return {
    ...metadata,
    authorId: state.authorApplications.find(
      (a) => a.readerEmail === authorEmail && a.status === "approved",
    )?.id,
    coverUrl: book.cover,
    totalCopies: book.totalCopies ?? book.availableCopies,
    availableCopies: available(state, book.id),
    hasChapters: Boolean(chapters?.length),
    hasPdf: Boolean(pdfKey || pdfUrl),
  };
}
export function catalog(state, query) {
  const limit = Math.max(1, Math.min(50, Number(query.limit) || 24));
  const filterKey = JSON.stringify([
    query.q || "",
    query.category || "",
    query.format || "",
    query.availability || "",
    query.sort || "title-asc",
  ]);
  let offset = 0;
  if (query.cursor) {
    try {
      const c = JSON.parse(Buffer.from(query.cursor, "base64url"));
      ensure(
        c.filter === filterKey && Number.isInteger(c.offset) && c.offset >= 0,
        "invalidCursor",
        "Bộ lọc phân trang đã thay đổi.",
      );
      offset = c.offset;
    } catch {
      throw new ServiceError(
        "invalidCursor",
        "Con trỏ phân trang không hợp lệ.",
      );
    }
  }
  const items = state.books
    .filter(isPublicBook)
    .filter(
      (b) =>
        (!query.q ||
          normalize(`${b.title} ${b.author}`).includes(normalize(query.q))) &&
        (!query.category ||
          normalize(b.category) === normalize(query.category)) &&
        (!query.format ||
          (query.format === "pdf"
            ? b.pdfKey || b.pdfUrl
            : b.chapters?.length)) &&
        (!query.availability ||
          available(state, b.id) > 0 === (query.availability === "available")),
    )
    .sort(
      (a, b) =>
        (query.sort === "newest"
          ? String(b.publishedAt || b.addedAt || "").localeCompare(
              a.publishedAt || a.addedAt || "",
            )
          : query.sort === "most-viewed"
            ? (b.viewCount || 0) - (a.viewCount || 0)
            : query.sort === "title-desc"
              ? b.title.localeCompare(a.title, "vi")
              : a.title.localeCompare(b.title, "vi")) ||
        a.id.localeCompare(b.id),
    );
  const data = items
    .slice(offset, offset + limit)
    .map((book) => publicCatalogBook(state, book));
  const nextCursor =
    offset + limit < items.length
      ? Buffer.from(
          JSON.stringify({ filter: filterKey, offset: offset + limit }),
        ).toString("base64url")
      : null;
  return {
    items: data,
    nextCursor,
    total: items.length,
    data,
    pagination: { nextCursor, total: items.length },
  };
}
