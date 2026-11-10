"use strict";

const INDEXES = [
  {
    name: "ByOwner",
    pk: "ownerAccountId",
    sk: "updatedAt",
  },
  {
    name: "ByStatusUpdatedAt",
    pk: "status",
    sk: "updatedAt",
  },
];

function validateTable(table) {
  if (!table) {
    throw new Error(
      "Không đọc được cấu trúc Books."
    );
  }

  const types = new Map(
    (table.AttributeDefinitions || []).map(
      (x) => [
        x.AttributeName,
        x.AttributeType,
      ]
    )
  );

  const keys = table.KeySchema || [];

  if (
    keys.length !== 1 ||
    keys[0].AttributeName !== "bookId" ||
    keys[0].KeyType !== "HASH" ||
    types.get("bookId") !== "S"
  ) {
    throw new Error(
      "Books phải có khóa bookId kiểu String."
    );
  }

  for (const definition of INDEXES) {
    for (
      const key of
      [definition.pk, definition.sk]
    ) {
      if (
        types.has(key) &&
        types.get(key) !== "S"
      ) {
        throw new Error(
          `${key}: kiểu khóa hiện có khác String.`
        );
      }
    }

    const index = (
      table.GlobalSecondaryIndexes || []
    ).find(
      (x) => x.IndexName === definition.name
    );

    if (!index) continue;

    const matches =
      index.KeySchema?.length === 2 &&
      [
        [definition.pk, "HASH"],
        [definition.sk, "RANGE"],
      ].every(([key, type]) =>
        index.KeySchema.some(
          (x) =>
            x.AttributeName === key &&
            x.KeyType === type
        )
      );

    if (
      !matches ||
      index.Projection?.ProjectionType !== "ALL"
    ) {
      throw new Error(
        `${definition.name}: đã có nhưng ` +
          "cấu hình khác. Không ghi đè."
      );
    }
  }
}

function checkBook(book) {
  const issues = [];

  for (const [key, limit] of [
    ["ownerAccountId", 2048],
    ["status", 2048],
    ["updatedAt", 1024],
  ]) {
    const optional =
      key === "ownerAccountId" &&
      book.source !== "AUTHOR";

    if (
      optional &&
      !Object.hasOwn(book, key)
    ) {
      continue;
    }

    const value = book[key];

    if (
      typeof value !== "string" ||
      !value.trim() ||
      Buffer.byteLength(value, "utf8") > limit
    ) {
      issues.push(
        `${book.bookId}: ${key} thiếu ` +
          "hoặc không hợp lệ."
      );
    }
  }

  if (
    typeof book.updatedAt === "string" &&
    !Number.isFinite(
      Date.parse(book.updatedAt)
    )
  ) {
    issues.push(
      `${book.bookId}: updatedAt không phải ` +
        "thời gian hợp lệ."
    );
  }

  return issues;
}

async function main() {
  const [mode, ...extra] =
    process.argv.slice(2);

  if (
    !["preview", "run"].includes(mode) ||
    extra.length
  ) {
    throw new Error(
      "Cách dùng: node setup/add-book-indexes.js preview|run"
    );
  }

  const {
    DescribeTableCommand,
    UpdateTableCommand,
  } = require("@aws-sdk/client-dynamodb");

  const {
    ScanCommand,
  } = require("@aws-sdk/lib-dynamodb");

  const {
    client,
    docClient,
  } = require("../config/db");

  try {
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
        "Chỉ chạy với DynamoDB Local cổng 8001."
      );
    }

    async function describe() {
      const result = await client.send(
        new DescribeTableCommand({
          TableName: "Books",
        })
      );

      validateTable(result.Table);
      return result.Table;
    }

    function ready(table, requiredName) {
      const indexes =
        table.GlobalSecondaryIndexes || [];

      return (
        table.TableStatus === "ACTIVE" &&
        indexes.every(
          (x) => x.IndexStatus === "ACTIVE"
        ) &&
        (
          !requiredName ||
          indexes.some(
            (x) => x.IndexName === requiredName
          )
        )
      );
    }

    async function waitReady(requiredName) {
      const deadline = Date.now() + 45000;

      do {
        const table = await describe();

        if (ready(table, requiredName)) {
          return table;
        }

        await new Promise((resolve) =>
          setTimeout(resolve, 1000)
        );
      } while (Date.now() < deadline);

      throw new Error(
        "Books/chỉ mục chưa sẵn sàng. " +
          "Chạy lại preview để kiểm tra tiến độ."
      );
    }

    let table = await describe();

    if (!ready(table)) {
      if (mode === "preview") {
        throw new Error(
          "Books/chỉ mục đang cập nhật. " +
            "Chờ rồi chạy preview lại."
        );
      }

      console.log(
        "Đang chờ Books và các chỉ mục sẵn sàng..."
      );

      table = await waitReady();
    }

    // Kiểm tra dữ liệu trước khi tạo chỉ mục.
    const books = new Map();
    let lastKey;

    do {
      const result = await docClient.send(
        new ScanCommand({
          TableName: "Books",
          ConsistentRead: true,
          ExclusiveStartKey: lastKey,

          ProjectionExpression:
            "bookId, #src, ownerAccountId, #s, updatedAt",

          ExpressionAttributeNames: {
            "#src": "source",
            "#s": "status",
          },
        })
      );

      for (const book of result.Items || []) {
        books.set(book.bookId, book);
      }

      lastKey = result.LastEvaluatedKey;
    } while (
      lastKey &&
      Object.keys(lastKey).length
    );

    const issues =
      [...books.values()].flatMap(checkBook);

    if (issues.length) {
      throw new Error(issues.join("\n"));
    }

    console.log(
      `Đã kiểm tra khóa chỉ mục của ${books.size} sách.`
    );

    console.table(
      INDEXES.map((definition) => ({
        "Chỉ mục": definition.name,
        "PK": definition.pk,
        "SK": definition.sk,

        "Dự kiến": (
          table.GlobalSecondaryIndexes || []
        ).some(
          (x) =>
            x.IndexName === definition.name
        )
          ? "ĐÃ CÓ"
          : "TẠO MỚI",
      }))
    );

    if (mode === "preview") {
      console.log(
        "Chỉ xem trước, chưa tạo hoặc sửa chỉ mục."
      );
      return;
    }

    for (const definition of INDEXES) {
      table = await waitReady();

      const existing = (
        table.GlobalSecondaryIndexes || []
      ).some(
        (x) => x.IndexName === definition.name
      );

      if (existing) {
        console.log(
          `${definition.name}: đã có và đúng cấu hình.`
        );
        continue;
      }

      const attributes = new Map(
        (table.AttributeDefinitions || []).map(
          (x) => [
            x.AttributeName,
            x.AttributeType,
          ]
        )
      );

      attributes.set(definition.pk, "S");
      attributes.set(definition.sk, "S");

      const create = {
        IndexName: definition.name,

        KeySchema: [
          {
            AttributeName: definition.pk,
            KeyType: "HASH",
          },
          {
            AttributeName: definition.sk,
            KeyType: "RANGE",
          },
        ],

        Projection: {
          ProjectionType: "ALL",
        },
      };

      // Hỗ trợ bảng local có cấu hình provisioned.
      if (
        table.BillingModeSummary?.BillingMode !==
        "PAY_PER_REQUEST"
      ) {
        create.ProvisionedThroughput = {
          ReadCapacityUnits: 1,
          WriteCapacityUnits: 1,
        };
      }

      console.log(
        `Đang tạo ${definition.name}...`
      );

      await client.send(
        new UpdateTableCommand({
          TableName: "Books",

          AttributeDefinitions: [
            ...attributes,
          ].map(
            ([
              AttributeName,
              AttributeType,
            ]) => ({
              AttributeName,
              AttributeType,
            })
          ),

          GlobalSecondaryIndexUpdates: [
            { Create: create },
          ],
        })
      );

      table = await waitReady(definition.name);

      console.log(
        `${definition.name}: ACTIVE.`
      );
    }

    table = await waitReady();

    console.table(
      INDEXES.map((definition) => ({
        "Chỉ mục": definition.name,

        "Trạng thái":
          table.GlobalSecondaryIndexes.find(
            (x) =>
              x.IndexName === definition.name
          )?.IndexStatus || "THIẾU",
      }))
    );

    console.log(
      "Hoàn tất 2 chỉ mục Books. " +
        "Không sửa nội dung các bản ghi sách."
    );
  } finally {
    client.destroy();
  }
}

module.exports = {
  INDEXES,
  validateTable,
  checkBook,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(
      "Chưa hoàn tất:",
      error.message
    );

    process.exitCode = 1;
  });
}