"use strict";

const {
  DescribeTableCommand,
  CreateTableCommand,
  waitUntilTableExists,
} = require("@aws-sdk/client-dynamodb");

const {
  GetCommand,
  PutCommand,
} = require("@aws-sdk/lib-dynamodb");

const {
  client,
  docClient,
} = require("../config/db");

const TABLE = "Accounts";

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
      "Cần dùng DynamoDB Local cổng 8001."
    );
  }
}

async function inspectTable() {
  try {
    const result = await client.send(
      new DescribeTableCommand({
        TableName: TABLE,
      })
    );

    const table = result.Table;
    const keys = table?.KeySchema || [];

    if (
      keys.length !== 1 ||
      keys[0].AttributeName !== "accountId" ||
      keys[0].KeyType !== "HASH" ||
      !table.AttributeDefinitions?.some(
        (field) =>
          field.AttributeName === "accountId" &&
          field.AttributeType === "S"
      )
    ) {
      throw new Error(
        "Bảng Accounts đã có nhưng khóa khác " +
          "accountId kiểu chuỗi. Cần kiểm tra lại."
      );
    }

    return true;
  } catch (error) {
    if (
      error.name === "ResourceNotFoundException"
    ) {
      return false;
    }

    throw error;
  }
}

function buildAuthor() {
  const at = new Date().toISOString();

  return {
    accountId: "ACCOUNT_AUTHOR_DEMO",
    fullName: "Tác giả mẫu",

    roles: ["AUTHOR"],
    status: "ACTIVE",
    accountKind: "LOCAL_DEMO",

    authorProfile: {
      penName: "Tác giả mẫu",
      biography:
        "Hồ sơ tác giả dùng để thử chức năng local.",
    },

    createdAt: at,
    updatedAt: at,
  };
}

async function readAuthor() {
  const result = await docClient.send(
    new GetCommand({
      TableName: TABLE,

      Key: {
        accountId: "ACCOUNT_AUTHOR_DEMO",
      },

      ConsistentRead: true,
    })
  );

  if (
    !result.Item ||
    result.Item.accountKind !== "LOCAL_DEMO" ||
    !Array.isArray(result.Item.roles) ||
    !result.Item.roles.includes("AUTHOR")
  ) {
    throw new Error(
      "Mã ACCOUNT_AUTHOR_DEMO đang được dùng " +
        "cho dữ liệu khác. Không ghi đè."
    );
  }

  return result.Item;
}

async function main() {
  const [mode, ...extra] =
    process.argv.slice(2);

  if (
    !["preview", "run"].includes(mode) ||
    extra.length
  ) {
    throw new Error(
      "Cách dùng: node setup/setup-accounts.js preview|run"
    );
  }

  await requireLocal();

  const exists = await inspectTable();

  console.log(
    exists
      ? "Bảng Accounts đã có, khóa accountId hợp lệ."
      : "Cần tạo bảng Accounts với khóa accountId."
  );

  const author = buildAuthor();

  if (mode === "preview") {
    console.table([
      {
        "Mã tài khoản": author.accountId,
        "Họ tên": author.fullName,
        "Vai trò": author.roles.join(", "),
        "Trạng thái": author.status,
      },
    ]);

    console.log(
      "Chỉ xem trước, chưa tạo bảng hoặc ghi dữ liệu."
    );

    return;
  }

  if (!exists) {
    try {
      await client.send(
        new CreateTableCommand({
          TableName: TABLE,
          BillingMode: "PAY_PER_REQUEST",

          KeySchema: [
            {
              AttributeName: "accountId",
              KeyType: "HASH",
            },
          ],

          AttributeDefinitions: [
            {
              AttributeName: "accountId",
              AttributeType: "S",
            },
          ],
        })
      );
    } catch (error) {
      if (
        error.name !== "ResourceInUseException"
      ) {
        throw error;
      }
    }
  }

  await waitUntilTableExists(
    {
      client,
      maxWaitTime: 30,
      minDelay: 1,
      maxDelay: 2,
    },
    {
      TableName: TABLE,
    }
  );

  await inspectTable();

  let saved;

  try {
    await docClient.send(
      new PutCommand({
        TableName: TABLE,
        Item: author,

        ConditionExpression:
          "attribute_not_exists(accountId)",
      })
    );

    saved = author;

    console.log(
      "Đã tạo tài khoản tác giả mẫu."
    );
  } catch (error) {
    if (
      error.name !==
      "ConditionalCheckFailedException"
    ) {
      throw error;
    }

    saved = await readAuthor();

    console.log(
      "Tác giả mẫu đã có. " +
        "Giữ nguyên dữ liệu hiện tại."
    );
  }

  console.table([
    {
      "Mã tài khoản": saved.accountId,
      "Họ tên": saved.fullName,
      "Vai trò": saved.roles.join(", "),
      "Trạng thái": saved.status,
    },
  ]);
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(
        "Chưa thiết lập được Accounts:",
        error.message
      );

      process.exitCode = 1;
    })
    .finally(() => client.destroy());
}