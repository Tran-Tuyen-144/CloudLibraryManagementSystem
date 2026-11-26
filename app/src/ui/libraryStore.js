import {
  decorateCoverFraming,
  rememberDraftFraming,
} from "../integration/coverFramingPreferences.js";
import { useSyncExternalStore } from "react";
import { request, clearSession, setSession } from "../api/runtime.js";

export const LIBRARY_STORAGE_KEY = "cloudlibrary:server:v1";
const blank = {
  schemaVersion: 3,
  version: 0,
  accounts: [],
  books: [],
  categories: [],
  authorApplications: [],
  authorManuscripts: [],
  publicAuthors: [],
  requestsByEmail: {},
  favoriteIdsByEmail: {},
  notificationReads: {},
  readingData: {},
  readerSettings: {},
  readingHistory: {},
  bookViewHistory: {},
  auditLogs: [],
  accessLogs: [],
  reservations: [],
  notifications: [],
  bookCopies: [],
  knowledgeSources: [],
  audioJobs: [],
  settings: { libraryName: "Cloud Library", maxActiveLoans: 3, loanDays: 14 },
  session: null,
};
let snapshot = blank;
let authEpoch = 0;
let connection = {
  loading: true,
  error: null,
  capabilities: null,
  pending: 0,
  notice: "",
};
const listeners = new Set();
const pendingCommands = new Map();
const emit = () => listeners.forEach((listener) => listener());
const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export const getLibrarySnapshot = () => snapshot;
export const useLibraryData = () =>
  useSyncExternalStore(subscribe, getLibrarySnapshot, getLibrarySnapshot);
export const useConnection = () =>
  useSyncExternalStore(
    subscribe,
    () => connection,
    () => connection,
  );
export const setNotice = (notice) => {
  connection = { ...connection, notice };
  emit();
};
export function receiveSnapshot(data) {
  if (
    data.session?.email === snapshot.session?.email &&
    Number(data.version) < Number(snapshot.version)
  )
    return;
  snapshot = { ...blank, ...decorateCoverFraming(data) };
  emit();
}
export async function refreshLibrary() {
  const epoch = authEpoch;
  try {
    const result = await request("/snapshot");
    if (epoch !== authEpoch) return false;
    receiveSnapshot(result.data);
    connection = {
      ...connection,
      loading: false,
      error: null,
      capabilities: result.capabilities,
    };
    emit();
    return true;
  } catch (error) {
    if (epoch !== authEpoch) return false;
    if (error.status === 401 || error.status === 403) {
      clearSession();
      try {
        const result = await request("/snapshot");
        if (epoch !== authEpoch) return false;
        receiveSnapshot(result.data);
        connection = {
          ...connection,
          loading: false,
          error: null,
          capabilities: result.capabilities,
        };
        emit();
        return true;
      } catch {
        /* Display the connection failure below. */
      }
    }
    connection = { ...connection, loading: false, error: error.message };
    emit();
    return false;
  }
}
export async function authenticate(values) {
  const epoch = ++authEpoch;
  try {
    const result = await request(
      "/auth/" + (values.mode === "register" ? "register" : "login"),
      { method: "POST", body: values, auth: false },
    );
    if (epoch !== authEpoch)
      return {
        ok: false,
        error: "sessionChanged",
        message: "Phiên đăng nhập đã thay đổi.",
      };
    if (result.confirmationRequired)
      return {
        ok: false,
        error: "confirmationRequired",
        confirmationRequired: true,
      };
    setSession(result);
    await refreshLibrary();
    return { ok: true, user: result.user };
  } catch (error) {
    return { ok: false, error: error.code, message: error.message };
  }
}
export async function logout() {
  const epoch = ++authEpoch;
  try {
    await request("/auth/logout", { method: "POST" });
  } finally {
    if (epoch === authEpoch) {
      clearSession();
      await refreshLibrary();
    }
  }
}
export async function runLibraryCommand(command, input = {}) {
  if (
    typeof command !== "string" ||
    typeof input !== "object" ||
    typeof input === "function"
  )
    return { ok: false, error: "invalidCommand" };
  const key = authEpoch + ":" + command + JSON.stringify(input);
  if (pendingCommands.has(key)) return pendingCommands.get(key);
  const work = (async () => {
    const epoch = authEpoch;
    connection = { ...connection, pending: connection.pending + 1 };
    emit();
    try {
      const result = await request("/commands", {
        method: "POST",
        body: { command, input },
        idempotencyKey: crypto.randomUUID(),
      });
      if (
        command === "draft.save" &&
        result.record?.id &&
        input.coverFraming &&
        epoch === authEpoch
      ) {
        try {
          rememberDraftFraming(result.record.id, input.coverFraming);
        } catch {
          setNotice(
            "Đã lưu nội dung; chưa lưu được tùy chọn khung ảnh trên trình duyệt này.",
          );
        }
      }
      if (result.data && epoch === authEpoch) receiveSnapshot(result.data);
      return { ...result, ok: true };
    } catch (error) {
      setNotice(error.message);
      if (epoch === authEpoch && [401, 403, 409].includes(error.status))
        await refreshLibrary();
      return { ok: false, error: error.code, message: error.message };
    } finally {
      pendingCommands.delete(key);
      connection = {
        ...connection,
        pending: Math.max(0, connection.pending - 1),
      };
      emit();
    }
  })();
  pendingCommands.set(key, work);
  return work;
}
export function updateLibrary(change) {
  if (typeof change === "string")
    return runLibraryCommand("access.visit", { page: change });
  return Promise.resolve({ ok: true });
}
