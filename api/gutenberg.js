"use strict";

function apiError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

const cache = new Map();

let queue = Promise.resolve();
let lastRequestAt = 0;
let cooldownUntil = 0;

const wait = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function searchGutenberg(query) {
  if (
    typeof query !== "string" ||
    !query.trim() ||
    query.trim().length > 120
  ) {
    throw apiError(
      400,
      "Từ khóa tìm sách cần có từ 1 đến 120 ký tự."
    );
  }

  const q = query.trim();
  const cacheKey = q.toLowerCase();

  const task = queue.then(async () => {
    const saved = cache.get(cacheKey);

    if (saved && saved.expiresAt > Date.now()) {
      return {
        ...saved.result,
        query: q,
        fromCache: true,
      };
    }

    if (Date.now() < cooldownUntil) {
      throw apiError(
        503,
        "Nguồn sách đang giới hạn truy cập. Bà thử lại sau nhé."
      );
    }

    const delay = Math.max(
      0,
      1100 - (Date.now() - lastRequestAt)
    );

    if (delay > 0) {
      await wait(delay);
    }

    lastRequestAt = Date.now();

    const url = new URL(
      "https://gutendex.com/books/"
    );

    url.searchParams.set("search", q);
    url.searchParams.set("copyright", "false");

    let result;

    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(30000),
      });

      if (response.status === 429) {
        const retry =
          response.headers.get("retry-after");

        const seconds =
          retry && /^\d+$/.test(retry)
            ? Number(retry)
            : 0;

        const retryDate = retry
          ? Date.parse(retry)
          : NaN;

        cooldownUntil = Math.max(
          Date.now() + 60000,
          seconds
            ? Date.now() + seconds * 1000
            : 0,
          Number.isFinite(retryDate)
            ? retryDate
            : 0
        );

        throw apiError(
          503,
          "Nguồn sách đang giới hạn truy cập. Bà thử lại sau nhé."
        );
      }

      if (response.status === 403) {
        throw apiError(
          502,
          "Gutendex đang từ chối kết nối (403). Cần kiểm tra lại nguồn kết nối."
        );
      }

      if (!response.ok) {
        throw apiError(
          502,
          "Chưa lấy được sách Gutenberg. Bà thử lại sau nhé."
        );
      }

      const payload = await response.json();

      if (
        !payload ||
        !Array.isArray(payload.results)
      ) {
        throw apiError(
          502,
          "Dữ liệu sách Gutenberg trả về không hợp lệ."
        );
      }

      const items = payload.results
        .filter(
          (book) =>
            book &&
            Number.isSafeInteger(book.id) &&
            book.id > 0 &&
            typeof book.title === "string" &&
            book.title.trim() &&
            book.media_type === "Text" &&
            book.copyright === false
        )
        .slice(0, 5)
        .map((book) => {
          const formats =
            book.formats &&
            typeof book.formats === "object"
              ? book.formats
              : {};

          const sourceUrl =
            `https://www.gutenberg.org/ebooks/${book.id}`;

          return {
            source: "PROJECT_GUTENBERG",
            metadataProvider: "GUTENDEX",

            externalId: String(book.id),
            title: book.title.trim(),

            authors: Array.isArray(book.authors)
              ? book.authors
                  .map((author) => author?.name)
                  .filter(
                    (name) =>
                      typeof name === "string" &&
                      name.trim()
                  )
              : [],

            firstPublishYear: null,

            coverUrl:
              formats["image/jpeg"] ||
              formats["image/png"] ||
              null,

            description: Array.isArray(book.summaries)
              ? book.summaries
                  .filter(
                    (text) => typeof text === "string"
                  )
                  .join("\n\n") || null
              : null,

            languages: Array.isArray(book.languages)
              ? book.languages
              : [],

            subjects: Array.isArray(book.subjects)
              ? book.subjects
              : [],

            sourceUrl,
            readUrl: sourceUrl,
          };
        });

      result = {
        source: "PROJECT_GUTENBERG",
        metadataProvider: "GUTENDEX",
        query: q,
        count: items.length,
        items,
      };
    } catch (error) {
      if (error.statusCode) {
        throw error;
      }

      if (
        ["TimeoutError", "AbortError"].includes(
          error.name
        )
      ) {
        throw apiError(
          504,
          "Nguồn sách phản hồi quá lâu. Bà thử lại sau nhé."
        );
      }

      throw apiError(
        502,
        "Không lấy được dữ liệu từ Gutendex. Bà kiểm tra Internet và thử lại nhé."
      );
    }

    cache.delete(cacheKey);

    if (cache.size >= 50) {
      cache.delete(cache.keys().next().value);
    }

    cache.set(cacheKey, {
      result,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    return {
      ...result,
      fromCache: false,
    };
  });

  queue = task.catch(() => {});

  return task;
}

module.exports = {
  searchGutenberg,
};