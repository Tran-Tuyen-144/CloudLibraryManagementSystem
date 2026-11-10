const {
  QueryCommand,
  GetCommand,
  UpdateCommand,
} = require("@aws-sdk/lib-dynamodb");

const { client, docClient } = require("../config/db");

const readerId = "READER001";

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

async function getNotifications() {
  const notices = new Map();
  let lastKey;

  do {
    const result = await docClient.send(
      new QueryCommand({
        TableName: "Notifications",
        IndexName: "ByReader",
        KeyConditionExpression: "readerId = :reader",
        ExpressionAttributeValues: {
          ":reader": readerId,
        },
        ScanIndexForward: false,
        ExclusiveStartKey: lastKey,
      })
    );

    for (const candidate of result.Items || []) {
      // Đọc lại bảng chính để lấy trạng thái đọc mới nhất.
      const item = await getItem("Notifications", {
        notificationId: candidate.notificationId,
      });

      if (
        item?.readerId === readerId &&
        item.channel === "IN_APP"
      ) {
        notices.set(item.notificationId, item);
      }
    }

    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  return [...notices.values()].sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt)
  );
}

async function listNotifications() {
  const notices = await getNotifications();

  if (notices.length === 0) {
    console.log("Chua co thong bao trong ung dung.");
    return;
  }

  for (const [index, notice] of notices.entries()) {
    console.log(
      `\n${index + 1}. ${notice.type} | ` +
      (notice.readAt == null ? "CHUA_DOC" : "DA_DOC")
    );

    console.log("Ma thong bao:", notice.notificationId);
    console.log("Noi dung su kien:", notice.message);

    console.log(
      "Tao luc:",
      new Date(notice.createdAt).toLocaleString("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        hour12: false,
      })
    );

    if (notice.reservationId) {
      const reservation = await getItem("Reservations", {
        reservationId: notice.reservationId,
      });

      if (reservation?.readerId === readerId) {
        console.log(
          "Trang thai dat truoc hien tai:",
          reservation.status
        );
      }
    }

    if (notice.readAt != null) {
      console.log(
        "Doc luc:",
        new Date(notice.readAt).toLocaleString("vi-VN", {
          timeZone: "Asia/Ho_Chi_Minh",
          hour12: false,
        })
      );
    }
  }

  const unreadCount = notices.filter(
    (notice) => notice.readAt == null
  ).length;

  console.log(`\nTong thong bao: ${notices.length}`);
  console.log(`Chua doc: ${unreadCount}`);
}

async function markAllRead() {
  const notices = await getNotifications();

  const unread = notices.filter(
    (notice) => notice.readAt == null
  );

  if (unread.length === 0) {
    console.log("Khong co thong bao chua doc trong danh sach.");
    return;
  }

  let updated = 0;
  let skipped = 0;

  for (const notice of unread) {
    try {
      await docClient.send(
        new UpdateCommand({
          TableName: "Notifications",
          Key: {
            notificationId: notice.notificationId,
          },
          UpdateExpression:
            "SET readAt = :now, updatedAt = :now",
          ConditionExpression:
            "readerId = :reader AND #channel = :channel " +
            "AND (attribute_not_exists(readAt) " +
            "OR attribute_type(readAt, :nullType))",
          ExpressionAttributeNames: {
            "#channel": "channel",
          },
          ExpressionAttributeValues: {
            ":reader": readerId,
            ":channel": "IN_APP",
            ":nullType": "NULL",
            ":now": new Date().toISOString(),
          },
        })
      );

      updated += 1;
    } catch (error) {
      if (error.name === "ConditionalCheckFailedException") {
        // Mục đã thay đổi, đã đọc hoặc không còn phù hợp.
        skipped += 1;
        continue;
      }

      console.error(
        `Da danh dau ${updated} thong bao truoc khi gap loi.`
      );

      throw error;
    }
  }

  console.log(`Da danh dau da doc: ${updated} thong bao.`);

  if (skipped > 0) {
    console.log(`Bo qua do du lieu da thay doi: ${skipped}.`);
  }
}

async function main() {
  try {
    const actions = {
      list: listNotifications,
      "read-all": markAllRead,
    };

    const action = process.argv[2];

    if (
      process.argv.length !== 3 ||
      !Object.hasOwn(actions, action)
    ) {
      throw new Error(
        "Cach dung: node notifications/notifications-demo.js " +
        "list|read-all"
      );
    }

    await actions[action]();
  } catch (error) {
    console.error("Khong hoan tat thao tac:", error.message);
    process.exitCode = 1;
  } finally {
    client.destroy();
  }
}

main();