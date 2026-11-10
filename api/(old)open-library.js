"use strict";

function apiError(statusCode, message) {
  return Object.assign(
    new Error(message),
    { statusCode }
  );
}

function createSearchService({
  fetchImpl = globalThis.fetch,
  now = Date.now,
  wait = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  const cache = new Map();

  let queue = Promise.resolve();
  let lastRequestAt = -Infinity;
  let cooldownUntil = 0;

  return async function searchOpenLibrary(value) {
    const q = String(value ?? "")
      .trim()
      .replace(/\s+/g, " ");

    if (q.length < 2 || q.length > 100) {
      throw apiError(
        400,
        "Từ khóa tìm sách phải có từ 2 đến 100 ký tự."
      );
    }

    if (typeof fetchImpl !== "function") {
      throw apiError(
        500,
        "Cần dùng Node.js 18 trở lên để gọi Open Library."
      );
    }

    const cacheKey = q.toLowerCase();

    const task = queue.then(async () => {
      const saved = cache.get(cacheKey);

      // Dùng lại kết quả còn hạn.
      if (saved && saved.expiresAt > now()) {
        return {
          ...saved.result,
          query: q,
          fromCache: true,
        };
      }

      if (now() < cooldownUntil) {
        throw apiError(
          503,
          "Open Library đang giới hạn truy cập. " +
            "Bà thử lại sau nhé."
        );
      }

      // Mỗi lần gọi cách nhau ít nhất 1,1 giây.
      const delay = Math.max(
        0,
        1100 - (now() - lastRequestAt)
      );

      if (delay) {
        await wait(delay);
      }

      lastRequestAt = now();

      const url = new URL(
        "https://openlibrary.org/search.json"
      );

      url.searchParams.set("q", q);
      url.searchParams.set("limit", "5");

      url.searchParams.set(
        "fields",
        "key,title,author_name,first_publish_year,cover_i"
      );

      let result;

      try {
        const response = await fetchImpl(url, {
          headers: {
            Accept: "application/json",
            "User-Agent": "CloudLibraryStudentDemo/1.0",
          },
          signal: AbortSignal.timeout(10000),
        });

        if (response.status === 429) {
          const retry =
            response.headers?.get("retry-after");

          const seconds =
            retry && /^\d+$/.test(retry)
              ? Number(retry)
              : 0;

          const date = retry
            ? Date.parse(retry)
            : NaN;

          cooldownUntil = Math.max(
            now() + 60000,
            seconds ? now() + seconds * 1000 : 0,
            Number.isFinite(date) ? date : 0
          );

          throw apiError(
            503,
            "Open Library đang giới hạn truy cập. " +
              "Bà thử lại sau nhé."
          );
        }

        if (!response.ok) {
          throw apiError(
            502,
            "Open Library chưa trả được kết quả. " +
              "Bà thử lại sau nhé."
          );
        }

        const payload = await response.json();

        if (
          !payload ||
          !Array.isArray(payload.docs)
        ) {
          throw apiError(
            502,
            "Dữ liệu trả về từ Open Library không hợp lệ."
          );
        }

        const items = [];

        for (const doc of payload.docs.slice(0, 5)) {
          if (!doc || typeof doc !== "object") {
            continue;
          }

          const externalId =
            typeof doc.key === "string"
              ? doc.key.replace(/^\/works\//, "")
              : "";

          if (
            !/^OL\d+W$/.test(externalId) ||
            typeof doc.title !== "string"
          ) {
            continue;
          }

          items.push({
            source: "OPEN_LIBRARY",

            externalId,

            title: doc.title,

            authors: Array.isArray(doc.author_name)
              ? doc.author_name.filter(
                  (x) => typeof x === "string"
                )
              : [],

            firstPublishYear:
              Number.isSafeInteger(doc.first_publish_year)
                ? doc.first_publish_year
                : null,

            coverUrl:
              Number.isSafeInteger(doc.cover_i) &&
              doc.cover_i > 0
                ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg?default=false`
                : null,

            sourceUrl:
              `https://openlibrary.org/works/${externalId}`,
          });
        }

        result = {
          source: "OPEN_LIBRARY",
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
            "Open Library phản hồi quá lâu. " +
              "Bà thử lại sau nhé."
          );
        }

        throw apiError(
          502,
          "Không kết nối được Open Library. " +
            "Bà kiểm tra Internet và thử lại nhé."
        );
      }

      // Giữ tối đa 50 kết quả tìm kiếm trong bộ nhớ.
      if (cache.size >= 50) {
        cache.delete(cache.keys().next().value);
      }

      // Kết quả được lưu tạm trong 5 phút.
      cache.set(cacheKey, {
        result,
        expiresAt: now() + 5 * 60 * 1000,
      });

      return {
        ...result,
        fromCache: false,
      };
    });

    // Một lần gọi lỗi không làm kẹt những lần sau.
    queue = task.catch(() => {});

    return task;
  };
}

const searchOpenLibrary = createSearchService();

module.exports = {
  searchOpenLibrary,
  createSearchService,
};