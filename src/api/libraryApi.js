import { apiRequest, ApiError } from "./client.js";

function segment(value) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    [".", ".."].includes(value)
  ) {
    throw new ApiError(
      "invalidRequest",
      "Thiếu mã đối tượng hợp lệ.",
    );
  }

  return encodeURIComponent(value);
}

export function createLibraryApi(request) {
  const read = (
    path,
    query,
    options,
    auth = true,
  ) =>
    request(path, {
      ...options,
      method: "GET",
      query,
      auth,
    });

  const write = (
    method,
    path,
    body,
    options,
  ) =>
    request(path, {
      ...options,
      method,
      body,
      auth: true,
    });

  const loanAction =
    (action) =>
    (id, input = {}, options) =>
      write(
        "POST",
        `/loans/${segment(id)}/${action}`,
        {
          version: input.version,

          ...(action === "reject"
            ? { reason: input.reason }
            : {}),

          ...(action === "handover"
            ? { dueDate: input.dueDate }
            : {}),
        },
        options,
      );

  return {
    me: {
      get: (options) =>
        read("/me", {}, options),

      update: ({ fullName }, options) =>
        write("PATCH", "/me", { fullName }, options),
    },

    books: {
      list: (query = {}, options) =>
        read("/books", query, options, false),

      listManaged: (query = {}, options) =>
        read(
          "/books",
          { ...query, includeArchived: true },
          options,
        ),

      get: (id, options) =>
        read(
          `/books/${segment(id)}`,
          {},
          options,
          false,
        ),

      create: (book, options) =>
        write("POST", "/books", book, options),

      update: (id, book, options) =>
        write(
          "PATCH",
          `/books/${segment(id)}`,
          book,
          options,
        ),

      readAccess: (id, options) =>
        read(
          `/books/${segment(id)}/read-access`,
          {},
          options,
        ),
    },

    loans: {
      mine: (query = {}, options) =>
        read("/me/loans", query, options),

      list: (query = {}, options) =>
        read("/loans", query, options),

      get: (id, options) =>
        read(`/loans/${segment(id)}`, {}, options),

      create: ({ bookId, note = "" }, options) =>
        write(
          "POST",
          "/loans",
          { bookId, note },
          options,
        ),

      approve: loanAction("approve"),
      reject: loanAction("reject"),
      handover: loanAction("handover"),
      returnBook: loanAction("return"),
      cancel: loanAction("cancel"),
    },

    readers: {
      list: (query = {}, options) =>
        read("/readers", query, options),

      update: (id, changes, options) =>
        write(
          "PATCH",
          `/readers/${segment(id)}`,
          changes,
          options,
        ),
    },

    staff: {
      list: (query = {}, options) =>
        read("/staff", query, options),

      create: (account, options) =>
        write("POST", "/staff", account, options),

      update: (id, changes, options) =>
        write(
          "PATCH",
          `/staff/${segment(id)}`,
          changes,
          options,
        ),
    },

    favorites: {
      list: (query = {}, options) =>
        read("/me/favorites", query, options),

      save: (id, options) =>
        write(
          "PUT",
          `/me/favorites/${segment(id)}`,
          undefined,
          options,
        ),

      remove: (id, options) =>
        write(
          "DELETE",
          `/me/favorites/${segment(id)}`,
          undefined,
          options,
        ),
    },

    bookmarks: {
      list: (query = {}, options) =>
        read("/me/bookmarks", query, options),

      get: (id, options) =>
        read(
          `/me/bookmarks/${segment(id)}`,
          {},
          options,
        ),

      save: (id, page, options) =>
        write(
          "PUT",
          `/me/bookmarks/${segment(id)}`,
          { page },
          options,
        ),

      remove: (id, options) =>
        write(
          "DELETE",
          `/me/bookmarks/${segment(id)}`,
          undefined,
          options,
        ),
    },

    notifications: {
      list: (query = {}, options) =>
        read("/me/notifications", query, options),

      markRead: (id, options) =>
        write(
          "PATCH",
          `/me/notifications/${segment(id)}`,
          { read: true },
          options,
        ),

      markAllRead: (options) =>
        write(
          "POST",
          "/me/notifications/read-all",
          undefined,
          options,
        ),
    },

    settings: {
      public: (options) =>
        read("/settings/public", {}, options, false),

      get: (options) =>
        read("/settings", {}, options),

      update: (settings, options) =>
        write(
          "PATCH",
          "/settings",
          settings,
          options,
        ),
    },

    reports: {
      overview: (query = {}, options) =>
        read("/reports/overview", query, options),

      exportCsv: (query = {}, options) =>
        read("/reports/export", query, {
          ...options,
          responseType: "blob",
          headers: { Accept: "text/csv" },
        }),
    },

    history: {
      audit: (query = {}, options) =>
        read("/history/audit", query, options),

      access: (query = {}, options) =>
        read("/history/access", query, options),

      visit: (page, options) =>
        write(
          "POST",
          "/history/access/page-view",
          { page },
          options,
        ),
    },

    conversations: {
      list: (query = {}, options) =>
        read("/me/conversations", query, options),

      create: (title, options) =>
        write(
          "POST",
          "/me/conversations",
          { title },
          options,
        ),

      get: (id, options) =>
        read(
          `/me/conversations/${segment(id)}`,
          {},
          options,
        ),

      remove: (id, options) =>
        write(
          "DELETE",
          `/me/conversations/${segment(id)}`,
          undefined,
          options,
        ),

      send: (id, content, options) =>
        write(
          "POST",
          `/me/conversations/${segment(id)}/messages`,
          { content },
          options,
        ),
    },
  };
}

export const libraryApi = createLibraryApi(apiRequest);