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

async function listAuthorBooks(accountId, inputStatus = "ALL") {
  if (
    typeof accountId !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(accountId)
  ) {
    throw new Error("Mã tài khoản không hợp lệ.");
  }

  const status = String(inputStatus).trim().toUpperCase();

  if (
    !["ALL", "DRAFT", "PENDING_REVIEW", "ACTIVE"].includes(status)
  ) {
    throw new Error(
      "Trạng thái phải là ALL, DRAFT, PENDING_REVIEW hoặc ACTIVE."
    );
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
    !account.roles.includes("AUTHOR")
  ) {
    throw new Error(
      "Tài khoản phải đang hoạt động và có vai trò AUTHOR."
    );
  }

  const names = {
    "#owner": "ownerAccountId",
    "#source": "source",
    "#id": "bookId",
    "#title": "title",
    "#category": "category",
    "#status": "status",
    "#review": "review",
    "#created": "createdAt",
    "#updated": "updatedAt",
  };

  const values = {
    ":owner": accountId,
    ":author": "AUTHOR",
  };

  let filter = "#owner = :owner AND #source = :author";

  if (status !== "ALL") {
    filter += " AND #status = :status";
    values[":status"] = status;
  }

  const books = new Map();
  let lastKey;

  do {
    const page = await docClient.send(
      new ScanCommand({
        TableName: "Books",
        ConsistentRead: true,

        FilterExpression: filter,

        ProjectionExpression:
          "#owner, #source, #id, #title, #category, " +
          "#status, #review, #created, #updated",

        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,

        ...(lastKey ? { ExclusiveStartKey: lastKey } : {}),
      })
    );

    for (const book of page.Items || []) {
      if (
        book.ownerAccountId !== accountId ||
        book.source !== "AUTHOR" ||
        typeof book.bookId !== "string" ||
        (status !== "ALL" && book.status !== status)
      ) {
        continue;
      }

      books.set(book.bookId, {
        bookId: book.bookId,
        title: book.title ?? "",
        category: book.category ?? "",
        status: book.status,

        reasonToFix:
          book.status === "DRAFT" &&
          book.review?.decision === "CHANGES_REQUESTED"
            ? book.review.reason ?? null
            : null,

        createdAt: book.createdAt ?? null,
        updatedAt: book.updatedAt ?? null,
      });
    }

    lastKey = page.LastEvaluatedKey;
  } while (lastKey && Object.keys(lastKey).length > 0);

  const items = [...books.values()].sort(
    (a, b) =>
      String(b.updatedAt ?? "").localeCompare(
        String(a.updatedAt ?? "")
      ) || a.bookId.localeCompare(b.bookId)
  );

  return {
    ok: true,
    accountId,
    filter: status,
    total: items.length,
    items,
  };
}

if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2);

    if (args.length < 1 || args.length > 2) {
      throw new Error(
        "Cách dùng: node authors/list-books.js ACCOUNT_ID [ALL|DRAFT|PENDING_REVIEW|ACTIVE]"
      );
    }

    const result = await listAuthorBooks(...args);
    console.log(JSON.stringify(result, null, 2));
  })()
    .catch((error) => {
      console.error("Lỗi:", error.message);
      process.exitCode = 1;
    })
    .finally(() => client.destroy());
}

module.exports = { listAuthorBooks };