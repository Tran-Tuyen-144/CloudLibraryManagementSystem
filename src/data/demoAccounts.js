import { verifyDemoCredential } from "./demoCredentials.js";
import { isManagementUser } from "./libraryPermissions.js";

// Public sample credentials for the frontend prototype.
const accounts = [
  {
    email: "admin@cloudlibrary.demo",
    password: "AdminDemo123!",
    fullName: "Quản trị viên",
    role: "admin",
  },
  {
    email: "librarian@cloudlibrary.demo",
    password: "LibraryDemo123!",
    fullName: "Thủ thư",
    role: "librarian",
  },
];

export { isManagementUser };

export function getDemoAccountProfiles() {
  return accounts.map(({ email, fullName, role }) => ({
    id: `account:${email}`,
    email,
    fullName,
    role,
    status: "active",
  }));
}

export function authenticateDemoAccount(
  { email = "", password = "", mode = "login" },
  registry = getDemoAccountProfiles(),
) {
  const normalizedEmail = email.trim().toLowerCase();

  if (
    !["login", "register"].includes(mode) ||
    !normalizedEmail ||
    password.length < 8 ||
    password.length > 128
  ) {
    return { ok: false, error: "invalidCredentials" };
  }

  const account = accounts.find((item) => item.email === normalizedEmail);

  const profile = registry.find((item) => item.email === normalizedEmail);

  if (profile?.status === "locked") {
    return { ok: false, error: "accountLocked" };
  }

  if (
    (account || (profile && profile.role !== "reader")) &&
    mode === "register"
  ) {
    return { ok: false, error: "reservedAccount" };
  }

  if (!profile?.credential && account && account.password !== password) {
    return { ok: false, error: "invalidCredentials" };
  }

  if (
    !account &&
    profile &&
    !["reader", "author"].includes(profile.role) &&
    !profile.credential
  ) {
    return { ok: false, error: "invalidCredentials" };
  }
  if (profile && !account && mode === "register") {
    return { ok: false, error: "accountExists" };
  }

  const success = {
    ok: true,
    user: {
      email: normalizedEmail,
      id: profile?.id || `account:${normalizedEmail}`,
      role: profile?.role || "reader",
      status: profile?.status || "active",
      fullName: profile?.fullName || account?.fullName || "",
      sessionVersion: 2,
    },
  };

  if (profile?.credential) {
    return verifyDemoCredential(password, profile.credential)
      .then((valid) =>
        valid ? success : { ok: false, error: "invalidCredentials" },
      )
      .catch(() => ({
        ok: false,
        error: "cryptoUnavailable",
      }));
  }

  return success;
}

export function restoreDemoSession(session) {
  if (
    !session ||
    session.sessionVersion !== 2 ||
    typeof session.email !== "string" ||
    typeof session.fullName !== "string"
  ) {
    return null;
  }

  const account = accounts.find((item) => item.email === session.email);

  if (session.role !== (account?.role || "reader")) {
    return null;
  }

  return {
    email: session.email,
    fullName: session.fullName,
    role: session.role,
    status: "active",
    sessionVersion: 2,
  };
}
