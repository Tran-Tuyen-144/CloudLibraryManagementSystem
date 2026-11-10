import { useEffect, useState } from "react";
import { currentLibraryUser } from "../data/libraryData.js";
import { readerNotifications } from "../data/libraryNotifications.js";
import {
  getLibrarySnapshot,
  updateLibrary,
  useLibraryData,
} from "./libraryStore.js";

export function markNotificationsRead(id = null) {
  const data = getLibrarySnapshot();
  const user = currentLibraryUser(data);

  if (!user || user.role !== "reader") {
    return { ok: false, error: "forbidden" };
  }

  const items = readerNotifications(data, user);
  const selected =
    id === null ? items : items.filter((item) => item.id === id);

  if (id !== null && selected.length === 0) {
    return { ok: false, error: "staleNotification" };
  }

  const ids = new Set(data.notificationReads?.[user.email] || []);

  selected.forEach((item) => ids.add(item.id));

  updateLibrary((state) => ({
    ...state,
    notificationReads: {
      ...state.notificationReads,
      [user.email]: [...ids],
    },
  }));

  return { ok: true };
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

  const items = readerNotifications(data, currentLibraryUser(data));

  return {
    items,
    unread: items.filter((item) => !item.read).length,
  };
}