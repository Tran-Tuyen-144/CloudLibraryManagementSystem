"use strict";

const {
  TransactGetCommand,
  TransactWriteCommand,
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

async function returnBook(mode, accountId, bookId, inputReason) {
  if (!["preview", "run"].includes(mode)) {
    throw new Error("Chế độ phải là preview hoặc run.");
  }

  if (
    !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(accountId || "")
  ) {
    throw new Error("Mã tài khoản không hợp lệ.");
  }

  if (
    !/^BOOK_AUTHOR_[A-Za-z0-9_-]{1,100}$/.test(bookId || "")
  ) {
    throw new Error("Mã sách tác giả không hợp lệ.");
  }

  const reason =
    typeof inputReason === "string" ? inputReason.trim() : "";

  if (
    !reason ||
    reason.length > 1000 ||
    /[\u0000-\u001f\u007f]/.test(reason)
  ) {
    throw new Error(
      "Nhập lý do từ 1 đến 1000 ký tự trên một dòng."
    );
  }

  await requireLocal();

  const result = await docClient.send(
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

  const account = result.Responses?.[0]?.Item;
  const book = result.Responses?.[1]?.Item;

  if (
    account?.status !== "ACTIVE" ||
    !Array.isArray(account.roles) ||
    !account.roles.includes("ADMIN")
  ) {
    throw new Error(
      "Tài khoản phải đang hoạt động và có vai trò ADMIN."
    );
  }

  if (!book || book.source !== "AUTHOR") {
    throw new Error("Không tìm thấy sách tác giả.");
  }

  // Chạy lại đúng yêu cầu vừa xử lý thì không ghi thêm.
  if (
    book.status === "DRAFT" &&
    book.review?.decision === "CHANGES_REQUESTED" &&
    book.review.reason === reason &&
    Number.isSafeInteger(book.review.submissionVersion) &&
    book.editVersion === book.review.submissionVersion + 1 &&
    book.submission?.bookVersion === book.review.submissionVersion
  ) {
    return {
      ok: true,
      action: "UNCHANGED",
      bookId,
      status: "DRAFT",
      reason,
    };
  }

  if (book.status !== "PENDING_REVIEW") {
    throw new Error(
      "Chỉ trả về chỉnh sửa với sách đang chờ duyệt (PENDING_REVIEW)."
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
    typeof book.ownerAccountId !== "string" ||
    !book.ownerAccountId ||
    submission?.accountId !== book.ownerAccountId ||
    submission?.bookVersion !== version ||
    typeof submission?.submittedAt !== "string" ||
    !submission.submittedAt
  ) {
    throw new Error(
      "Thông tin gửi duyệt không hợp lệ hoặc không khớp phiên bản sách."
    );
  }

  const now = new Date().toISOString();

  const review = {
    decision: "CHANGES_REQUESTED",
    accountId,
    reviewedAt: now,
    submissionVersion: version,
    pdfSha256: submission.pdfSha256 ?? null,
    reason,
  };

  const output = {
    ok: true,
    action: mode === "preview" ? "PREVIEW" : "RETURNED_TO_DRAFT",
    bookId,
    title: book.title,
    fromStatus: "PENDING_REVIEW",
    status: "DRAFT",
    reason,
    editVersion: version + 1,
  };

  if (mode === "preview") {
    return output;
  }

  try {
    await docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            ConditionCheck: {
              TableName: "Accounts",
              Key: { accountId },

              ConditionExpression:
                "#s = :active AND contains(#roles, :admin)",

              ExpressionAttributeNames: {
                "#s": "status",
                "#roles": "roles",
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
                "SET #s = :draft, #review = :review, " +
                "#updated = :now, #version = :next, " +
                "#read = :none REMOVE #published",

              ConditionExpression:
                "#s = :pending AND #source = :author " +
                "AND #owner = :owner AND #version = :old " +
                "AND #updated = :previous " +
                "AND #submission = :submission",

              ExpressionAttributeNames: {
                "#s": "status",
                "#review": "review",
                "#updated": "updatedAt",
                "#version": "editVersion",
                "#read": "readUrl",
                "#published": "publishedAt",
                "#source": "source",
                "#owner": "ownerAccountId",
                "#submission": "submission",
              },

              ExpressionAttributeValues: {
                ":draft": "DRAFT",
                ":review": review,
                ":now": now,
                ":next": version + 1,
                ":none": null,
                ":pending": "PENDING_REVIEW",
                ":author": "AUTHOR",
                ":owner": book.ownerAccountId,
                ":old": version,
                ":previous": book.updatedAt,
                ":submission": submission,
              },
            },
          },
        ],
      })
    );
  } catch (error) {
    if (error.name === "TransactionCanceledException") {
      throw new Error(
        "Chưa lưu được. Dữ liệu hoặc quyền admin có thể đã thay đổi; hãy chạy preview lại."
      );
    }

    throw error;
  }

  return output;
}

if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2);

    if (args.length !== 4) {
      throw new Error(
        'Cách dùng: node admin/return-book.js preview|run ACCOUNT_ID BOOK_ID "Lý do cần sửa"'
      );
    }

    const result = await returnBook(...args);
    console.log(JSON.stringify(result, null, 2));
  })()
    .catch((error) => {
      console.error("Lỗi:", error.message);
      process.exitCode = 1;
    })
    .finally(() => client.destroy());
}

module.exports = { returnBook };