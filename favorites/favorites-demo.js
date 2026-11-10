const {
  TransactWriteCommand,
  QueryCommand,
  GetCommand,
  DeleteCommand,
} = require("@aws-sdk/lib-dynamodb");

const { client, docClient } = require("../config/db");

// Dùng các mã mẫu đã tạo trước đó.
const readerId = "READER001";
const bookId = "BOOK001";

async function addFavorite() {
  await docClient.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          ConditionCheck: {
            TableName: "Readers",
            Key: { readerId },
            ConditionExpression: "#s = :active",
            ExpressionAttributeNames: { "#s": "status" },
            ExpressionAttributeValues: {
              ":active": "ACTIVE",
            },
          },
        },
        {
          ConditionCheck: {
            TableName: "Books",
            Key: { bookId },
            ConditionExpression: "#s = :active",
            ExpressionAttributeNames: { "#s": "status" },
            ExpressionAttributeValues: {
              ":active": "ACTIVE",
            },
          },
        },
        {
          Update: {
            TableName: "Favorites",
            Key: { readerId, bookId },
            UpdateExpression:
              "SET createdAt = if_not_exists(createdAt, :now)",
            ExpressionAttributeValues: {
              ":now": new Date().toISOString(),
            },
          },
        },
      ],
    })
  );

  console.log(`Da luu ${bookId} vao sach yeu thich cua ${readerId}.`);
}

async function listFavorites() {
  const rows = [];
  let lastKey;

  do {
    const result = await docClient.send(
      new QueryCommand({
        TableName: "Favorites",
        KeyConditionExpression: "readerId = :reader",
        ExpressionAttributeValues: {
          ":reader": readerId,
        },
        ConsistentRead: true,
        ExclusiveStartKey: lastKey,
      })
    );

    for (const favorite of result.Items || []) {
      const bookResult = await docClient.send(
        new GetCommand({
          TableName: "Books",
          Key: { bookId: favorite.bookId },
          ConsistentRead: true,
        })
      );

      const book = bookResult.Item;

      rows.push({
        readerId,
        bookId: favorite.bookId,
        title: book?.title || "(Sach khong con trong danh muc)",
        availableCopies: book?.availableCopies ?? "-",
        savedAt: favorite.createdAt,
      });
    }

    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  if (rows.length === 0) {
    console.log(`${readerId} chua co sach yeu thich.`);
    return;
  }

  console.table(rows);
  console.log(`Tong cong: ${rows.length} sach yeu thich.`);
}

async function removeFavorite() {
  const result = await docClient.send(
    new DeleteCommand({
      TableName: "Favorites",
      Key: { readerId, bookId },
      ReturnValues: "ALL_OLD",
    })
  );

  console.log(
    result.Attributes
      ? `Da bo ${bookId} khoi sach yeu thich.`
      : `${bookId} chua nam trong sach yeu thich.`
  );
}

async function main() {
  try {
    const actions = {
      add: addFavorite,
      list: listFavorites,
      remove: removeFavorite,
    };

    const action = process.argv[2];

    if (
      process.argv.length !== 3 ||
      !Object.hasOwn(actions, action)
    ) {
      throw new Error(
        "Cach dung: node favorites/favorites-demo.js " +
        "add|list|remove"
      );
    }

    await actions[action]();
  } catch (error) {
    console.error("Khong hoan tat thao tac:", error.message);

    if (error.name === "TransactionCanceledException") {
      console.error(
        "Kiem tra doc gia va sach ton tai, " +
        "dong thoi deu co trang thai ACTIVE."
      );
    }

    process.exitCode = 1;
  } finally {
    client.destroy();
  }
}

main();