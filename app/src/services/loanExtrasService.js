import { currentLibraryUser } from "../data/libraryData.js";
import { hasPermission, PERMISSIONS as P } from "../data/libraryPermissions.js";
import { flattenRequests } from "../ui/borrowWorkflow.js";
import {
  getLibrarySnapshot,
  refreshLibrary,
  runLibraryCommand,
  useConnection,
  useLibraryData,
} from "../ui/libraryStore.js";
const DEFAULT_RULES = Object.freeze({
  maxRenewals: 1,
  extensionDays: 7,
  dailyFineVnd: 5000,
});

const normalizeEmail = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

function policyNumber(value, fallback, min, max) {
  return Number.isSafeInteger(value) && value >= min && value <= max
    ? value
    : fallback;
}

export function loanExtrasRules(loan) {
  const settings = getLibrarySnapshot().settings;
  const snapshot = {
    ...settings,
    ...loan?.rulesSnapshot,
    ...(loan?.dailyFineVnd != null ? { dailyFineVnd: loan.dailyFineVnd } : {}),
  };
  return {
    maxRenewals: policyNumber(
      snapshot.maxRenewals,
      DEFAULT_RULES.maxRenewals,
      0,
      10,
    ),
    extensionDays: policyNumber(
      snapshot.extensionDays,
      DEFAULT_RULES.extensionDays,
      1,
      60,
    ),
    dailyFineVnd: policyNumber(
      snapshot.dailyFineVnd,
      DEFAULT_RULES.dailyFineVnd,
      0,
      1000000,
    ),
  };
}

function dayNumber(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return null;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) &&
    new Date(parsed).toISOString().slice(0, 10) === value
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

export function loanFineInfo(loan, now = new Date()) {
  const rate = loanExtrasRules(loan).dailyFineVnd;
  const dueDay = dayNumber(loan?.dueDate);
  const isReturned = loan?.status === "returned";
  const actualDay = isReturned
    ? dayFromTimestamp(loan.returnedAt)
    : dayNumber(vietnamDate(now));
  const overdueDays =
    dueDay === null || actualDay === null
      ? null
      : Math.max(0, actualDay - dueDay);
  const estimate = overdueDays === null ? 0 : overdueDays * rate;
  const fromServer = Number(loan?.fineAmount);
  const amount =
    Number.isFinite(fromServer) && fromServer >= 0 ? fromServer : estimate;
  const paid = loan?.finePaymentStatus === "paid";
  return {
    overdueDays,
    amount,
    paid,
    isEstimate: !isReturned,
    canCollect: isReturned && amount > 0 && loan.finePaymentStatus === "unpaid",
  };
}

function meetsRenewalPolicy(loan, now = new Date()) {
  const today = vietnamDate(now);
  return Boolean(
    loan?.status === "borrowed" &&
    dayNumber(loan.dueDate) !== null &&
    loan.dueDate >= today &&
    Number(loan.renewalCount || 0) < loanExtrasRules(loan).maxRenewals,
  );
}

export function canRequestLoanRenewal(loan, now = new Date()) {
  return meetsRenewalPolicy(loan, now) && loan.renewalStatus !== "pending";
}

function sendLoanAction(loan, action, reason) {
  if (!loan?.id || !Number.isSafeInteger(loan.version))
    return Promise.resolve({ ok: false, error: "missingVersion" });
  return runLibraryCommand("loan.action", {
    id: loan.id,
    version: loan.version,
    action,
    ...(reason ? { reason } : {}),
  });
}
export const loanExtrasService = {
  mode: "api",
  requestRenewal: ({ loan }) => sendLoanAction(loan, "renew-request"),
  decideRenewal: ({ loan, approve, reason }) =>
    sendLoanAction(loan, approve ? "renew-approve" : "renew-reject", reason),
  collectFine: ({ loan }) => sendLoanAction(loan, "collect-fine"),
};
export function useLoanExtras({ all = false } = {}) {
  const library = useLibraryData();
  const connection = useConnection();
  const user = currentLibraryUser(library);
  const isStaff = hasPermission(user, P.LOANS_READ);
  const source = flattenRequests(library.requestsByEmail);
  return {
    user,
    rows:
      all && isStaff
        ? source
        : source.filter(
            (row) =>
              normalizeEmail(row.readerEmail) === normalizeEmail(user?.email),
          ),
    books: library.books,
    isDemo: false,
    isStaff,
    loading: connection.loading,
    error: connection.error || "",
    refresh: refreshLibrary,
  };
}
