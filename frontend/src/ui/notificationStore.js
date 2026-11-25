
import { useEffect, useState } from "react";

import {
  currentLibraryUser,
} from "../data/libraryData.js";

import {
  readerNotifications,
} from "../data/libraryNotifications.js";

import {
  readerActivityNotifications,
} from "../data/readerActivityNotifications.js";

import {
  useReservations,
} from "../services/reservationService.js";

import {
  getLibrarySnapshot,
  updateLibrary,
  useLibraryData,
} from "./libraryStore.js";

// Danh sách items được cung cấp từ hook đã
// giới hạn theo tài khoản đang đăng nhập.
//
// Không truyền items vẫn hỗ trợ thông báo
// mượn–trả cũ để giữ tương thích.
export function markNotificationsRead(
  id = null,
  items = null,
) {
  const data = getLibrarySnapshot();
  const user = currentLibraryUser(data);

  if (
    !["reader", "author"].includes(
      user?.role,
    )
  ) {
    return {
      ok: false,
      error: "forbidden",
    };
  }

  const available = Array.isArray(items)
    ? items
    : readerNotifications(data, user);

  const selected =
    id === null
      ? available
      : available.filter(
          (item) => item.id === id,
        );

  if (
    id !== null &&
    selected.length === 0
  ) {
    return {
      ok: false,
      error: "staleNotification",
    };
  }

  if (
    selected.every(
      (item) => item.read,
    )
  ) {
    return { ok: true };
  }

  const ids = new Set(
    data.notificationReads?.[user.email] || [],
  );

  selected.forEach(
    (item) => ids.add(item.id),
  );

  const saved = updateLibrary(
    (state) => ({
      ...state,

      notificationReads: {
        ...state.notificationReads,
        [user.email]: [...ids],
      },
    }),

    {
      requirePersistence: true,
    },
  );

  return saved
    ? { ok: true }
    : {
        ok: false,
        error: "storageFailed",
      };
}

export function useReaderNotifications() {
  const data = useLibraryData();
  const user = currentLibraryUser(data);

  const {
    rows: reservations,
  } = useReservations({
    readerEmail: user?.email || "",
  });

  const [now, setNow] = useState(
    () => new Date(),
  );

  useEffect(() => {
    const refresh = () =>
      setNow(new Date());

    const interval = window.setInterval(
      refresh,
      60000,
    );

    window.addEventListener(
      "focus",
      refresh,
    );

    document.addEventListener(
      "visibilitychange",
      refresh,
    );

    return () => {
      window.clearInterval(interval);

      window.removeEventListener(
        "focus",
        refresh,
      );

      document.removeEventListener(
        "visibilitychange",
        refresh,
      );
    };
  }, []);

  const items =
    readerActivityNotifications(
      data,
      user,
      reservations,
      now,
    );

  return {
    items,
    unread: items.filter(
      (item) => !item.read,
    ).length,
  };
}
