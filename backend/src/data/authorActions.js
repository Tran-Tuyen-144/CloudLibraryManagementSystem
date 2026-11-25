import { currentLibraryUser } from "./libraryData.js";

import { hasPermission, PERMISSIONS as P } from "./libraryPermissions.js";

export function reviewAuthorApplication(state, input) {
  const actor = currentLibraryUser(state);

  if (!hasPermission(actor, P.AUTHORS_REVIEW)) {
    return { ok: false, error: "forbidden" };
  }

  const { id, decision, expectedSubmittedAt } = input;

  if (!["approve", "reject"].includes(decision)) {
    return { ok: false, error: "invalidDecision" };
  }

  const applications = state.authorApplications || [];

  const before = applications.find((item) => item.id === id);

  // Không xử lý lại hồ sơ đã duyệt hoặc hồ sơ vừa được gửi lại.
  if (
    !before ||
    before.status !== "pending" ||
    typeof expectedSubmittedAt !== "string" ||
    before.submittedAt !== expectedSubmittedAt
  ) {
    return { ok: false, error: "staleApplication" };
  }

  const account = state.accounts.find(
    (item) => item.email === before.readerEmail,
  );

  if (!account || account.role !== "reader") {
    return { ok: false, error: "accountChanged" };
  }

  if (decision === "approve" && account.status !== "active") {
    return { ok: false, error: "accountLocked" };
  }

  const reason = String(input.reason || "").trim();

  if (decision === "reject" && (reason.length < 5 || reason.length > 500)) {
    return { ok: false, error: "invalidReason" };
  }

  const approved = decision === "approve";

  const after = {
    ...before,
    status: approved ? "approved" : "rejected",
    reviewedAt: new Date().toISOString(),
    reviewedBy: actor.email,
    rejectionReason: approved ? "" : reason,
  };

  return {
    ok: true,
    targetId: before.id,

    details: {
      operation: `author.application.${decision}`,

      before: {
        status: before.status,
        role: account.role,
      },

      after: {
        status: after.status,
        role: approved ? "author" : account.role,
      },
    },

    state: {
      ...state,

      authorApplications: applications.map((item) =>
        item.id === id ? after : item,
      ),

      // Giữ nguyên email, mật khẩu và các dữ liệu tài khoản.
      accounts: approved
        ? state.accounts.map((item) =>
            item.email === account.email ? { ...item, role: "author" } : item,
          )
        : state.accounts,
    },
  };
}
