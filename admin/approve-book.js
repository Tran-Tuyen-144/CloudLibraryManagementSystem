"use strict";

const {
  TransactGetCommand,
  TransactWriteCommand,
} = require("@aws-sdk/lib-dynamodb");

const {
  client,
  docClient,
} = require("../config/db");

const {
  checkContent,
} = require("../authors/submit-book");

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
      "Chỉ duyệt sách trong DynamoDB Local cổng 8001."
    );
  }
}

async function approveBook(
  mode,
  adminId,
  bookId
) {
  const validId = (value) =>
    typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value);

  if (
    !["preview", "run"].includes(mode) ||
    !validId(adminId) ||
    !validId(bookId)
  ) {
    throw new Error(
      "Cách dùng: node admin/approve-book.js " +
        "preview|run MÃ_ADMIN MÃ_SÁCH"
    );
  }

  await requireLocal();

  const snapshot = await docClient.send(
    new TransactGetCommand({
      TransactItems: [
        {
          Get: {
            TableName: "Accounts",
            Key: {
              accountId: adminId,
            },
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

  const admin =
    snapshot.Responses?.[0]?.Item;

  const book =
    snapshot.Responses?.[1]?.Item;

  if (
    !admin ||
    admin.accountId !== adminId ||
    admin.status !== "ACTIVE" ||
    !Array.isArray(admin.roles) ||
    !admin.roles.includes("ADMIN")
  ) {
    throw new Error(
      "Cần tài khoản hoạt động và có vai trò ADMIN."
    );
  }

  if (
    !book ||
    book.bookId !== bookId ||
    book.source !== "AUTHOR"
  ) {
    throw new Error(
      "Không tìm thấy sách do tác giả đăng."
    );
  }

  if (
    book.status === "ACTIVE" &&
    book.review?.decision === "APPROVED"
  ) {
    return {
      alreadyApproved: true,
      item: book,
    };
  }

  if (book.status !== "PENDING_REVIEW") {
    throw new Error(
      "Chỉ duyệt sách đang ở trạng thái PENDING_REVIEW."
    );
  }

  const version = book.editVersion;
  const submission = book.submission;

  if (
    !Number.isSafeInteger(version) ||
    version < 1 ||
    version >= Number.MAX_SAFE_INTEGER ||
    typeof book.updatedAt !== "string" ||
    !book.updatedAt ||
    !submission ||
    submission.accountId !== book.ownerAccountId ||
    submission.bookVersion !== version ||
    typeof submission.submittedAt !== "string" ||
    !submission.submittedAt
  ) {
    throw new Error(
      "Phiên bản sách không khớp với lần gửi duyệt."
    );
  }

  if (typeof checkContent !== "function") {
    throw new Error(
      "Cần thêm checkContent vào module.exports " +
        "trong authors/submit-book.js."
    );
  }

  const pdfSha256 = await checkContent(book);

  if (pdfSha256 !== submission.pdfSha256) {
    throw new Error(
      "PDF hiện tại không khớp với bản tác giả đã gửi duyệt."
    );
  }

  const now = new Date().toISOString();

  const review = {
    decision: "APPROVED",
    accountId: adminId,
    reviewedAt: now,
    submissionVersion: version,
    pdfSha256,
  };

  const readUrl =
    book.digitalAccess.mode === "FREE"
      ? `/api/books/${encodeURIComponent(bookId)}/read`
      : null;

  const updated = {
    ...book,
    status: "ACTIVE",
    review,
    publishedAt: now,
    readUrl,
    updatedAt: now,
    editVersion: version + 1,
  };

  if (mode === "preview") {
    return {
      alreadyApproved: false,
      item: updated,
    };
  }

  await docClient.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          ConditionCheck: {
            TableName: "Accounts",

            Key: {
              accountId: adminId,
            },

            ConditionExpression:
              "#s = :active AND contains(#r, :admin)",

            ExpressionAttributeNames: {
              "#s": "status",
              "#r": "roles",
            },

            ExpressionAttributeValues: {
              ":active": "ACTIVE",
              ":admin": "ADMIN",
            },
          },
        },
        {
          Update: {
            TableName: "Books",
            Key: { bookId },

            UpdateExpression:
              "SET #s = :active, #review = :review, " +
              "publishedAt = :now, readUrl = :readUrl, " +
              "updatedAt = :now, #v = :next",

            ConditionExpression:
              "#s = :pending AND #source = :source " +
              "AND ownerAccountId = :owner " +
              "AND #v = :oldVersion " +
              "AND updatedAt = :oldTime " +
              "AND #submission.#bv = :oldVersion " +
              "AND digitalAccess = :digital",

            ExpressionAttributeNames: {
              "#s": "status",
              "#source": "source",
              "#review": "review",
              "#v": "editVersion",
              "#submission": "submission",
              "#bv": "bookVersion",
            },

            ExpressionAttributeValues: {
              ":active": "ACTIVE",
              ":review": review,
              ":now": now,
              ":readUrl": readUrl,
              ":next": version + 1,
              ":pending": "PENDING_REVIEW",
              ":source": "AUTHOR",
              ":owner": book.ownerAccountId,
              ":oldVersion": version,
              ":oldTime": book.updatedAt,
              ":digital": book.digitalAccess,
            },
          },
        },
      ],
    })
  );

  return {
    alreadyApproved: false,
    item: updated,
  };
}

async function main() {
  const [
    mode,
    adminId,
    bookId,
    ...extra
  ] = process.argv.slice(2);

  if (extra.length) {
    throw new Error(
      "Lệnh chỉ nhận chế độ, mã admin và mã sách."
    );
  }

  const result = await approveBook(
    mode,
    adminId,
    bookId
  );

  console.log(
    result.alreadyApproved
      ? "Sách đã được duyệt. Giữ nguyên dữ liệu."
      : mode === "preview"
        ? "Chỉ xem trước kết quả dự kiến. Chưa ghi database."
        : "Admin đã duyệt sách thành công."
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

  console.log(
    "Admin duyệt:",
    result.item.review.accountId
  );
}

module.exports = {
  approveBook,
};

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(
        "Chưa duyệt được sách:",
        error.message
      );

      if (
        error.name ===
        "TransactionCanceledException"
      ) {
        console.error(
          "Quyền hoặc phiên bản sách vừa thay đổi. " +
            "Bà chạy preview để kiểm tra lại."
        );
      }

      if (error.code === "ENOENT") {
        console.error(
          "Không tìm thấy PDF đã lưu trong storage/private-pdfs."
        );
      }

      process.exitCode = 1;
    })
    .finally(() => client.destroy());
}