import {
  dateKey,
  flattenRequests,
  futureDate,
} from "../ui/borrowWorkflow.js";

export function normalizeNotificationReads(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, ids]) => Array.isArray(ids))
      .map(([email, ids]) => [
        email,
        [
          ...new Set(
            ids.filter((id) => typeof id === "string"),
          ),
        ],
      ]),
  );
}

function validDay(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return false;
  }

  const parsed = new Date(`${value}T12:00:00`);

  return (
    !Number.isNaN(parsed.getTime()) &&
    dateKey(parsed) === value
  );
}

export function readerNotifications(
  data,
  user,
  now = new Date(),
) {
  if (
    !["reader", "author"].includes(user?.role) ||
    user.status !== "active"
  ) {
    return [];
  }

  const readIds = new Set(
    data.notificationReads?.[user.email] || [],
  );

  const today = dateKey(now);
  const notifications = [];
  const seen = new Set();

  function add(request, type, occurrence, at) {
    const id = JSON.stringify([
      request.id,
      type,
      occurrence,
    ]);

    if (seen.has(id)) {
      return;
    }

    seen.add(id);

    notifications.push({
      id,
      requestId: request.id,
      type,
      title: request.title || request.bookId,
      dueDate: request.dueDate,
      reason: request.rejectionReason || "",
      at,
      read: readIds.has(id),
    });
  }

  function addEvent(request, type, value) {
    if (typeof value !== "string") {
      return;
    }

    const at = new Date(value);

    if (
      !Number.isNaN(at.getTime()) &&
      at <= now
    ) {
      add(
        request,
        type,
        at.toISOString(),
        at.toISOString(),
      );
    }
  }

  const rows = flattenRequests({
    [user.email]:
      data.requestsByEmail?.[user.email] || [],
  });

  for (const request of rows) {
    if (
      [
        "approved",
        "borrowed",
        "returned",
        "cancelled",
      ].includes(request.status)
    ) {
      addEvent(
        request,
        "approved",
        request.approvedAt,
      );
    }

    if (
      ["borrowed", "returned"].includes(request.status)
    ) {
      addEvent(
        request,
        "borrowed",
        request.borrowedAt,
      );
    }

    if (request.status === "returned") {
      addEvent(
        request,
        "returned",
        request.returnedAt,
      );
    }

    if (request.status === "cancelled") {
      addEvent(
        request,
        "cancelled",
        request.cancelledAt,
      );
    }

    if (request.status === "rejected") {
      addEvent(
        request,
        "rejected",
        request.rejectedAt,
      );
    }

    if (
      request.status !== "borrowed" ||
      !validDay(request.dueDate)
    ) {
      continue;
    }

    const due = request.dueDate;

    const dueAt = new Date(`${due}T12:00:00`);
    const startAt = new Date(request.renewalApprovedAt || request.borrowedAt || "");
    const startDay = Number.isNaN(startAt.getTime()) ? "" : dateKey(startAt);

    // Each milestone has a stable ID tied to the current due date.
    // Only the latest relevant reminder is displayed; catch up if the app was closed.
    if (due < today) {
      add(request, "overdue", due, `${futureDate(1, dueAt)}T00:00:00`);
    } else {
      for (const [days, type] of [[0, "dueToday"], [1, "dueTomorrow"], [5, "dueInFive"]]) {
        const day = futureDate(-days, dueAt);
        if (day <= today && (!startDay || day >= startDay)) {
          add(request, type, due, `${day}T00:00:00`);
          break;
        }
      }
    }
  }

  const order = {
    approved: 0,
    borrowed: 1,
    dueInFive: 2,
    dueTomorrow: 2,
    dueToday: 2,
    overdue: 3,
    rejected: 4,
    cancelled: 4,
    returned: 4,
  };

  return notifications.sort(
    (a, b) =>
      new Date(b.at) - new Date(a.at) ||
      order[b.type] - order[a.type] ||
      a.id.localeCompare(b.id),
  );
}