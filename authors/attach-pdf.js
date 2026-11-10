"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash } = require("node:crypto");

const {
  TransactGetCommand,
  TransactWriteCommand,
} = require("@aws-sdk/lib-dynamodb");

const {
  client,
  docClient,
} = require("../config/db");

const STORAGE = path.join(
  __dirname,
  "..",
  "storage"
);

const MAX_BYTES = 20 * 1024 * 1024;

const hash = (bytes) =>
  createHash("sha256")
    .update(bytes)
    .digest("hex");

async function requireLocal() {
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
      "Chỉ gắn PDF trong DynamoDB Local cổng 8001."
    );
  }
}

async function readPdf(file) {
  const handle = await fs.open(file, "r");

  try {
    const stat = await handle.stat();

    if (
      !stat.isFile() ||
      stat.size === 0 ||
      stat.size > MAX_BYTES
    ) {
      throw new Error(
        "PDF phải là tệp có nội dung, " +
          "dung lượng tối đa 20 MB."
      );
    }

    const bytes = await handle.readFile();

    if (
      bytes.length > MAX_BYTES ||
      bytes
        .subarray(0, 5)
        .toString("ascii") !== "%PDF-"
    ) {
      throw new Error(
        "Tệp không có dấu hiệu PDF hợp lệ " +
          "hoặc vượt quá 20 MB."
      );
    }

    return bytes;
  } finally {
    await handle.close();
  }
}

async function savePrivateFile(
  file,
  bytes,
  digest
) {
  await fs.mkdir(
    path.dirname(file),
    { recursive: true }
  );

  let handle;

  try {
    handle = await fs.open(file, "wx");
  } catch (error) {
    if (error.code !== "EEXIST") {
      throw error;
    }

    const stat = await fs.stat(file);

    if (
      !stat.isFile() ||
      stat.size !== bytes.length ||
      hash(await fs.readFile(file)) !== digest
    ) {
      throw new Error(
        "Tệp đã lưu bị sai nội dung. " +
          "Cần kiểm tra trước khi gắn."
      );
    }

    return;
  }

  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } catch (error) {
    await handle.close().catch(() => {});
    await fs.unlink(file).catch(() => {});
    throw error;
  }

  await handle.close();
}

async function attachPdf(
  mode,
  accountId,
  bookId,
  file,
  accessMode,
  priceText
) {
  const validId = (value) =>
    typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value);

  if (
    !["preview", "run"].includes(mode) ||
    !validId(accountId) ||
    !validId(bookId) ||
    typeof file !== "string" ||
    path.extname(file).toLowerCase() !== ".pdf" ||
    !["FREE", "PAID"].includes(accessMode) ||
    !/^(0|[1-9]\d*)$/.test(priceText || "")
  ) {
    throw new Error(
      "Cách dùng: node authors/attach-pdf.js " +
        "preview|run MÃ_TÀI_KHOẢN MÃ_SÁCH " +
        '"ĐƯỜNG_DẪN.pdf" FREE|PAID GIÁ_VND'
    );
  }

  const priceVnd = Number(priceText);

  if (
    !Number.isSafeInteger(priceVnd) ||
    (accessMode === "FREE" && priceVnd !== 0) ||
    (accessMode === "PAID" && priceVnd <= 0)
  ) {
    throw new Error(
      "FREE cần giá 0; PAID cần giá nguyên dương theo VND."
    );
  }

  await requireLocal();

  const snapshot = await docClient.send(
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
            TableName: "Books",
            Key: { bookId },
          },
        },
      ],
    })
  );

  const account =
    snapshot.Responses?.[0]?.Item;

  const book =
    snapshot.Responses?.[1]?.Item;

  if (
    !account ||
    account.accountId !== accountId ||
    account.status !== "ACTIVE" ||
    !Array.isArray(account.roles) ||
    !account.roles.includes("AUTHOR")
  ) {
    throw new Error(
      "Cần tài khoản hoạt động và có vai trò AUTHOR."
    );
  }

  if (
    !book ||
    book.bookId !== bookId ||
    book.source !== "AUTHOR" ||
    book.ownerAccountId !== accountId ||
    book.status !== "DRAFT"
  ) {
    throw new Error(
      "Chỉ được gắn PDF vào sách DRAFT " +
        "thuộc tài khoản của mình."
    );
  }

  const version = book.editVersion ?? 0;

  if (
    !Number.isSafeInteger(version) ||
    version < 0 ||
    version >= Number.MAX_SAFE_INTEGER ||
    typeof book.updatedAt !== "string" ||
    !book.updatedAt
  ) {
    throw new Error(
      "Phiên bản sách không hợp lệ."
    );
  }

  const bytes = await readPdf(
    path.resolve(file)
  );

  const digest = hash(bytes);

  const fileKey = path.posix.join(
    "private-pdfs",
    bookId,
    digest + ".pdf"
  );

  const now = new Date().toISOString();

  const digital = {
    mode: accessMode,
    format: "PDF",
    fileKey,
    priceVnd,
    currency: "VND",
    sha256: digest,
    byteSize: bytes.length,
    originalFileName: path.basename(file),
    attachedAt: now,
  };

  const same = [
    "mode",
    "format",
    "fileKey",
    "priceVnd",
    "currency",
    "sha256",
    "byteSize",
  ].every(
    (key) =>
      book.digitalAccess?.[key] === digital[key]
  );

  if (mode === "preview") {
    return {
      changed: !same,
      item: {
        ...book,
        digitalAccess: digital,
      },
    };
  }

  const target = path.join(
    STORAGE,
    ...fileKey.split("/")
  );

  await savePrivateFile(
    target,
    bytes,
    digest
  );

  if (same) {
    return {
      changed: false,
      item: book,
    };
  }

  const hasVersion = Object.hasOwn(
    book,
    "editVersion"
  );

  await docClient.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          ConditionCheck: {
            TableName: "Accounts",
            Key: { accountId },

            ConditionExpression:
              "#s = :active AND contains(#r, :author)",

            ExpressionAttributeNames: {
              "#s": "status",
              "#r": "roles",
            },

            ExpressionAttributeValues: {
              ":active": "ACTIVE",
              ":author": "AUTHOR",
            },
          },
        },
        {
          Update: {
            TableName: "Books",
            Key: { bookId },

            UpdateExpression:
              "SET digitalAccess = :digital, " +
              "updatedAt = :now, #v = :next",

            ConditionExpression:
              "ownerAccountId = :owner " +
              "AND #source = :source " +
              "AND #s = :draft " +
              "AND updatedAt = :oldTime AND " +
              (
                hasVersion
                  ? "#v = :oldVersion"
                  : "attribute_not_exists(#v)"
              ),

            ExpressionAttributeNames: {
              "#v": "editVersion",
              "#s": "status",
              "#source": "source",
            },

            ExpressionAttributeValues: {
              ":digital": digital,
              ":now": now,
              ":next": version + 1,
              ":owner": accountId,
              ":source": "AUTHOR",
              ":draft": "DRAFT",
              ":oldTime": book.updatedAt,

              ...(
                hasVersion
                  ? { ":oldVersion": version }
                  : {}
              ),
            },
          },
        },
      ],
    })
  );

  return {
    changed: true,
    item: {
      ...book,
      digitalAccess: digital,
      updatedAt: now,
      editVersion: version + 1,
    },
  };
}

async function main() {
  const [
    mode,
    accountId,
    bookId,
    file,
    accessMode,
    price,
    ...extra
  ] = process.argv.slice(2);

  if (extra.length) {
    throw new Error(
      "Đặt đường dẫn PDF trong dấu ngoặc kép nhé."
    );
  }

  const result = await attachPdf(
    mode,
    accountId,
    bookId,
    file,
    accessMode,
    price
  );

  const digital =
    result.item.digitalAccess;

  console.log(
    mode === "preview"
      ? "Chỉ xem trước, chưa lưu tệp hoặc sửa database."
      : result.changed
        ? "Đã lưu PDF và gắn vào sách nháp."
        : "PDF và cấu hình đã có. Không thay đổi dữ liệu."
  );

  console.log(
    "Mã sách:",
    result.item.bookId
  );

  console.log(
    "Chủ sở hữu:",
    result.item.ownerAccountId
  );

  console.log(
    "Trạng thái:",
    result.item.status
  );

  console.log(
    "Chế độ:",
    digital.mode
  );

  console.log(
    "Giá VND:",
    digital.priceVnd
  );

  console.log(
    "Dung lượng:",
    digital.byteSize,
    "bytes"
  );

  console.log(
    "Khóa tệp:",
    digital.fileKey
  );
}

module.exports = {
  attachPdf,
};

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(
        "Chưa gắn được PDF:",
        error.message
      );

      if (
        error.name ===
        "TransactionCanceledException"
      ) {
        console.error(
          "Quyền hoặc dữ liệu vừa thay đổi. " +
            "Bà chạy preview để kiểm tra lại."
        );
      }

      process.exitCode = 1;
    })
    .finally(() => client.destroy());
}