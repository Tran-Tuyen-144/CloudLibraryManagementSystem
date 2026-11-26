import { readerNotifications } from "../integration/libraryNotifications.js";
import { flattenRequests } from "../ui/borrowWorkflow.js";

const DAY_MS = 86400000;
const VIETNAM_MS = 7 * 3600000;

function emailOf(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function dayIndex(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const time = Date.parse(`${value}T00:00:00.000Z`);

  return Number.isFinite(time) &&
    new Date(time).toISOString().slice(0, 10) === value
    ? Math.floor(time / DAY_MS)
    : null;
}

function returnedDay(value) {
  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) return null;

  return dayIndex(new Date(timestamp + VIETNAM_MS).toISOString().slice(0, 10));
}

function fineForReturnedLoan(loan) {
  if (loan.status !== "returned") return 0;

  const due = dayIndex(loan.dueDate);
  const returned = returnedDay(loan.returnedAt);

  if (due === null || returned === null) return 0;

  const stored = Number(loan.fineAmount);

  if (loan.fineAmount != null && Number.isFinite(stored) && stored >= 0) {
    return stored;
  }

  const snapshotRate = Number(
    loan.dailyFineVnd ?? loan.rulesSnapshot?.dailyFineVnd,
  );

  const rate =
    Number.isSafeInteger(snapshotRate) && snapshotRate >= 0
      ? snapshotRate
      : 5000;

  return Math.max(0, returned - due) * rate;
}

export function readerActivityNotifications(
  data,
  user,
  reservations = [],
  now = new Date(),
) {
  // Giữ nguyên thông báo mượn–trả gốc.
  const original = readerNotifications(data, user, now);

  if (!["reader", "author"].includes(user?.role) || user.status !== "active") {
    return original;
  }

  const email = emailOf(user.email);
  const nowMs = now.getTime();

  const readIds = new Set(data.notificationReads?.[email] || []);

  const bookNames = new Map(
    (data.books || []).map((book) => [book.id, book.title]),
  );

  const extras = [];
  const seen = new Set(original.map((item) => item.id));

  function add({
    type,
    identity,
    at,
    title,
    target,
    requestId = null,
    expiresAt,
    dueDate,
    amount,
    reason,
  }) {
    const timestamp = Date.parse(at);

    if (!Number.isFinite(timestamp) || timestamp > nowMs) {
      return;
    }

    const id = JSON.stringify(["activity", identity, type, at]);

    if (seen.has(id)) return;

    seen.add(id);

    extras.push({
      id,
      type,
      title,
      target,
      requestId,
      at: new Date(timestamp).toISOString(),
      read: readIds.has(id),

      ...(expiresAt ? { expiresAt } : {}),
      ...(dueDate ? { dueDate } : {}),
      ...(amount ? { amount } : {}),
      ...(reason ? { reason } : {}),
    });
  }

  // Thông báo đặt trước từ bước 1–2.
  for (const reservation of Array.isArray(reservations) ? reservations : []) {
    if (emailOf(reservation?.readerEmail) !== email || !reservation.id) {
      continue;
    }

    const title =
      bookNames.get(reservation.bookId) ||
      reservation.title ||
      reservation.bookId;

    const identity = `reservation:${reservation.id}`;

    const expiryMs = Date.parse(reservation.expiresAt);

    const hasExpiry = Number.isFinite(expiryMs);

    if (
      reservation.readyAt &&
      ["ready", "collected", "expired"].includes(reservation.status)
    ) {
      add({
        type: "reservationReady",
        identity,
        at: reservation.readyAt,
        title,
        target: "reservations",
        expiresAt: reservation.expiresAt,
      });
    }

    // Nhắc khi còn 24 giờ giữ sách.
    if (
      reservation.status === "ready" &&
      hasExpiry &&
      expiryMs > nowMs &&
      expiryMs - nowMs <= DAY_MS
    ) {
      add({
        type: "reservationExpiring",
        identity,
        at: new Date(expiryMs - DAY_MS).toISOString(),
        title,
        target: "reservations",
        expiresAt: reservation.expiresAt,
      });
    }

    // Có thể hiển thị hết hạn theo thời gian ngay cả
    // khi thủ thư chưa bấm xử lý hết hạn trong demo.
    if (
      (reservation.status === "expired" ||
        (reservation.status === "ready" && hasExpiry && expiryMs <= nowMs)) &&
      hasExpiry
    ) {
      add({
        type: "reservationExpired",
        identity,
        at: reservation.expiredAt || reservation.expiresAt,
        title,
        target: "reservations",
      });
    }

    if (reservation.status === "cancelled" && reservation.cancelledAt) {
      add({
        type: "reservationCancelled",
        identity,
        at: reservation.cancelledAt,
        title,
        target: "reservations",
      });
    }

    if (reservation.status === "collected" && reservation.collectedAt) {
      add({
        type: "reservationCollected",
        identity,
        at: reservation.collectedAt,
        title,
        target: "reservations",
      });
    }
  }

  // Thông báo gia hạn và tiền phạt từ bước 3.
  const loans = flattenRequests({
    [email]: data.requestsByEmail?.[email] || [],
  });

  for (const loan of loans) {
    const title = bookNames.get(loan.bookId) || loan.title || loan.bookId;

    const identity = `loan:${loan.id}`;

    const common = {
      identity,
      title,
      target: "loans",
      requestId: loan.id,
    };

    if (loan.renewalRequestedAt) {
      add({
        ...common,
        type: "renewalRequested",
        at: loan.renewalRequestedAt,
      });
    }

    if (loan.renewalApprovedAt) {
      add({
        ...common,
        type: "renewalApproved",
        at: loan.renewalApprovedAt,
        dueDate: loan.dueDate,
      });
    }

    if (loan.renewalStatus === "rejected" && loan.renewalRejectedAt) {
      add({
        ...common,
        type: "renewalRejected",
        at: loan.renewalRejectedAt,
        reason: loan.renewalReason,
      });
    }

    const amount = fineForReturnedLoan(loan);

    if (amount > 0 && loan.finePaymentStatus !== "paid") {
      add({
        ...common,
        type: "fineDue",
        at: loan.returnedAt,
        amount,
      });
    }

    if (loan.finePaymentStatus === "paid" && loan.fineCollectedAt) {
      add({
        ...common,
        type: "finePaid",
        at: loan.fineCollectedAt,
        amount: amount || Number(loan.fineAmount) || 0,
      });
    }
  }

  return [...original, ...extras].sort(
    (a, b) => Date.parse(b.at) - Date.parse(a.at) || a.id.localeCompare(b.id),
  );
}
