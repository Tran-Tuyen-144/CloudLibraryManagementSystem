"use strict";

const hasId = (value) =>
  typeof value === "string" && value.trim().length > 0;

function auditAccountLinks(accounts, readers) {
  const issues = [];

  const accountMap = new Map(
    accounts.map((x) => [x.accountId, x])
  );

  const readerMap = new Map(
    readers.map((x) => [x.readerId, x])
  );

  // Kiểm tra từ độc giả sang tài khoản.
  for (const reader of readers) {
    if (!hasId(reader.accountId)) {
      issues.push(
        `${reader.readerId}: chưa có accountId hợp lệ.`
      );
      continue;
    }

    const account = accountMap.get(reader.accountId);

    if (!account) {
      issues.push(
        `${reader.readerId}: không tìm thấy ${reader.accountId}.`
      );
    } else if (account.readerId !== reader.readerId) {
      issues.push(
        `${reader.readerId}: tài khoản không trỏ ngược về độc giả này.`
      );
    }
  }

  // Kiểm tra từ tài khoản sang độc giả.
  for (const account of accounts) {
    const isReader =
      Array.isArray(account.roles) &&
      account.roles.includes("READER");

    const hasLink = Object.hasOwn(account, "readerId");

    // Tác giả/admin không bắt buộc có hồ sơ độc giả.
    if (!isReader && !hasLink) continue;

    if (!isReader) {
      issues.push(
        `${account.accountId}: có readerId nhưng thiếu vai trò READER.`
      );
    }

    if (!hasId(account.readerId)) {
      issues.push(
        `${account.accountId}: chưa có readerId hợp lệ.`
      );
      continue;
    }

    const reader = readerMap.get(account.readerId);

    if (!reader) {
      issues.push(
        `${account.accountId}: không tìm thấy ${account.readerId}.`
      );
    } else if (reader.accountId !== account.accountId) {
      issues.push(
        `${account.accountId}: độc giả không trỏ ngược về tài khoản này.`
      );
    }
  }

  return issues;
}

async function main() {
  const {
    ScanCommand,
  } = require("@aws-sdk/lib-dynamodb");

  const {
    client,
    docClient,
  } = require("./config/db");

  try {
    // Chỉ chạy với database local.
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

    async function readAll(table, key) {
      const records = new Map();
      let lastKey;

      do {
        const result = await docClient.send(
          new ScanCommand({
            TableName: table,
            ConsistentRead: true,
            ExclusiveStartKey: lastKey,
          })
        );

        for (const item of result.Items || []) {
          records.set(item[key], item);
        }

        lastKey = result.LastEvaluatedKey;
      } while (
        lastKey &&
        Object.keys(lastKey).length
      );

      return [...records.values()];
    }

    const accounts = await readAll(
      "Accounts",
      "accountId"
    );

    const readers = await readAll(
      "Readers",
      "readerId"
    );

    const issues = auditAccountLinks(
      accounts,
      readers
    );

    console.log(
      `Đã đọc ${accounts.length} tài khoản ` +
      `và ${readers.length} độc giả.`
    );

    console.table(
      readers.map((reader) => ({
        readerId: reader.readerId,
        accountId: reader.accountId ?? "CHƯA CÓ",
      }))
    );

    if (issues.length) {
      console.log(
        `Có ${issues.length} điểm cần kiểm tra:`
      );

      issues.forEach((message, index) => {
        console.log(`${index + 1}. ${message}`);
      });

      process.exitCode = 1;
    } else {
      console.log(
        "Các liên kết Accounts ↔ Readers đều khớp hai chiều."
      );
    }

    console.log(
      "Chỉ kiểm tra liên kết, không thay đổi dữ liệu."
    );
  } finally {
    client.destroy();
  }
}

module.exports = { auditAccountLinks };

if (require.main === module) {
  main().catch((error) => {
    console.error(
      "Chưa kiểm tra được:",
      error.message
    );

    process.exitCode = 1;
  });
}