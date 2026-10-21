import { dateKey, flattenRequests, futureDate } from "../ui/borrowWorkflow.js";

export function normalizeNotificationReads(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, ids]) => Array.isArray(ids))
      .map(([email, ids]) => [
        email,
        [...new Set(ids.filter((id) => typeof id === "string"))],
      ]),
  );
}

function validDay(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T12:00:00`);

  return !Number.isNaN(parsed.getTime()) && dateKey(parsed) === value;
}

export function readerNotifications(data, user, now = new Date()) {
  if (user?.role !== "reader" || user.status !== "active") return [];

  const readIds = new Set(data.notificationReads?.[user.email] || []);
  const today = dateKey(now);
  const notifications = [];
  const seen = new Set();

  function add(request, type, occurrence, at) {
    const id = JSON.stringify([request.id, type, occurrence]);

    if (seen.has(id)) return;

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

  const rows = flattenRequests({
    [user.email]: data.requestsByEmail?.[user.email] || [],
  });

  for (const request of rows) {
    const event =
      request.status === "rejected"
        ? ["rejected", request.rejectedAt]
        : ["approved", "borrowed", "returned", "cancelled"].includes(
              request.status,
            )
          ? ["approved", request.approvedAt]
          : null;

    if (event && typeof event[1] === "string") {
      const at = new Date(event[1]);

      if (!Number.isNaN(at.getTime()) && at <= now) {
        add(request, event[0], at.toISOString(), at.toISOString());
      }
    }

    if (request.status !== "borrowed" || !validDay(request.dueDate)) {
      continue;
    }

    const due = request.dueDate;

    if (due < today) {
      const at = new Date(`${due}T12:00:00`);

      add(request, "overdue", due, `${futureDate(1, at)}T00:00:00`);
    } else if (due <= futureDate(3, now)) {
      const at = new Date(`${due}T12:00:00`);

      add(request, "dueSoon", due, `${futureDate(-3, at)}T00:00:00`);
    }
  }

  return notifications.sort(
    (a, b) => new Date(b.at) - new Date(a.at) || a.id.localeCompare(b.id),
  );
}