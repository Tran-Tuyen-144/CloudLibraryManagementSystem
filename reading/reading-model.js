"use strict";

function readText(value, field, maxLength = 128) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim().length > maxLength
  ) {
    throw new Error(
      `${field} phải là chuỗi có từ 1 đến ${maxLength} ký tự.`
    );
  }

  return value.trim();
}

function readId(value, field) {
  const id = readText(value, field);

  if (!/^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/.test(id)) {
    throw new Error(
      `${field} chỉ nhận chữ, số và các dấu : _ -.`
    );
  }

  return id;
}

function validateLocator(locator) {
  if (
    !locator ||
    typeof locator !== "object" ||
    Array.isArray(locator)
  ) {
    throw new Error("Thiếu thông tin vị trí đọc hợp lệ.");
  }

  const { type, value } = locator;

  if (type === "scrollFraction") {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new Error("scrollFraction phải là số từ 0 đến 1.");
    }
  } else if (type === "pdfPage") {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new Error("pdfPage phải là số nguyên dương.");
    }
  } else {
    throw new Error("Chỉ hỗ trợ scrollFraction hoặc pdfPage.");
  }

  return { type, value };
}

function baseRecord(input) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input)
  ) {
    throw new Error("Dữ liệu đầu vào phải là một object.");
  }

  return {
    readerId: readId(input.readerId, "readerId"),
    bookId: readId(input.bookId, "bookId"),
    sourceId: readText(input.sourceId, "sourceId"),
    contentVersion: readText(input.contentVersion, "contentVersion"),
    locator: validateLocator(input.locator),
  };
}

function createReadingProgress(input) {
  return {
    ...baseRecord(input),
    updatedAt: new Date().toISOString(),
  };
}

function createBookmark(input) {
  const base = baseRecord(input);
  const bookmarkId = readId(input.bookmarkId, "bookmarkId");
  const note = input.note === undefined ? "" : input.note;

  if (typeof note !== "string" || note.length > 1000) {
    throw new Error("Ghi chú phải là chuỗi, tối đa 1000 ký tự.");
  }

  const now = new Date().toISOString();

  return {
    ...base,
    bookmarkId,
    bookmarkKey: `${base.bookId}#${bookmarkId}`,
    note,
    createdAt: now,
    updatedAt: now,
  };
}

module.exports = {
  validateLocator,
  createReadingProgress,
  createBookmark,
};

// Chạy trực tiếp file để xem dữ liệu mẫu trong bộ nhớ.
if (require.main === module) {
  const common = {
    readerId: "READER001",
    bookId: "BOOK_PG_1661",
    sourceId: "BOOK_PG_1661:txt",
    contentVersion: "demo-v1",
  };

  const progress = createReadingProgress({
    ...common,
    locator: { type: "scrollFraction", value: 0.4 },
  });

  const bookmark = createBookmark({
    ...common,
    bookmarkId: "mark-001",
    locator: { type: "scrollFraction", value: 0.25 },
    note: "Đoạn cần đọc lại",
  });

  console.table(
    [progress, bookmark].map((item) => ({
      loai: item.bookmarkId ? "Dấu trang" : "Tiến độ đọc",
      readerId: item.readerId,
      bookId: item.bookId,
      viTri: `${item.locator.value * 100}%`,
      bookmarkKey: item.bookmarkKey || "—",
    }))
  );

  console.log("Đã tạo object mẫu trong bộ nhớ, chưa lưu dữ liệu.");
}