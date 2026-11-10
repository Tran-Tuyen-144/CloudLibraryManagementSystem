const {
  CreateTableCommand,
  waitUntilTableExists,
} = require("@aws-sdk/client-dynamodb");

const { client } = require("../config/db");

const tables = [
  {
    name: "Reservations",
    pk: "reservationId",
    indexes: [
      {
        name: "ByBook",
        pk: "bookId",
        sk: "queueKey",
      },
      {
        name: "ByReader",
        pk: "readerId",
        sk: "createdAt",
      },
      {
        name: "ByStatusExpiry",
        pk: "status",
        sk: "expiresAt",
      },
    ],
  },
  {
    name: "Favorites",
    pk: "readerId",
    sk: "bookId",
    indexes: [],
  },
  {
    name: "Notifications",
    pk: "notificationId",
    indexes: [
      {
        name: "ByReader",
        pk: "readerId",
        sk: "createdAt",
      },
      {
        name: "ByDeliveryStatus",
        pk: "deliveryStatus",
        sk: "nextAttemptAt",
      },
    ],
  },
];

function keySchema(pk, sk) {
  const keys = [
    { AttributeName: pk, KeyType: "HASH" },
  ];

  if (sk) {
    keys.push({
      AttributeName: sk,
      KeyType: "RANGE",
    });
  }

  return keys;
}

function buildTable(definition) {
  const attributes = new Set([
    definition.pk,
    definition.sk,
    ...definition.indexes.flatMap((index) => [
      index.pk,
      index.sk,
    ]),
  ].filter(Boolean));

  const table = {
    TableName: definition.name,
    BillingMode: "PAY_PER_REQUEST",
    AttributeDefinitions: [...attributes].map((name) => ({
      AttributeName: name,
      AttributeType: "S",
    })),
    KeySchema: keySchema(definition.pk, definition.sk),
  };

  if (definition.indexes.length > 0) {
    table.GlobalSecondaryIndexes =
      definition.indexes.map((index) => ({
        IndexName: index.name,
        KeySchema: keySchema(index.pk, index.sk),
        Projection: { ProjectionType: "ALL" },
      }));
  }

  return table;
}

async function createFeatureTables() {
  try {
    for (const definition of tables) {
      try {
        await client.send(
          new CreateTableCommand(buildTable(definition))
        );

        console.log(`Da tao bang: ${definition.name}`);
      } catch (error) {
        if (error.name !== "ResourceInUseException") {
          throw error;
        }

        console.log(`Bang da ton tai: ${definition.name}`);
      }

      await waitUntilTableExists(
        {
          client,
          maxWaitTime: 30,
          minDelay: 1,
          maxDelay: 3,
        },
        { TableName: definition.name }
      );

      console.log(`Bang san sang: ${definition.name}`);
    }

    console.log("Hoan tat tao 3 bang bo sung!");
  } catch (error) {
    console.error("Khong tao duoc bang:", error.message);
    process.exitCode = 1;
  } finally {
    client.destroy();
  }
}

createFeatureTables();