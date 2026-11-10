const {
  GetCommand,
  TransactWriteCommand,
  TransactGetCommand,
} = require("@aws-sdk/lib-dynamodb");

const { client, docClient } = require("../config/db");

const readerId = "READER001";
const bookId = "BOOK002";
const lockId = `ACTIVE#${readerId}#${bookId}`;

const rules = {
  maxActiveLoans: 3,
  loanDays: 14,
  dailyFineVnd: 5000,
  maxRenewals: 1,
  extensionDays: 7,
};

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

async function getItem(table, key) {
  const result = await docClient.send(
    new GetCommand({
      TableName: table,
      Key: key,
      ConsistentRead: true,
    })
  );

  return result.Item;
}

async function pickupDemo() {
  let saved = false;

  try {
    const lock = await getItem("Reservations", {
      reservationId: lockId,
    });

    if (!lock) {
      console.log("Khong con yeu cau giu sach dang hoat dong.");
      console.log("Khong tao phieu muon moi.");
      return;
    }

    const reservationId = lock.activeReservationId;

    const reservation = await getItem("Reservations", {
      reservationId,
    });

    if (
      !reservation ||
      reservation.status !== "READY" ||
      reservation.readerId !== readerId ||
      reservation.bookId !== bookId ||
      typeof reservation.copyId !== "string"
    ) {
      throw new Error("Khong co yeu cau READY hop le de nhan.");
    }

    const now = new Date();
    const timestamp = now.toISOString();
    const expiry = reservation.expiresAt;
    const expiryTime = Date.parse(expiry);

    if (
      !Number.isFinite(expiryTime) ||
      new Date(expiryTime).toISOString() !== expiry
    ) {
      throw new Error("Thoi han giu sach khong hop le.");
    }

    if (now.getTime() >= expiryTime) {
      throw new Error("Da het han giu sach. Khong the giao sach.");
    }

    const copyId = reservation.copyId;

    // Mỗi yêu cầu đặt trước chỉ tạo một mã phiếu nhận sách.
    const loanId = `LOAN#${reservationId}`;

    const vietnamDate = new Date(
      now.getTime() + 7 * 60 * 60 * 1000
    );

    vietnamDate.setUTCDate(
      vietnamDate.getUTCDate() + rules.loanDays
    );

    const dueDate = vietnamDate.toISOString().slice(0, 10);

    await docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: "Loans",
              Item: {
                loanId,
                readerId,
                bookId,
                copyId,
                reservationId,
                status: "BORROWED",
                createdAt: timestamp,
                borrowedAt: timestamp,
                dueDate,
                returnedAt: null,
                renewalCount: 0,
                fineAmount: 0,
                finePaymentStatus: "NOT_ASSESSED",
                confirmedBy: "LIBRARIAN_DEMO",
                rulesSnapshot: rules,
                updatedAt: timestamp,
              },
              ConditionExpression:
                "attribute_not_exists(loanId)",
            },
          },

          update(
            "BookCopies",
            { copyId },
            "SET #s = :borrowed, currentLoanId = :loan, " +
              "updatedAt = :now " +
              "REMOVE currentReservationId, holdExpiresAt",
            "#s = :held AND currentReservationId = :reservation " +
              "AND bookId = :book AND holdExpiresAt = :expiry " +
              "AND holdExpiresAt > :now",
            {
              ":borrowed": "BORROWED",
              ":held": "HELD",
              ":loan": loanId,
              ":reservation": reservationId,
              ":book": bookId,
              ":expiry": expiry,
              ":now": timestamp,
            },
            { "#s": "status" }
          ),

          update(
            "Books",
            { bookId },
            "SET heldCopies = heldCopies - :one, " +
              "reservationVersion = " +
              "if_not_exists(reservationVersion, :zero) + :one, " +
              "updatedAt = :now",
            "#s = :active AND heldCopies > :zero",
            {
              ":one": 1,
              ":zero": 0,
              ":active": "ACTIVE",
              ":now": timestamp,
            },
            { "#s": "status" }
          ),

          update(
            "Readers",
            { readerId },
            "SET activeLoanCount = activeLoanCount + :one, " +
              "updatedAt = :now",
            "#s = :active AND activeLoanCount >= :zero " +
              "AND activeLoanCount < :limit",
            {
              ":one": 1,
              ":zero": 0,
              ":active": "ACTIVE",
              ":limit": rules.maxActiveLoans,
              ":now": timestamp,
            },
            { "#s": "status" }
          ),

          update(
            "Reservations",
            { reservationId },
            "SET #s = :fulfilled, fulfilledAt = :now, " +
              "fulfilledLoanId = :loan, updatedAt = :now",
            "#s = :ready AND readerId = :reader " +
              "AND bookId = :book AND copyId = :copy " +
              "AND expiresAt = :expiry AND expiresAt > :now " +
              "AND updatedAt = :version",
            {
              ":fulfilled": "FULFILLED",
              ":ready": "READY",
              ":reader": readerId,
              ":book": bookId,
              ":copy": copyId,
              ":expiry": expiry,
              ":version": reservation.updatedAt,
              ":loan": loanId,
              ":now": timestamp,
            },
            { "#s": "status" }
          ),

          {
            Delete: {
              TableName: "Reservations",
              Key: { reservationId: lockId },
              ConditionExpression:
                "activeReservationId = :reservation",
              ExpressionAttributeValues: {
                ":reservation": reservationId,
              },
            },
          },
        ],
      })
    );

    saved = true;
    console.log("Da giao sach da giu cho doc gia!");
    console.log("Ma phieu muon moi:", loanId);

    const result = await docClient.send(
      new TransactGetCommand({
        TransactItems: [
          { Get: { TableName: "Loans", Key: { loanId } } },
          { Get: { TableName: "BookCopies", Key: { copyId } } },
          { Get: { TableName: "Books", Key: { bookId } } },
          { Get: { TableName: "Readers", Key: { readerId } } },
          {
            Get: {
              TableName: "Reservations",
              Key: { reservationId },
            },
          },
        ],
      })
    );

    const [loan, copy, book, reader, fulfilled] =
      result.Responses.map((response) => response.Item);

    console.table([
      { field: "loanStatus", value: loan.status },
      { field: "copyStatus", value: copy.status },
      { field: "reservationStatus", value: fulfilled.status },
      { field: "availableCopies", value: book.availableCopies },
      { field: "heldCopies", value: book.heldCopies },
      { field: "activeLoanCount", value: reader.activeLoanCount },
      { field: "dueDate", value: loan.dueDate },
    ]);
  } catch (error) {
    console.error(
      saved
        ? "Phieu da luu, nhung doc lai ket qua bi loi."
        : "Chua hoan tat giao sach."
    );

    console.error(error.message);

    if (error.name === "TransactionCanceledException") {
      console.error(
        "Kiem tra han giu, trang thai sach, quyen nhan sach " +
        "va gioi han muon toi da 3 cuon."
      );
    }

    process.exitCode = 1;
  } finally {
    client.destroy();
  }
}

pickupDemo();