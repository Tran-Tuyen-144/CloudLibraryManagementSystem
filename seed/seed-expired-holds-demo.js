const {
  TransactWriteCommand,
  TransactGetCommand,
} = require("@aws-sdk/lib-dynamodb");

const { client, docClient } = require("../config/db");

async function seedExpiredHoldsDemo() {
  let saved = false;

  try {
    const now = new Date();
    const timestamp = now.toISOString();

    // Tình huống giả lập:
    // bắt đầu giữ 49 giờ trước, hết hạn 1 giờ trước.
    const readyAt = new Date(
      now.getTime() - 49 * 60 * 60 * 1000
    ).toISOString();

    const expiresAt = new Date(
      now.getTime() - 60 * 60 * 1000
    ).toISOString();

    const waitingAt = new Date(
      now.getTime() - 30 * 60 * 1000
    ).toISOString();

    const scenarios = [
      {
        bookId: "BOOK003",
        copyId: "COPY005",
        reservationId: "RES_EXPIRED_003",
        title: "Python cơ bản - Sách mẫu",
        hasWaiting: false,
      },
      {
        bookId: "BOOK004",
        copyId: "COPY006",
        reservationId: "RES_EXPIRED_004",
        title: "Cơ sở dữ liệu - Sách mẫu",
        hasWaiting: true,
      },
    ];

    const records = [];

    function add(table, key, item) {
      records.push({ table, key, item });
    }

    function addLock(readerId, bookId, reservationId, createdAt) {
      add("Reservations", "reservationId", {
        reservationId: `ACTIVE#${readerId}#${bookId}`,
        entityType: "RESERVATION_LOCK",
        activeReservationId: reservationId,
        createdAt,
      });
    }

    for (const scenario of scenarios) {
      add("Books", "bookId", {
        bookId: scenario.bookId,
        title: scenario.title,
        author: "Tác giả mẫu",
        category: "Programming",
        description: "Dữ liệu mẫu kiểm tra hết hạn giữ sách.",
        totalCopies: 1,
        availableCopies: 0,
        heldCopies: 1,
        waitingReservationCount: scenario.hasWaiting ? 1 : 0,
        reservationVersion: 1,
        coverImageKey: null,
        status: "ACTIVE",
        createdAt: readyAt,
        updatedAt: timestamp,
      });

      add("BookCopies", "copyId", {
        copyId: scenario.copyId,
        bookId: scenario.bookId,
        barcode: scenario.copyId,
        status: "HELD",
        currentReservationId: scenario.reservationId,
        holdExpiresAt: expiresAt,
        createdAt: readyAt,
        updatedAt: timestamp,
      });

      add("Reservations", "reservationId", {
        reservationId: scenario.reservationId,
        entityType: "RESERVATION",
        readerId: "READER001",
        bookId: scenario.bookId,
        copyId: scenario.copyId,
        status: "READY",
        queueKey: `${readyAt}#${scenario.reservationId}`,
        readyAt,
        expiresAt,
        createdAt: readyAt,
        updatedAt: readyAt,
      });

      addLock(
        "READER001",
        scenario.bookId,
        scenario.reservationId,
        readyAt
      );

      if (scenario.hasWaiting) {
        const reservationId = "RES_WAITING_004";

        add("Reservations", "reservationId", {
          reservationId,
          entityType: "RESERVATION",
          readerId: "READER002",
          bookId: scenario.bookId,
          status: "WAITING",
          queueKey: `${waitingAt}#${reservationId}`,
          createdAt: waitingAt,
          updatedAt: waitingAt,
        });

        addLock(
          "READER002",
          scenario.bookId,
          reservationId,
          waitingAt
        );
      }
    }

    await docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          ...["READER001", "READER002"].map((readerId) => ({
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
          })),

          ...records.map((record) => ({
            Put: {
              TableName: record.table,
              Item: record.item,
              ConditionExpression: "attribute_not_exists(#id)",
              ExpressionAttributeNames: {
                "#id": record.key,
              },
            },
          })),
        ],
      })
    );

    saved = true;
    console.log("Da tao 2 tinh huong het han giu sach!");

    const inspected = records.filter(
      (record) => record.item.entityType !== "RESERVATION_LOCK"
    );

    const result = await docClient.send(
      new TransactGetCommand({
        TransactItems: inspected.map((record) => ({
          Get: {
            TableName: record.table,
            Key: {
              [record.key]: record.item[record.key],
            },
          },
        })),
      })
    );

    const stored = result.Responses.map((response, index) => ({
      table: inspected[index].table,
      item: response.Item,
    }));

    console.table(
      stored
        .filter((record) => record.table === "Books")
        .map(({ item }) => ({
          bookId: item.bookId,
          available: item.availableCopies,
          held: item.heldCopies,
          waiting: item.waitingReservationCount,
        }))
    );

    console.table(
      stored
        .filter((record) => record.table === "Reservations")
        .map(({ item }) => ({
          reservationId: item.reservationId,
          readerId: item.readerId,
          status: item.status,
        }))
    );

    const expiredReservation = stored.find(
      (record) =>
        record.table === "Reservations" &&
        record.item.status === "READY"
    ).item;

    console.log(
      "Han giu gia lap da qua (gio Viet Nam):",
      new Date(expiredReservation.expiresAt).toLocaleString(
        "vi-VN",
        {
          timeZone: "Asia/Ho_Chi_Minh",
          hour12: false,
        }
      )
    );
  } catch (error) {
    console.error(
      saved
        ? "Du lieu da luu, nhung doc lai ket qua bi loi."
        : "Chua hoan tat tao du lieu mau."
    );

    console.error(error.message);

    if (error.name === "TransactionCanceledException") {
      console.error(
        "Kiem tra ma mau da ton tai hoac tai khoan " +
        "doc gia khong con ACTIVE. Script khong ghi de."
      );
    }

    process.exitCode = 1;
  } finally {
    client.destroy();
  }
}

seedExpiredHoldsDemo();