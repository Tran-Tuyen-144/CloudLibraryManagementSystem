"use strict";

const {
  TransactGetCommand,
  TransactWriteCommand,
} = require("@aws-sdk/lib-dynamodb");

const { client, docClient } = require("../config/db");

async function requireLocal() {
  const configured =
    typeof client.config.endpoint === "function"
      ? await client.config.endpoint()
      : client.config.endpoint;

  const raw = configured?.url || configured;

  const endpoint =
    typeof raw === "string" ? new URL(raw) : raw;

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
      "Lệnh này chỉ dùng với DynamoDB Local ở cổng 8001."
    );
  }
}

async function linkReaderAccount(
  mode,
  accountId,
  readerId
) {
  if (!["preview", "run"].includes(mode)) {
    throw new Error(
      "Chế độ phải là preview hoặc run."
    );
  }

  if (
    !/^ACCOUNT_READER_DEMO[A-Za-z0-9_-]{1,80}$/.test(
      accountId || ""
    ) ||
    !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(
      readerId || ""
    )
  ) {
    throw new Error(
      "Dùng mã tài khoản ACCOUNT_READER_DEMO... và mã độc giả hợp lệ."
    );
  }

  await requireLocal();

  const result = await docClient.send(
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
            TableName: "Readers",
            Key: { readerId },
          },
        },
      ],
    })
  );

  const account = result.Responses?.[0]?.Item;
  const reader = result.Responses?.[1]?.Item;

  if (
    !reader ||
    reader.readerId !== readerId ||
    reader.status !== "ACTIVE"
  ) {
    throw new Error(
      "Không tìm thấy độc giả đang hoạt động với mã này."
    );
  }

  if (
    typeof reader.updatedAt !== "string" ||
    !reader.updatedAt ||
    !Number.isSafeInteger(reader.activeLoanCount) ||
    reader.activeLoanCount < 0
  ) {
    throw new Error(
      "Độc giả thiếu phiên bản cập nhật hoặc có số phiếu mượn không hợp lệ."
    );
  }

  if (
    reader.accountId !== undefined &&
    reader.accountId !== accountId
  ) {
    throw new Error(
      "Độc giả đã có liên kết khác hoặc accountId chưa hợp lệ. Không ghi đè."
    );
  }

  if (account) {
    if (
      account.accountId !== accountId ||
      account.accountKind !== "LOCAL_DEMO" ||
      account.status !== "ACTIVE" ||
      !Array.isArray(account.roles) ||
      !account.roles.includes("READER") ||
      typeof account.updatedAt !== "string" ||
      !account.updatedAt
    ) {
      throw new Error(
        "Tài khoản có sẵn phải là tài khoản mẫu ACTIVE có vai trò READER."
      );
    }

    if (
      account.readerId !== undefined &&
      account.readerId !== readerId
    ) {
      throw new Error(
        "Tài khoản đã liên kết với độc giả khác. Không ghi đè."
      );
    }
  }

  const unchanged =
    account?.readerId === readerId &&
    reader.accountId === accountId;

  const output = {
    ok: true,

    action: unchanged
      ? "UNCHANGED"
      : mode === "preview"
        ? "PREVIEW"
        : "LINKED",

    accountId,
    readerId,
    roles: account?.roles ?? ["READER"],
    activeLoanCount: reader.activeLoanCount,
  };

  if (unchanged || mode === "preview") {
    return output;
  }

  const timestamp = new Date().toISOString();

  const accountWrite = account
    ? {
        Update: {
          TableName: "Accounts",
          Key: { accountId },

          UpdateExpression:
            "SET #r = :reader, #u = :now",

          ConditionExpression:
            "#kind = :demo AND #s = :active " +
            "AND contains(#roles, :role) " +
            "AND #u = :old " +
            "AND (attribute_not_exists(#r) OR #r = :reader)",

          ExpressionAttributeNames: {
            "#r": "readerId",
            "#u": "updatedAt",
            "#kind": "accountKind",
            "#s": "status",
            "#roles": "roles",
          },

          ExpressionAttributeValues: {
            ":reader": readerId,
            ":now": timestamp,
            ":old": account.updatedAt,
            ":demo": "LOCAL_DEMO",
            ":active": "ACTIVE",
            ":role": "READER",
          },
        },
      }
    : {
        Put: {
          TableName: "Accounts",

          Item: {
            accountId,
            readerId,
            accountKind: "LOCAL_DEMO",
            fullName: reader.fullName ?? "Độc giả mẫu",
            email: reader.email ?? null,
            roles: ["READER"],
            status: "ACTIVE",
            createdAt: timestamp,
            updatedAt: timestamp,
          },

          ConditionExpression:
            "attribute_not_exists(accountId)",
        },
      };

  try {
    await docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          accountWrite,

          {
            Update: {
              TableName: "Readers",
              Key: { readerId },

              UpdateExpression:
                "SET #a = :account, #u = :now",

              ConditionExpression:
                "attribute_exists(readerId) " +
                "AND #s = :active AND #u = :old " +
                "AND (attribute_not_exists(#a) OR #a = :account)",

              ExpressionAttributeNames: {
                "#a": "accountId",
                "#u": "updatedAt",
                "#s": "status",
              },

              ExpressionAttributeValues: {
                ":account": accountId,
                ":now": timestamp,
                ":old": reader.updatedAt,
                ":active": "ACTIVE",
              },
            },
          },
        ],
      })
    );
  } catch (error) {
    if (
      error.name === "TransactionCanceledException"
    ) {
      throw new Error(
        "Dữ liệu đã thay đổi hoặc không còn đủ điều kiện. Chạy preview lại trước khi liên kết."
      );
    }

    throw error;
  }

  return output;
}

if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2);

    if (args.length !== 3) {
      throw new Error(
        "Cách dùng: node setup/link-reader-account.js preview|run ACCOUNT_READER_DEMO001 READER001"
      );
    }

    const result = await linkReaderAccount(...args);

    console.log(JSON.stringify(result, null, 2));
  })()
    .catch((error) => {
      console.error("Lỗi:", error.message);
      process.exitCode = 1;
    })
    .finally(() => client.destroy());
}

module.exports = { linkReaderAccount };