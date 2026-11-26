import { useEffect, useState } from "react";

import { currentLibraryUser } from "../data/libraryData.js";

import { readerActivityNotifications } from "../data/readerActivityNotifications.js";

import {
  getLibrarySnapshot,
  runLibraryCommand,
  useLibraryData,
} from "./libraryStore.js";

export async function markNotificationsRead(id = null) {
  const data = getLibrarySnapshot();
  const user = currentLibraryUser(data);

  if (!["reader", "author"].includes(user?.role)) {
    return {
      ok: false,
      error: "forbidden",
    };
  }

  const items = readerActivityNotifications(data, user, data.reservations);

  const selected = id === null ? items : items.filter((item) => item.id === id);

  if (id !== null && selected.length === 0) {
    return {
      ok: false,
      error: "staleNotification",
    };
  }

  if (selected.every((item) => item.read)) {
    return { ok: true };
  }

  const ids = new Set(data.notificationReads?.[user.email] || []);

  selected.forEach((item) => ids.add(item.id));

  return runLibraryCommand("notification.read", { id, ids: [...ids] });
}

export function useReaderNotifications() {
  const data = useLibraryData();
  const [, refreshClock] = useState(0);

  useEffect(() => {
    const refresh = () => refreshClock((value) => value + 1);

    const timer = window.setInterval(refresh, 60000);

    window.addEventListener("focus", refresh);

    document.addEventListener("visibilitychange", refresh);

    return () => {
      window.clearInterval(timer);

      window.removeEventListener("focus", refresh);

      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  const items = readerActivityNotifications(
    data,
    currentLibraryUser(data),
    data.reservations,
  );

  return {
    items,
    unread: items.filter((item) => !item.read).length,
  };
}
