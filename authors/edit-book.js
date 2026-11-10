"use strict";

const {
  TransactGetCommand,
  TransactWriteCommand,
} = require("@aws-sdk/lib-dynamodb");

const {
  client,
  docClient,
} = require("../config/db");

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
      "Chỉ sửa sách trong DynamoDB Local cổng 8001."
    );
  }
}

function validateInput(
  mode,
  accountId,
  bookId,
  title,
  category,
  description
) {
  const validId = (value) =>
    typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value);

  const shortText = (value, max) =>
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= max &&
    !/[\u0000-\u001f\u007f]/.test(value);

  if (
    !["preview", "run"].includes(mode) ||
    !validId(accountId) ||
    !validId(bookId) ||
    !shortText(title, 200) ||
    !shortText(category, 100) ||
    typeof description !== "string" ||
    description.trim().length > 5000 ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(
      description
    )
  ) {
    throw new Error(
      "Cách dùng: node authors/edit-book.js " +
        "preview|run MÃ_TÀI_KHOẢN MÃ_SÁCH " +
        '"Tên sách" "Thể loại" "Mô tả"'
    );
  }

  return {
    title: title.trim(),
    category: category.trim(),
    description: description.trim(),
  };
}

async function editDraft(
  mode,
  accountId,
  bookId,
  title,
  category,
  description
) {
  const patch = validateInput(
    mode,
    accountId,
    bookId,
    title,
    category,
    description
  );

  await requireLocal();

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

  const book =
    snapshot.Responses?.[1]?.Item;

  if (
    !account ||
    account.accountId !== accountId ||
    account.status !== "ACTIVE" ||
    !Array.isArray(account.roles) ||
    !account.roles.includes("AUTHOR")
  ) {
    throw new Error(
      "Tài khoản chưa hoạt động " +
        "hoặc không có vai trò AUTHOR."
    );
  }

  if (!book || book.bookId !== bookId) {
    throw new Error("Không tìm thấy sách.");
  }

  if (
    book.source !== "AUTHOR" ||
    book.ownerAccountId !== accountId
  ) {
    throw new Error(
      "Tác giả chỉ được sửa sách " +
        "thuộc tài khoản của mình."
    );
  }

  if (book.status !== "DRAFT") {
    throw new Error(
      "Bước này chỉ hỗ trợ sửa sách " +
        "ở trạng thái DRAFT."
    );
  }

  const changed = Object.entries(patch).some(
    ([key, value]) =>
      (book[key] ?? "") !== value
  );

  if (!changed) {
    return {
      changed: false,
      item: book,
    };
  }

  const version = book.editVersion ?? 0;

  if (
    !Number.isSafeInteger(version) ||
    version < 0 ||
    version >= Number.MAX_SAFE_INTEGER ||
    typeof book.updatedAt !== "string" ||
    !book.updatedAt
  ) {
    throw new Error(
      "Phiên bản hoặc ngày cập nhật " +
        "của sách không hợp lệ."
    );
  }

  const updated = {
    ...book,
    ...patch,
    updatedAt: new Date().toISOString(),
    editVersion: version + 1,
  };

  if (mode === "preview") {
    return {
      changed: true,
      item: updated,
    };
  }

  const hasVersion = Object.hasOwn(
    book,
    "editVersion"
  );

  await docClient.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          ConditionCheck: {
            TableName: "Accounts",
            Key: { accountId },

            ConditionExpression:
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
          Update: {
            TableName: "Books",
            Key: { bookId },

            UpdateExpression:
              "SET #title = :title, " +
              "#category = :category, " +
              "#description = :description, " +
              "updatedAt = :now, #v = :next",

            ConditionExpression:
              "ownerAccountId = :owner " +
              "AND #source = :source " +
              "AND #s = :draft " +
              "AND updatedAt = :oldTime AND " +
              (
                hasVersion
                  ? "#v = :oldVersion"
                  : "attribute_not_exists(#v)"
              ),

            ExpressionAttributeNames: {
              "#title": "title",
              "#category": "category",
              "#description": "description",
              "#v": "editVersion",
              "#s": "status",
              "#source": "source",
            },

            ExpressionAttributeValues: {
              ":title": patch.title,
              ":category": patch.category,
              ":description": patch.description,
              ":now": updated.updatedAt,
              ":next": updated.editVersion,
              ":owner": accountId,
              ":source": "AUTHOR",
              ":draft": "DRAFT",
              ":oldTime": book.updatedAt,

              ...(
                hasVersion
                  ? { ":oldVersion": version }
                  : {}
              ),
            },
          },
        },
      ],
    })
  );

  return {
    changed: true,
    item: updated,
  };
}

async function main() {
  const [
    mode,
    accountId,
    bookId,
    title,
    category,
    description,
    ...extra
  ] = process.argv.slice(2);

  if (extra.length) {
    throw new Error(
      "Bà đặt tên sách, thể loại và mô tả " +
        "trong dấu ngoặc kép nhé."
    );
  }

  const result = await editDraft(
    mode,
    accountId,
    bookId,
    title,
    category,
    description
  );

  console.log(
    !result.changed
      ? "Thông tin đã giống dữ liệu hiện tại, không cần sửa."
      : mode === "preview"
        ? "Thông tin dự kiến sau khi sửa. Chưa ghi database."
        : "Đã cập nhật sách nháp của tác giả."
  );

  console.log(
    "Mã sách:",
    result.item.bookId
  );

  console.log(
    "Chủ sở hữu:",
    result.item.ownerAccountId
  );

  console.log(
    "Tên sách:",
    result.item.title
  );

  console.log(
    "Thể loại:",
    result.item.category
  );

  console.log(
    "Mô tả:",
    result.item.description
  );

  console.log(
    "Trạng thái:",
    result.item.status
  );
}

module.exports = {
  editDraft,
};

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(
        "Chưa sửa được sách:",
        error.message
      );

      if (
        error.name ===
        "TransactionCanceledException"
      ) {
        console.error(
          "Quyền tài khoản hoặc dữ liệu sách vừa thay đổi. " +
            "Bà chạy preview để kiểm tra lại."
        );
      }

      process.exitCode = 1;
    })
    .finally(() => client.destroy());
}