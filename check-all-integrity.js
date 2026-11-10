"use strict";

const { audit } = require("./check-integrity");

const {
  auditAccountLinks,
} = require("./check-account-links");

const TABLE_KEYS = {
  Books: ["bookId"],
  BookCopies: ["copyId"],
  Readers: ["readerId"],
  Loans: ["loanId"],
  Reservations: ["reservationId"],
  Accounts: ["accountId"],
  Favorites: ["readerId", "bookId"],
  Notifications: ["notificationId"],
};

const validDate = (value) =>
  typeof value === "string" &&
  Number.isFinite(Date.parse(value));

function auditAll(data) {
  const issues = [
    ...audit(data),
    ...auditAccountLinks(
      data.Accounts,
      data.Readers
    ),
  ];

  const map = (table, key) =>
    new Map(
      data[table].map((item) => [item[key], item])
    );

  const books = map("Books", "bookId");
  const readers = map("Readers", "readerId");
  const accounts = map("Accounts", "accountId");
  const copies = map("BookCopies", "copyId");
  const loans = map("Loans", "loanId");

  const reservations = map(
    "Reservations",
    "reservationId"
  );

  function check(ok, message) {
    if (!ok) issues.push(message);
  }

  // Kiểm tra sách yêu thích.
  for (const item of data.Favorites) {
    const label =
      `Favorites ${item.readerId}/${item.bookId}`;

    check(
      readers.has(item.readerId),
      `${label}: không tìm thấy độc giả.`
    );

    check(
      books.has(item.bookId),
      `${label}: không tìm thấy sách.`
    );

    check(
      validDate(item.createdAt),
      `${label}: createdAt không hợp lệ.`
    );
  }

  // Kiểm tra liên kết của thông báo.
  for (const item of data.Notifications) {
    const label =
      `Notifications ${item.notificationId}`;

    check(
      readers.has(item.readerId),
      `${label}: không tìm thấy độc giả.`
    );

    check(
      validDate(item.createdAt),
      `${label}: createdAt không hợp lệ.`
    );

    if (item.readAt != null) {
      check(
        validDate(item.readAt),
        `${label}: readAt không hợp lệ.`
      );
    }

    if (item.bookId != null) {
      check(
        books.has(item.bookId),
        `${label}: không tìm thấy sách.`
      );
    }

    // Thông báo được giữ làm lịch sử.
    // Kiểm tra mã liên kết, không ép trạng thái
    // hiện tại giống thời điểm gửi thông báo.
    for (const [field, records] of [
      ["loanId", loans],
      ["reservationId", reservations],
    ]) {
      if (item[field] == null) continue;

      const related = records.get(item[field]);

      check(
        related &&
          related.readerId === item.readerId &&
          (
            field !== "reservationId" ||
            related.entityType === "RESERVATION"
          ) &&
          (
            item.bookId == null ||
            related.bookId === item.bookId
          ),
        `${label}: liên kết ${field} không tồn tại ` +
          "hoặc sai độc giả/sách."
      );
    }

    if (item.copyId != null) {
      const copy = copies.get(item.copyId);

      check(
        copy &&
          (
            item.bookId == null ||
            copy.bookId === item.bookId
          ),
        `${label}: bản sách không tồn tại ` +
          "hoặc sai đầu sách."
      );
    }
  }

  // Kiểm tra tài khoản liên quan đến sách tác giả.
  for (const book of data.Books) {
    if (book.source !== "AUTHOR") continue;

    check(
      accounts.has(book.ownerAccountId),
      `${book.bookId}: không tìm thấy ` +
        "tài khoản chủ sở hữu."
    );

    if (book.submission != null) {
      check(
        book.submission.accountId ===
          book.ownerAccountId,
        `${book.bookId}: tài khoản gửi duyệt ` +
          "khác chủ sở hữu."
      );
    }

    if (book.review != null) {
      check(
        accounts.has(book.review.accountId),
        `${book.bookId}: không tìm thấy ` +
          "tài khoản xét duyệt."
      );
    }
  }

  return issues;
}

async function main() {
  const {
    ScanCommand,
  } = require("@aws-sdk/lib-dynamodb");

  const {
    client,
    docClient,
  } = require("./config/db");

  try {
    const configured =
      typeof client.config.endpoint === "function"
        ? await client.config.endpoint()
        : client.config.endpoint;

    const raw = configured?.url || configured;

    const endpoint =
      typeof raw === "string"
        ? new URL(raw)
        : raw;

    if (
      !endpoint ||
      endpoint.protocol !== "http:" ||
      ![
        "localhost",
        "127.0.0.1",
        "[::1]",
        "::1",
      ].includes(endpoint.hostname) ||
      String(endpoint.port) !== "8001"
    ) {
      throw new Error(
        "Cần dùng DynamoDB Local cổng 8001."
      );
    }

    console.log(
      "KIỂM TRA LIÊN KẾT VÀ SỐ ĐẾM TRÊN 8 BẢNG"
    );

    console.log(
      "Trong lúc kiểm tra, tạm ngừng " +
        "các thao tác sửa dữ liệu."
    );

    const data = {};

    for (
      const [table, keys] of
      Object.entries(TABLE_KEYS)
    ) {
      const records = new Map();
      let lastKey;

      do {
        const result = await docClient.send(
          new ScanCommand({
            TableName: table,
            ConsistentRead: true,
            ExclusiveStartKey: lastKey,
          })
        );

        for (const item of result.Items || []) {
          const id = JSON.stringify(
            keys.map((key) => item[key])
          );

          records.set(id, item);
        }

        lastKey = result.LastEvaluatedKey;
      } while (
        lastKey &&
        Object.keys(lastKey).length
      );

      data[table] = [...records.values()];
    }

    console.table(
      Object.entries(data).map(
        ([table, items]) => ({
          "Bảng": table,
          "Số bản ghi": items.length,
        })
      )
    );

    console.log(
      "Reservations bao gồm yêu cầu đặt trước " +
        "và bản ghi khóa."
    );

    const issues = auditAll(data);

    if (issues.length) {
      console.log(
        `Có ${issues.length} điểm cần kiểm tra:`
      );

      issues.forEach((message, index) => {
        console.log(`${index + 1}. ${message}`);
      });

      process.exitCode = 1;
    } else {
      console.log(
        "Các liên kết và số đếm " +
          "được kiểm tra đều khớp."
      );
    }

    console.log(
      "Chỉ kiểm tra dữ liệu, " +
        "không thực hiện thao tác ghi."
    );
  } finally {
    client.destroy();
  }
}

module.exports = { auditAll };

if (require.main === module) {
  main().catch((error) => {
    console.error(
      "Chưa kiểm tra được:",
      error.message
    );

    process.exitCode = 1;
  });
}