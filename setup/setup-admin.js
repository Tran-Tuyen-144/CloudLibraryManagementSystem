"use strict";

const {
  GetCommand,
  PutCommand,
} = require("@aws-sdk/lib-dynamodb");

const {
  client,
  docClient,
} = require("../config/db");

const ACCOUNT_ID = "ACCOUNT_ADMIN_DEMO";

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
      "Chỉ tạo admin mẫu trong DynamoDB Local cổng 8001."
    );
  }
}

async function readAdmin() {
  const { Item } = await docClient.send(
    new GetCommand({
      TableName: "Accounts",

      Key: {
        accountId: ACCOUNT_ID,
      },

      ConsistentRead: true,
    })
  );

  if (
    Item &&
    (
      Item.accountId !== ACCOUNT_ID ||
      Item.accountKind !== "LOCAL_DEMO" ||
      !Array.isArray(Item.roles) ||
      !Item.roles.includes("ADMIN")
    )
  ) {
    throw new Error(
      "Mã ACCOUNT_ADMIN_DEMO đang được dùng " +
        "cho dữ liệu khác. Không ghi đè hoặc nâng quyền."
    );
  }

  return Item;
}

async function setupAdmin(mode) {
  if (!["preview", "run"].includes(mode)) {
    throw new Error(
      "Cách dùng: node setup/setup-admin.js preview|run"
    );
  }

  await requireLocal();

  const existing = await readAdmin();

  if (existing) {
    return {
      existed: true,
      item: existing,
    };
  }

  const at = new Date().toISOString();

  const admin = {
    accountId: ACCOUNT_ID,
    fullName: "Admin mẫu",

    roles: ["ADMIN"],
    status: "ACTIVE",
    accountKind: "LOCAL_DEMO",

    createdAt: at,
    updatedAt: at,
  };

  if (mode === "preview") {
    return {
      existed: false,
      item: admin,
    };
  }

  try {
    await docClient.send(
      new PutCommand({
        TableName: "Accounts",
        Item: admin,

        ConditionExpression:
          "attribute_not_exists(accountId)",
      })
    );

    return {
      existed: false,
      item: admin,
    };
  } catch (error) {
    if (
      error.name !==
      "ConditionalCheckFailedException"
    ) {
      throw error;
    }

    const saved = await readAdmin();

    if (!saved) {
      throw new Error(
        "Dữ liệu tài khoản vừa thay đổi. " +
          "Bà chạy preview kiểm tra lại."
      );
    }

    return {
      existed: true,
      item: saved,
    };
  }
}

async function main() {
  const [mode, ...extra] =
    process.argv.slice(2);

  if (extra.length) {
    throw new Error(
      "Lệnh chỉ nhận preview hoặc run."
    );
  }

  const result = await setupAdmin(mode);

  console.log(
    result.existed
      ? "Admin mẫu đã có. Giữ nguyên dữ liệu hiện tại."
      : mode === "preview"
        ? "Chỉ xem trước, chưa tạo tài khoản admin."
        : "Đã tạo tài khoản admin mẫu."
  );

  console.log(
    "Mã tài khoản:",
    result.item.accountId
  );

  console.log(
    "Họ tên:",
    result.item.fullName
  );

  console.log(
    "Vai trò:",
    result.item.roles.join(", ")
  );

  console.log(
    "Trạng thái:",
    result.item.status
  );
}

module.exports = {
  setupAdmin,
};

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(
        "Chưa tạo được admin mẫu:",
        error.message
      );

      process.exitCode = 1;
    })
    .finally(() => client.destroy());
}