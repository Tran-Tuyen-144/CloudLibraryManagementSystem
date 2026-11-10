"use strict";

function validateInput(bookId, copyIds) {
  const validId = (x) =>
    typeof x === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(x);

  if (
    !validId(bookId) ||
    !Array.isArray(copyIds) ||
    copyIds.length < 1 ||
    copyIds.length > 20 ||
    !copyIds.every(validId)
  ) {
    throw new Error(
      "Cần một mã đầu sách và từ 1 đến 20 mã bản sách hợp lệ."
    );
  }

  if (new Set(copyIds).size !== copyIds.length) {
    throw new Error(
      "Các mã bản sách trong cùng lệnh không được trùng nhau."
    );
  }
}

function planAddition(
  bookId,
  copyIds,
  book,
  existing,
  at
) {
  validateInput(bookId, copyIds);

  if (
    !book ||
    book.bookId !== bookId ||
    book.status !== "ACTIVE"
  ) {
    throw new Error(
      "Đầu sách không tồn tại hoặc không hoạt động."
    );
  }

  if (
    existing.length !== copyIds.length ||
    existing.some(
      (item, i) =>
        item &&
        (
          item.copyId !== copyIds[i] ||
          item.bookId !== bookId
        )
    )
  ) {
    throw new Error(
      "Có mã bản sách thuộc đầu sách khác. " +
        "Bà chọn mã mới nhé."
    );
  }

  const found = existing.filter(Boolean).length;

  if (found === copyIds.length) {
    return {
      created: false,
      book,
      copies: existing,
    };
  }

  if (found) {
    throw new Error(
      "Một số mã bản sách đã tồn tại. " +
        "Chỉ nhập các mã chưa có trong kho."
    );
  }

  const held = book.heldCopies ?? 0;
  const waiting = book.waitingReservationCount ?? 0;

  if (
    ![
      book.totalCopies,
      book.availableCopies,
      held,
      waiting,
    ].every(
      (x) => Number.isSafeInteger(x) && x >= 0
    ) ||
    book.availableCopies + held > book.totalCopies ||
    !Number.isSafeInteger(
      book.totalCopies + copyIds.length
    )
  ) {
    throw new Error(
      "Số lượng sách không hợp lệ. " +
        "Cần kiểm tra dữ liệu trước."
    );
  }

  if (waiting > 0) {
    throw new Error(
      "Đầu sách đang có người chờ. " +
        "Cần xử lý cấp sách cho hàng chờ khi nhập kho."
    );
  }

  return {
    created: true,
    original: book,

    book: {
      ...book,
      totalCopies:
        book.totalCopies + copyIds.length,
      availableCopies:
        book.availableCopies + copyIds.length,
      updatedAt: at,
    },

    copies: copyIds.map((copyId) => ({
      copyId,
      bookId,
      barcode: copyId,
      status: "AVAILABLE",
      createdAt: at,
      updatedAt: at,
    })),
  };
}

// Thêm các bản sách và tăng số lượng trong cùng giao dịch.
function buildTransaction(plan) {
  if (!plan.created) {
    throw new Error(
      "Các bản sách đã tồn tại, không cần ghi thêm."
    );
  }

  return [
    {
      Update: {
        TableName: "Books",

        Key: {
          bookId: plan.book.bookId,
        },

        UpdateExpression:
          "SET totalCopies = totalCopies + :count, " +
          "availableCopies = availableCopies + :count, " +
          "updatedAt = :now",

        ConditionExpression:
          "#s = :active " +
          "AND totalCopies = :oldTotal " +
          "AND availableCopies = :oldAvailable " +
          "AND (attribute_not_exists(waitingReservationCount) " +
          "OR waitingReservationCount = :zero)",

        ExpressionAttributeNames: {
          "#s": "status",
        },

        ExpressionAttributeValues: {
          ":active": "ACTIVE",
          ":count": plan.copies.length,
          ":oldTotal": plan.original.totalCopies,
          ":oldAvailable":
            plan.original.availableCopies,
          ":zero": 0,
          ":now": plan.book.updatedAt,
        },
      },
    },

    ...plan.copies.map((copy) => ({
      Put: {
        TableName: "BookCopies",
        Item: copy,
        ConditionExpression:
          "attribute_not_exists(copyId)",
      },
    })),
  ];
}

async function requireLocal(client) {
  const configured =
    typeof client.config.endpoint === "function"
      ? await client.config.endpoint()
      : client.config.endpoint;

  const endpoint = configured?.url || configured;

  if (
    !endpoint ||
    endpoint.protocol !== "http:" ||
    ![
      "127.0.0.1",
      "localhost",
      "[::1]",
      "::1",
    ].includes(endpoint.hostname) ||
    String(endpoint.port) !== "8001"
  ) {
    throw new Error(
      "Chỉ thêm bản sách vào DynamoDB Local tại cổng 8001."
    );
  }
}

async function main() {
  const [
    mode,
    bookId,
    ...copyIds
  ] = process.argv.slice(2);

  if (!["preview", "run"].includes(mode)) {
    throw new Error(
      "Cách dùng: node copies/add-copies.js " +
        "preview|run MÃ_ĐẦU_SÁCH MÃ_BẢN_1 MÃ_BẢN_2"
    );
  }

  validateInput(bookId, copyIds);

  const {
    TransactGetCommand,
    TransactWriteCommand,
  } = require("@aws-sdk/lib-dynamodb");

  const {
    client,
    docClient,
  } = require("../config/db");

  try {
    await requireLocal(client);

    const keys = [
      {
        TableName: "Books",
        Key: { bookId },
      },

      ...copyIds.map((copyId) => ({
        TableName: "BookCopies",
        Key: { copyId },
      })),
    ];

    const snapshot = await docClient.send(
      new TransactGetCommand({
        TransactItems: keys.map(
          (Get) => ({ Get })
        ),
      })
    );

    const [book, ...existing] =
      snapshot.Responses.map(
        (row) => row.Item
      );

    const plan = planAddition(
      bookId,
      copyIds,
      book,
      existing,
      new Date().toISOString()
    );

    console.log("Đầu sách:", plan.book.title);

    if (!plan.created) {
      console.log(
        "Tất cả mã bản sách đã tồn tại. " +
          "Không tăng số lượng lần nữa."
      );

      return;
    }

    if (mode === "preview") {
      console.log(
        "Chỉ xem trước, chưa thêm bản sách."
      );
    } else {
      await docClient.send(
        new TransactWriteCommand({
          TransactItems:
            buildTransaction(plan),
        })
      );

      console.log(
        `Đã thêm ${plan.copies.length} bản sách vào kho.`
      );
    }

    console.table(
      plan.copies.map((copy) => ({
        "Mã bản sách": copy.copyId,
        "Mã vạch": copy.barcode,
        "Trạng thái": "Có sẵn để mượn",
      }))
    );

    console.log(
      mode === "preview"
        ? "Số lượng dự kiến:"
        : "Số lượng sau giao dịch:"
    );

    console.table([
      {
        "Mã đầu sách": plan.book.bookId,
        "Tổng số bản": plan.book.totalCopies,
        "Có sẵn": plan.book.availableCopies,
      },
    ]);
  } finally {
    client.destroy();
  }
}

module.exports = {
  validateInput,
  planAddition,
  buildTransaction,
  requireLocal,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(
      "Không hoàn tất thao tác thêm bản sách:",
      error.message
    );

    if (
      error.name === "TransactionCanceledException"
    ) {
      console.error(
        "Dữ liệu vừa thay đổi hoặc mã bản sách " +
          "đã được dùng. Bà kiểm tra và chạy lại nhé."
      );
    }

    process.exitCode = 1;
  });
}