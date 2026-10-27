import { currentLibraryUser } from "./libraryData.js";

import { hasPermission, PERMISSIONS as P } from "./libraryPermissions.js";

export function getAuthorWorkspace(state) {
  const user = currentLibraryUser(state);

  const profile = (state.authorApplications || []).find(
    (item) => item.readerEmail === user?.email && item.status === "approved",
  );

  const allowed =
    user?.role === "author" &&
    hasPermission(user, P.AUTHOR_WORKSPACE) &&
    Boolean(profile);

  return {
    allowed: Boolean(allowed),
    user: allowed ? user : null,
    profile: allowed ? profile : null,

    manuscripts: allowed
      ? (state.authorManuscripts || []).filter(
          (item) => item.authorEmail === user.email,
        )
      : [],

    books: allowed
      ? state.books.filter(
          (book) => book.authorEmail === user.email && !book.archived,
        )
      : [],
  };
}

export function saveAuthorDraft(state, input) {
  const workspace = getAuthorWorkspace(state);

  if (!workspace.allowed) {
    return { ok: false, error: "forbidden" };
  }

  const drafts = state.authorManuscripts || [];
  const editing = input.id != null;

  const before = editing ? drafts.find((item) => item.id === input.id) : null;

  // Chỉ được sửa bản nháp của chính tài khoản đang đăng nhập.
  // revision giúp phát hiện bản thảo đã được sửa ở tab khác.
  if (
    editing &&
    (!before ||
      before.authorEmail !== workspace.user.email ||
      !["draft", "rejected"].includes(before.status) ||
      before.revision !== input.expectedRevision)
  ) {
    return { ok: false, error: "staleDraft" };
  }

  const title = String(input.title || "").trim();
  const category = String(input.category || "").trim();
  const description = String(input.description || "").trim();
  const pdfUrl = String(input.pdfUrl || "").trim();

  if (
    title.length < 2 ||
    title.length > 160 ||
    !category ||
    category.length > 80 ||
    description.length > 3000
  ) {
    return { ok: false, error: "invalidDraft" };
  }

  if (pdfUrl) {
    try {
      const url = new URL(pdfUrl);

      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        pdfUrl.length > 1000
      ) {
        throw new Error("invalidUrl");
      }
    } catch {
      return { ok: false, error: "invalidUrl" };
    }
  }

  const now = new Date().toISOString();

  const after = {
    ...before,

    id: before?.id || crypto.randomUUID(),

    // Chủ sở hữu lấy từ phiên đăng nhập và hồ sơ đã duyệt.
    authorEmail: workspace.user.email,
    authorName: workspace.profile.penName,

    title,
    category,
    description,
    pdfUrl,

    status: "draft",
    createdAt: before?.createdAt || now,
    updatedAt: now,
    revision: crypto.randomUUID(),
  };

  return {
    ok: true,
    targetId: after.id,

    details: {
      operation: editing ? "author.draft.update" : "author.draft.create",

      before: before ? { title: before.title, status: before.status } : null,

      after: {
        title: after.title,
        status: after.status,
      },
    },

    state: {
      ...state,

      authorManuscripts: editing
        ? drafts.map((item) => (item.id === after.id ? after : item))
        : [after, ...drafts],
    },
  };
}
