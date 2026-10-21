import {
  createLibraryLog,
  currentLibraryUser,
  visibleLibraryLogs,
} from "./libraryData.js";

import {
  hasPermission,
  PERMISSIONS as P,
} from "./libraryPermissions.js";

import { dateKey } from "../ui/borrowWorkflow.js";

export const MANAGEMENT_PAGES = Object.freeze({
  overview: P.DASHBOARD,
  loans: P.LOANS_READ,
  books: P.CATALOG,
  readersPage: P.READERS_READ,
  staff: P.ACCOUNTS_MANAGE,
  permissions: P.PERMISSIONS_OWN,
  audit: P.AUDIT_OWN,
  access: P.ACCESS_OWN,
  settings: P.SETTINGS_MANAGE,
});

export function managementVisit(state, page) {
  const actor = currentLibraryUser(state);

  const allowed =
    hasPermission(actor, P.MANAGEMENT) &&
    Object.hasOwn(MANAGEMENT_PAGES, page) &&
    hasPermission(actor, MANAGEMENT_PAGES[page]);

  return {
    ...state,

    accessLogs: [
      createLibraryLog(
        actor,
        allowed ? "page.view" : "access.denied",
        page,
        allowed ? "success" : "denied",
      ),
      ...state.accessLogs,
    ],
  };
}

export const HISTORY_FIELDS = Object.freeze([
  "title",
  "author",
  "category",
  "isbn",
  "cover",
  "description",
  "availableCopies",
  "archived",
  "email",
  "fullName",
  "role",
  "status",
  "bookId",
  "readerName",
  "dueDate",
  "createdAt",
  "approvedAt",
  "borrowedAt",
  "returnedAt",
  "rejectedAt",
  "cancelledAt",
  "rejectionReason",
  "maxActiveLoans",
  "loanDays",
  "libraryName",
  "address",
  "contactEmail",
  "phone",
  "openingHours",
]);

function publicSnapshot(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return null;
  }

  return Object.fromEntries(
    HISTORY_FIELDS.filter(
      (key) =>
        Object.hasOwn(value, key) &&
        (value[key] === null ||
          ["string", "number", "boolean"].includes(
            typeof value[key],
          )),
    ).map((key) => [key, value[key]]),
  );
}

const string = (value) =>
  typeof value === "string" ? value : "";

const normalize = (value) =>
  String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .trim();

const validDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T12:00:00`);

  return (
    Number.isFinite(date.getTime()) &&
    dateKey(date) === value
  );
};

const timestamp = (value) => Date.parse(value) || 0;

export function historyChanges(log) {
  return HISTORY_FIELDS.filter(
    (key) =>
      (Object.hasOwn(log.before || {}, key) ||
        Object.hasOwn(log.after || {}, key)) &&
      log.before?.[key] !== log.after?.[key],
  ).map((field) => ({
    field,
    before: log.before?.[field],
    after: log.after?.[field],
  }));
}

export function libraryHistory(
  state,
  kind,
  filters = {},
) {
  const actor = currentLibraryUser(state);
  const validKind = ["audit", "access"].includes(kind);

  const all =
    validKind &&
    hasPermission(
      actor,
      kind === "audit" ? P.AUDIT_ALL : P.ACCESS_ALL,
    );

  const own =
    validKind &&
    hasPermission(
      actor,
      kind === "audit" ? P.AUDIT_OWN : P.ACCESS_OWN,
    );

  if (
    !hasPermission(actor, P.MANAGEMENT) ||
    (!all && !own)
  ) {
    return {
      allowed: false,
      all: false,
      rows: [],
      total: 0,
      actions: [],
      error: "forbidden",
    };
  }

  const key =
    kind === "audit" ? "auditLogs" : "accessLogs";

  const safeRows = (
    Array.isArray(state[key]) ? state[key] : []
  ).filter(
    (row) =>
      row &&
      typeof row === "object" &&
      typeof row.action === "string",
  );

  const scoped = visibleLibraryLogs(
    { ...state, [key]: safeRows },
    kind,
  ).map((row, index) => ({
    id: string(row.id) || `legacy:${index}`,
    at: string(row.at),
    action: row.action,
    operation: string(row.operation),
    targetId: string(row.targetId),
    actorEmail: string(row.actorEmail),
    actorName: string(row.actorName),
    actorRole: string(row.actorRole),
    result: string(row.result),
    attemptedEmail: string(row.attemptedEmail),
    error: string(row.error),
    before: publicSnapshot(row.before),
    after: publicSnapshot(row.after),
  }));

  const actions = [
    ...new Set(
      scoped.map((row) => row.operation || row.action),
    ),
  ].sort();

  const from = filters.from || "";
  const to = filters.to || "";

  if (
    (from && !validDate(from)) ||
    (to && !validDate(to)) ||
    (from && to && from > to)
  ) {
    return {
      allowed: true,
      all,
      rows: [],
      total: scoped.length,
      actions,
      error: "invalidRange",
    };
  }

  const query = normalize(filters.query || "");

  const rows = scoped
    .filter((row) => {
      const date = new Date(row.at);

      const day = Number.isFinite(date.getTime())
        ? dateKey(date)
        : "";

      return (
        (!from || (day && day >= from)) &&
        (!to || (day && day <= to)) &&
        (!filters.result ||
          filters.result === "all" ||
          row.result === filters.result) &&
        (!filters.action ||
          filters.action === "all" ||
          (row.operation || row.action) ===
            filters.action) &&
        normalize(
          [
            row.actorName,
            row.actorEmail,
            row.attemptedEmail,
            row.action,
            row.operation,
            row.targetId,
            row.before?.title,
            row.after?.title,
            row.before?.fullName,
            row.after?.fullName,
          ]
            .filter(Boolean)
            .join(" "),
        ).includes(query)
      );
    })
    .sort((a, b) =>
      filters.sort === "oldest"
        ? timestamp(a.at) - timestamp(b.at)
        : timestamp(b.at) - timestamp(a.at),
    );

  return {
    allowed: true,
    all,
    rows,
    total: scoped.length,
    actions,
    error: "",
  };
}