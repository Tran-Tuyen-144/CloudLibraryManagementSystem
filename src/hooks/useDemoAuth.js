import { authenticateDemoAccount } from "../data/demoAccounts";
import {
  createLibraryLog,
  currentLibraryUser,
} from "../data/libraryData";
import { PERMISSIONS as P } from "../data/libraryPermissions";
import {
  getLibrarySnapshot,
  runLibraryCommand,
  updateLibrary,
  useLibraryData,
} from "../ui/libraryStore";

export function profileStorageKey(email) {
  return (
    "cloudlibrary:demo-profile:" +
    email.toLowerCase() +
    ":v1"
  );
}

export default function useDemoAuth() {
  const data = useLibraryData();
  const user = currentLibraryUser(data);

  async function signInDemo({
    email,
    password,
    mode = "login",
    fullName = "",
    signal,
  }) {
    const current = getLibrarySnapshot();

    const result = await authenticateDemoAccount(
      { email, password, mode },
      current.accounts,
    );

    if (signal?.aborted) {
      return { ok: false, error: "cancelled" };
    }

    const normalized = String(email || "")
      .trim()
      .toLowerCase();

    const before = current.accounts.find(
      (account) => account.email === normalized,
    );

    const fresh = getLibrarySnapshot().accounts.find(
      (account) => account.email === normalized,
    );

    if (JSON.stringify(before) !== JSON.stringify(fresh)) {
      return { ok: false, error: "accountChanged" };
    }

    if (!result.ok) {
      updateLibrary((state) => ({
        ...state,
        accessLogs: [
          createLibraryLog(
            null,
            "login.failed",
            "session",
            "failed",
            {
              attemptedEmail: normalized,
              error: result.error,
            },
          ),
          ...state.accessLogs,
        ],
      }));

      return result;
    }

    const key = profileStorageKey(result.user.email);
    let savedProfile = {};

    try {
      const saved = JSON.parse(
        localStorage.getItem(key) || "{}",
      );

      if (
        saved &&
        typeof saved === "object" &&
        !Array.isArray(saved)
      ) {
        savedProfile = saved;
      }
    } catch {
      // Keep a usable profile if old storage is invalid.
    }

    const savedName =
      typeof savedProfile.fullName === "string"
        ? savedProfile.fullName.trim()
        : "";

    const nextUser = {
      ...result.user,
      fullName:
        result.user.fullName ||
        fullName.trim().slice(0, 100) ||
        savedName ||
        result.user.email.split("@")[0],
    };

    const account = {
      ...fresh,
      id: nextUser.id,
      email: nextUser.email,
      fullName: nextUser.fullName,
      role: nextUser.role,
      status: nextUser.status,
    };

    updateLibrary((state) => ({
      ...state,
      accounts: [
        ...state.accounts.filter(
          (item) => item.email !== account.email,
        ),
        account,
      ],
      session: {
        email: account.email,
        sessionVersion: 2,
      },
      accessLogs: [
        createLibraryLog(
          account,
          "login.success",
          "session",
        ),
        ...state.accessLogs,
      ],
    }));

    try {
      localStorage.setItem(
        key,
        JSON.stringify({
          ...savedProfile,
          fullName: account.fullName,
          email: account.email,
        }),
      );
    } catch (error) {
      console.warn("Không thể lưu hồ sơ demo:", error);
    }

    return { ok: true, user: nextUser };
  }

  function signOutDemo() {
    updateLibrary((state) => {
      const actor = currentLibraryUser(state);

      return {
        ...state,
        session: null,
        accessLogs: actor
          ? [
              createLibraryLog(
                actor,
                "logout",
                "session",
              ),
              ...state.accessLogs,
            ]
          : state.accessLogs,
      };
    });
  }

  function updateDemoProfile({ fullName }) {
    return runLibraryCommand(
      P.PROFILE_OWN,
      (state, actor) => ({
        ok: true,
        targetId: actor.email,
        details: {
          before: { fullName: actor.fullName },
          after: {
            fullName: fullName.trim().slice(0, 100),
          },
        },
        state: {
          ...state,
          accounts: state.accounts.map((account) =>
            account.email === actor.email
              ? {
                  ...account,
                  fullName: fullName.trim().slice(0, 100),
                }
              : account,
          ),
        },
      }),
    );
  }

  return {
    user,
    signInDemo,
    signOutDemo,
    updateDemoProfile,
  };
}