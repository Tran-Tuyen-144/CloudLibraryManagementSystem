"use strict";

const http = require("node:http");
const path = require("node:path");

const { sendAuthorPdf } = require("./pdf-reader");
const { sendLocalBook } = require("./local-reader");

const {
  parseBookFilters,
  filterBooks,
} = require("./book-filters");

const { searchGutenberg } = require("./gutenberg");

const HOST = "127.0.0.1";
const PORT = 3000;

function publicBook(book) {
  return {
    bookId: book.bookId,
    title: book.title,
    author: book.author,
    authors: book.authors ?? [],
    category: book.category,

    coverImageKey: book.coverImageKey ?? null,
    coverUrl: book.coverUrl ?? null,
    firstPublishYear: book.firstPublishYear ?? null,

    source: book.source ?? null,
    metadataProvider: book.metadataProvider ?? null,
    externalId: book.externalId ?? null,
    sourceUrl: book.sourceUrl ?? null,

    readUrl:
      book.source === "PROJECT_GUTENBERG"
        ? `/api/books/${encodeURIComponent(book.bookId)}/read`
        : book.readUrl ?? null,

    description: book.description ?? null,
    languages: book.languages ?? [],
    subjects: book.subjects ?? [],

    totalCopies: book.totalCopies,
    availableCopies: book.availableCopies,
    heldCopies: book.heldCopies ?? 0,
    status: book.status,
  };
}

function createRepository(
  docClient,
  { ScanCommand, GetCommand }
) {
  return {
    async listBooks() {
      const books = new Map();
      let lastKey;

      do {
        const result = await docClient.send(
          new ScanCommand({
            TableName: "Books",
            ConsistentRead: true,
            FilterExpression: "#s = :active",

            ExpressionAttributeNames: {
              "#s": "status",
            },

            ExpressionAttributeValues: {
              ":active": "ACTIVE",
            },

            ...(lastKey
              ? { ExclusiveStartKey: lastKey }
              : {}),
          })
        );

        for (const book of result.Items || []) {
          if (book.status === "ACTIVE") {
            books.set(book.bookId, publicBook(book));
          }
        }

        lastKey = result.LastEvaluatedKey;
      } while (
        lastKey &&
        Object.keys(lastKey).length > 0
      );

      return [...books.values()].sort((a, b) =>
        a.bookId.localeCompare(b.bookId)
      );
    },

    async getBook(bookId) {
      const result = await docClient.send(
        new GetCommand({
          TableName: "Books",
          Key: { bookId },
          ConsistentRead: true,
        })
      );

      return result.Item?.status === "ACTIVE"
        ? publicBook(result.Item)
        : null;
    },
  };
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });

  res.end(JSON.stringify(data, null, 2));
}

function readBookId(value) {
  let bookId;

  try {
    bookId = decodeURIComponent(value);
  } catch {
    return null;
  }

  if (
    !bookId.trim() ||
    bookId.length > 128 ||
    /[\u0000-\u001f\u007f/]/.test(bookId)
  ) {
    return null;
  }

  return bookId;
}

function createApiServer(repository, auth = null) {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(
        req.url,
        `http://${HOST}:${PORT}`
      );

      const route =
        url.pathname.replace(/\/+$/, "") || "/";

      // Xử lý đăng nhập và tài khoản trước.
      if (
        auth &&
        (await auth.handle(req, res, url))
      ) {
        return;
      }

      if (req.method !== "GET") {
        res.setHeader("Allow", "GET");

        return sendJson(res, 405, {
          ok: false,
          message: "Đường dẫn này chỉ hỗ trợ GET.",
        });
      }

      if (route === "/api/health") {
        return sendJson(res, 200, {
          ok: true,
          message: "API local đang hoạt động.",
          note:
            "Mở /api/books để kiểm tra đọc database.",
        });
      }

      if (route === "/api/books") {
        const parsed = parseBookFilters(
          url.searchParams
        );

        if (parsed.error) {
          return sendJson(res, 400, {
            ok: false,
            message: parsed.error,
          });
        }

        const items = filterBooks(
          await repository.listBooks(),
          parsed.filters
        );

        return sendJson(res, 200, {
          ok: true,
          count: items.length,
          filters: parsed.filters,
          items,
        });
      }

      if (route === "/api/external-books") {
        if (
          url.searchParams.getAll("q").length !== 1 ||
          [...url.searchParams.keys()].some(
            (key) => key !== "q"
          )
        ) {
          return sendJson(res, 400, {
            ok: false,
            message:
              "Cần đúng một từ khóa q. " +
              "Ví dụ: /api/external-books?q=sherlock",
          });
        }

        try {
          const result = await searchGutenberg(
            url.searchParams.get("q")
          );

          return sendJson(res, 200, {
            ok: true,
            ...result,
          });
        } catch (error) {
          return sendJson(
            res,
            error.statusCode || 502,
            {
              ok: false,
              message:
                error.message ||
                "Chưa tra cứu được Project Gutenberg.",
            }
          );
        }
      }

      const readMatch = route.match(
        /^\/api\/books\/([^/]+)\/read$/
      );

      const detailMatch = route.match(
        /^\/api\/books\/([^/]+)$/
      );

      const match = readMatch || detailMatch;

      if (match) {
        const bookId = readBookId(match[1]);

        if (!bookId) {
          return sendJson(res, 400, {
            ok: false,
            message: "Mã sách không hợp lệ.",
          });
        }

        const item = await repository.getBook(bookId);

        if (!item) {
          return sendJson(res, 404, {
            ok: false,
            message:
              "Không tìm thấy sách đang hoạt động với mã này.",
          });
        }

        if (readMatch) {
          if (item.source === "AUTHOR") {
            return await sendAuthorPdf(res, bookId);
          }

          return await sendLocalBook(res, item);
        }

        return sendJson(res, 200, {
          ok: true,
          item,
        });
      }

      return sendJson(res, 404, {
        ok: false,
        message:
          "Không tìm thấy đường dẫn. " +
          "Bà thử mở /api/books nhé.",
      });
    } catch (error) {
      console.error(
        "Lỗi xử lý API:",
        error.message
      );

      if (res.headersSent) {
        return res.destroy();
      }

      return sendJson(res, 500, {
        ok: false,
        message:
          "Không đọc được dữ liệu. " +
          "Kiểm tra DynamoDB Local và terminal API.",
      });
    }
  });
}

async function main() {
  require("dotenv").config({
    path: path.join(__dirname, "..", ".env"),
    quiet: true,
  });

  const commands =
    require("@aws-sdk/lib-dynamodb");

  const { client, docClient } =
    require("../config/db");

  const { createAuth } = require("./auth");

  try {
    const configured =
      typeof client.config.endpoint === "function"
        ? await client.config.endpoint()
        : client.config.endpoint;

    const endpoint = configured?.url || configured;

    if (
      !endpoint ||
      endpoint.protocol !== "http:" ||
      ![
        "127.0.0.1",
        "localhost",
        "[::1]",
        "::1",
      ].includes(endpoint.hostname) ||
      String(endpoint.port) !== "8001"
    ) {
      throw new Error(
        "Cần dùng DynamoDB Local tại cổng 8001 trong config/db.js."
      );
    }

    const repository = createRepository(
      docClient,
      commands
    );

    const auth = createAuth(docClient, commands);

    const server = createApiServer(
      repository,
      auth
    );

    server.on("error", (error) => {
      console.error(
        error.code === "EADDRINUSE"
          ? "Cổng 3000 đang được dùng. " +
              "Bà dừng API cũ bằng Ctrl + C rồi chạy lại."
          : `Không khởi động được API: ${error.message}`
      );

      client.destroy();
      process.exitCode = 1;
    });

    server.listen(PORT, HOST, () => {
      console.log(
        `API đang chạy tại http://${HOST}:${PORT}`
      );

      console.log(
        `Đăng nhập: http://${HOST}:${PORT}/auth/login`
      );

      console.log(
        "Giữ terminal này mở. Nhấn Ctrl + C để dừng API."
      );
    });

    process.once("SIGINT", () => {
      console.log("\nĐang dừng API...");

      server.close(() => {
        client.destroy();
        console.log("Đã dừng API.");
      });
    });
  } catch (error) {
    client.destroy();
    throw error;
  }
}

module.exports = {
  createRepository,
  createApiServer,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(
      "Không khởi động được API:",
      error.message
    );

    process.exitCode = 1;
  });
}