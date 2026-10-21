import { useSyncExternalStore } from "react";
import { books } from "../data/books.js";

import {
  createLibraryData,
  createLibraryLog,
  currentLibraryUser,
  LEGACY_REQUESTS_KEY,
  LEGACY_SESSION_KEY,
  LIBRARY_STORAGE_KEY,
} from "../data/libraryData.js";

import { hasPermission } from "../data/libraryPermissions.js";
import { normalizeNotificationReads } from "../data/libraryNotifications.js";

import {
  LEGACY_FAVORITES_KEY,
  normalizeFavoriteLists,
} from "../data/libraryFavorites.js";

export { LIBRARY_STORAGE_KEY };

function readJSON(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}

function load() {
  const session = readJSON(LEGACY_SESSION_KEY, null);
  const requestsByEmail = readJSON(LEGACY_REQUESTS_KEY, {});

  const emails = new Set([
    ...Object.keys(requestsByEmail || {}),
    ...(session?.email ? [session.email] : []),
  ]);

  const profiles = Object.fromEntries(
    [...emails].map((email) => [
      email,
      readJSON(`cloudlibrary:demo-profile:${email}:v1`, {}),
    ]),
  );

  const saved = readJSON(LIBRARY_STORAGE_KEY, null);

  const data = createLibraryData(
    saved,
    { session, requestsByEmail, profiles },
    books,
  );

  return {
    ...data,

    notificationReads: normalizeNotificationReads(
      saved?.notificationReads,
    ),

    favoriteIdsByEmail: normalizeFavoriteLists(
      saved?.favoriteIdsByEmail,
      readJSON(LEGACY_FAVORITES_KEY, []),
      data.accounts,
    ),
  };
}

let snapshot = load();
const listeners = new Set();

function persist() {
  try {
    localStorage.setItem(
      LIBRARY_STORAGE_KEY,
      JSON.stringify(snapshot),
    );

    localStorage.removeItem(LEGACY_SESSION_KEY);
  } catch (error) {
    console.warn("Không thể lưu dữ liệu thư viện demo:", error);
  }
}

if (typeof localStorage !== "undefined") persist();

export function getLibrarySnapshot() {
  return snapshot;
}

export function updateLibrary(updater) {
  const next = updater(snapshot);

  if (next === snapshot) return;

  const account = next.accounts.find(
    (item) => item.email === next.session?.email,
  );

  snapshot =
    next.session && account?.status !== "active"
      ? { ...next, session: null }
      : next;

  persist();
  listeners.forEach((listener) => listener());
}

function subscribe(listener) {
  listeners.add(listener);

  return () => listeners.delete(listener);
}

export function useLibraryData() {
  return useSyncExternalStore(
    subscribe,
    getLibrarySnapshot,
    getLibrarySnapshot,
  );
}

export function runLibraryCommand(permission, transform) {
  const data = getLibrarySnapshot();
  const actor = currentLibraryUser(data);

  if (!hasPermission(actor, permission)) {
    updateLibrary((current) => ({
      ...current,

      accessLogs: [
        createLibraryLog(
          actor,
          "access.denied",
          permission,
          "denied",
        ),
        ...current.accessLogs,
      ],
    }));

    return {
      ok: false,
      error: actor ? "forbidden" : "loginRequired",
    };
  }

  const result = transform(data, actor);

  if (!result.ok) {
    updateLibrary((current) => ({
      ...current,

      auditLogs: [
        createLibraryLog(
          actor,
          permission,
          result.targetId || "library",
          "failed",
          { error: result.error },
        ),
        ...current.auditLogs,
      ],
    }));

    return result;
  }

  updateLibrary(() => ({
    ...result.state,

    auditLogs: [
      createLibraryLog(
        actor,
        permission,
        result.targetId || "library",
        "success",
        result.details || {},
      ),
      ...result.state.auditLogs,
    ],
  }));

  return { ok: true };
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (
      event.key !== LIBRARY_STORAGE_KEY &&
      event.key !== null
    ) {
      return;
    }

    snapshot = load();
    listeners.forEach((listener) => listener());
  });
}