import { request } from "../api/runtime.js";
import useDemoAuth from "./useDemoAuth.js";
import useFavorites from "./useFavorites.js";
import useBorrowRequests from "./useBorrowRequests.js";
import { useReaderNotifications } from "../ui/notificationStore.js";
import { useConnection, useLibraryData, refreshLibrary, runLibraryCommand } from "../ui/libraryStore.js";
import { reservationService } from "../services/reservationService.js";

export async function featureRequest(path, options = {}) {
  const result = await request(path, {
    ...options,
    ...(options.method && options.method !== "GET" ? { idempotencyKey: crypto.randomUUID() } : {}),
  });
  if (options.method && options.method !== "GET") await refreshLibrary();
  return result;
}
export default function useServerLibrary() {
  const auth = useDemoAuth();
  const favorites = useFavorites();
  const loans = useBorrowRequests();
  const snapshot = useLibraryData();
  const connection = useConnection();
  const notifications = useReaderNotifications();
  const user = auth.user;
  const staff = ["admin", "librarian"].includes(user?.role);
  const reservations = (snapshot.reservations || []).filter(row => staff || row.readerEmail === user?.email)
    .map(row => ({ ...row, position: reservationService.getPosition(snapshot.reservations, row) }));
  async function command(name, input) {
    if (name === "notification.read") {
      input = { ...input, ids: [...new Set([...(snapshot.notificationReads[user?.email] || []), ...(input.ids || [])])] };
    }
    return runLibraryCommand(name, input);
  }
  const localPanels = {
    snapshot, featureRequest, featureCommand: runLibraryCommand,
    reservations, copies: staff ? snapshot.bookCopies : [],
    notifications: notifications.items, settings: snapshot.settings,
    command, refresh: refreshLibrary, isLocal: connection.capabilities?.mode === "local",
  };
  return {
    ...auth, ...favorites, ...loans, createDemoRequests: undefined,
    loading: connection.loading, error: connection.error, notice: connection.notice,
    busy: connection.pending > 0, refreshCatalog: refreshLibrary, refreshMine: refreshLibrary,
    featureRequest, localPanels,
  };
}
