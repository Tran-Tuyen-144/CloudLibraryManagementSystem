"use strict";

function buildBook(item, at = new Date().toISOString()) {
  if (
    item?.source !== "OPEN_LIBRARY" ||
    !/^OL\d+W$/.test(item.externalId) ||
    typeof item.title !== "string" ||
    !item.title.trim()
  ) {
    throw new Error(
      "Thông tin sách từ Open Library không hợp lệ."
    );
  }

  const authors = Array.isArray(item.authors)
    ? item.authors.filter(
        (x) => typeof x === "string" && x.trim()
      )
    : [];

  return {
    bookId: `BOOK_${item.externalId}`,
    title: item.title.trim(),
    author: authors.join(", ") || "Chưa rõ tác giả",
    authors,
    category: "Chưa phân loại",
    firstPublishYear: item.firstPublishYear ?? null,

    coverUrl: item.coverUrl ?? null,
    coverImageKey: null,

    source: "OPEN_LIBRARY",
    externalId: item.externalId,
    sourceUrl:
      `https://openlibrary.org/works/${item.externalId}`,
    metadataLevel: "WORK",

    totalCopies: 0,
    availableCopies: 0,
    heldCopies: 0,
    waitingReservationCount: 0,
    reservationVersion: 0,

    status: "ACTIVE",
    createdAt: at,
    updatedAt: at,
  };
}

function createImporter(
  docClient,
  { PutCommand, GetCommand }
) {
  return async function importBook(book) {
    try {
      await docClient.send(
        new PutCommand({
          TableName: "Books",
          Item: book,
          ConditionExpression:
            "attribute_not_exists(bookId)",
        })
      );

      return {
        created: true,
        item: book,
      };
    } catch (error) {
      if (
        error.name !==
        "ConditionalCheckFailedException"
      ) {
        throw error;
      }

      // Đã tồn tại thì đọc lại, giữ nguyên dữ liệu cũ.
      const result = await docClient.send(
        new GetCommand({
          TableName: "Books",
          Key: { bookId: book.bookId },
          ConsistentRead: true,
        })
      );

      if (
        !result.Item ||
        result.Item.source !== book.source ||
        result.Item.externalId !== book.externalId
      ) {
        throw new Error(
          "Mã sách đang trùng hoặc dữ liệu vừa thay đổi. " +
            "Cần kiểm tra lại."
        );
      }

      return {
        created: false,
        item: result.Item,
      };
    }
  };
}

async function requireLocal(client) {
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
      "Chỉ nhập sách vào DynamoDB Local tại cổng 8001."
    );
  }
}

async function main() {
  const [
    mode,
    query,
    externalId,
    ...extra
  ] = process.argv.slice(2);

  if (
    !["preview", "run"].includes(mode) ||
    !query?.trim() ||
    !/^OL\d+W$/.test(externalId || "") ||
    extra.length
  ) {
    throw new Error(
      'Cách dùng: node books/import-open-library.js ' +
        'preview|run "từ khóa" "mã Open Library"'
    );
  }

  const {
    searchOpenLibrary,
  } = require("../api/(old)open-library");

  const result = await searchOpenLibrary(query);

  const selected = result.items.find(
    (x) => x.externalId === externalId
  );

  if (!selected) {
    throw new Error(
      "Mã đã chọn không nằm trong kết quả tìm kiếm hiện tại. " +
        "Bà tra cứu lại mã trên /api/external-books " +
        "rồi chạy lại nhé."
    );
  }

  const book = buildBook(selected);

  console.log("Sách đã chọn:");

  console.table([
    {
      "Mã sách": book.bookId,
      "Tên sách": book.title,
      "Tác giả": book.author,
      "Có link bìa": book.coverUrl ? "Có" : "Không",
    },
  ]);

  if (mode === "preview") {
    console.log("Chỉ xem trước, chưa lưu vào database.");

    console.log(
      "Nếu nhập mới: tổng số bản và số bản có sẵn đều bằng 0."
    );

    return;
  }

  const commands = require("@aws-sdk/lib-dynamodb");

  const {
    client,
    docClient,
  } = require("../config/db");

  try {
    await requireLocal(client);

    const save = createImporter(
      docClient,
      commands
    );

    const saved = await save(book);

    console.log(
      saved.created
        ? "Đã nhập thông tin sách vào thư viện."
        : "Sách đã tồn tại. " +
            "Giữ nguyên thông tin và số lượng hiện có."
    );

    console.table([
      {
        "Mã sách": saved.item.bookId,
        "Tên sách": saved.item.title,
        "Tổng số bản": saved.item.totalCopies,
        "Có sẵn": saved.item.availableCopies,
      },
    ]);

    console.log(
      "Link bìa:",
      saved.item.coverUrl || "Chưa có"
    );
  } finally {
    client.destroy();
  }
}

module.exports = {
  buildBook,
  createImporter,
  requireLocal,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(
      "Chưa nhập được sách:",
      error.message
    );

    process.exitCode = 1;
  });
}