import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
  waitUntilTableExists,
} from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  QueryCommand,
  GetCommand,
  PutCommand,
  DeleteCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { createHash } from "node:crypto";
import { config } from "./config.mjs";
import { ServiceError, ensure } from "./errors.mjs";
import { createStorage } from "./storage.mjs";

export const collections = [
  "accounts",
  "books",
  "categories",
  "authorApplications",
  "authorManuscripts",
  "revisions",
  "auditLogs",
  "accessLogs",
  "reservations",
  "notifications",
  "bookCopies",
  "knowledgeSources",
  "chatSessions",
  "audioJobs",
];
export const maps = [
  "requestsByEmail",
  "favoriteIdsByEmail",
  "notificationReads",
  "readingData",
  "readerSettings",
  "readingHistory",
  "bookViewHistory",
];
export const emptyState = () => ({
  ...Object.fromEntries(collections.map((k) => [k, []])),
  ...Object.fromEntries(maps.map((k) => [k, {}])),
  settings: {
    libraryName: "Cloud Library",
    maxActiveLoans: 3,
    loanDays: 14,
    dailyFineVnd: 5000,
    maxRenewals: 1,
    extensionDays: 7,
    holdHours: 48,
    address: "",
    phone: "",
    contactEmail: "",
    openingHours: "",
  },
  version: 0,
});

export function createRepository(options = config) {
  const client = new DynamoDBClient({
    region: options.region,
    ...(options.endpoint
      ? {
          endpoint: options.endpoint,
          credentials: { accessKeyId: "localdev", secretAccessKey: "localdev" },
          maxAttempts: 2,
        }
      : {}),
  });
  const db = DynamoDBDocumentClient.from(client, {
    marshallOptions: {
      removeUndefinedValues: true,
      convertClassInstanceToMap: true,
    },
  });
  const storage = createStorage(options);
  const table = options.table;
  const partition = options.partition || "LIBRARY";
  const key = (sk) => ({ PK: partition, SK: sk });
  async function stateItems(state) {
    const entries = new Map();
    for (const collection of collections) {
      for (const value of state[collection] || []) {
        if (collection === "chatSessions") {
          const { messages, ...session } = value;
          entries.set(`chatSessions#${value.id}`, session);
          for (const message of messages || [])
            entries.set(`chatMessages#${value.id}#${message.id}`, {
              sessionId: value.id,
              ...message,
            });
          continue;
        }
        const packed = ["books", "authorManuscripts", "revisions"].includes(
          collection,
        )
          ? await storage.pack(value)
          : value;
        entries.set(`${collection}#${value.id}`, packed);
      }
    }
    for (const map of maps)
      for (const [id, value] of Object.entries(state[map] || {})) {
        if (map === "requestsByEmail" || map === "readingHistory") {
          for (const item of value)
            entries.set(`${map}#${id}#${item.id}`, { id, item });
        } else if (map === "readingData" || map === "bookViewHistory") {
          for (const [entryId, item] of Object.entries(value))
            entries.set(`${map}#${id}#${entryId}`, { id, entryId, item });
        } else entries.set(`${map}#${id}`, { id, value });
      }
    entries.set("settings", state.settings);
    return entries;
  }
  return {
    db,
    client,
    storage,
    table,
    namespace: partition,
    async initialize() {
      try {
        await client.send(new DescribeTableCommand({ TableName: table }));
      } catch (error) {
        if (
          error.name !== "ResourceNotFoundException" ||
          options.mode !== "local"
        )
          throw error;
        await client.send(
          new CreateTableCommand({
            TableName: table,
            BillingMode: "PAY_PER_REQUEST",
            AttributeDefinitions: [
              { AttributeName: "PK", AttributeType: "S" },
              { AttributeName: "SK", AttributeType: "S" },
            ],
            KeySchema: [
              { AttributeName: "PK", KeyType: "HASH" },
              { AttributeName: "SK", KeyType: "RANGE" },
            ],
          }),
        );
        await waitUntilTableExists(
          { client, maxWaitTime: 30, minDelay: 1 },
          { TableName: table },
        );
      }
    },
    async read() {
      const state = emptyState();
      let cursor;
      let count = 0;
      const messages = [];
      const storedItems = new Map();
      do {
        const result = await db.send(
          new QueryCommand({
            TableName: table,
            KeyConditionExpression: "PK = :pk",
            ExpressionAttributeValues: { ":pk": partition },
            ConsistentRead: true,
            ExclusiveStartKey: cursor,
          }),
        );
        for (const row of result.Items || []) {
          count++;
          ensure(
            count <= 5000,
            "catalogLimit",
            "Dữ liệu vượt giới hạn bản đồ án. Cần chuyển sang truy vấn theo bộ lọc.",
            503,
          );
          if (row.SK === "META") {
            state.version = row.version;
            continue;
          }
          storedItems.set(row.SK, row.value);
          if (row.SK === "settings") {
            state.settings = { ...state.settings, ...row.value };
            continue;
          }
          const [kind] = row.SK.split("#");
          if (kind === "chatMessages") messages.push(row.value);
          else if (collections.includes(kind))
            state[kind].push(
              ["books", "authorManuscripts", "revisions"].includes(kind)
                ? await storage.unpack(row.value)
                : row.value,
            );
          else if (maps.includes(kind)) {
            if (row.value.item !== undefined) {
              if (kind === "requestsByEmail" || kind === "readingHistory")
                (state[kind][row.value.id] ||= []).push(row.value.item);
              else
                (state[kind][row.value.id] ||= {})[row.value.entryId] =
                  row.value.item;
            } else state[kind][row.value.id] = row.value.value;
          }
        }
        cursor = result.LastEvaluatedKey;
      } while (cursor);
      for (const chat of state.chatSessions)
        chat.messages = [
          ...(chat.messages || []),
          ...messages.filter((m) => m.sessionId === chat.id),
        ]
          .filter(
            (message, index, rows) =>
              rows.findIndex((row) => row.id === message.id) === index,
          )
          .sort(
            (a, b) =>
              a.createdAt.localeCompare(b.createdAt) ||
              a.id.localeCompare(b.id),
          );
      Object.defineProperty(state, "_storedItems", {
        value: storedItems,
        enumerable: false,
      });
      return state;
    },
    async getSecret(pk, sk) {
      return (
        await db.send(
          new GetCommand({
            TableName: table,
            Key: { PK: pk, SK: sk },
            ConsistentRead: true,
          }),
        )
      ).Item;
    },
    async putSecret(pk, sk, value, condition) {
      const { PK: _pk, SK: _sk, ...data } = value;
      await db.send(
        new PutCommand({
          TableName: table,
          Item: { PK: pk, SK: sk, ...data },
          ...(condition
            ? { ConditionExpression: "attribute_not_exists(PK)" }
            : {}),
        }),
      );
    },
    async deleteSecret(pk, sk) {
      await db.send(
        new DeleteCommand({ TableName: table, Key: { PK: pk, SK: sk } }),
      );
    },
    async mutate(actorId, requestId, payload, transform) {
      ensure(
        typeof requestId === "string" &&
          /^[A-Za-z0-9_-]{8,100}$/.test(requestId),
        "invalidRequest",
        "Thiếu mã xử lý lặp an toàn.",
      );
      const requestKey = {
        PK: `REQUEST#${partition}#${actorId}`,
        SK: requestId,
      };
      const hash = createHash("sha256")
        .update(JSON.stringify(payload))
        .digest("hex");
      for (let attempt = 0; attempt < 7; attempt++) {
        const previous = await this.getSecret(requestKey.PK, requestKey.SK);
        if (previous && previous.expiresAt > Math.floor(Date.now() / 1000)) {
          ensure(
            previous.hash === hash,
            "idempotencyConflict",
            "Mã yêu cầu đã được dùng với nội dung khác.",
            409,
          );
          return {
            state: await this.read(),
            result: previous.result,
            replayed: true,
          };
        }
        const before = await this.read();
        const outcome = await transform(structuredClone(before));
        const after = outcome.state;
        const result = outcome.result || { ok: true };
        ensure(
          after,
          "invalidCommand",
          "Thao tác không trả dữ liệu hợp lệ.",
          500,
        );
        const oldItems = before._storedItems || (await stateItems(before));
        const newItems = await stateItems(after);
        const actions = [];
        for (const [sk, value] of newItems)
          if (JSON.stringify(value) !== JSON.stringify(oldItems.get(sk))) {
            ensure(
              Buffer.byteLength(JSON.stringify(value)) < 360000,
              "itemTooLarge",
              "Nội dung quá lớn; hãy tách chương hoặc tải tệp.",
            );
            actions.push({
              Put: { TableName: table, Item: { ...key(sk), value } },
            });
          }
        for (const sk of oldItems.keys())
          if (!newItems.has(sk))
            actions.push({ Delete: { TableName: table, Key: key(sk) } });
        ensure(
          actions.length <= 95,
          "batchTooLarge",
          "Thao tác thay đổi quá nhiều bản ghi cùng lúc. Hãy chia nhỏ.",
        );
        actions.push({
          Put: {
            TableName: table,
            Item: { ...key("META"), version: before.version + 1 },
            ConditionExpression: "attribute_not_exists(PK) OR #v = :v",
            ExpressionAttributeNames: { "#v": "version" },
            ExpressionAttributeValues: { ":v": before.version },
          },
        });
        actions.push({
          Put: {
            TableName: table,
            Item: {
              ...requestKey,
              hash,
              result,
              expiresAt: Math.floor(Date.now() / 1000) + 86400,
            },
            ConditionExpression: "attribute_not_exists(PK) OR expiresAt < :now",
            ExpressionAttributeValues: {
              ":now": Math.floor(Date.now() / 1000),
            },
          },
        });
        try {
          await db.send(new TransactWriteCommand({ TransactItems: actions }));
          return { state: { ...after, version: before.version + 1 }, result };
        } catch (error) {
          if (
            ![
              "TransactionCanceledException",
              "TransactionConflictException",
            ].includes(error.name)
          )
            throw error;
          if (attempt === 6)
            throw new ServiceError(
              "staleRequest",
              "Dữ liệu đang được cập nhật. Hãy tải lại và thử lại.",
              409,
            );
          await new Promise((resolve) =>
            setTimeout(resolve, 15 * (attempt + 1) + Math.random() * 35),
          );
        }
      }
    },
  };
}
