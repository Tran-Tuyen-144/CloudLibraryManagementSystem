"use strict";

// Mô tả thiết kế, chưa thực hiện kết nối hoặc tạo bảng.
const READING_SCHEMA = {
  ReadingProgress: {
    keys: ["readerId", "bookId"],
    indexes: {},
    description: "Vị trí đọc gần nhất của một người trong một sách",
  },

  Bookmarks: {
    keys: ["readerId", "bookmarkKey"],
    indexes: {},
    description: "Các dấu trang của từng người đọc",
  },
};

// bookmarkKey dự kiến có dạng:
// bookId#bookmarkId
// Ví dụ: BOOK_PG_1661#mark-001

function previewReadingSchema() {
  console.table(
    Object.entries(READING_SCHEMA).map(([table, schema]) => ({
      bangDuKien: table,
      khoaChinh: schema.keys[0],
      khoaSapXep: schema.keys[1],
      noiDung: schema.description,
    }))
  );

  console.log("Đã hiển thị thiết kế dấu trang và tiến độ đọc.");
  console.log("Đây là bản mô tả, chưa tạo bảng hay lưu dữ liệu.");
}

module.exports = {
  READING_SCHEMA,
  previewReadingSchema,
};

if (require.main === module) {
  previewReadingSchema();
}