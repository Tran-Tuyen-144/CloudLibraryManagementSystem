export const ACTIVE_STATUSES = [
  "pending",
  "approved",
  "borrowed",
];

export const LOAN_STATUSES = [
  ...ACTIVE_STATUSES,
  "returned",
  "rejected",
  "cancelled",
];

export function dateKey(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");

  return `${date.getFullYear()}-${pad(
    date.getMonth() + 1,
  )}-${pad(date.getDate())}`;
}

export function futureDate(days, now = new Date()) {
  const date = new Date(now);

  date.setDate(date.getDate() + days);

  return dateKey(date);
}

export function isOverdue(request, today = dateKey()) {
  return (
    request.status === "borrowed" &&
    Boolean(request.dueDate) &&
    request.dueDate < today
  );
}

export function flattenRequests(state) {
  return Object.entries(state)
    .flatMap(([readerEmail, items]) =>
      Array.isArray(items)
        ? items
            .filter(
              (item) =>
                item &&
                typeof item.id === "string" &&
                typeof item.bookId === "string" &&
                LOAN_STATUSES.includes(item.status),
            )
            .map((item) => ({ ...item, readerEmail }))
        : [],
    )
    .sort((a, b) =>
      String(b.createdAt || "").localeCompare(
        String(a.createdAt || ""),
      ),
    );
}

export function availableBooks(books, requests) {
  return books.map((book) => {
    const held = requests.filter(
      (request) =>
        request.bookId === book.id &&
        ["approved", "borrowed"].includes(request.status),
    ).length;

    return {
      ...book,
      availableCopies: Math.max(
        0,
        Number(book.availableCopies || 0) - held,
      ),
    };
  });
}

export function requestError(
  requests,
  email,
  book,
  maxActiveLoans = 3,
) {
  if (!email) return "loginRequired";

  // Không cho tạo phiếu mới với sách đã bị ẩn.
  if (!book || book.archived) return "invalidBook";

  if (!(book.availableCopies > 0)) return "unavailable";

  const active = requests.filter(
    (request) =>
      request.readerEmail === email &&
      ACTIVE_STATUSES.includes(request.status),
  );

  if (active.some((request) => request.bookId === book.id)) {
    return "duplicate";
  }

  return active.length >= maxActiveLoans ? "limit" : "";
}

export function transitionRequest(
  state,
  books,
  {
    readerEmail,
    id,
    action,
    reason = "",
    dueDate = "",
  },
  now = new Date(),
) {
  const requests = flattenRequests(state);

  const request = requests.find(
    (item) =>
      item.readerEmail === readerEmail &&
      item.id === id,
  );

  if (!request) {
    return { ok: false, error: "staleRequest" };
  }

  const allowed = {
    approve: ["pending"],
    reject: ["pending"],
    handover: ["approved"],
    return: ["borrowed"],
    cancel: ["pending", "approved"],
  };

  if (!allowed[action]?.includes(request.status)) {
    return { ok: false, error: "staleRequest" };
  }

  if (action === "approve") {
    const book = availableBooks(books, requests).find(
      (item) => item.id === request.bookId,
    );

    if (
      !book ||
      book.archived ||
      book.availableCopies < 1
    ) {
      return { ok: false, error: "unavailable" };
    }
  }

  if (action === "reject" && !reason.trim()) {
    return { ok: false, error: "reasonRequired" };
  }

  if (action === "handover") {
    const parsed = new Date(`${dueDate}T12:00:00`);

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(dueDate) ||
      Number.isNaN(parsed.getTime()) ||
      dateKey(parsed) !== dueDate ||
      dueDate < dateKey(now) ||
      dueDate > futureDate(60, now)
    ) {
      return { ok: false, error: "invalidDueDate" };
    }
  }

  const at = now.toISOString();

  const changes = {
    approve: {
      status: "approved",
      approvedAt: at,
    },

    reject: {
      status: "rejected",
      rejectedAt: at,
      rejectionReason: reason.trim().slice(0, 300),
    },

    handover: {
      status: "borrowed",
      borrowedAt: at,
      dueDate,
    },

    return: {
      status: "returned",
      returnedAt: at,
    },

    cancel: {
      status: "cancelled",
      cancelledAt: at,
    },
  };

  return {
    ok: true,
    state: {
      ...state,
      [readerEmail]: state[readerEmail].map((item) =>
        item.id === id
          ? { ...item, ...changes[action] }
          : item,
      ),
    },
  };
}