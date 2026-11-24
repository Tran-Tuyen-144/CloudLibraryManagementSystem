
import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "../api/client.js";
import { currentLibraryUser } from "../data/libraryData.js";
import { hasPermission, PERMISSIONS as P } from "../data/libraryPermissions.js";
import { flattenRequests } from "../ui/borrowWorkflow.js";
import { runLibraryCommand, useLibraryData } from "../ui/libraryStore.js";

const MODE = import.meta.env.VITE_LOAN_EXTRAS_SOURCE === "api" ? "api" : "demo";
const RESERVATIONS_KEY = "cloudlibrary:demo-reservations:v1";
const EMPTY = [];

const DEFAULT_RULES = Object.freeze({
  maxRenewals: 1,
  extensionDays: 7,
  dailyFineVnd: 5000,
});

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

function policyNumber(value, fallback, min, max) {
  return Number.isSafeInteger(value) && value >= min && value <= max
    ? value
    : fallback;
}

export function loanExtrasRules(loan) {
  const snapshot = loan?.rulesSnapshot || {};
  return {
    maxRenewals: policyNumber(snapshot.maxRenewals, DEFAULT_RULES.maxRenewals, 1, 10),
    extensionDays: policyNumber(snapshot.extensionDays, DEFAULT_RULES.extensionDays, 1, 60),
    dailyFineVnd: policyNumber(snapshot.dailyFineVnd, DEFAULT_RULES.dailyFineVnd, 0, 1000000),
  };
}

function dayNumber(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value
    ? Math.floor(parsed / 86400000)
    : null;
}

function vietnamDate(date = new Date()) {
  return new Date(date.getTime() + 7 * 3600000).toISOString().slice(0, 10);
}

function dayFromTimestamp(value) {
  if (typeof value !== "string") return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return dayNumber(value);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : dayNumber(vietnamDate(date));
}

function addDays(value, days) {
  const day = dayNumber(value);
  return day === null ? null : new Date((day + days) * 86400000).toISOString().slice(0, 10);
}

export function loanFineInfo(loan, now = new Date()) {
  const rate = loanExtrasRules(loan).dailyFineVnd;
  const dueDay = dayNumber(loan?.dueDate);
  const isReturned = loan?.status === "returned";
  const actualDay = isReturned
    ? dayFromTimestamp(loan.returnedAt)
    : dayNumber(vietnamDate(now));
  const overdueDays = dueDay === null || actualDay === null
    ? null
    : Math.max(0, actualDay - dueDay);
  const estimate = overdueDays === null ? 0 : overdueDays * rate;
  const fromServer = Number(loan?.fineAmount);
  const amount = MODE === "api" && Number.isFinite(fromServer) && fromServer >= 0
    ? fromServer
    : loan?.finePaymentStatus === "paid" && Number.isFinite(fromServer) && fromServer >= 0
      ? fromServer
      : estimate;
  const paid = loan?.finePaymentStatus === "paid";
  return {
    overdueDays,
    amount,
    paid,
    isEstimate: !isReturned,
    canCollect: isReturned && overdueDays !== null && amount > 0 && !paid,
  };
}

function meetsRenewalPolicy(loan, now = new Date()) {
  const today = vietnamDate(now);
  return Boolean(
    loan?.status === "borrowed" &&
    dayNumber(loan.dueDate) !== null &&
    loan.dueDate >= today &&
    Number(loan.renewalCount || 0) < loanExtrasRules(loan).maxRenewals
  );
}

export function canRequestLoanRenewal(loan, now = new Date()) {
  return meetsRenewalPolicy(loan, now) && loan.renewalStatus !== "pending";
}

function hasActiveReservation(bookId) {
  try {
    const rows = JSON.parse(localStorage.getItem(RESERVATIONS_KEY) || "[]");
    return Array.isArray(rows) && rows.some(
      (item) => item?.bookId === bookId && ["waiting", "ready"].includes(item.status),
    );
  } catch {
    // Nếu không thể kiểm tra hàng chờ, không cho duyệt gia hạn.
    return true;
  }
}

function findLoan(state, email, id) {
  return (state.requestsByEmail[email] || []).find((item) => item.id === id);
}

function patchLoan(state, email, loan, patch, operation) {
  const after = { ...loan, ...patch };
  return {
    ok: true,
    targetId: loan.id,
    details: { operation, before: loan, after },
    state: {
      ...state,
      requestsByEmail: {
        ...state.requestsByEmail,
        [email]: state.requestsByEmail[email].map((item) =>
          item.id === loan.id ? after : item,
        ),
      },
    },
  };
}

const demoAdapter = {
  async requestRenewal({ loan }) {
    return runLibraryCommand(P.LOAN_CREATE, (state, actor) => {
      const email = normalizeEmail(actor.email);
      const current = findLoan(state, email, loan?.id);
      if (!current) return { ok: false, error: "notFound" };
      if (current.renewalStatus === "pending") return { ok: false, error: "alreadyPending" };
      if (!canRequestLoanRenewal(current)) return { ok: false, error: "renewalNotAllowed" };
      if (hasActiveReservation(current.bookId)) return { ok: false, error: "bookReserved" };
      const at = new Date().toISOString();
      return patchLoan(state, email, current, {
        renewalStatus: "pending",
        renewalRequestedAt: at,
        renewalReason: "",
      }, "loan.renew.request");
    });
  },

  async decideRenewal({ loan, approve, reason = "" }) {
    const permission = approve ? P.LOAN_APPROVE : P.LOAN_REJECT;
    return runLibraryCommand(permission, (state, actor) => {
      const email = normalizeEmail(loan?.readerEmail);
      const current = findLoan(state, email, loan?.id);
      if (!current) return { ok: false, error: "notFound" };
      if (current.renewalStatus !== "pending") return { ok: false, error: "notPending" };
      const at = new Date().toISOString();
      if (!approve) {
        const explanation = reason.trim().slice(0, 300);
        if (!explanation) return { ok: false, error: "reasonRequired" };
        return patchLoan(state, email, current, {
          renewalStatus: "rejected",
          renewalRejectedAt: at,
          renewalReason: explanation,
          renewalHandledBy: actor.email,
        }, "loan.renew.reject");
      }
      if (!meetsRenewalPolicy(current)) return { ok: false, error: "renewalNotAllowed" };
      if (hasActiveReservation(current.bookId)) return { ok: false, error: "bookReserved" };
      const rules = loanExtrasRules(current);
      const nextDue = addDays(current.dueDate, rules.extensionDays);
      if (!nextDue) return { ok: false, error: "invalidDueDate" };
      return patchLoan(state, email, current, {
        dueDate: nextDue,
        renewalCount: Number(current.renewalCount || 0) + 1,
        renewalStatus: "approved",
        renewalApprovedAt: at,
        renewalHandledBy: actor.email,
        renewalReason: "",
      }, "loan.renew.approve");
    });
  },

  async collectFine({ loan }) {
    return runLibraryCommand(P.LOAN_RETURN, (state, actor) => {
      const email = normalizeEmail(loan?.readerEmail);
      const current = findLoan(state, email, loan?.id);
      if (!current) return { ok: false, error: "notFound" };
      if (current.finePaymentStatus === "paid") return { ok: false, error: "alreadyPaid" };
      const fine = loanFineInfo(current);
      if (!fine.canCollect) return { ok: false, error: "fineNotCollectable" };
      const at = new Date().toISOString();
      return patchLoan(state, email, current, {
        fineAmount: fine.amount,
        finePaymentStatus: "paid",
        fineCollectedAt: at,
        fineCollectedBy: actor.email,
        overdueDays: fine.overdueDays,
        fineDailyRateVnd: loanExtrasRules(current).dailyFineVnd,
      }, "loan.fine.collect");
    });
  },
};

async function sendLoanAction(loan, action, reason) {
  if (!loan?.id) return { ok: false, error: "notFound" };
  if (!Number.isSafeInteger(loan.version)) {
    return { ok: false, error: "missingVersion" };
  }
  return apiRequest("/commands", {
    method: "POST",
    auth: true,
    idempotencyKey: crypto.randomUUID(),
    body: {
      command: "loan.action",
      input: {
        id: loan.id,
        version: loan.version,
        action,
        ...(reason ? { reason } : {}),
      },
    },
  });
}

const apiAdapter = {
  requestRenewal: ({ loan }) => sendLoanAction(loan, "renew-request"),
  decideRenewal: ({ loan, approve, reason }) => sendLoanAction(
    loan, approve ? "renew-approve" : "renew-reject", approve ? "" : reason,
  ),
  collectFine: ({ loan }) => sendLoanAction(loan, "collect-fine"),
};

const adapter = MODE === "api" ? apiAdapter : demoAdapter;

async function perform(action, payload) {
  try {
    const result = await adapter[action](payload);
    if (result?.ok === false) return result;
    return { ok: true, data: result?.data ?? null };
  } catch (error) {
    return {
      ok: false,
      error: error?.code || "networkError",
      message: error?.message || "Không thể hoàn tất thao tác.",
    };
  }
}

export const loanExtrasService = {
  mode: MODE,
  requestRenewal: (payload) => perform("requestRenewal", payload),
  decideRenewal: (payload) => perform("decideRenewal", payload),
  collectFine: (payload) => perform("collectFine", payload),
};

export function useLoanExtras({ all = false } = {}) {
  const library = useLibraryData();
  const user = currentLibraryUser(library);
  const [revision, setRevision] = useState(0);
  const [apiState, setApiState] = useState({ rows: EMPTY, loading: MODE === "api", error: "" });
  const refresh = useCallback(() => {
    if (MODE === "api") setRevision((value) => value + 1);
  }, []);

  useEffect(() => {
    if (MODE !== "api") return;
    const controller = new AbortController();
    apiRequest("/snapshot", { auth: true, signal: controller.signal })
      .then((response) => {
        if (controller.signal.aborted) return;
        const source = response?.data?.requestsByEmail;
        if (!source || typeof source !== "object" || Array.isArray(source)) {
          throw new Error("API chưa trả về danh sách phiếu mượn hợp lệ.");
        }
        setApiState({ rows: flattenRequests(source), loading: false, error: "" });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setApiState({ rows: EMPTY, loading: false, error: error.message });
      });
    return () => controller.abort();
  }, [revision, user?.email]);

  const sourceRows = MODE === "api"
    ? apiState.rows
    : flattenRequests(library.requestsByEmail);
  const staffAllowed = hasPermission(user, P.LOANS_READ);
  const rows = all && staffAllowed
    ? sourceRows
    : sourceRows.filter((item) => normalizeEmail(item.readerEmail) === normalizeEmail(user?.email));

  return {
    user,
    rows,
    books: library.books,
    isDemo: MODE === "demo",
    isStaff: staffAllowed,
    loading: MODE === "api" && apiState.loading,
    error: MODE === "api" ? apiState.error : "",
    refresh,
  };
}
