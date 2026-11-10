"use strict";

const EXPECTED = {
  Books: {
    keys: ["bookId"],
    indexes: {},
  },

  BookCopies: {
    keys: ["copyId"],
    indexes: {
      ByBook: ["bookId", "copyId"],
    },
  },

  Readers: {
    keys: ["readerId"],
    indexes: {},
  },

  Loans: {
    keys: ["loanId"],
    indexes: {
      ByReader: ["readerId", "createdAt"],
      ByCopy: ["copyId", "createdAt"],
      ByStatusDueDate: ["status", "dueDate"],
    },
  },

  Reservations: {
    keys: ["reservationId"],
    indexes: {
      ByBook: ["bookId", "queueKey"],
      ByReader: ["readerId", "createdAt"],
      ByStatusExpiry: ["status", "expiresAt"],
    },
  },

  Accounts: {
    keys: ["accountId"],
    indexes: {},
  },

  Favorites: {
    keys: ["readerId", "bookId"],
    indexes: {},
  },

  Notifications: {
    keys: ["notificationId"],
    indexes: {
      ByReader: ["readerId", "createdAt"],
      ByDeliveryStatus: [
        "deliveryStatus",
        "nextAttemptAt",
      ],
    },
  },
};

function checkSchema(name, table) {
  const issues = [];
  const expected = EXPECTED[name];

  const types = new Map(
    (table.AttributeDefinitions || []).map(
      (x) => [
        x.AttributeName,
        x.AttributeType,
      ]
    )
  );

  function checkKeys(label, actual, keys) {
    const schema = actual || [];

    const matches =
      schema.length === keys.length &&
      keys.every((key, i) =>
        schema.some(
          (entry) =>
            entry.AttributeName === key &&
            entry.KeyType ===
              (i === 0 ? "HASH" : "RANGE")
        )
      );

    if (!matches) {
      issues.push(
        `${label}: khóa chưa đúng cấu hình.`
      );
    }

    for (const key of keys) {
      if (types.get(key) !== "S") {
        issues.push(
          `${label}: khóa ${key} phải có ` +
            "kiểu String (S)."
        );
      }
    }
  }

  if (table.TableStatus !== "ACTIVE") {
    issues.push(`${name}: bảng chưa ACTIVE.`);
  }

  checkKeys(
    name,
    table.KeySchema,
    expected.keys
  );

  for (
    const [indexName, keys] of
    Object.entries(expected.indexes)
  ) {
    const index = (
      table.GlobalSecondaryIndexes || []
    ).find((x) => x.IndexName === indexName);

    if (!index) {
      issues.push(
        `${name}: thiếu chỉ mục ${indexName}.`
      );
      continue;
    }

    const label = `${name}/${indexName}`;

    checkKeys(
      label,
      index.KeySchema,
      keys
    );

    if (index.IndexStatus !== "ACTIVE") {
      issues.push(
        `${label}: chỉ mục chưa ACTIVE.`
      );
    }

    if (
      index.Projection?.ProjectionType !== "ALL"
    ) {
      issues.push(
        `${label}: Projection phải là ALL ` +
          "theo cấu hình hiện tại."
      );
    }
  }

  return issues;
}

async function main() {
  const {
    DescribeTableCommand,
  } = require("@aws-sdk/client-dynamodb");

  const { client } = require("./config/db");

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
        "Cần dùng DynamoDB Local cổng 8001."
      );
    }

    const issues = [];
    const rows = [];
    const indexRows = [];

    const keyName = (schema, type) =>
      (schema || []).find(
        (x) => x.KeyType === type
      )?.AttributeName || "—";

    for (const name of Object.keys(EXPECTED)) {
      let table;

      try {
        const result = await client.send(
          new DescribeTableCommand({
            TableName: name,
          })
        );

        table = result.Table;

        if (!table) {
          throw new Error(
            `${name}: không nhận được cấu trúc bảng.`
          );
        }
      } catch (error) {
        if (
          error.name !==
          "ResourceNotFoundException"
        ) {
          throw error;
        }

        issues.push(
          `${name}: bảng chưa tồn tại.`
        );

        rows.push({
          "Bảng": name,
          "Kết quả": "THIẾU BẢNG",
        });

        continue;
      }

      const found = checkSchema(name, table);
      issues.push(...found);

      rows.push({
        "Bảng": name,
        "PK": keyName(table.KeySchema, "HASH"),
        "SK": keyName(table.KeySchema, "RANGE"),
        "Số GSI": (
          table.GlobalSecondaryIndexes || []
        ).length,
        "Kết quả": found.length
          ? "CẦN KIỂM TRA"
          : "OK",
      });

      for (
        const index of
        table.GlobalSecondaryIndexes || []
      ) {
        indexRows.push({
          "Bảng": name,
          "GSI": index.IndexName,
          "PK": keyName(
            index.KeySchema,
            "HASH"
          ),
          "SK": keyName(
            index.KeySchema,
            "RANGE"
          ),
          "Trạng thái": index.IndexStatus,
        });
      }
    }

    console.log("CẤU TRÚC BẢNG");
    console.table(rows);

    console.log("CÁC CHỈ MỤC HIỆN CÓ");
    console.table(indexRows);

    if (issues.length) {
      issues.forEach((message, i) => {
        console.log(`${i + 1}. ${message}`);
      });

      process.exitCode = 1;
    } else {
      console.log(
        "Khóa bảng và 9 GSI yêu cầu đều " +
          "đúng cấu hình, đang ACTIVE."
      );
    }

    console.log(
      "Chỉ đọc cấu trúc, " +
        "không sửa bảng hoặc dữ liệu."
    );
  } finally {
    client.destroy();
  }
}

module.exports = {
  EXPECTED,
  checkSchema,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(
      "Chưa kiểm tra được cấu trúc:",
      error.message
    );

    process.exitCode = 1;
  });
}