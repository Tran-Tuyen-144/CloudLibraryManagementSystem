import { normalizeLibrarySettings } from "./librarySettings.js";
import { isDemoCredential } from "./demoCredentials.js";

import {
  getDemoAccountProfiles,
  restoreDemoSession,
} from "./demoAccounts.js";

import {
  hasPermission,
  PERMISSIONS as P,
  ROLE_PERMISSIONS,
} from "./libraryPermissions.js";

import { flattenRequests } from "../ui/borrowWorkflow.js";

export const LIBRARY_STORAGE_KEY =
  "cloudlibrary:demo-library:v3";

export const LEGACY_REQUESTS_KEY =
  "cloudlibrary:demo-requests-by-email:v1";

export const LEGACY_SESSION_KEY =
  "cloudlibrary:demo-session:v1";

const isObject = (value) =>
  value &&
  typeof value === "object" &&
  !Array.isArray(value);

export function createLibraryData(saved, legacy, catalogBooks) {
  const source =
    isObject(saved) && saved.schemaVersion === 3
      ? saved
      : null;

  const rows = flattenRequests(
    isObject(source?.requestsByEmail)
      ? source.requestsByEmail
      : isObject(legacy?.requestsByEmail)
        ? legacy.requestsByEmail
        : {},
  );

  const requestsByEmail = {};

  for (const row of rows) {
    const email = row.readerEmail.trim().toLowerCase();

    if (!email.includes("@")) continue;

    (requestsByEmail[email] ||= []).push(row);
  }

  const accounts = new Map(
    getDemoAccountProfiles().map((account) => [
      account.email,
      account,
    ]),
  );

  for (const item of Array.isArray(source?.accounts)
    ? source.accounts
    : []) {
    if (
      !isObject(item) ||
      typeof item.email !== "string" ||
      !item.email.includes("@") ||
      !Object.hasOwn(ROLE_PERMISSIONS, item.role)
    ) {
      continue;
    }

    const email = item.email.trim().toLowerCase();

    accounts.set(email, {
      id: `account:${email}`,
      email,

      fullName:
        typeof item.fullName === "string"
          ? item.fullName
          : email.split("@")[0],

      role: item.role,
      status: item.status === "locked" ? "locked" : "active",

      ...(isDemoCredential(item.credential)
        ? {
            credential: {
              scheme: item.credential.scheme,
              iterations: item.credential.iterations,
              salt: item.credential.salt,
              hash: item.credential.hash,
            },
          }
        : {}),
    });
  }

  const rawSession = source
    ? source.session
    : legacy?.session;

  for (const email of [
    ...Object.keys(requestsByEmail),

    ...(rawSession?.role === "reader" &&
    typeof rawSession.email === "string"
      ? [rawSession.email.toLowerCase()]
      : []),
  ]) {
    if (!email.includes("@") || accounts.has(email)) {
      continue;
    }

    const profile = legacy?.profiles?.[email];

    const candidateName =
      profile?.fullName ||
      rows.find((row) => row.readerEmail === email)
        ?.readerName ||
      (rawSession?.email === email
        ? rawSession.fullName
        : "");

    accounts.set(email, {
      id: `account:${email}`,
      email,

      fullName:
        typeof candidateName === "string" &&
        candidateName.trim()
          ? candidateName.trim()
          : email.split("@")[0],

      role: "reader",
      status: "active",
    });
  }

  const accountList = [...accounts.values()];

  const session = source
    ? rawSession
    : restoreDemoSession(rawSession);

  return {
    schemaVersion: 3,
    accounts: accountList,

    session:
      session &&
      typeof session.email === "string" &&
      session.sessionVersion === 2
        ? {
            email: session.email.toLowerCase(),
            sessionVersion: 2,
          }
        : null,

    books: (
      Array.isArray(source?.books)
        ? source.books
        : catalogBooks
    )
      .filter(
        (book) =>
          book &&
          typeof book.id === "string" &&
          typeof book.title === "string" &&
          typeof book.author === "string",
      )
      .map((book) => ({
        ...book,

        availableCopies: Math.max(
          0,
          Math.floor(Number(book.availableCopies) || 0),
        ),
      })),

    requestsByEmail,

    settings: normalizeLibrarySettings(source?.settings),

    auditLogs: Array.isArray(source?.auditLogs)
      ? source.auditLogs
      : [],

    accessLogs: Array.isArray(source?.accessLogs)
      ? source.accessLogs
      : [],
  };
}

export function publicAccount(account) {
  return account
    ? {
        id: account.id,
        email: account.email,
        fullName: account.fullName,
        role: account.role,
        status: account.status,
      }
    : null;
}

export function currentLibraryUser(data) {
  if (data.session?.sessionVersion !== 2) return null;

  const account = data.accounts.find(
    (item) => item.email === data.session.email,
  );

  return account?.status === "active"
    ? {
        ...publicAccount(account),
        sessionVersion: 2,
      }
    : null;
}

export function createLibraryLog(
  actor,
  action,
  targetId,
  result = "success",
  details = {},
) {
  return {
    ...details,

    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    action,
    targetId,

    actorEmail: actor?.email || null,
    actorName: actor?.fullName || "",
    actorRole: actor?.role || "",

    result,
  };
}

export function visibleLibraryLogs(
  data,
  kind,
  user = currentLibraryUser(data),
) {
  if (!["audit", "access"].includes(kind)) return [];

  const rows =
    kind === "audit" ? data.auditLogs : data.accessLogs;

  if (
    hasPermission(
      user,
      kind === "audit" ? P.AUDIT_ALL : P.ACCESS_ALL,
    )
  ) {
    return rows;
  }

  return hasPermission(
    user,
    kind === "audit" ? P.AUDIT_OWN : P.ACCESS_OWN,
  )
    ? rows.filter((row) => row.actorEmail === user.email)
    : [];
}

export function changeLibraryAccount(data, email, changes) {
  const actor = currentLibraryUser(data);

  if (!hasPermission(actor, P.ACCOUNTS_MANAGE)) {
    return { ok: false, error: "forbidden" };
  }

  const account = data.accounts.find(
    (item) => item.email === email,
  );

  if (!account) {
    return { ok: false, error: "invalidAccount" };
  }

  if (
    (Object.hasOwn(changes, "role") &&
      !Object.hasOwn(ROLE_PERMISSIONS, changes.role)) ||
    (Object.hasOwn(changes, "status") &&
      !["active", "locked"].includes(changes.status))
  ) {
    return { ok: false, error: "invalidAccount" };
  }

  const next = {
    ...account,

    ...(typeof changes.fullName === "string" &&
    changes.fullName.trim()
      ? {
          fullName: changes.fullName.trim().slice(0, 100),
        }
      : {}),

    ...(Object.hasOwn(ROLE_PERMISSIONS, changes.role)
      ? { role: changes.role }
      : {}),

    ...(["active", "locked"].includes(changes.status)
      ? { status: changes.status }
      : {}),
  };

  const accounts = data.accounts.map((item) =>
    item.email === email ? next : item,
  );

  if (
    !accounts.some(
      (item) =>
        item.role === "admin" &&
        item.status === "active",
    )
  ) {
    return { ok: false, error: "lastAdmin" };
  }

  return {
    ok: true,

    state: {
      ...data,
      accounts,

      session:
        data.session?.email === email &&
        next.status === "locked"
          ? null
          : data.session,

      auditLogs: [
        createLibraryLog(
          actor,
          "account.update",
          email,
          "success",
          {
            before: publicAccount(account),
            after: publicAccount(next),
          },
        ),
        ...data.auditLogs,
      ],
    },
  };
}