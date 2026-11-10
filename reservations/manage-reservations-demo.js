const {
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
} = require("@aws-sdk/lib-dynamodb");

const { client, docClient } = require("../config/db");

const readerId = "READER001";
const bookId = "BOOK002";
const lockId = `ACTIVE#${readerId}#${bookId}`;

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

async function queryReservations(indexName, keyName, value) {
  const records = new Map();
  let lastKey;

  do {
    const result = await docClient.send(
      new QueryCommand({
        TableName: "Reservations",
        IndexName: indexName,
        KeyConditionExpression: "#key = :value",
        ExpressionAttributeNames: {
          "#key": keyName,
        },
        ExpressionAttributeValues: {
          ":value": value,
        },
        ScanIndexForward: true,
        ExclusiveStartKey: lastKey,
      })
    );

    for (const candidate of result.Items || []) {
      // Đọc lại bảng chính để lấy trạng thái mới nhất.
      const item = await getItem("Reservations", {
        reservationId: candidate.reservationId,
      });

      if (
        item?.entityType === "RESERVATION" &&
        item[keyName] === value
      ) {
        records.set(item.reservationId, item);
      }
    }

    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  return [...records.values()];
}

async function listQueue() {
  const reservations = await queryReservations(
    "ByBook",
    "bookId",
    bookId
  );

  const waiting = reservations
    .filter((item) => item.status === "WAITING")
    .sort((a, b) => a.queueKey.localeCompare(b.queueKey));

  if (waiting.length === 0) {
    console.log(`${bookId} hien khong co nguoi dang cho.`);
  } else {
    console.log(`Hang cho cua ${bookId}:`);

    console.table(
      waiting.map((item, index) => ({
        thuTu: index + 1,
        readerId: item.readerId,
        status: item.status,
      }))
    );
  }

  const book = await getItem("Books", { bookId });

  if (!book) {
    throw new Error("Khong tim thay dau sach.");
  }

  console.log(
    "So luot cho luu tren sach:",
    book.waitingReservationCount ?? 0
  );
}

async function showHistory() {
  const reservations = await queryReservations(
    "ByReader",
    "readerId",
    readerId
  );

  reservations.sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt)
  );

  if (reservations.length === 0) {
    console.log(`${readerId} chua co lich su dat truoc.`);
    return;
  }

  console.log(`Lich su dat truoc cua ${readerId}:`);

  console.table(
    reservations.map((item) => ({
      bookId: item.bookId,
      status: item.status,
      createdAt: item.createdAt,
    }))
  );
}

async function cancelReservation() {
  const lock = await getItem("Reservations", {
    reservationId: lockId,
  });

  if (!lock) {
    console.log("Khong co yeu cau dat truoc dang hoat dong.");
    return;
  }

  const reservationId = lock.activeReservationId;

  const reservation = await getItem("Reservations", {
    reservationId,
  });

  if (
    !reservation ||
    reservation.readerId !== readerId ||
    reservation.bookId !== bookId
  ) {
    throw new Error("Du lieu yeu cau dat truoc khong khop.");
  }

  if (reservation.status !== "WAITING") {
    throw new Error(
      "Script nay chi huy yeu cau dang WAITING."
    );
  }

  const timestamp = new Date().toISOString();

  await docClient.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Update: {
            TableName: "Reservations",
            Key: { reservationId },
            UpdateExpression:
              "SET #s = :cancelled, cancelledAt = :now, " +
              "updatedAt = :now",
            ConditionExpression:
              "#s = :waiting AND readerId = :reader " +
              "AND bookId = :book AND updatedAt = :version",
            ExpressionAttributeNames: {
              "#s": "status",
            },
            ExpressionAttributeValues: {
              ":cancelled": "CANCELLED",
              ":waiting": "WAITING",
              ":reader": readerId,
              ":book": bookId,
              ":version": reservation.updatedAt,
              ":now": timestamp,
            },
          },
        },
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
        {
          Update: {
            TableName: "Books",
            Key: { bookId },
            UpdateExpression:
              "SET waitingReservationCount = " +
              "waitingReservationCount - :one, " +
              "reservationVersion = " +
              "if_not_exists(reservationVersion, :zero) + :one, " +
              "updatedAt = :now",
            ConditionExpression:
              "waitingReservationCount > :zero",
            ExpressionAttributeValues: {
              ":one": 1,
              ":zero": 0,
              ":now": timestamp,
            },
          },
        },
      ],
    })
  );

  console.log("Da huy yeu cau dat truoc.");
  console.log("Ma yeu cau:", reservationId);
  console.log("Da giu lai lich su voi trang thai CANCELLED.");
}

async function main() {
  try {
    const actions = {
      list: listQueue,
      cancel: cancelReservation,
      history: showHistory,
    };

    const action = process.argv[2];

    if (
      process.argv.length !== 3 ||
      !Object.hasOwn(actions, action)
    ) {
      throw new Error(
        "Cach dung: node reservations/manage-reservations-demo.js " +
        "list|cancel|history"
      );
    }

    await actions[action]();
  } catch (error) {
    console.error("Khong hoan tat thao tac:", error.message);

    if (error.name === "TransactionCanceledException") {
      console.error(
        "Du lieu da thay doi hoac so luot cho khong hop le. " +
        "Giao dich huy dat truoc bi huy."
      );
    }

    process.exitCode = 1;
  } finally {
    client.destroy();
  }
}

main();