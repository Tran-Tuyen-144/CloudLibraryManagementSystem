import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bundledBooks } from "../server/data/standard-ebooks/books.mjs";

// An independent, read-only API for the bundled public books. This entry point
// deliberately imports no repository, AWS SDK, account data or database config.
const normalize = (text) =>
  String(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const metadata = ({ chapters, ...book }) => ({
  ...book,
  hasChapters: true,
  chapterCount: chapters.length,
  detailsUrl: `/api/v1/books/${encodeURIComponent(book.id)}`,
});
const staticFiles = new Map([
  [
    "/",
    {
      file: new URL("./books-preview.html", import.meta.url),
      type: "text/html; charset=utf-8",
    },
  ],
  [
    "/assets/book-description.js",
    {
      file: new URL("../src/data/bookDescription.js", import.meta.url),
      type: "text/javascript; charset=utf-8",
    },
  ],
  ...bundledBooks.map((book) => [
    book.cover,
    {
      file: new URL("../public" + book.cover, import.meta.url),
      type: "image/jpeg",
    },
  ]),
]);

export function createBooksApi() {
  return createServer(async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    const send = (status, body) => {
      response.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
      });
      response.end(
        request.method === "HEAD" ? undefined : JSON.stringify(body, null, 2),
      );
    };
    try {
      if (!["GET", "HEAD"].includes(request.method)) {
        response.setHeader("Allow", "GET, HEAD");
        return send(405, { error: "Chế độ thử API chỉ hỗ trợ đọc sách." });
      }
      const url = new URL(request.url, "http://127.0.0.1");
      if (url.pathname === "/favicon.ico") {
        response.writeHead(204);
        response.end();
        return;
      }
      const asset = staticFiles.get(url.pathname);
      if (asset) {
        const bytes = await readFile(asset.file);
        response.writeHead(200, { "Content-Type": asset.type });
        response.end(request.method === "HEAD" ? undefined : bytes);
        return;
      }
      if (url.pathname === "/api/v1/health") {
        return send(200, {
          ok: true,
          mode: "books-api-test",
          database: false,
          books: bundledBooks.length,
          progressSaved: false,
        });
      }
      if (url.pathname === "/api/v1/books") {
        const q = url.searchParams.get("q") || "";
        if (q.length > 120)
          return send(400, { error: "Từ khóa tối đa 120 ký tự." });
        const words = normalize(q).split(/\s+/).filter(Boolean);
        const books = bundledBooks.filter((book) =>
          words.every((word) =>
            normalize(book.title + " " + book.author).includes(word),
          ),
        );
        return send(200, {
          data: books.map(metadata),
          total: books.length,
          source: "Standard Ebooks",
          mode: "books-api-test",
        });
      }
      const match = url.pathname.match(
        /^\/api\/v1\/books\/([^/]+)(?:\/chapters\/([^/]+))?$/,
      );
      if (match) {
        const book = bundledBooks.find(
          (item) => item.id === decodeURIComponent(match[1]),
        );
        if (!book) return send(404, { error: "Không tìm thấy sách." });
        if (match[2]) {
          const chapter = book.chapters.find(
            (item) => item.id === decodeURIComponent(match[2]),
          );
          if (!chapter) return send(404, { error: "Không tìm thấy chương." });
          return send(200, { data: { bookId: book.id, ...chapter } });
        }
        return send(200, {
          data: {
            ...metadata(book),
            chapters: book.chapters.map(({ id, title, content }) => ({
              id,
              title,
              characters: content.length,
              href: `/api/v1/books/${encodeURIComponent(book.id)}/chapters/${encodeURIComponent(id)}`,
            })),
          },
        });
      }
      return send(404, {
        error: "Không có đường dẫn này trong API sách thử nghiệm.",
      });
    } catch (error) {
      if (error instanceof URIError)
        return send(400, { error: "Đường dẫn không hợp lệ." });
      console.error("Books API:", error.message);
      return send(500, { error: "Chưa đọc được dữ liệu sách." });
    }
  });
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  const server = createBooksApi();
  server.on("error", (error) => {
    console.error(
      error.code === "EADDRINUSE"
        ? "Cổng 3002 đang được dùng. Dừng phiên API sách cũ rồi chạy lại."
        : error.message,
    );
    process.exitCode = 1;
  });
  server.listen(3002, "127.0.0.1", () => {
    console.log("API sách độc lập: http://127.0.0.1:3002/");
    console.log(
      "12 sách Standard Ebooks có sẵn để thử đọc. Không kết nối database hoặc AWS.",
    );
    console.log("JSON: http://127.0.0.1:3002/api/v1/books");
    console.log(
      "Chế độ thử không lưu tài khoản hoặc tiến độ đọc. Dừng bằng Ctrl+C.",
    );
  });
  const stop = () => {
    server.closeAllConnections();
    server.close();
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
