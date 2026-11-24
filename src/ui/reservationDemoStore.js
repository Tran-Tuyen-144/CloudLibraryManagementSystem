
import { useSyncExternalStore } from "react";

const STORAGE_KEY = "cloudlibrary:demo-reservations:v1";
const HOLD_DURATION = 48 * 60 * 60 * 1000;

const EMPTY = [];
const listeners = new Set();

const STATUSES = new Set([
  "waiting",
  "ready",
  "collected",
  "cancelled",
  "expired",
]);

const ACTIVE = new Set(["waiting", "ready"]);

const ACTIVE_LOANS = new Set([
  "pending",
  "approved",
  "borrowed",
]);

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function readRows() {
  if (typeof window === "undefined") return EMPTY;

  try {
    const saved = JSON.parse(
      localStorage.getItem(STORAGE_KEY) || "[]",
    );

    if (!Array.isArray(saved)) return EMPTY;

    return saved.filter(
      (item) =>
        item &&
        typeof item.id === "string" &&
        typeof item.bookId === "string" &&
        typeof item.readerEmail === "string" &&
        typeof item.createdAt === "string" &&
        STATUSES.has(item.status),
    );
  } catch {
    return EMPTY;
  }
}

let snapshot = readRows();

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return snapshot;
}

function getServerSnapshot() {
  return EMPTY;
}

function saveRows(rows) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(rows),
    );

    snapshot = rows;
    listeners.forEach((listener) => listener());

    return true;
  } catch (error) {
    console.warn("Không lưu được dữ liệu đặt trước:", error);
    return false;
  }
}

function updateRows(transform) {
  const current = readRows();
  const result = transform(current);

  if (!result.ok) return result;

  if (result.rows === current) {
    return { ok: true, count: result.count ?? 0 };
  }

  if (!saveRows(result.rows)) {
    return { ok: false, error: "storageFailed" };
  }

  return { ok: true, count: result.count ?? 1 };
}

export function useDemoReservationRows() {
  return useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
}

export function canReserveDemoBook(book) {
  if (!book || book.archived) return false;

  if (Number(book.availableCopies) !== 0) {
    return false;
  }

  if (book.physicalEnabled === false) {
    return false;
  }

  if (
    book.totalCopies != null &&
    Number(book.totalCopies) === 0
  ) {
    return false;
  }

  // Không đặt trước tài liệu chỉ có PDF demo.
  if (
    book.pdfUrl &&
    !book.isbn &&
    book.physicalEnabled !== true
  ) {
    return false;
  }

  return true;
}

export function queuePosition(rows, reservation) {
  if (reservation.status !== "waiting") return null;

  const queue = rows
    .filter(
      (item) =>
        item.bookId === reservation.bookId &&
        item.status === "waiting",
    )
    .sort(
      (a, b) =>
        a.createdAt.localeCompare(b.createdAt) ||
        a.id.localeCompare(b.id),
    );

  const index = queue.findIndex(
    (item) => item.id === reservation.id,
  );

  return index < 0 ? null : index + 1;
}

export function createDemoReservation({
  readerEmail,
  book,
  requests = [],
}) {
  const email = normalizeEmail(readerEmail);

  if (!email) {
    return { ok: false, error: "loginRequired" };
  }

  if (!canReserveDemoBook(book)) {
    return { ok: false, error: "unavailable" };
  }

  return updateRows((rows) => {
    const duplicate = rows.some(
      (item) =>
        item.readerEmail === email &&
        item.bookId === book.id &&
        ACTIVE.has(item.status),
    );

    if (duplicate) {
      return { ok: false, error: "duplicate" };
    }

    const hasLoan = requests.some(
      (item) =>
        item.bookId === book.id &&
        ACTIVE_LOANS.has(item.status),
    );

    if (hasLoan) {
      return { ok: false, error: "activeLoan" };
    }

    const now = new Date().toISOString();

    return {
      ok: true,
      rows: [
        ...rows,
        {
          id: crypto.randomUUID(),
          readerEmail: email,
          bookId: book.id,
          title: book.title,
          status: "waiting",
          createdAt: now,
          updatedAt: now,
          version: 1,
        },
      ],
    };
  });
}

export function cancelDemoReservation({
  readerEmail,
  id,
}) {
  const email = normalizeEmail(readerEmail);

  return updateRows((rows) => {
    const target = rows.find(
      (item) =>
        item.id === id &&
        item.readerEmail === email,
    );

    if (!target) {
      return { ok: false, error: "notFound" };
    }

    if (!ACTIVE.has(target.status)) {
      return { ok: false, error: "cannotCancel" };
    }

    const now = new Date().toISOString();

    return {
      ok: true,
      rows: rows.map((item) =>
        item.id === id
          ? {
              ...item,
              status: "cancelled",
              cancelledAt: now,
              updatedAt: now,
              version: (item.version || 1) + 1,
            }
          : item,
      ),
    };
  });
}

export function markDemoReservationReady({
  id,
  staffEmail,
}) {
  return updateRows((rows) => {
    const target = rows.find((item) => item.id === id);

    if (!target) {
      return { ok: false, error: "notFound" };
    }

    if (target.status !== "waiting") {
      return { ok: false, error: "notWaiting" };
    }

    const alreadyHeld = rows.some(
      (item) =>
        item.bookId === target.bookId &&
        item.status === "ready",
    );

    if (alreadyHeld) {
      return { ok: false, error: "alreadyHeld" };
    }

    if (queuePosition(rows, target) !== 1) {
      return { ok: false, error: "notFirst" };
    }

    const now = new Date();
    const at = now.toISOString();

    const expiresAt = new Date(
      now.getTime() + HOLD_DURATION,
    ).toISOString();

    return {
      ok: true,
      rows: rows.map((item) =>
        item.id === id
          ? {
              ...item,
              status: "ready",
              readyAt: at,
              expiresAt,
              handledBy: normalizeEmail(staffEmail),
              updatedAt: at,
              version: (item.version || 1) + 1,
            }
          : item,
      ),
    };
  });
}

export function collectDemoReservation({
  id,
  staffEmail,
}) {
  return updateRows((rows) => {
    const target = rows.find((item) => item.id === id);

    if (!target) {
      return { ok: false, error: "notFound" };
    }

    if (target.status !== "ready") {
      return { ok: false, error: "notReady" };
    }

    if (
      !target.expiresAt ||
      Date.parse(target.expiresAt) <= Date.now()
    ) {
      return { ok: false, error: "holdExpired" };
    }

    const at = new Date().toISOString();

    return {
      ok: true,
      rows: rows.map((item) =>
        item.id === id
          ? {
              ...item,
              status: "collected",
              collectedAt: at,
              handledBy: normalizeEmail(staffEmail),
              updatedAt: at,
              version: (item.version || 1) + 1,
            }
          : item,
      ),
    };
  });
}

export function expireDemoReservations({
  staffEmail,
}) {
  return updateRows((rows) => {
    const now = Date.now();

    const expiredIds = new Set(
      rows
        .filter(
          (item) =>
            item.status === "ready" &&
            item.expiresAt &&
            Date.parse(item.expiresAt) <= now,
        )
        .map((item) => item.id),
    );

    if (expiredIds.size === 0) {
      return { ok: true, rows, count: 0 };
    }

    const at = new Date(now).toISOString();

    return {
      ok: true,
      count: expiredIds.size,
      rows: rows.map((item) =>
        expiredIds.has(item.id)
          ? {
              ...item,
              status: "expired",
              expiredAt: at,
              updatedAt: at,
              handledBy: normalizeEmail(staffEmail),
              version: (item.version || 1) + 1,
            }
          : item,
      ),
    };
  });
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (
      event.key !== STORAGE_KEY &&
      event.key !== null
    ) {
      return;
    }

    snapshot = readRows();
    listeners.forEach((listener) => listener());
  });
}
