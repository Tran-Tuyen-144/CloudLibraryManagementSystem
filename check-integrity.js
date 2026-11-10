"use strict";

const TABLES = [
  "Books",
  "BookCopies",
  "Readers",
  "Loans",
  "Reservations",
];

const isActiveLoan = (item) =>
  ["BORROWED", "OVERDUE"].includes(item.status);

const isActiveReservation = (item) =>
  ["WAITING", "READY"].includes(item.status);

const lockId = (item) =>
  `ACTIVE#${item.readerId}#${item.bookId}`;

function audit(data) {
  const issues = [];

  const check = (ok, message) => {
    if (!ok) issues.push(message);
  };

  const books = new Map(
    data.Books.map((x) => [x.bookId, x])
  );

  const copies = new Map(
    data.BookCopies.map((x) => [x.copyId, x])
  );

  const readers = new Map(
    data.Readers.map((x) => [x.readerId, x])
  );

  const loans = new Map(
    data.Loans.map((x) => [x.loanId, x])
  );

  const allReservations = new Map(
    data.Reservations.map((x) => [x.reservationId, x])
  );

  const reservations = data.Reservations.filter(
    (x) => x.entityType === "RESERVATION"
  );

  const locks = data.Reservations.filter(
    (x) => x.entityType === "RESERVATION_LOCK"
  );

  // Kiểm tra các số đếm của từng đầu sách.
  for (const book of books.values()) {
    const ownCopies = data.BookCopies.filter(
      (x) => x.bookId === book.bookId
    );

    const counts = {
      totalCopies: ownCopies.length,

      availableCopies: ownCopies.filter(
        (x) => x.status === "AVAILABLE"
      ).length,

      heldCopies: ownCopies.filter(
        (x) => x.status === "HELD"
      ).length,

      waitingReservationCount: reservations.filter(
        (x) =>
          x.bookId === book.bookId &&
          x.status === "WAITING"
      ).length,
    };

    for (const [field, expected] of Object.entries(counts)) {
      const optional = [
        "heldCopies",
        "waitingReservationCount",
      ].includes(field);

      const actual =
        book[field] === undefined && optional
          ? 0
          : book[field];

      check(
        Number.isSafeInteger(actual) &&
          actual === expected,
        `${book.bookId}: ${field} đang là ${actual}, ` +
          `cần là ${expected}.`
      );
    }
  }

  // Kiểm tra số phiếu đang mượn của từng độc giả.
  for (const reader of readers.values()) {
    const expected = data.Loans.filter(
      (x) =>
        x.readerId === reader.readerId &&
        isActiveLoan(x)
    ).length;

    check(
      reader.activeLoanCount === expected,
      `${reader.readerId}: số phiếu đang mượn là ${expected}, ` +
        `nhưng activeLoanCount là ${reader.activeLoanCount}.`
    );
  }

  // Kiểm tra liên kết của phiếu mượn.
  for (const loan of loans.values()) {
    const copy = copies.get(loan.copyId);

    check(
      readers.has(loan.readerId),
      `${loan.loanId}: không tìm thấy độc giả.`
    );

    check(
      books.has(loan.bookId),
      `${loan.loanId}: không tìm thấy đầu sách.`
    );

    check(
      copy && copy.bookId === loan.bookId,
      `${loan.loanId}: bản sách không tồn tại hoặc sai đầu sách.`
    );

    // Phiếu đã trả được giữ làm lịch sử.
    // Chỉ phiếu đang mượn cần khớp liên kết hiện tại.
    if (isActiveLoan(loan)) {
      check(
        copy?.status === "BORROWED" &&
          copy.currentLoanId === loan.loanId,
        `${loan.loanId}: phiếu đang mượn không khớp bản sách.`
      );
    }
  }

  // Kiểm tra trạng thái và liên kết của từng bản sách.
  for (const copy of copies.values()) {
    check(
      books.has(copy.bookId),
      `${copy.copyId}: không tìm thấy đầu sách.`
    );

    const hasLoan = Object.hasOwn(
      copy,
      "currentLoanId"
    );

    const hasHold = Object.hasOwn(
      copy,
      "currentReservationId"
    );

    const hasExpiry = Object.hasOwn(
      copy,
      "holdExpiresAt"
    );

    if (copy.status === "AVAILABLE") {
      check(
        !hasLoan && !hasHold && !hasExpiry,
        `${copy.copyId}: sách có sẵn nhưng còn liên kết ` +
          "mượn hoặc giữ sách."
      );
    } else if (copy.status === "BORROWED") {
      const loan = loans.get(copy.currentLoanId);

      check(
        loan &&
          isActiveLoan(loan) &&
          loan.copyId === copy.copyId &&
          loan.bookId === copy.bookId &&
          !hasHold &&
          !hasExpiry,
        `${copy.copyId}: liên kết phiếu mượn không hợp lệ.`
      );
    } else if (copy.status === "HELD") {
      const reservation = allReservations.get(
        copy.currentReservationId
      );

      check(
        reservation?.entityType === "RESERVATION" &&
          reservation.status === "READY" &&
          reservation.copyId === copy.copyId &&
          reservation.bookId === copy.bookId &&
          typeof reservation.expiresAt === "string" &&
          Number.isFinite(
            Date.parse(reservation.expiresAt)
          ) &&
          reservation.expiresAt === copy.holdExpiresAt &&
          !hasLoan,
        `${copy.copyId}: liên kết hoặc thời hạn giữ sách ` +
          "không hợp lệ."
      );
    } else {
      check(
        false,
        `${copy.copyId}: trạng thái chưa được hỗ trợ: ` +
          `${copy.status}.`
      );
    }
  }

  // Kiểm tra yêu cầu đặt trước.
  for (const reservation of reservations) {
    const id = reservation.reservationId;

    check(
      readers.has(reservation.readerId),
      `${id}: không tìm thấy độc giả.`
    );

    check(
      books.has(reservation.bookId),
      `${id}: không tìm thấy đầu sách.`
    );

    if (isActiveReservation(reservation)) {
      const lock = allReservations.get(
        lockId(reservation)
      );

      check(
        lock?.entityType === "RESERVATION_LOCK" &&
          lock.activeReservationId === id,
        `${id}: thiếu hoặc sai bản ghi khóa giữ sách.`
      );
    }

    if (reservation.status === "READY") {
      const copy = copies.get(reservation.copyId);

      check(
        copy?.status === "HELD" &&
          copy.bookId === reservation.bookId &&
          copy.currentReservationId === id &&
          copy.holdExpiresAt === reservation.expiresAt,
        `${id}: yêu cầu chờ nhận không khớp ` +
          "bản sách đang giữ."
      );
    }
  }

  // Khóa chỉ được trỏ đến yêu cầu đang chờ hoặc chờ nhận.
  for (const lock of locks) {
    const reservation = allReservations.get(
      lock.activeReservationId
    );

    check(
      reservation?.entityType === "RESERVATION" &&
        isActiveReservation(reservation) &&
        lock.reservationId === lockId(reservation),
      `${lock.reservationId}: khóa không trỏ tới ` +
        "yêu cầu đang hoạt động."
    );
  }

  for (const item of data.Reservations) {
    check(
      ["RESERVATION", "RESERVATION_LOCK"].includes(
        item.entityType
      ),
      `${item.reservationId}: loại bản ghi đặt trước ` +
        "không hợp lệ."
    );
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
    const data = {};

    const keys = {
      Books: "bookId",
      BookCopies: "copyId",
      Readers: "readerId",
      Loans: "loanId",
      Reservations: "reservationId",
    };

    // Đọc đầy đủ từng bảng, kể cả khi kết quả chia nhiều trang.
    for (const table of TABLES) {
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
          records.set(item[keys[table]], item);
        }

        lastKey = result.LastEvaluatedKey;
      } while (lastKey);

      data[table] = [...records.values()];
    }

    console.log("KIỂM TRA DỮ LIỆU THƯ VIỆN");

    console.table([
      {
        "Nội dung": "Đầu sách",
        "Số lượng": data.Books.length,
      },
      {
        "Nội dung": "Bản sách",
        "Số lượng": data.BookCopies.length,
      },
      {
        "Nội dung": "Độc giả",
        "Số lượng": data.Readers.length,
      },
      {
        "Nội dung": "Phiếu mượn",
        "Số lượng": data.Loans.length,
      },
      {
        "Nội dung": "Yêu cầu đặt trước",
        "Số lượng": data.Reservations.filter(
          (x) => x.entityType === "RESERVATION"
        ).length,
      },
      {
        "Nội dung": "Khóa giữ sách",
        "Số lượng": data.Reservations.filter(
          (x) => x.entityType === "RESERVATION_LOCK"
        ).length,
      },
    ]);

    const issues = audit(data);

    if (!issues.length) {
      console.log(
        "Kết quả: các liên kết và số đếm được kiểm tra đều khớp."
      );
    } else {
      console.log(
        `Phát hiện ${issues.length} điểm cần kiểm tra:`
      );

      issues.forEach((message, index) => {
        console.log(`${index + 1}. ${message}`);
      });

      process.exitCode = 1;
    }

    console.log("Chỉ kiểm tra, không thay đổi dữ liệu.");
  } catch (error) {
    console.error(
      "Không kiểm tra được dữ liệu:",
      error.message
    );

    process.exitCode = 1;
  } finally {
    client.destroy();
  }
}

module.exports = { audit };

if (require.main === module) {
  main().catch((error) => {
    console.error(
      "Có lỗi khi chạy chương trình:",
      error.message
    );

    process.exitCode = 1;
  });
}