"use strict";

// Chuẩn hóa để tìm kiếm không phân biệt dấu và chữ hoa.
function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

// Đọc và kiểm tra các bộ lọc trên địa chỉ API.
function parseBookFilters(searchParams) {
  const allowed = new Set([
    "q",
    "category",
    "available",
  ]);

  for (const key of searchParams.keys()) {
    if (!allowed.has(key)) {
      return {
        error: `Bộ lọc không được hỗ trợ: ${key}.`,
      };
    }

    if (searchParams.getAll(key).length > 1) {
      return {
        error:
          `Bộ lọc ${key} chỉ được xuất hiện một lần.`,
      };
    }
  }

  const q = (
    searchParams.get("q") ?? ""
  ).trim();

  const category = (
    searchParams.get("category") ?? ""
  ).trim();

  const available = searchParams.get("available");

  if (q.length > 100 || category.length > 100) {
    return {
      error:
        "Từ khóa và thể loại không được dài quá 100 ký tự.",
    };
  }

  if (
    available !== null &&
    !["true", "false"].includes(available)
  ) {
    return {
      error:
        "Bộ lọc available chỉ nhận true hoặc false.",
    };
  }

  return {
    filters: {
      q,
      category,
      available:
        available === null
          ? null
          : available === "true",
    },
  };
}

// Lọc danh sách, không thay đổi dữ liệu sách.
function filterBooks(items, filters) {
  const q = normalizeText(filters.q);
  const category = normalizeText(filters.category);

  return items.filter((book) => {
    const text = normalizeText(
      [
        book.bookId,
        book.title,
        book.author,
        book.category,
      ]
        .filter(Boolean)
        .join(" ")
    );

    if (q && !text.includes(q)) {
      return false;
    }

    if (
      category &&
      normalizeText(book.category) !== category
    ) {
      return false;
    }

    if (filters.available !== null) {
      const hasAvailableCopy =
        book.availableCopies > 0;

      if (
        hasAvailableCopy !== filters.available
      ) {
        return false;
      }
    }

    return true;
  });
}

module.exports = {
  parseBookFilters,
  filterBooks,
};