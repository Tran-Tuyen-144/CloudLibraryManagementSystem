const {
  GetCommand,
  TransactGetCommand,
  TransactWriteCommand,
} = require("@aws-sdk/lib-dynamodb");

const { client, docClient } = require("../config/db");

const loanId = "LOAN002";
const bookId = "BOOK002";
const copyId = "COPY004";
const borrowerId = "READER002";
const waitingReaderId = "READER001";
const lockId = `ACTIVE#${waitingReaderId}#${bookId}`;

// Hàm tạo thao tác cập nhật trong giao dịch.
function update(table, key, expression, condition, values, names) {
  return {
    Update: {
      TableName: table,
      Key: key,
      UpdateExpression: expression,
      ConditionExpression: condition,
      ExpressionAttributeValues: values,
      ...(names ? { ExpressionAttributeNames: names } : {}),
    },
  };
}

function dayNumber(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Ngay khong dung dang YYYY-MM-DD.");
  }

  const date = new Date(`${value}T00:00:00Z`);

  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new Error("Ngay khong hop le.");
  }

  return date.getTime() / 86400000;
}

async function returnAndHoldDemo() {
  let saved = false;

  try {
    const initial = await docClient.send(
      new TransactGetCommand({
        TransactItems: [
          { Get: { TableName: "Loans", Key: { loanId } } },
          { Get: { TableName: "Books", Key: { bookId } } },
          {
            Get: {
              TableName: "Reservations",
              Key: { reservationId: lockId },
            },
          },
        ],
      })
    );

    const [loan, book, lock] =
      initial.Responses.map((response) => response.Item);

    if (!loan || !book) {
      throw new Error("Khong tim thay du lieu mau LOAN002/BOOK002.");
    }

    if (loan.status === "RETURNED") {
      console.log("LOAN002 da tra. Khong xu ly lap.");
      return;
    }

    if (
      !["BORROWED", "OVERDUE"].includes(loan.status) ||
      loan.bookId !== bookId ||
      loan.copyId !== copyId ||
      loan.readerId !== borrowerId
    ) {
      throw new Error("Phieu muon khong khop tinh huong mau.");
    }

    if (!lock) {
      throw new Error(
        "Chua co yeu cau cua READER001. " +
        "Hay chay lai add-reservation-demo.js."
      );
    }

    if (
      book.waitingReservationCount !== 1 ||
      !Number.isSafeInteger(book.reservationVersion)
    ) {
      throw new Error(
        "Ban demo nay can dung 1 nguoi dang cho."
      );
    }

    const reservationId = lock.activeReservationId;

    const reservationResult = await docClient.send(
      new GetCommand({
        TableName: "Reservations",
        Key: { reservationId },
        ConsistentRead: true,
      })
    );

    const reservation = reservationResult.Item;

    if (
      !reservation ||
      reservation.status !== "WAITING" ||
      reservation.readerId !== waitingReaderId ||
      reservation.bookId !== bookId
    ) {
      throw new Error("Yeu cau dat truoc khong hop le.");
    }

    const now = new Date();
    const timestamp = now.toISOString();
    const expiresAt = new Date(
      now.getTime() + 48 * 60 * 60 * 1000
    ).toISOString();

    const returnDate = new Date(
      now.getTime() + 7 * 60 * 60 * 1000
    ).toISOString().slice(0, 10);

    if (
      !Number.isFinite(Date.parse(loan.borrowedAt)) ||
      now.getTime() < Date.parse(loan.borrowedAt)
    ) {
      throw new Error("Thoi diem tra truoc thoi diem muon.");
    }

    const dailyFine = loan.rulesSnapshot?.dailyFineVnd;

    if (!Number.isSafeInteger(dailyFine) || dailyFine < 0) {
      throw new Error("Muc phat trong phieu khong hop le.");
    }

    const overdueDays = Math.max(
      0,
      dayNumber(returnDate) - dayNumber(loan.dueDate)
    );

    const fineAmount = overdueDays * dailyFine;

    if (!Number.isSafeInteger(fineAmount)) {
      throw new Error("Tien phat khong hop le.");
    }

    const notificationId = `RES_READY#${reservationId}`;

    await docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          update(
            "Loans",
            { loanId },
            "SET #s = :returned, returnedAt = :now, " +
              "overdueDays = :days, fineAmount = :fine, " +
              "finePaymentStatus = :payment, " +
              "returnedBy = :staff, updatedAt = :now",
            "#s = :oldStatus AND updatedAt = :version " +
              "AND dueDate = :due",
            {
              ":returned": "RETURNED",
              ":oldStatus": loan.status,
              ":version": loan.updatedAt,
              ":due": loan.dueDate,
              ":now": timestamp,
              ":days": overdueDays,
              ":fine": fineAmount,
              ":payment": fineAmount > 0 ? "UNPAID" : "NOT_REQUIRED",
              ":staff": "LIBRARIAN_DEMO",
            },
            { "#s": "status" }
          ),

          update(
            "BookCopies",
            { copyId },
            "SET #s = :held, currentReservationId = :reservation, " +
              "holdExpiresAt = :expiry, updatedAt = :now " +
              "REMOVE currentLoanId",
            "#s = :borrowed AND currentLoanId = :loan " +
              "AND bookId = :book",
            {
              ":held": "HELD",
              ":borrowed": "BORROWED",
              ":reservation": reservationId,
              ":expiry": expiresAt,
              ":loan": loanId,
              ":book": bookId,
              ":now": timestamp,
            },
            { "#s": "status" }
          ),

          update(
            "Books",
            { bookId },
            "SET heldCopies = if_not_exists(heldCopies, :zero) + :one, " +
              "waitingReservationCount = waitingReservationCount - :one, " +
              "reservationVersion = reservationVersion + :one, " +
              "updatedAt = :now",
            "#s = :active AND availableCopies = :zero " +
              "AND waitingReservationCount = :one " +
              "AND reservationVersion = :version",
            {
              ":zero": 0,
              ":one": 1,
              ":active": "ACTIVE",
              ":version": book.reservationVersion,
              ":now": timestamp,
            },
            { "#s": "status" }
          ),

          update(
            "Readers",
            { readerId: borrowerId },
            "SET activeLoanCount = activeLoanCount - :one, " +
              "updatedAt = :now",
            "activeLoanCount > :zero",
            {
              ":one": 1,
              ":zero": 0,
              ":now": timestamp,
            }
          ),

          {
            ConditionCheck: {
              TableName: "Readers",
              Key: { readerId: waitingReaderId },
              ConditionExpression: "#s = :active",
              ExpressionAttributeNames: { "#s": "status" },
              ExpressionAttributeValues: { ":active": "ACTIVE" },
            },
          },

          update(
            "Reservations",
            { reservationId },
            "SET #s = :ready, copyId = :copy, readyAt = :now, " +
              "expiresAt = :expiry, updatedAt = :now",
            "#s = :waiting AND readerId = :reader " +
              "AND bookId = :book AND updatedAt = :version",
            {
              ":ready": "READY",
              ":waiting": "WAITING",
              ":copy": copyId,
              ":reader": waitingReaderId,
              ":book": bookId,
              ":version": reservation.updatedAt,
              ":now": timestamp,
              ":expiry": expiresAt,
            },
            { "#s": "status" }
          ),

          {
            ConditionCheck: {
              TableName: "Reservations",
              Key: { reservationId: lockId },
              ConditionExpression: "activeReservationId = :id",
              ExpressionAttributeValues: { ":id": reservationId },
            },
          },

          {
            Put: {
              TableName: "Notifications",
              Item: {
                notificationId,
                readerId: waitingReaderId,
                bookId,
                copyId,
                reservationId,
                type: "RESERVATION_READY",
                channel: "IN_APP",
                deliveryStatus: "STORED",
                message:
                  `${book.title} đã được giữ cho bạn trong 48 giờ.`,
                expiresAt,
                readAt: null,
                createdAt: timestamp,
                updatedAt: timestamp,
              },
              ConditionExpression:
                "attribute_not_exists(notificationId)",
            },
          },
        ],
      })
    );

    saved = true;
    console.log("Da tra sach, giu sach va luu thong bao local!");

    const result = await docClient.send(
      new TransactGetCommand({
        TransactItems: [
          { Get: { TableName: "Loans", Key: { loanId } } },
          { Get: { TableName: "BookCopies", Key: { copyId } } },
          { Get: { TableName: "Books", Key: { bookId } } },
          {
            Get: {
              TableName: "Reservations",
              Key: { reservationId },
            },
          },
          {
            Get: {
              TableName: "Notifications",
              Key: { notificationId },
            },
          },
          {
            Get: {
              TableName: "Readers",
              Key: { readerId: borrowerId },
            },
          },
        ],
      })
    );

    const [savedLoan, copy, savedBook, ready, notice, borrower] =
      result.Responses.map((response) => response.Item);

    console.table([
      { field: "loanStatus", value: savedLoan.status },
      { field: "copyStatus", value: copy.status },
      { field: "reservationStatus", value: ready.status },
      { field: "availableCopies", value: savedBook.availableCopies },
      { field: "heldCopies", value: savedBook.heldCopies },
      { field: "waitingCount", value: savedBook.waitingReservationCount },
      { field: "borrowerActiveLoans", value: borrower.activeLoanCount },
      { field: "notification", value: notice.deliveryStatus },
    ]);

    console.log(
      "Han den nhan sach (gio Viet Nam):",
      new Date(ready.expiresAt).toLocaleString("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        hour12: false,
      })
    );

    console.log("Noi dung thong bao:", notice.message);
  } catch (error) {
    console.error(
      saved
        ? "Du lieu da luu, nhung doc lai ket qua bi loi."
        : "Chua hoan tat thao tac."
    );

    console.error(error.message);

    if (error.name === "TransactionCanceledException") {
      console.error(
        "Du lieu da thay doi hoac khong dat dieu kien. " +
        "Giao dich bi huy; hay kiem tra lai trang thai."
      );
    }

    process.exitCode = 1;
  } finally {
    client.destroy();
  }
}

returnAndHoldDemo();