import {
  currentLibraryUser,
  publicAccount,
  changeLibraryAccount,
} from "./libraryData.js";

import { isDemoCredential } from "./demoCredentials.js";
import { hasPermission, PERMISSIONS as P } from "./libraryPermissions.js";
import { flattenRequests } from "../ui/borrowWorkflow.js";

const fail = (error) => ({ ok: false, error });

const text = (value, max) =>
  String(value ?? "")
    .trim()
    .slice(0, max);

const safeUrl = (value) => {
  if (!value) return true;

  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

const isbnKey = (value) => text(value, 32).replace(/[\s-]/g, "").toUpperCase();

export function saveManagedBook(state, input) {
  if (!hasPermission(currentLibraryUser(state), P.BOOKS_MANAGE)) {
    return fail("forbidden");
  }

  const before = state.books.find((book) => book.id === input.id);

  if (input.id && !before) return fail("invalidBook");

  const fields = {
    title: text(input.title, 200),
    author: text(input.author, 150),
    category: text(input.category, 100),
    isbn: text(input.isbn, 32),
    cover: text(input.cover, 2000),
    description: text(input.description, 4000),
    availableCopies: Number(input.availableCopies),
  };

  if (
    !fields.title ||
    !fields.author ||
    !fields.category ||
    !Number.isInteger(fields.availableCopies) ||
    fields.availableCopies < 0 ||
    fields.availableCopies > 100000
  ) {
    return fail("invalidBook");
  }

  if (!safeUrl(fields.cover)) return fail("invalidUrl");

  if (
    fields.isbn &&
    state.books.some(
      (book) =>
        book.id !== input.id && isbnKey(book.isbn) === isbnKey(fields.isbn),
    )
  ) {
    return fail("duplicateIsbn");
  }

  const held = flattenRequests(state.requestsByEmail).filter(
    (request) =>
      request.bookId === input.id &&
      ["approved", "borrowed"].includes(request.status),
  ).length;

  if (fields.availableCopies < held) {
    return fail("stockBelowLoans");
  }

  const after = {
    ...before,
    ...fields,
    id: before?.id || crypto.randomUUID(),
    archived: before?.archived === true,
  };

  return {
    ok: true,
    targetId: after.id,
    details: {
      operation: before ? "book.update" : "book.create",
      before: before || null,
      after,
    },
    state: {
      ...state,
      books: before
        ? state.books.map((book) => (book.id === before.id ? after : book))
        : [...state.books, after],
    },
  };
}

export function archiveManagedBook(state, id, archived) {
  if (!hasPermission(currentLibraryUser(state), P.BOOKS_MANAGE)) {
    return fail("forbidden");
  }

  const before = state.books.find((book) => book.id === id);

  if (!before || typeof archived !== "boolean") {
    return fail("invalidBook");
  }

  const after = { ...before, archived };

  return {
    ok: true,
    targetId: id,
    details: {
      operation: archived ? "book.archive" : "book.restore",
      before,
      after,
    },
    state: {
      ...state,
      books: state.books.map((book) => (book.id === id ? after : book)),
    },
  };
}

export function saveManagedAccount(state, input, kind, credential) {
  const permission = kind === "readers" ? P.READERS_MANAGE : P.ACCOUNTS_MANAGE;

  if (!hasPermission(currentLibraryUser(state), permission)) {
    return fail("forbidden");
  }

  if (!["readers", "staff"].includes(kind)) {
    return fail("invalidAccount");
  }

  const email = text(input.email, 254).toLowerCase();
  const fullName = text(input.fullName, 100);
  const role =
    kind === "readers"
      ? state.accounts.find((account) => account.email === email)?.role
      : input.role;
  const status = input.status;

  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !fullName ||
    !["active", "locked"].includes(status) ||
    !(kind === "readers"
      ? ["reader", "author"].includes(role)
      : ["admin", "librarian"].includes(role))
  ) {
    return fail("invalidAccount");
  }

  const before = state.accounts.find((account) => account.email === email);

  if (input.create) {
    if (kind !== "staff" || before) {
      return fail(before ? "accountExists" : "invalidAccount");
    }

    if (!isDemoCredential(credential)) {
      return fail("invalidPassword");
    }

    const after = {
      id: `account:${email}`,
      email,
      fullName,
      role,
      status,
      credential,
    };

    return {
      ok: true,
      targetId: email,
      details: {
        operation: "account.create",
        before: null,
        after: publicAccount(after),
      },
      state: {
        ...state,
        accounts: [...state.accounts, after],
      },
    };
  }

  if (
    !before ||
    (kind === "readers") !== ["reader", "author"].includes(before.role)
  ) {
    return fail("invalidAccount");
  }

  const result = changeLibraryAccount(state, email, {
    fullName,
    role,
    status,
  });

  if (!result.ok) return result;

  const after = result.state.accounts.find(
    (account) => account.email === email,
  );

  return {
    ok: true,
    targetId: email,
    details: {
      operation: "account.update",
      before: publicAccount(before),
      after: publicAccount(after),
    },
    state: {
      ...result.state,
      auditLogs: state.auditLogs,
    },
  };
}

export function managedAccounts(state, kind) {
  const actor = currentLibraryUser(state);

  if (
    !hasPermission(actor, kind === "staff" ? P.ACCOUNTS_MANAGE : P.READERS_READ)
  ) {
    return [];
  }

  const rows = flattenRequests(state.requestsByEmail);

  return state.accounts
    .filter((account) =>
      kind === "readers"
        ? ["reader", "author"].includes(account.role)
        : ["admin", "librarian"].includes(account.role),
    )
    .map((account) => ({
      ...publicAccount(account),

      activeLoans: rows.filter(
        (request) =>
          request.readerEmail === account.email &&
          ["pending", "approved", "borrowed"].includes(request.status),
      ).length,

      borrowed: rows.filter(
        (request) =>
          request.readerEmail === account.email &&
          request.status === "borrowed",
      ).length,
    }));
}
