const { randomUUID } = require("node:crypto");

const {
  GetCommand,
  TransactWriteCommand,
  TransactGetCommand,
} = require("@aws-sdk/lib-dynamodb");

const { client, docClient } = require("../config/db");

const readerId = "READER001";
const bookId = "BOOK002";

// Một khóa riêng cho mỗi cặp độc giả và đầu sách.
const lockId = `ACTIVE#${readerId}#${bookId}`;

async function addReservationDemo() {
  let saved = false;

  try {
    const existing = await docClient.send(
      new GetCommand({
        TableName: "Reservations",
        Key: { reservationId: lockId },
        ConsistentRead: true,
      })
    );

    if (existing.Item) {
      console.log("Doc gia da co yeu cau dat truoc sach nay.");
      console.log(
        "Ma yeu cau:",
        existing.Item.activeReservationId
      );
      return;
    }

    const timestamp = new Date().toISOString();
    const reservationId = `RES#${randomUUID()}`;

    await docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            ConditionCheck: {
              TableName: "Readers",
              Key: { readerId },
              ConditionExpression: "#s = :active",
              ExpressionAttributeNames: {
                "#s": "status",
              },
              ExpressionAttributeValues: {
                ":active": "ACTIVE",
              },
            },
          },
          {
            Update: {
              TableName: "Books",
              Key: { bookId },
              UpdateExpression:
                "SET waitingReservationCount = " +
                "if_not_exists(waitingReservationCount, :zero) + :one, " +
                "reservationVersion = " +
                "if_not_exists(reservationVersion, :zero) + :one, " +
                "updatedAt = :now",
              ConditionExpression:
                "#s = :active AND availableCopies = :zero",
              ExpressionAttributeNames: {
                "#s": "status",
              },
              ExpressionAttributeValues: {
                ":active": "ACTIVE",
                ":zero": 0,
                ":one": 1,
                ":now": timestamp,
              },
            },
          },
          {
            Put: {
              TableName: "Reservations",
              Item: {
                reservationId,
                entityType: "RESERVATION",
                readerId,
                bookId,
                status: "WAITING",
                queueKey: `${timestamp}#${reservationId}`,
                createdAt: timestamp,
                updatedAt: timestamp,
              },
              ConditionExpression:
                "attribute_not_exists(reservationId)",
            },
          },
          {
            Put: {
              TableName: "Reservations",
              Item: {
                reservationId: lockId,
                entityType: "RESERVATION_LOCK",
                activeReservationId: reservationId,
                createdAt: timestamp,
              },
              ConditionExpression:
                "attribute_not_exists(reservationId)",
            },
          },
        ],
      })
    );

    saved = true;
    console.log("Da gui yeu cau dat truoc thanh cong!");

    const result = await docClient.send(
      new TransactGetCommand({
        TransactItems: [
          {
            Get: {
              TableName: "Reservations",
              Key: { reservationId },
            },
          },
          {
            Get: {
              TableName: "Books",
              Key: { bookId },
            },
          },
        ],
      })
    );

    const [reservation, book] =
      result.Responses.map((response) => response.Item);

    console.log("Ma yeu cau:", reservation.reservationId);

    console.table([
      { field: "readerId", value: reservation.readerId },
      { field: "bookId", value: reservation.bookId },
      { field: "status", value: reservation.status },
      { field: "availableCopies", value: book.availableCopies },
      {
        field: "waitingReservationCount",
        value: book.waitingReservationCount,
      },
      {
        field: "holdExpiresAt",
        value: "Chua bat dau giu sach",
      },
    ]);
  } catch (error) {
    console.error(
      saved
        ? "Yeu cau da luu, nhung doc lai ket qua bi loi."
        : "Chua hoan tat dat truoc."
    );

    console.error(error.message);

    if (error.name === "TransactionCanceledException") {
      console.error(
        "Kiem tra: doc gia ACTIVE, sach ACTIVE va het ban " +
        "san co, dong thoi chua co yeu cau dat trung."
      );
    }

    process.exitCode = 1;
  } finally {
    client.destroy();
  }
}

addReservationDemo();