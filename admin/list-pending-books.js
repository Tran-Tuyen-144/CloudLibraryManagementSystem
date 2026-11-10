"use strict";

const {
  GetCommand,
  ScanCommand,
} = require("@aws-sdk/lib-dynamodb");

const { client, docClient } = require("../config/db");

async function requireLocal() {
  const endpoint = await client.config.endpoint?.();

  if (
    !endpoint ||
    endpoint.protocol !== "http:" ||
    !["127.0.0.1", "localhost"].includes(endpoint.hostname) ||
    Number(endpoint.port) !== 8001
  ) {
    throw new Error(
      "Lệnh này chỉ dùng với DynamoDB Local ở cổng 8001."
    );
  }
}

async function listPendingBooks(accountId) {
  if (
    typeof accountId !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(accountId)
  ) {
    throw new Error("Mã tài khoản không hợp lệ.");
  }

  await requireLocal();

  const { Item: account } = await docClient.send(
    new GetCommand({
      TableName: "Accounts",
      Key: { accountId },
      ConsistentRead: true,
    })
  );

  if (
    account?.status !== "ACTIVE" ||
    !Array.isArray(account.roles) ||
    !account.roles.includes("ADMIN")
  ) {
    throw new Error(
      "Tài khoản phải đang hoạt động và có vai trò ADMIN."
    );
  }

  const books = new Map();
  let lastKey;

  do {
    const page = await docClient.send(
      new ScanCommand({
        TableName: "Books",
        ConsistentRead: true,

        FilterExpression:
          "#source = :author AND #status = :pending",

        ProjectionExpression:
          "#id, #title, #author, #owner, #category, #description, " +
          "#source, #status, #submission, #version, #digital",

        ExpressionAttributeNames: {
          "#id": "bookId",
          "#title": "title",
          "#author": "author",
          "#owner": "ownerAccountId",
          "#category": "category",
          "#description": "description",
          "#source": "source",
          "#status": "status",
          "#submission": "submission",
          "#version": "editVersion",
          "#digital": "digitalAccess",
        },

        ExpressionAttributeValues: {
          ":author": "AUTHOR",
          ":pending": "PENDING_REVIEW",
        },

        ...(lastKey ? { ExclusiveStartKey: lastKey } : {}),
      })
    );

    for (const book of page.Items || []) {
      if (
        book.source !== "AUTHOR" ||
        book.status !== "PENDING_REVIEW" ||
        typeof book.bookId !== "string"
      ) {
        continue;
      }

      const digital = book.digitalAccess;

      books.set(book.bookId, {
        bookId: book.bookId,
        title: book.title ?? "",
        author: book.author ?? "",
        ownerAccountId: book.ownerAccountId ?? null,
        category: book.category ?? "",
        description: book.description ?? "",
        status: book.status,
        submittedAt: book.submission?.submittedAt ?? null,
        editVersion: book.editVersion ?? null,

        digitalAccess: {
          mode: digital?.mode ?? "NONE",
          format: digital?.format ?? null,
          priceVnd: digital?.priceVnd ?? 0,
        },
      });
    }

    lastKey = page.LastEvaluatedKey;
  } while (lastKey && Object.keys(lastKey).length > 0);

  // Sách gửi trước sẽ đứng trước.
  const items = [...books.values()].sort(
    (a, b) =>
      String(a.submittedAt ?? "").localeCompare(
        String(b.submittedAt ?? "")
      ) || a.bookId.localeCompare(b.bookId)
  );

  return {
    ok: true,
    accountId,
    status: "PENDING_REVIEW",
    total: items.length,
    items,
  };
}

if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2);

    if (args.length !== 1) {
      throw new Error(
        "Cách dùng: node admin/list-pending-books.js ACCOUNT_ADMIN_ID"
      );
    }

    const result = await listPendingBooks(args[0]);
    console.log(JSON.stringify(result, null, 2));
  })()
    .catch((error) => {
      console.error("Lỗi:", error.message);
      process.exitCode = 1;
    })
    .finally(() => client.destroy());
}

module.exports = { listPendingBooks };