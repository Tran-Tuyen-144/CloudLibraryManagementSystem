"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { TextDecoder } = require("node:util");

const BOOK_DIR = path.join(
  __dirname,
  "..",
  "storage",
  "ebooks"
);

const MAX_BYTES = 10 * 1024 * 1024;

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char]
  );
}
function formatBookText(text) {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n[ \t]*\n+/)
    .filter((block) => block.trim())
    .map((block) => {
      const lines = block.split("\n");

      const indented = lines.filter(
        (line) => /^(?: {2,}|\t)\S/.test(line)
      ).length;

      // Giữ bố cục các khối có nhiều dòng thụt lề.
      if (lines.length > 1 && indented >= 2) {
        return (
          "<pre>" +
          escapeHtml(block) +
          "</pre>"
        );
      }

      // Nối các dòng trong cùng một đoạn văn.
      const paragraph = block
        .trim()
        .replace(/\s*\n\s*/g, " ");

      const isHeading =
        paragraph.length <= 120 &&
        /[A-Z]/.test(paragraph) &&
        !/[a-z]/.test(paragraph);

      if (isHeading) {
        return (
          "<h2>" +
          escapeHtml(paragraph) +
          "</h2>"
        );
      }

      return (
        "<p>" +
        escapeHtml(paragraph) +
        "</p>"
      );
    })
    .join("\n");
}
function sendError(res, status, message) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
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

async function sendLocalBook(res, book) {
  if (
    book.source !== "PROJECT_GUTENBERG" ||
    !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(
      book.bookId || ""
    )
  ) {
    return sendError(
      res,
      409,
      "Sách này chưa hỗ trợ trình đọc Gutenberg nội bộ."
    );
  }

  let handle;
  let text;

  try {
    const file = path.join(
      BOOK_DIR,
      book.bookId + ".txt"
    );

    handle = await fs.open(file, "r");

    const stat = await handle.stat();

    if (!stat.isFile()) {
      return sendError(
        res,
        422,
        "Nội dung sách phải là một tệp TXT."
      );
    }

    if (stat.size > MAX_BYTES) {
      return sendError(
        res,
        413,
        "Tệp sách vượt quá giới hạn 10 MB."
      );
    }

    const bytes = await handle.readFile();

    if (bytes.length > MAX_BYTES) {
      return sendError(
        res,
        413,
        "Tệp sách vượt quá giới hạn 10 MB."
      );
    }

    text = new TextDecoder(
      "utf-8",
      { fatal: true }
    ).decode(bytes);

    if (!text.trim()) {
      return sendError(
        res,
        422,
        "Tệp sách đang rỗng."
      );
    }

    if (
      /^\s*(<!doctype\s+html|<html\b)/i.test(text)
    ) {
      return sendError(
        res,
        422,
        "Bà đã lưu trang HTML. " +
          "Cần tải bản Plain Text của sách."
      );
    }
  } catch (error) {
    if (error.code === "ENOENT") {
      return sendError(
        res,
        404,
        "Chưa có tệp nội dung của sách này " +
          "trong storage/ebooks."
      );
    }

    if (
      error.code ===
      "ERR_ENCODING_INVALID_ENCODED_DATA"
    ) {
      return sendError(
        res,
        422,
        "Tệp sách cần được lưu bằng mã hóa UTF-8."
      );
    }

    console.error(
      "Lỗi đọc tệp sách:",
      error.message
    );

    return sendError(
      res,
      500,
      "Không mở được tệp nội dung sách."
    );
  } finally {
    if (handle) {
      await handle.close().catch(() => {});
    }
  }

  const html = `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta
    name="viewport"
    content="width=device-width,initial-scale=1"
  >
  <title>${escapeHtml(book.title)} | Cloud Library</title>

    <style>
    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      background: #eeeae2;
      color: #2c2b29;
    }

    main {
      width: calc(100% - 40px);
      max-width: 860px;
      margin: 32px auto;
      padding: clamp(24px, 5vw, 56px);
      background: #fffdf8;
      border: 1px solid #e5dfd3;
      border-radius: 16px;
      box-shadow: 0 8px 28px rgba(50, 40, 20, 0.06);
    }

    header {
      text-align: center;
      border-bottom: 1px solid #e5dfd3;
      padding-bottom: 24px;
      margin-bottom: 32px;
    }

    .brand {
      margin: 0 0 18px;
      font: 600 12px/1.5 system-ui, sans-serif;
      letter-spacing: 0.1em;
      color: #526b54;
    }

    h1 {
      max-width: 28ch;
      margin: 0 auto 16px;
      font: 700 clamp(25px, 3.5vw, 32px)/1.3 Georgia, serif;
      text-wrap: balance;
    }

    .author {
      margin: 0 0 8px;
      font: 15px/1.6 system-ui, sans-serif;
      color: #555;
    }

    .credit {
      margin: 0;
      font: 12px/1.6 system-ui, sans-serif;
      color: #777;
    }

    article {
      max-width: 68ch;
      margin: 0 auto;
      font: 18px/1.8 Georgia, "Times New Roman", serif;
      overflow-wrap: break-word;
    }

    article p {
      margin: 0 0 1em;
      text-align: justify;
      text-justify: inter-word;
      hyphens: auto;
    }

    article h2 {
      margin: 2em 0 1em;
      font: 700 21px/1.5 Georgia, serif;
      text-align: center;
    }

    article pre {
      margin: 1em 0;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      font: inherit;
      text-align: left;
    }

    @media (max-width: 600px) {
      main {
        width: 100%;
        margin: 0;
        padding: 28px 20px;
        border: 0;
        border-radius: 0;
        box-shadow: none;
      }

      article {
        font-size: 17px;
        line-height: 1.75;
      }
    }

    @media (max-width: 420px) {
      article p {
        text-align: left;
      }
    }
  </style>
</head>

<body>
  <main>
    <header>
      <p class="brand">CLOUD LIBRARY · ĐỌC SÁCH</p>

      <h1>${escapeHtml(book.title)}</h1>

      <p class="author">${escapeHtml(book.author)}</p>

      <p class="credit">
        Nguồn nội dung: Project Gutenberg
      </p>
    </header>

    <article lang="${escapeHtml(book.languages?.[0] || "en")}">
  ${formatBookText(text)}
</article>
  </main>
</body>
</html>`;

  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy":
      "default-src 'none'; " +
      "style-src 'unsafe-inline'; " +
      "base-uri 'none'; " +
      "frame-ancestors 'self'",
  });

  return res.end(html);
}

module.exports = {
  sendLocalBook,
};