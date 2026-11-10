"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const {
  createHash,
} = require("node:crypto");

const {
  TransactGetCommand,
  TransactWriteCommand,
} = require("@aws-sdk/lib-dynamodb");

const {
  client,
  docClient,
} = require("../config/db");

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
      "Chỉ gửi duyệt trong DynamoDB Local cổng 8001."
    );
  }
}

async function checkContent(book) {
  if (
    typeof book.title !== "string" ||
    !book.title.trim() ||
    typeof book.category !== "string" ||
    !book.category.trim() ||
    typeof book.description !== "string" ||
    !book.description.trim()
  ) {
    throw new Error(
      "Cần điền tên sách, thể loại và mô tả " +
        "trước khi gửi duyệt."
    );
  }

  const digital = book.digitalAccess;

  if (
    !digital ||
    !["NONE", "FREE", "PAID"].includes(digital.mode)
  ) {
    throw new Error(
      "Cấu hình hình thức đọc sách không hợp lệ."
    );
  }

  if (digital.mode === "NONE") {
    if (book.physicalEnabled !== true) {
      throw new Error(
        "Cần gắn PDF hoặc bật hình thức sách giấy " +
          "trước khi gửi duyệt."
      );
    }

    return null;
  }

  if (
    digital.format !== "PDF" ||
    !/^[a-f0-9]{64}$/.test(digital.sha256 || "") ||
    !Number.isSafeInteger(digital.byteSize) ||
    digital.byteSize <= 0 ||
    digital.byteSize > 20 * 1024 * 1024 ||
    digital.currency !== "VND" ||
    !Number.isSafeInteger(digital.priceVnd) ||
    (digital.mode === "FREE" && digital.priceVnd !== 0) ||
    (digital.mode === "PAID" && digital.priceVnd <= 0)
  ) {
    throw new Error(
      "Thông tin PDF hoặc giá đọc chưa hợp lệ."
    );
  }

  const expectedKey = path.posix.join(
    "private-pdfs",
    book.bookId,
    digital.sha256 + ".pdf"
  );

  if (digital.fileKey !== expectedKey) {
    throw new Error(
      "Khóa tệp PDF không khớp với mã sách."
    );
  }

  const file = path.join(
    __dirname,
    "..",
    "storage",
    ...expectedKey.split("/")
  );

  const handle = await fs.open(file, "r");

  try {
    const stat = await handle.stat();

    if (
      !stat.isFile() ||
      stat.size !== digital.byteSize
    ) {
      throw new Error(
        "PDF đã lưu bị sai dung lượng."
      );
    }

    const bytes = await handle.readFile();

    const digest = createHash("sha256")
      .update(bytes)
      .digest("hex");

    if (
      bytes.length !== digital.byteSize ||
      bytes
        .subarray(0, 5)
        .toString("ascii") !== "%PDF-" ||
      digest !== digital.sha256
    ) {
      throw new Error(
        "Nội dung PDF không khớp với bản đã gắn vào sách."
      );
    }
  } finally {
    await handle.close();
  }

  return digital.sha256;
}

async function submitBook(
  mode,
  accountId,
  bookId
) {
  const validId = (value) =>
    typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value);

  if (
    !["preview", "run"].includes(mode) ||
    !validId(accountId) ||
    !validId(bookId)
  ) {
    throw new Error(
      "Cách dùng: node authors/submit-book.js " +
        "preview|run MÃ_TÀI_KHOẢN MÃ_SÁCH"
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
    book.ownerAccountId !== accountId
  ) {
    throw new Error(
      "Chỉ được gửi duyệt sách thuộc tài khoản của mình."
    );
  }

  if (book.status === "PENDING_REVIEW") {
    return {
      alreadySubmitted: true,
      item: book,
    };
  }

  if (book.status !== "DRAFT") {
    throw new Error(
      "Chỉ gửi duyệt sách đang ở trạng thái DRAFT."
    );
  }

  const pdfSha256 = await checkContent(book);

  const version = book.editVersion ?? 0;

  if (
    !Number.isSafeInteger(version) ||
    version < 0 ||
    version >= Number.MAX_SAFE_INTEGER ||
    typeof book.updatedAt !== "string" ||
    !book.updatedAt
  ) {
    throw new Error(
      "Phiên bản hoặc ngày cập nhật của sách không hợp lệ."
    );
  }

  const now = new Date().toISOString();

  const submission = {
    accountId,
    submittedAt: now,
    bookVersion: version + 1,
    pdfSha256,
  };

  const updated = {
    ...book,
    status: "PENDING_REVIEW",
    submission,
    editVersion: version + 1,
    updatedAt: now,
  };

  if (mode === "preview") {
    return {
      alreadySubmitted: false,
      item: updated,
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
              "SET #s = :pending, " +
              "#submission = :submission, " +
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
              "#s": "status",
              "#source": "source",
              "#v": "editVersion",
              "#submission": "submission",
            },

            ExpressionAttributeValues: {
              ":pending": "PENDING_REVIEW",
              ":submission": submission,
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
    alreadySubmitted: false,
    item: updated,
  };
}

async function main() {
  const [
    mode,
    accountId,
    bookId,
    ...extra
  ] = process.argv.slice(2);

  if (extra.length) {
    throw new Error(
      "Lệnh chỉ cần chế độ, mã tài khoản và mã sách."
    );
  }

  const result = await submitBook(
    mode,
    accountId,
    bookId
  );

  console.log(
    result.alreadySubmitted
      ? "Sách đã được gửi duyệt trước đó. Giữ nguyên dữ liệu."
      : mode === "preview"
        ? "Chỉ xem trước trạng thái dự kiến. Chưa ghi database."
        : "Đã gửi sách cho admin duyệt."
  );

  console.log(
    "Mã sách:",
    result.item.bookId
  );

  console.log(
    "Tên sách:",
    result.item.title
  );

  console.log(
    "Chủ sở hữu:",
    result.item.ownerAccountId
  );

  console.log(
    "Trạng thái:",
    result.item.status
  );
}

module.exports = {
  submitBook,
  checkContent,
};

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(
        "Chưa gửi duyệt được:",
        error.message
      );

      if (error.code === "ENOENT") {
        console.error(
          "Không tìm thấy PDF đã lưu. " +
            "Bà kiểm tra storage/private-pdfs."
        );
      }

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