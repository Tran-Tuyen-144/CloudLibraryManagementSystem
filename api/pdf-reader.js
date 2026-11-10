"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const {
  createHash,
} = require("node:crypto");

const {
  GetCommand,
} = require("@aws-sdk/lib-dynamodb");

const {
  docClient,
} = require("../config/db");

function readerError(statusCode, message) {
  return Object.assign(
    new Error(message),
    { statusCode }
  );
}

async function loadPdf(book) {
  const digital = book.digitalAccess;

  if (digital?.mode === "PAID") {
    throw readerError(
      403,
      "Sách trả phí chưa được mở quyền đọc ở bước này."
    );
  }

  if (
    digital?.mode !== "FREE" ||
    digital.format !== "PDF" ||
    digital.priceVnd !== 0 ||
    digital.currency !== "VND"
  ) {
    throw readerError(
      409,
      "Sách chưa có cấu hình PDF miễn phí hợp lệ."
    );
  }

  const approvedVersion =
    book.review.submissionVersion;

  if (
    !Number.isSafeInteger(approvedVersion) ||
    approvedVersion < 1 ||
    book.submission?.bookVersion !== approvedVersion ||
    book.editVersion !== approvedVersion + 1 ||
    !/^[a-f0-9]{64}$/.test(digital.sha256 || "") ||
    book.review.pdfSha256 !== digital.sha256 ||
    book.submission?.pdfSha256 !== digital.sha256 ||
    !Number.isSafeInteger(digital.byteSize) ||
    digital.byteSize <= 0 ||
    digital.byteSize > 20 * 1024 * 1024
  ) {
    throw readerError(
      409,
      "Thông tin PDF không khớp với bản đã được duyệt."
    );
  }

  const expectedKey = path.posix.join(
    "private-pdfs",
    book.bookId,
    digital.sha256 + ".pdf"
  );

  if (digital.fileKey !== expectedKey) {
    throw readerError(
      409,
      "Khóa tệp PDF không khớp với sách."
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
      throw readerError(
        409,
        "Tệp PDF đã lưu bị sai dung lượng."
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
      throw readerError(
        409,
        "Nội dung PDF không khớp với bản đã duyệt."
      );
    }

    return bytes;
  } finally {
    await handle.close();
  }
}

async function sendAuthorPdf(res, bookId) {
  try {
    if (
      typeof bookId !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(
        bookId
      )
    ) {
      throw readerError(
        400,
        "Mã sách không hợp lệ."
      );
    }

    // Đọc bản ghi gốc để kiểm tra PDF và trạng thái duyệt.
    const { Item: book } = await docClient.send(
      new GetCommand({
        TableName: "Books",
        Key: { bookId },
        ConsistentRead: true,
      })
    );

    if (
      !book ||
      book.bookId !== bookId ||
      book.source !== "AUTHOR" ||
      book.status !== "ACTIVE" ||
      book.review?.decision !== "APPROVED"
    ) {
      throw readerError(
        404,
        "Không tìm thấy sách tác giả đã được duyệt."
      );
    }

    const bytes = await loadPdf(book);

    res.writeHead(200, {
      "Content-Type": "application/pdf",

      "Content-Disposition":
        `inline; filename="${bookId}.pdf"`,

      "Content-Length": bytes.length,
      "Accept-Ranges": "none",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "SAMEORIGIN",

      "Content-Security-Policy":
        "frame-ancestors 'self'",

      "Cross-Origin-Resource-Policy":
        "same-origin",
    });

    return res.end(bytes);
  } catch (error) {
    if (res.headersSent) {
      res.destroy();
      return;
    }

    const status =
      error.statusCode ||
      (error.code === "ENOENT" ? 404 : 500);

    const message = error.statusCode
      ? error.message
      : error.code === "ENOENT"
        ? "Không tìm thấy tệp PDF đã lưu."
        : "Chưa mở được PDF. Bà kiểm tra terminal API.";

    if (status === 500) {
      console.error(
        "Lỗi mở PDF:",
        error.message
      );
    }

    res.writeHead(status, {
      "Content-Type":
        "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });

    return res.end(
      JSON.stringify(
        { ok: false, message },
        null,
        2
      )
    );
  }
}

module.exports = {
  sendAuthorPdf,
};