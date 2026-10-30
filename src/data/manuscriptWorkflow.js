import { currentLibraryUser } from "./libraryData.js";
import { hasPermission, PERMISSIONS as P } from "./libraryPermissions.js";
import { getAuthorWorkspace } from "./authorWorkspace.js";
import { manuscriptContent } from "./manuscriptContent.js";

function manuscriptError(item) {
  const title = String(item.title || "").trim();
  const category = String(item.category || "").trim();
  const description = String(item.description || "").trim();

  if (
    title.length < 2 ||
    title.length > 160 ||
    !category ||
    category.length > 80 ||
    description.length < 30 ||
    description.length > 3000
  ) {
    return "incompleteManuscript";
  }

  const content = manuscriptContent(item, { publishing: true });

  return content.ok ? "" : content.error;
}

export function submitAuthorManuscript(state, input) {
  const workspace = getAuthorWorkspace(state);

  if (!workspace.allowed) {
    return { ok: false, error: "forbidden" };
  }

  const items = state.authorManuscripts || [];
  const before = items.find((item) => item.id === input.id);

  if (
    !before ||
    before.authorEmail !== workspace.user.email ||
    before.status !== "draft" ||
    typeof input.expectedRevision !== "string" ||
    before.revision !== input.expectedRevision
  ) {
    return { ok: false, error: "staleDraft" };
  }

  const error = manuscriptError(before);

  if (error) return { ok: false, error };

  const now = new Date().toISOString();

  const after = {
    ...before,
    status: "pending",
    submittedAt: now,
    updatedAt: now,
    reviewedAt: null,
    reviewedBy: null,
    rejectionReason: "",
    revision: crypto.randomUUID(),
  };

  return {
    ok: true,
    targetId: before.id,
    details: {
      operation: "author.manuscript.submit",
      before: {
        title: before.title,
        status: before.status,
      },
      after: {
        title: after.title,
        status: after.status,
      },
    },
    state: {
      ...state,
      authorManuscripts: items.map((item) =>
        item.id === before.id ? after : item,
      ),
    },
  };
}

export function reviewAuthorManuscript(state, input) {
  const actor = currentLibraryUser(state);

  if (!hasPermission(actor, P.MANUSCRIPTS_REVIEW)) {
    return { ok: false, error: "forbidden" };
  }

  const { id, decision, expectedRevision } = input;

  if (!["publish", "reject"].includes(decision)) {
    return { ok: false, error: "invalidDecision" };
  }

  const items = state.authorManuscripts || [];
  const before = items.find((item) => item.id === id);

  if (
    !before ||
    before.status !== "pending" ||
    typeof expectedRevision !== "string" ||
    before.revision !== expectedRevision
  ) {
    return { ok: false, error: "staleManuscript" };
  }

  const publishing = decision === "publish";
  const reason = String(input.reason || "").trim();

  if (!publishing && (reason.length < 5 || reason.length > 500)) {
    return { ok: false, error: "invalidReason" };
  }

  const bookId = `manuscript:${before.id}`;

  if (publishing) {
    const account = state.accounts.find(
      (item) => item.email === before.authorEmail,
    );

    const approved = (state.authorApplications || []).some(
      (item) =>
        item.readerEmail === before.authorEmail &&
        item.status === "approved",
    );

    if (
      account?.role !== "author" ||
      account.status !== "active" ||
      !approved
    ) {
      return { ok: false, error: "authorUnavailable" };
    }

    const error = manuscriptError(before);

    if (error) return { ok: false, error };

    if (
      state.books.some(
        (book) => book.id === bookId || book.manuscriptId === before.id,
      )
    ) {
      return { ok: false, error: "duplicatePublication" };
    }
  }

  const now = new Date().toISOString();

  const after = {
    ...before,
    status: publishing ? "published" : "rejected",
    updatedAt: now,
    reviewedAt: now,
    reviewedBy: actor.email,
    rejectionReason: publishing ? "" : reason,
    publishedAt: publishing ? now : null,
    publishedBookId: publishing ? bookId : null,
    revision: crypto.randomUUID(),
  };

  const book = publishing
    ? {
        id: bookId,
        manuscriptId: before.id,
        title: before.title,
        author: before.authorName,
        authorEmail: before.authorEmail,
        category: before.category,
        description: before.description,
        pdfUrl: before.pdfUrl,
        cover: before.cover || "",
        chapters: manuscriptContent(before, { publishing: true }).chapters,
        isbn: "",
        availableCopies: 0,
        archived: false,
        publishedAt: now,
      }
    : null;

  return {
    ok: true,
    targetId: before.id,
    details: {
      operation: `author.manuscript.${decision}`,
      before: {
        title: before.title,
        status: before.status,
      },
      after: {
        title: after.title,
        status: after.status,
        rejectionReason: after.rejectionReason,
      },
    },
    state: {
      ...state,
      authorManuscripts: items.map((item) =>
        item.id === id ? after : item,
      ),
      books: publishing ? [...state.books, book] : state.books,
    },
  };
}