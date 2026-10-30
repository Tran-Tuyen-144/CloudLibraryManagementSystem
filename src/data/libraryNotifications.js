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

    if (due < today) {
      const at = new Date(`${due}T12:00:00`);

      add(
        request,
        "overdue",
        due,
        `${futureDate(1, at)}T00:00:00`,
      );
    } else if (due <= futureDate(3, now)) {
      const at = new Date(`${due}T12:00:00`);

      add(
        request,
        "dueSoon",
        due,
        `${futureDate(-3, at)}T00:00:00`,
      );
    }
  }

  const order = {
    approved: 0,
    borrowed: 1,
    dueSoon: 2,
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