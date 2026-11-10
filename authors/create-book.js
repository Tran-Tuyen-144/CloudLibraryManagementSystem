"use strict";

const {
  TransactGetCommand,
  TransactWriteCommand,
} = require("@aws-sdk/lib-dynamodb");

const {
  client,
  docClient,
} = require("../config/db");

function validateInput(
  mode,
  accountId,
  bookId,
  title
) {
  if (
    !["preview", "run"].includes(mode) ||
    !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(
      accountId || ""
    ) ||
    !/^BOOK_AUTHOR_[A-Za-z0-9_-]{1,100}$/.test(
      bookId || ""
    ) ||
    typeof title !== "string" ||
    !title.trim() ||
    title.trim().length > 200 ||
    /[\u0000-\u001f\u007f]/.test(title)
  ) {
    throw new Error(
      "Cách dùng: node authors/create-book.js " +
        "preview|run MÃ_TÀI_KHOẢN BOOK_AUTHOR_MÃ_SÁCH " +
        '"Tên sách tối đa 200 ký tự"'
    );
  }
}

async function requireLocal() {
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
      "Chỉ tạo sách trong DynamoDB Local cổng 8001."
    );
  }
}

function buildDraft(account, bookId, title) {
  const at = new Date().toISOString();

  const authorName =
    account.authorProfile?.penName?.trim() ||
    account.fullName?.trim();

  if (!authorName) {
    throw new Error(
      "Hồ sơ tác giả chưa có tên hoặc bút danh."
    );
  }

  return {
    bookId,
    title: title.trim(),

    author: authorName,
    authors: [authorName],

    // Tài khoản sở hữu sách.
    ownerAccountId: account.accountId,

    source: "AUTHOR",
    status: "DRAFT",

    category: "Chưa phân loại",
    description: "",

    coverImageKey: null,
    coverUrl: null,
    firstPublishYear: null,
    sourceUrl: null,
    readUrl: null,

    // Chưa bật hình thức cung cấp sách.
    physicalEnabled: false,

    digitalAccess: {
      mode: "NONE",
      fileKey: null,
      priceVnd: null,
      currency: "VND",
    },

    totalCopies: 0,
    availableCopies: 0,
    heldCopies: 0,
    waitingReservationCount: 0,
    reservationVersion: 0,

    createdAt: at,
    updatedAt: at,
  };
}

async function createDraft(
  mode,
  accountId,
  bookId,
  title
) {
  validateInput(
    mode,
    accountId,
    bookId,
    title
  );

  await requireLocal();

  // Đọc tài khoản và mã sách trong cùng giao dịch.
  const snapshot = await docClient.send(
    new TransactGetCommand({
      TransactItems: [
        {
          Get: {
            TableName: "Accounts",
            Key: { accountId },
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

  const account =
    snapshot.Responses?.[0]?.Item;

  const existing =
    snapshot.Responses?.[1]?.Item;

  if (
    !account ||
    account.accountId !== accountId ||
    account.status !== "ACTIVE" ||
    !Array.isArray(account.roles) ||
    !account.roles.includes("AUTHOR")
  ) {
    throw new Error(
      "Cần tài khoản đang hoạt động " +
        "và có vai trò AUTHOR."
    );
  }

  if (existing) {
    if (
      existing.ownerAccountId !== accountId ||
      existing.source !== "AUTHOR"
    ) {
      throw new Error(
        "Mã sách đã được dùng cho sách khác. " +
          "Bà chọn mã mới nhé."
      );
    }

    return {
      existed: true,
      item: existing,
    };
  }

  const book = buildDraft(
    account,
    bookId,
    title
  );

  if (mode === "preview") {
    return {
      existed: false,
      item: book,
    };
  }

  // Kiểm tra quyền và tạo sách trong cùng giao dịch.
  await docClient.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          ConditionCheck: {
            TableName: "Accounts",

            Key: { accountId },

            ConditionExpression:
              "attribute_exists(accountId) AND " +
              "#s = :active AND " +
              "contains(#roles, :author)",

            ExpressionAttributeNames: {
              "#s": "status",
              "#roles": "roles",
            },

            ExpressionAttributeValues: {
              ":active": "ACTIVE",
              ":author": "AUTHOR",
            },
          },
        },
        {
          Put: {
            TableName: "Books",
            Item: book,

            ConditionExpression:
              "attribute_not_exists(bookId)",
          },
        },
      ],
    })
  );

  return {
    existed: false,
    item: book,
  };
}

async function main() {
  const [
    mode,
    accountId,
    bookId,
    title,
    ...extra
  ] = process.argv.slice(2);

  if (extra.length) {
    throw new Error(
      'Bà đặt tên sách trong dấu ngoặc kép "..." nhé.'
    );
  }

  const result = await createDraft(
    mode,
    accountId,
    bookId,
    title
  );

  console.log(
    result.existed
      ? "Sách đã có. Giữ nguyên dữ liệu hiện tại."
      : mode === "preview"
        ? "Chỉ xem trước, chưa tạo sách."
        : "Đã tạo sách nháp thuộc tài khoản tác giả."
  );

  console.table([
    {
      "Mã sách": result.item.bookId,
      "Tên sách": result.item.title,
      "Tác giả": result.item.author,
      "Chủ sở hữu": result.item.ownerAccountId,
      "Trạng thái": result.item.status,
      "Bản giấy": result.item.totalCopies,
    },
  ]);
}

module.exports = {
  buildDraft,
  createDraft,
};

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(
        "Chưa tạo được sách:",
        error.message
      );

      if (
        error.name ===
        "TransactionCanceledException"
      ) {
        console.error(
          "Tài khoản hoặc mã sách vừa thay đổi. " +
            "Bà chạy preview để kiểm tra lại."
        );
      }

      process.exitCode = 1;
    })
    .finally(() => client.destroy());
}