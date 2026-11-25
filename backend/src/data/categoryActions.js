import { currentLibraryUser } from "./libraryData.js";

import { hasPermission, PERMISSIONS as P } from "./libraryPermissions.js";

import { categoryName, findCategory } from "./libraryCategories.js";

export function createCategory(state, value) {
  const actor = currentLibraryUser(state);

  const approvedAuthor =
    actor?.role === "author" &&
    (state.authorApplications || []).some(
      (item) => item.readerEmail === actor.email && item.status === "approved",
    );

  if (
    !hasPermission(actor, P.CATEGORIES_CREATE) ||
    (actor.role !== "admin" && !approvedAuthor)
  ) {
    return { ok: false, error: "forbidden" };
  }

  const name = categoryName(value);

  if (!name || name.length > 80) {
    return { ok: false, error: "invalidCategory" };
  }

  const categories = state.categories || [];

  if (findCategory(categories, name)) {
    return { ok: false, error: "duplicateCategory" };
  }

  const item = {
    id: `category:${crypto.randomUUID()}`,
    name,
    aliases: [],
  };

  return {
    ok: true,
    targetId: item.id,

    details: {
      operation: "category.create",
      after: { category: name },
    },

    state: {
      ...state,
      categories: [...categories, item],
    },
  };
}

function moveReferences(state, before, name) {
  const matches = (item) => Boolean(findCategory([before], item.category));

  const now = new Date().toISOString();

  return {
    books: state.books.map((item) =>
      matches(item) ? { ...item, category: name } : item,
    ),

    authorManuscripts: (state.authorManuscripts || []).map((item) =>
      matches(item)
        ? {
            ...item,
            category: name,
            updatedAt: now,
            revision: crypto.randomUUID(),
          }
        : item,
    ),
  };
}

export function updateCategory(state, input) {
  if (!hasPermission(currentLibraryUser(state), P.CATEGORIES_MANAGE)) {
    return { ok: false, error: "forbidden" };
  }

  const categories = state.categories || [];

  const before = categories.find((item) => item.id === input.id);

  if (!before || before.name !== input.expectedName) {
    return { ok: false, error: "staleCategory" };
  }

  const name = categoryName(input.name);

  if (!name || name.length > 80) {
    return { ok: false, error: "invalidCategory" };
  }

  const duplicate = findCategory(
    categories.filter((item) => item.id !== before.id),
    name,
  );

  if (duplicate) {
    return { ok: false, error: "duplicateCategory" };
  }

  const after = {
    ...before,
    name,

    // Giữ tên cũ để nhận diện các lựa chọn đã mở trước đó.
    aliases: [...new Set([...(before.aliases || []), before.name])],
  };

  return {
    ok: true,
    targetId: before.id,

    details: {
      operation: "category.update",
      before: { category: before.name },
      after: { category: name },
    },

    state: {
      ...state,
      ...moveReferences(state, before, name),

      categories: categories.map((item) =>
        item.id === before.id ? after : item,
      ),
    },
  };
}

export function deleteCategory(state, input) {
  if (!hasPermission(currentLibraryUser(state), P.CATEGORIES_MANAGE)) {
    return { ok: false, error: "forbidden" };
  }

  const categories = state.categories || [];

  const before = categories.find((item) => item.id === input.id);

  if (!before || before.name !== input.expectedName) {
    return { ok: false, error: "staleCategory" };
  }

  const used = [...state.books, ...(state.authorManuscripts || [])].some(
    (item) => findCategory([before], item.category),
  );

  const replacement = categories.find(
    (item) => item.id === input.replacementId && item.id !== before.id,
  );

  if (used && !replacement) {
    return { ok: false, error: "categoryInUse" };
  }

  return {
    ok: true,
    targetId: before.id,

    details: {
      operation: "category.delete",
      before: { category: before.name },

      after: replacement ? { category: replacement.name } : null,
    },

    state: {
      ...state,

      ...(used ? moveReferences(state, before, replacement.name) : {}),

      categories: categories.filter((item) => item.id !== before.id),
    },
  };
}
