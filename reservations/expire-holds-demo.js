"use strict";

const HOUR = 60 * 60 * 1000;

function requireValue(ok, message) {
  if (!ok) throw new Error(message);
}

function canonicalTime(value) {
  const time = Date.parse(value);

  return (
    Number.isFinite(time) &&
    new Date(time).toISOString() === value
  );
}

function lockId(readerId, bookId) {
  return `ACTIVE#${readerId}#${bookId}`;
}

// Chỉ dịch khi hiển thị, không thay đổi mã lưu trong database.
function tenTrangThai(status) {
  const labels = {
    ACTIVE: "Đang hoạt động",
    WAITING: "Đang chờ sách",
    READY: "Chờ đến nhận sách",
    HELD: "Đang được giữ",
    AVAILABLE: "Có sẵn để mượn",
    EXPIRED: "Đã hết hạn",
    FULFILLED: "Đã nhận sách",
    CANCELLED: "Đã hủy",
    BORROWED: "Đang được mượn",
  };

  return labels[status] || status;
}

// Lập kế hoạch xử lý, chưa ghi thay đổi vào database.
function planExpiry({ expired, book, copy, lock, waiting, now }) {
  requireValue(
    now instanceof Date && Number.isFinite(now.getTime()),
    "Thời điểm xử lý không hợp lệ."
  );

  if (!expired || expired.status !== "READY") {
    return null;
  }

  requireValue(
    canonicalTime(expired.expiresAt),
    "Thời hạn giữ sách không hợp lệ."
  );

  if (Date.parse(expired.expiresAt) > now.getTime()) {
    return null;
  }

  requireValue(
    expired.entityType === "RESERVATION" &&
      typeof expired.reservationId === "string" &&
      expired.reservationId &&
      expired.readerId &&
      expired.bookId &&
      expired.copyId &&
      canonicalTime(expired.updatedAt),
    "Yêu cầu giữ sách thiếu thông tin."
  );

  requireValue(
    book &&
      book.bookId === expired.bookId &&
      book.status === "ACTIVE",
    "Đầu sách không tồn tại hoặc không còn hoạt động."
  );

  const counterFields = [
    "totalCopies",
    "availableCopies",
    "heldCopies",
    "waitingReservationCount",
    "reservationVersion",
  ];

  for (const field of counterFields) {
    requireValue(
      Number.isSafeInteger(book[field]) && book[field] >= 0,
      `Trường ${field} phải là số nguyên không âm.`
    );
  }

  requireValue(
    book.heldCopies > 0 &&
      book.availableCopies + book.heldCopies <= book.totalCopies &&
      book.reservationVersion < Number.MAX_SAFE_INTEGER,
    "Số lượng sách không nhất quán."
  );

  requireValue(
    copy &&
      copy.copyId === expired.copyId &&
      copy.bookId === expired.bookId &&
      copy.status === "HELD" &&
      copy.currentReservationId === expired.reservationId &&
      copy.holdExpiresAt === expired.expiresAt &&
      canonicalTime(copy.updatedAt) &&
      !Object.hasOwn(copy, "currentLoanId"),
    "Bản sách không khớp với yêu cầu giữ sách."
  );

  requireValue(
    lock &&
      lock.reservationId === lockId(expired.readerId, expired.bookId) &&
      lock.activeReservationId === expired.reservationId,
    "Bản ghi khóa giữ sách không khớp."
  );

  requireValue(
    Array.isArray(waiting) &&
      waiting.length === book.waitingReservationCount,
    "Hàng chờ vừa thay đổi hoặc số đếm không khớp. Bà chạy lại nhé."
  );

  const readers = new Set();
  const ids = new Set();

  for (const item of waiting) {
    requireValue(
      item.entityType === "RESERVATION" &&
        item.status === "WAITING" &&
        item.bookId === book.bookId &&
        item.readerId &&
        typeof item.reservationId === "string" &&
        item.reservationId &&
        item.queueKey === `${item.createdAt}#${item.reservationId}` &&
        canonicalTime(item.createdAt) &&
        canonicalTime(item.updatedAt),
      "Dữ liệu hàng chờ không hợp lệ."
    );

    requireValue(
      !readers.has(item.readerId) &&
        !ids.has(item.reservationId) &&
        item.readerId !== expired.readerId,
      "Phát hiện yêu cầu đặt trước bị trùng."
    );

    readers.add(item.readerId);
    ids.add(item.reservationId);
  }

  // Người đặt trước sớm nhất được ưu tiên.
  const queue = [...waiting].sort((a, b) => {
    if (a.queueKey < b.queueKey) return -1;
    if (a.queueKey > b.queueKey) return 1;
    return 0;
  });

  const selected = queue[0];
  const at = now.toISOString();
  const nextExpiry = new Date(now.getTime() + 48 * HOUR).toISOString();

  const next = selected
    ? {
        ...selected,
        status: "READY",
        copyId: copy.copyId,
        readyAt: at,
        expiresAt: nextExpiry,
        updatedAt: at,
      }
    : null;

  const newCopy = {
    ...copy,
    status: next ? "HELD" : "AVAILABLE",
    updatedAt: at,
  };

  if (next) {
    newCopy.currentReservationId = next.reservationId;
    newCopy.holdExpiresAt = nextExpiry;
  } else {
    delete newCopy.currentReservationId;
    delete newCopy.holdExpiresAt;
  }

  const newBook = {
    ...book,
    availableCopies: book.availableCopies + (next ? 0 : 1),
    heldCopies: book.heldCopies - (next ? 0 : 1),
    waitingReservationCount:
      book.waitingReservationCount - (next ? 1 : 0),
    reservationVersion: book.reservationVersion + 1,
    updatedAt: at,
  };

  const notifications = [
    {
      notificationId: `RES_EXPIRED#${expired.reservationId}`,
      readerId: expired.readerId,
      bookId: book.bookId,
      copyId: copy.copyId,
      reservationId: expired.reservationId,
      type: "RESERVATION_EXPIRED",
      message:
        `Thời hạn nhận ${book.title || book.bookId} đã hết. ` +
        "Yêu cầu giữ sách đã kết thúc.",
      expiresAt: expired.expiresAt,
    },
  ];

  if (next) {
    notifications.push({
      notificationId: `RES_READY#${next.reservationId}`,
      readerId: next.readerId,
      bookId: book.bookId,
      copyId: copy.copyId,
      reservationId: next.reservationId,
      type: "RESERVATION_READY",
      message:
        `${book.title || book.bookId} ` +
        "đã được giữ cho bạn trong 48 giờ.",
      expiresAt: nextExpiry,
    });
  }

  return {
    original: {
      expired,
      book,
      copy,
      lock,
      selected,
    },
    at,
    expired: {
      ...expired,
      status: "EXPIRED",
      expiredAt: at,
      updatedAt: at,
    },
    book: newBook,
    copy: newCopy,
    next,
    notifications: notifications.map((item) => ({
      ...item,
      channel: "IN_APP",
      deliveryStatus: "STORED",
      readAt: null,
      createdAt: at,
      updatedAt: at,
    })),
  };
}

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

function check(table, key, condition, values, names) {
  return {
    ConditionCheck: {
      TableName: table,
      Key: key,
      ConditionExpression: condition,
      ExpressionAttributeValues: values,
      ...(names ? { ExpressionAttributeNames: names } : {}),
    },
  };
}

// Gộp các thay đổi thành một giao dịch.
function buildTransactions(plan) {
  const {
    expired: old,
    book,
    copy,
    selected,
  } = plan.original;

  const copyValues = {
    ":newStatus": plan.copy.status,
    ":held": "HELD",
    ":book": book.bookId,
    ":old": old.reservationId,
    ":oldExpiry": old.expiresAt,
    ":copyVersion": copy.updatedAt,
    ":now": plan.at,
  };

  let copyExpression = "SET #s = :newStatus, updatedAt = :now ";

  if (plan.next) {
    copyExpression +=
      ", currentReservationId = :next, holdExpiresAt = :newExpiry";

    copyValues[":next"] = plan.next.reservationId;
    copyValues[":newExpiry"] = plan.next.expiresAt;
  } else {
    copyExpression +=
      "REMOVE currentReservationId, holdExpiresAt";
  }

  const items = [
    update(
      "Reservations",
      { reservationId: old.reservationId },
      "SET #s = :expired, expiredAt = :now, updatedAt = :now",
      "#s = :ready AND expiresAt = :expiry " +
        "AND expiresAt <= :now AND updatedAt = :version " +
        "AND readerId = :reader AND bookId = :book AND copyId = :copy",
      {
        ":expired": "EXPIRED",
        ":ready": "READY",
        ":expiry": old.expiresAt,
        ":version": old.updatedAt,
        ":reader": old.readerId,
        ":book": old.bookId,
        ":copy": old.copyId,
        ":now": plan.at,
      },
      { "#s": "status" }
    ),

    {
      Delete: {
        TableName: "Reservations",
        Key: {
          reservationId: lockId(old.readerId, old.bookId),
        },
        ConditionExpression: "activeReservationId = :id",
        ExpressionAttributeValues: {
          ":id": old.reservationId,
        },
      },
    },

    update(
      "BookCopies",
      { copyId: copy.copyId },
      copyExpression,
      "#s = :held AND bookId = :book " +
        "AND currentReservationId = :old " +
        "AND holdExpiresAt = :oldExpiry " +
        "AND updatedAt = :copyVersion " +
        "AND attribute_not_exists(currentLoanId)",
      copyValues,
      { "#s": "status" }
    ),

    update(
      "Books",
      { bookId: book.bookId },
      "SET availableCopies = :available, heldCopies = :held, " +
        "waitingReservationCount = :waiting, " +
        "reservationVersion = :newVersion, updatedAt = :now",
      "#s = :active AND reservationVersion = :oldVersion " +
        "AND availableCopies = :oldAvailable " +
        "AND heldCopies = :oldHeld " +
        "AND waitingReservationCount = :oldWaiting " +
        "AND totalCopies = :total",
      {
        ":active": "ACTIVE",
        ":available": plan.book.availableCopies,
        ":held": plan.book.heldCopies,
        ":waiting": plan.book.waitingReservationCount,
        ":newVersion": plan.book.reservationVersion,
        ":oldVersion": book.reservationVersion,
        ":oldAvailable": book.availableCopies,
        ":oldHeld": book.heldCopies,
        ":oldWaiting": book.waitingReservationCount,
        ":total": book.totalCopies,
        ":now": plan.at,
      },
      { "#s": "status" }
    ),
  ];

  if (plan.next) {
    const next = plan.next;

    items.push(
      check(
        "Readers",
        { readerId: next.readerId },
        "#s = :active",
        { ":active": "ACTIVE" },
        { "#s": "status" }
      ),

      check(
        "Reservations",
        {
          reservationId: lockId(next.readerId, next.bookId),
        },
        "activeReservationId = :id",
        { ":id": next.reservationId }
      ),

      update(
        "Reservations",
        { reservationId: next.reservationId },
        "SET #s = :ready, copyId = :copy, readyAt = :now, " +
          "expiresAt = :expiry, updatedAt = :now",
        "#s = :waiting AND readerId = :reader " +
          "AND bookId = :book AND queueKey = :queue " +
          "AND updatedAt = :version",
        {
          ":ready": "READY",
          ":waiting": "WAITING",
          ":reader": next.readerId,
          ":book": next.bookId,
          ":queue": selected.queueKey,
          ":version": selected.updatedAt,
          ":copy": next.copyId,
          ":expiry": next.expiresAt,
          ":now": plan.at,
        },
        { "#s": "status" }
      )
    );
  }

  for (const item of plan.notifications) {
    items.push({
      Put: {
        TableName: "Notifications",
        Item: item,
        ConditionExpression: "attribute_not_exists(notificationId)",
      },
    });
  }

  return items;
}

// Kiểm tra đúng kết nối DynamoDB Local.
async function requireLocal(client) {
  requireValue(
    client.config.endpoint,
    "File này chỉ chạy với kết nối DynamoDB Local."
  );

  const configured =
    typeof client.config.endpoint === "function"
      ? await client.config.endpoint()
      : client.config.endpoint;

  const endpoint = configured.url || configured;

  requireValue(
    ["127.0.0.1", "localhost", "[::1]", "::1"].includes(
      endpoint.hostname
    ) &&
      String(endpoint.port) === "8001" &&
      endpoint.protocol === "http:",
    "Cần dùng DynamoDB Local tại cổng 8001."
  );
}

async function main() {
  const {
    ScanCommand,
    GetCommand,
    TransactGetCommand,
    TransactWriteCommand,
  } = require("@aws-sdk/lib-dynamodb");

  const { client, docClient } = require("../config/db");

  let completed = 0;
  let skipped = 0;
  let failures = 0;
  let noticeCount = 0;

  try {
    const mode = process.argv[2] || "preview";

    requireValue(
      process.argv.length <= 3 &&
        ["preview", "run"].includes(mode),
      "Cách dùng: node reservations/expire-holds-demo.js preview|run"
    );

    await requireLocal(client);

    async function scan(filter, values) {
      const records = new Map();
      let lastKey;

      do {
        const result = await docClient.send(
          new ScanCommand({
            TableName: "Reservations",
            ConsistentRead: true,
            FilterExpression: filter,
            ExpressionAttributeNames: {
              "#s": "status",
            },
            ExpressionAttributeValues: values,
            ExclusiveStartKey: lastKey,
          })
        );

        for (const item of result.Items || []) {
          records.set(item.reservationId, item);
        }

        lastKey = result.LastEvaluatedKey;
      } while (lastKey);

      return [...records.values()];
    }

    const cutoff = new Date().toISOString();

    const candidates = await scan(
      "entityType = :type AND #s = :ready AND expiresAt <= :now",
      {
        ":type": "RESERVATION",
        ":ready": "READY",
        ":now": cutoff,
      }
    );

    console.log(
      "Chế độ:",
      mode === "preview" ? "Xem trước" : "Thực hiện"
    );

    console.log(
      "Số yêu cầu giữ sách đã hết hạn:",
      candidates.length
    );

    if (!candidates.length) {
      console.log("Không có yêu cầu cần xử lý.");
      return;
    }

    for (const hint of candidates) {
      let committed = false;

      try {
        requireValue(
          hint.bookId && hint.copyId && hint.readerId,
          "Yêu cầu hết hạn thiếu thông tin."
        );

        const keys = [
          {
            TableName: "Reservations",
            Key: { reservationId: hint.reservationId },
          },
          {
            TableName: "Books",
            Key: { bookId: hint.bookId },
          },
          {
            TableName: "BookCopies",
            Key: { copyId: hint.copyId },
          },
          {
            TableName: "Reservations",
            Key: {
              reservationId: lockId(hint.readerId, hint.bookId),
            },
          },
        ];

        const snapshot = await docClient.send(
          new TransactGetCommand({
            TransactItems: keys.map((Get) => ({ Get })),
          })
        );

        const [expired, book, copy, lock] =
          snapshot.Responses.map((row) => row.Item);

        const waiting = await scan(
          "entityType = :type AND #s = :waiting AND bookId = :book",
          {
            ":type": "RESERVATION",
            ":waiting": "WAITING",
            ":book": hint.bookId,
          }
        );

        const plan = planExpiry({
          expired,
          book,
          copy,
          lock,
          waiting,
          now: new Date(),
        });

        if (!plan) {
          skipped += 1;
          continue;
        }

        if (plan.next) {
          const recipient = await docClient.send(
            new GetCommand({
              TableName: "Readers",
              Key: { readerId: plan.next.readerId },
              ConsistentRead: true,
            })
          );

          requireValue(
            recipient.Item?.status === "ACTIVE",
            "Tài khoản người đứng đầu hàng chờ không hoạt động. " +
              "Cần xử lý tài khoản trước."
          );
        }

        console.log(`\nĐầu sách: ${book.bookId}`);
        console.log("Yêu cầu hết hạn:", expired.reservationId);

        if (mode === "preview") {
          console.table([
            {
              "Mã sách": book.bookId,
              "Trạng thái dự kiến": tenTrangThai(plan.copy.status),
              "Có sẵn": plan.book.availableCopies,
              "Đang giữ": plan.book.heldCopies,
              "Đang chờ": plan.book.waitingReservationCount,
              "Độc giả tiếp theo":
                plan.next?.readerId || "Không có",
            },
          ]);

          console.log(
            "Số thông báo dự kiến tạo:",
            plan.notifications.length
          );

          continue;
        }

        await docClient.send(
          new TransactWriteCommand({
            TransactItems: buildTransactions(plan),
          })
        );

        committed = true;
        completed += 1;
        noticeCount += plan.notifications.length;

        console.log("Đã lưu giao dịch xử lý hết hạn.");

        const verifyKeys = [
          {
            TableName: "Books",
            Key: { bookId: book.bookId },
          },
          {
            TableName: "BookCopies",
            Key: { copyId: copy.copyId },
          },
          {
            TableName: "Reservations",
            Key: { reservationId: expired.reservationId },
          },
          ...(plan.next
            ? [
                {
                  TableName: "Reservations",
                  Key: {
                    reservationId: plan.next.reservationId,
                  },
                },
              ]
            : []),
        ];

        const verification = await docClient.send(
          new TransactGetCommand({
            TransactItems: verifyKeys.map((Get) => ({ Get })),
          })
        );

        const [savedBook, savedCopy, savedExpired, savedNext] =
          verification.Responses.map((row) => row.Item);

        console.table([
          {
            "Mã sách": savedBook.bookId,
            "Yêu cầu cũ": tenTrangThai(savedExpired.status),
            "Bản sách": tenTrangThai(savedCopy.status),
            "Có sẵn": savedBook.availableCopies,
            "Đang giữ": savedBook.heldCopies,
            "Đang chờ": savedBook.waitingReservationCount,
            "Độc giả tiếp theo":
              savedNext?.readerId || "Không có",
          },
        ]);

        if (savedNext) {
          const deadline = new Date(
            savedNext.expiresAt
          ).toLocaleString("vi-VN", {
            timeZone: "Asia/Ho_Chi_Minh",
            hour12: false,
          });

          console.log("Hạn nhận sách mới, giờ Việt Nam:", deadline);
        }
      } catch (error) {
        failures += 1;

        console.error(
          committed
            ? "Giao dịch đã lưu nhưng đọc lại kết quả bị lỗi:"
            : "Chưa xử lý được yêu cầu:",
          hint.reservationId
        );

        console.error("Chi tiết:", error.message);

        if (error.name === "TransactionCanceledException") {
          console.error(
            "Giao dịch bị hủy do điều kiện dữ liệu hoặc xung đột. " +
              "Bà kiểm tra dữ liệu rồi chạy lại nhé. " +
              "Yêu cầu đã hết hạn và được xử lý thành công " +
              "sẽ không bị xử lý lặp."
          );
        }
      }
    }

    if (mode === "preview") {
      console.log("\nĐang xem trước, chưa ghi thay đổi vào database.");

      if (failures) {
        console.log("Số lỗi khi xem trước:", failures);
      }
    } else {
      console.log("\nKết quả xử lý:");
      console.log("Số yêu cầu đã xử lý:", completed);
      console.log("Số yêu cầu bỏ qua:", skipped);
      console.log("Số thông báo đã lưu:", noticeCount);
      console.log("Số lỗi:", failures);
    }

    if (failures) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error("Không hoàn tất tác vụ:", error.message);
    process.exitCode = 1;
  } finally {
    client.destroy();
  }
}

module.exports = {
  planExpiry,
  buildTransactions,
  requireLocal,
};

if (require.main === module) {
  main().catch((error) => {
    console.error("Có lỗi khi chạy chương trình:", error.message);
    process.exitCode = 1;
  });
}