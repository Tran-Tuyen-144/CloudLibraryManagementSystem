const {
  CreateTableCommand,
  waitUntilTableExists,
} = require("@aws-sdk/client-dynamodb");

const { client } = require("../config/db");

const tables = [
  {
    TableName: "Books",
    BillingMode: "PAY_PER_REQUEST",
    AttributeDefinitions: [
      { AttributeName: "bookId", AttributeType: "S" },
    ],
    KeySchema: [
      { AttributeName: "bookId", KeyType: "HASH" },
    ],
  },

  {
    TableName: "BookCopies",
    BillingMode: "PAY_PER_REQUEST",
    AttributeDefinitions: [
      { AttributeName: "copyId", AttributeType: "S" },
      { AttributeName: "bookId", AttributeType: "S" },
    ],
    KeySchema: [
      { AttributeName: "copyId", KeyType: "HASH" },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: "ByBook",
        KeySchema: [
          { AttributeName: "bookId", KeyType: "HASH" },
          { AttributeName: "copyId", KeyType: "RANGE" },
        ],
        Projection: { ProjectionType: "ALL" },
      },
    ],
  },

  {
    TableName: "Readers",
    BillingMode: "PAY_PER_REQUEST",
    AttributeDefinitions: [
      { AttributeName: "readerId", AttributeType: "S" },
    ],
    KeySchema: [
      { AttributeName: "readerId", KeyType: "HASH" },
    ],
  },
];

async function createTables() {
  try {
    for (const table of tables) {
      try {
        await client.send(new CreateTableCommand(table));
        console.log(`Da tao bang: ${table.TableName}`);
      } catch (error) {
        if (error.name !== "ResourceInUseException") {
          throw error;
        }

        console.log(`Bang da ton tai: ${table.TableName}`);
      }

      await waitUntilTableExists(
        {
          client,
          maxWaitTime: 30,
          minDelay: 1,
          maxDelay: 3,
        },
        { TableName: table.TableName }
      );

      console.log(`Bang san sang: ${table.TableName}`);
    }

    console.log("Hoan tat tao 3 bang nen!");
  } catch (error) {
    console.error("Tao bang khong thanh cong:", error.message);
    process.exitCode = 1;
  } finally {
    client.destroy();
  }
}

createTables();