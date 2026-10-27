import { currentLibraryUser } from "../data/libraryData";

import { hasPermission, PERMISSIONS as P } from "../data/libraryPermissions";

import {
  availableBooks,
  flattenRequests,
  futureDate,
  requestError,
  transitionRequest,
} from "../ui/borrowWorkflow";

import { runLibraryCommand, useLibraryData } from "../ui/libraryStore";

const actions = {
  approve: P.LOAN_APPROVE,
  reject: P.LOAN_REJECT,
  handover: P.LOAN_HANDOVER,
  return: P.LOAN_RETURN,
  cancel: P.LOAN_CANCEL_ANY,
};

export default function useBorrowRequests() {
  const data = useLibraryData();
  const user = currentLibraryUser(data);

  const rows = flattenRequests(data.requestsByEmail);

  // Giữ toàn bộ sách để tra cứu lịch sử và xử lý mượn trả.
  const allBooks = availableBooks(data.books, rows);

  // Danh mục dành cho bạn đọc chỉ hiển thị sách chưa bị ẩn.
  const books = allBooks.filter((book) => !book.archived);

  const requests = rows.filter(
    (request) => request.readerEmail === user?.email,
  );

  const allRequests = hasPermission(user, P.LOANS_READ) ? rows : [];

  function createRequest(candidate, note = "") {
    return runLibraryCommand(P.LOAN_CREATE, (state, actor) => {
      const currentRows = flattenRequests(state.requestsByEmail);

      const book = availableBooks(state.books, currentRows).find(
        (item) => item.id === candidate?.id,
      );

      const error = requestError(
        currentRows,
        actor.email,
        book,
        state.settings.maxActiveLoans,
      );

      if (error) return { ok: false, error };

      const request = {
        id: crypto.randomUUID(),
        bookId: book.id,
        title: book.title,
        readerName: actor.fullName,
        createdAt: new Date().toISOString(),
        status: "pending",
        note: note.trim().slice(0, 300),
      };

      return {
        ok: true,
        targetId: request.id,
        details: { after: request },

        state: {
          ...state,
          requestsByEmail: {
            ...state.requestsByEmail,
            [actor.email]: [
              request,
              ...(state.requestsByEmail[actor.email] || []),
            ],
          },
        },
      };
    });
  }

  function transition(permission, values) {
    return runLibraryCommand(permission, (state, actor) => {
      const command =
        permission === P.LOAN_CANCEL
          ? { ...values, readerEmail: actor.email }
          : values;

      const before = (state.requestsByEmail[command.readerEmail] || []).find(
        (request) => request.id === command.id,
      );

      const result = transitionRequest(
        state.requestsByEmail,
        state.books,
        command,
      );

      if (!result.ok) return result;

      const after = result.state[command.readerEmail].find(
        (request) => request.id === command.id,
      );

      return {
        ok: true,
        targetId: command.id,
        details: { before, after },

        state: {
          ...state,
          requestsByEmail: result.state,
        },
      };
    });
  }

  function processRequest(values) {
    return transition(actions[values.action], values);
  }

  function cancelRequest(id) {
    return transition(P.LOAN_CANCEL, {
      id,
      action: "cancel",
    });
  }

  function createDemoRequests() {
    return runLibraryCommand(P.DEMO_SEED, (state) => {
      if (flattenRequests(state.requestsByEmail).length) {
        return { ok: false, error: "staleRequest" };
      }

      const now = new Date().toISOString();

      const daysAgo = (days) =>
        new Date(Date.now() - days * 86400000).toISOString();

      const records = state.books
        .filter((book) => !book.archived && book.availableCopies > 0)
        .slice(0, 3)
        .map((book, index) => ({
          id: crypto.randomUUID(),
          bookId: book.id,
          title: book.title,
          readerName: "Bạn đọc mẫu",

          createdAt: index === 2 ? daysAgo(18) : index === 1 ? daysAgo(1) : now,

          note: "Demo / Dữ liệu mẫu",
          status: ["pending", "approved", "borrowed"][index],

          ...(index === 1 ? { approvedAt: daysAgo(1) } : {}),

          ...(index === 2
            ? {
                approvedAt: daysAgo(17),
                borrowedAt: daysAgo(16),
                dueDate: futureDate(-2),
              }
            : {}),
        }));

      const sample = {
        id: "account:reader.demo@example.com",
        email: "reader.demo@example.com",
        fullName: "Bạn đọc mẫu",
        role: "reader",
        status: "active",
      };

      return {
        ok: true,
        targetId: "sample-records",

        state: {
          ...state,

          accounts: state.accounts.some(
            (account) => account.email === sample.email,
          )
            ? state.accounts
            : [...state.accounts, sample],

          requestsByEmail: {
            ...state.requestsByEmail,
            [sample.email]: records,
          },
        },
      };
    });
  }

  return {
    books,
    allBooks,
    requests,
    allRequests,
    createRequest,
    cancelRequest,
    processRequest,
    createDemoRequests,
  };
}
