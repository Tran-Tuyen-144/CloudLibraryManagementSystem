import { currentLibraryUser } from "./libraryData.js";

import {
  hasPermission,
  PERMISSIONS as P,
} from "./libraryPermissions.js";

import {
  availableBooks,
  dateKey,
  flattenRequests,
  futureDate,
} from "../ui/borrowWorkflow.js";

const dayMs = 86400000;

function dayNumber(key) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) {
    return NaN;
  }

  const [year, month, day] = key
    .split("-")
    .map(Number);

  const date = new Date(
    Date.UTC(year, month - 1, day),
  );

  return date.toISOString().slice(0, 10) === key
    ? date.getTime() / dayMs
    : NaN;
}

function eventDay(value) {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    return "";
  }

  const date = new Date(value);

  return Number.isFinite(date.getTime())
    ? dateKey(date)
    : "";
}

export function reportRange(
  days = 30,
  now = new Date(),
) {
  return {
    from: futureDate(-(days - 1), now),
    to: dateKey(now),
  };
}

export function libraryReport(
  state,
  filters = {},
  now = new Date(),
) {
  const actor = currentLibraryUser(state);

  if (
    !hasPermission(actor, P.MANAGEMENT) ||
    !hasPermission(actor, P.REPORTS_READ)
  ) {
    return {
      allowed: false,
      error: "forbidden",
    };
  }

  const defaults = reportRange(30, now);

  const from = filters.from ?? defaults.from;
  const to = filters.to ?? defaults.to;

  const first = dayNumber(from);
  const last = dayNumber(to);
  const today = dateKey(now);

  if (
    !Number.isFinite(first) ||
    !Number.isFinite(last) ||
    first > last ||
    to > today ||
    last - first >= 366
  ) {
    return {
      allowed: true,
      error: "invalidRange",
    };
  }

  const rows = flattenRequests(
    state.requestsByEmail,
  );

  const books = new Map(
    state.books.map((book) => [book.id, book]),
  );

  const accounts = new Map(
    state.accounts.map((account) => [
      account.email,
      account,
    ]),
  );

  const within = (day) =>
    Boolean(
      day &&
      day >= from &&
      day <= to,
    );

  const events = rows.map((row) => ({
    row,
    created: eventDay(row.createdAt),
    borrowed: eventDay(row.borrowedAt),
    returned: eventDay(row.returnedAt),
  }));

  const borrowed = events.filter((event) =>
    within(event.borrowed),
  );

  const returned = events.filter((event) =>
    within(event.returned),
  );

  const overdue = rows
    .filter(
      (row) =>
        row.status === "borrowed" &&
        Number.isFinite(
          dayNumber(row.dueDate || ""),
        ) &&
        row.dueDate < today,
    )
    .map((row) => ({
      id: `${row.readerEmail}:${row.id}`,

      title:
        books.get(row.bookId)?.title ||
        row.title ||
        row.bookId,

      readerName:
        accounts.get(row.readerEmail)?.fullName ||
        row.readerName ||
        row.readerEmail,

      readerEmail: row.readerEmail,
      dueDate: row.dueDate,

      daysLate:
        dayNumber(today) -
        dayNumber(row.dueDate),
    }))
    .sort(
      (a, b) =>
        b.daysLate - a.daysLate ||
        a.title.localeCompare(b.title, "vi"),
    );

  const current = Object.fromEntries(
    [
      "pending",
      "approved",
      "borrowed",
      "returned",
      "rejected",
      "cancelled",
    ].map((status) => [
      status,
      rows.filter(
        (row) => row.status === status,
      ).length,
    ]),
  );

  current.overdue = overdue.length;

  const inventory = availableBooks(
    state.books,
    rows,
  ).filter((book) => !book.archived);

  const span = last - first + 1;

  const unit =
    span <= 31
      ? "day"
      : span <= 93
        ? "week"
        : "month";

  const trend = [];

  for (
    let cursor = first;
    cursor <= last;
  ) {
    const start = new Date(cursor * dayMs);

    const end =
      unit === "month"
        ? Math.min(
            last,
            Date.UTC(
              start.getUTCFullYear(),
              start.getUTCMonth() + 1,
              0,
            ) / dayMs,
          )
        : Math.min(
            last,
            cursor +
              (unit === "week" ? 6 : 0),
          );

    const startKey = start
      .toISOString()
      .slice(0, 10);

    const endKey = new Date(end * dayMs)
      .toISOString()
      .slice(0, 10);

    trend.push({
      from: startKey,
      to: endKey,

      borrowed: borrowed.filter(
        (event) =>
          event.borrowed >= startKey &&
          event.borrowed <= endKey,
      ).length,

      returned: returned.filter(
        (event) =>
          event.returned >= startKey &&
          event.returned <= endKey,
      ).length,
    });

    cursor = end + 1;
  }

  const ranking = new Map();

  for (const { row } of borrowed) {
    const item = ranking.get(row.bookId) || {
      id: row.bookId,

      title:
        books.get(row.bookId)?.title ||
        row.title ||
        row.bookId,

      count: 0,
    };

    item.count++;
    ranking.set(row.bookId, item);
  }

  return {
    allowed: true,
    error: "",
    from,
    to,
    asOf: now.toISOString(),
    unit,
    trend,

    period: {
      requested: events.filter((event) =>
        within(event.created),
      ).length,

      borrowed: borrowed.length,
      returned: returned.length,

      readers: new Set(
        borrowed.map(
          (event) => event.row.readerEmail,
        ),
      ).size,
    },

    current,

    stock: {
      titles: inventory.length,

      totalCopies: state.books
        .filter((book) => !book.archived)
        .reduce(
          (sum, book) =>
            sum +
            Number(book.availableCopies || 0),
          0,
        ),

      available: inventory.reduce(
        (sum, book) =>
          sum + book.availableCopies,
        0,
      ),
    },

    topBooks: [...ranking.values()]
      .sort(
        (a, b) =>
          b.count - a.count ||
          a.title.localeCompare(
            b.title,
            "vi",
          ),
      )
      .slice(0, 5),

    overdue,

    missingDates: events.filter(
      (event) =>
        (["borrowed", "returned"].includes(
          event.row.status,
        ) &&
          !event.borrowed) ||
        (event.row.status === "returned" &&
          !event.returned),
    ).length,
  };
}

function csvCell(value) {
  let text = String(value ?? "");

  if (
    typeof value === "string" &&
    (/^\s*[=+\-@]/.test(text) ||
      /^[\t\r\n]/.test(text))
  ) {
    text = "'" + text;
  }

  return `"${text.replace(/"/g, '""')}"`;
}

export function reportCsv(report, copy) {
  if (!report.allowed || report.error) {
    return "";
  }

  const rows = [
    copy.csvHeaders,
    [
      copy.generated,
      report.asOf,
      "",
      "",
      "",
    ],
  ];

  for (const [key, value] of Object.entries(
    report.period,
  )) {
    rows.push([
      copy.periodTitle,
      copy[key],
      report.from,
      report.to,
      value,
    ]);
  }

  for (const [key, value] of Object.entries(
    report.current,
  )) {
    rows.push([
      copy.currentTitle,

      key === "borrowed"
        ? copy.onLoan
        : key === "returned"
          ? copy.completed
          : copy[key],

      "",
      report.asOf,
      value,
    ]);
  }

  for (const [key, value] of Object.entries(
    report.stock,
  )) {
    rows.push([
      copy.inventory,
      copy[key],
      "",
      report.asOf,
      value,
    ]);
  }

  for (const bucket of report.trend) {
    rows.push([
      copy.trendTitle,
      copy.borrowed,
      bucket.from,
      bucket.to,
      bucket.borrowed,
    ]);

    rows.push([
      copy.trendTitle,
      copy.returned,
      bucket.from,
      bucket.to,
      bucket.returned,
    ]);
  }

  for (const book of report.topBooks) {
    rows.push([
      copy.topTitle,
      book.title,
      report.from,
      report.to,
      book.count,
    ]);
  }

  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row.map(csvCell).join(","),
      )
      .join("\r\n")
  );
}