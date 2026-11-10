const {
  CreateTableCommand,
  waitUntilTableExists,
} = require("@aws-sdk/client-dynamodb");

const { client } = require("../config/db");

// Các chỉ mục phục vụ tra cứu phiếu mượn.
const indexes = [
  {
    name: "ByReader",
    partitionKey: "readerId",
    sortKey: "createdAt",
  },
  {
    name: "ByCopy",
    partitionKey: "copyId",
    sortKey: "createdAt",
  },
  {
    name: "ByStatusDueDate",
    partitionKey: "status",
    sortKey: "dueDate",
  },
];

const keyAttributes = [
  ...new Set([
    "loanId",
    ...indexes.flatMap((index) => [
      index.partitionKey,
      index.sortKey,
    ]),
  ]),
];

const table = {
  TableName: "Loans",
  BillingMode: "PAY_PER_REQUEST",

  AttributeDefinitions: keyAttributes.map((name) => ({
    AttributeName: name,
    AttributeType: "S",
  })),

  KeySchema: [
    { AttributeName: "loanId", KeyType: "HASH" },
  ],

  GlobalSecondaryIndexes: indexes.map((index) => ({
    IndexName: index.name,
    KeySchema: [
      {
        AttributeName: index.partitionKey,
        KeyType: "HASH",
      },
      {
        AttributeName: index.sortKey,
        KeyType: "RANGE",
      },
    ],
    Projection: { ProjectionType: "ALL" },
  })),
};

async function createLoansTable() {
  try {
    try {
      await client.send(new CreateTableCommand(table));
      console.log("Da tao bang: Loans");
    } catch (error) {
      if (error.name !== "ResourceInUseException") {
        throw error;
      }

      console.log("Bang Loans da ton tai.");
    }

    await waitUntilTableExists(
      {
        client,
        maxWaitTime: 30,
        minDelay: 1,
        maxDelay: 3,
      },
      { TableName: "Loans" }
    );

    console.log("Bang Loans san sang!");
  } catch (error) {
    console.error("Khong tao duoc bang Loans:", error.message);
    process.exitCode = 1;
  } finally {
    client.destroy();
  }
}

createLoansTable();