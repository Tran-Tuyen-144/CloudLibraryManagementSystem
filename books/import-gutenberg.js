"use strict";

const {
  searchGutenberg,
} = require("../api/gutenberg");

function buildBook(
  item,
  at = new Date().toISOString()
) {
  if (
    item?.source !== "PROJECT_GUTENBERG" ||
    item.metadataProvider !== "GUTENDEX" ||
    !/^[1-9]\d{0,8}$/.test(item.externalId) ||
    typeof item.title !== "string" ||
    !item.title.trim()
  ) {
    throw new Error(
      "Thông tin sách Gutenberg không hợp lệ."
    );
  }

  const authors = Array.isArray(item.authors)
    ? item.authors.filter(
        (name) =>
          typeof name === "string" &&
          name.trim()
      )
    : [];

  const sourceUrl =
    `https://www.gutenberg.org/ebooks/${item.externalId}`;

  return {
    bookId: `BOOK_PG_${item.externalId}`,

    title: item.title.trim(),
    author:
      authors.join(", ") || "Chưa rõ tác giả",
    authors,

    category: "Chưa phân loại",
    subjects: item.subjects || [],
    languages: item.languages || [],
    description: item.description ?? null,

    firstPublishYear: null,
    coverUrl: item.coverUrl ?? null,
    coverImageKey: null,

    source: "PROJECT_GUTENBERG",
    metadataProvider: "GUTENDEX",
    externalId: item.externalId,
    sourceUrl,
    readUrl: sourceUrl,

    metadataLevel: "EBOOK",

    // Nhập sách điện tử không tạo bản sách giấy.
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

      // Sách đã có thì đọc lại, không ghi đè.
      const { Item } = await docClient.send(
        new GetCommand({
          TableName: "Books",
          Key: {
            bookId: book.bookId,
          },
          ConsistentRead: true,
        })
      );

      if (
        !Item ||
        Item.source !== book.source ||
        Item.externalId !== book.externalId
      ) {
        throw new Error(
          "Mã sách đang trùng hoặc dữ liệu vừa thay đổi. " +
            "Cần kiểm tra lại."
        );
      }

      return {
        created: false,
        item: Item,
      };
    }
  };
}

async function requireLocal(client) {
  const configured =
    typeof client.config.endpoint === "function"
      ? await client.config.endpoint()
      : client.config.endpoint;

  const raw = configured?.url || configured;

  let endpoint;

  try {
    endpoint =
      typeof raw === "string"
        ? new URL(raw)
        : raw;
  } catch {
    // Kiểm tra và báo lỗi ở bên dưới.
  }

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
      "Chỉ nhập vào DynamoDB Local tại cổng 8001."
    );
  }
}

async function main() {
  const [
    mode,
    query,
    id,
    ...extra
  ] = process.argv.slice(2);

  if (
    !["preview", "run"].includes(mode) ||
    !query?.trim() ||
    !/^[1-9]\d{0,8}$/.test(id || "") ||
    extra.length
  ) {
    throw new Error(
      'Cách dùng: node books/import-gutenberg.js ' +
        'preview|run "TỪ_KHÓA" MÃ_GUTENBERG'
    );
  }

  const result = await searchGutenberg(query);

  const item = result.items.find(
    (book) => book.externalId === id
  );

  if (!item) {
    throw new Error(
      "Mã sách không nằm trong kết quả tìm kiếm. " +
        "Bà chọn externalId trong kết quả hiện tại nhé."
    );
  }

  const book = buildBook(item);

  console.table([
    {
      "Mã sách": book.bookId,
      "Tên sách": book.title,
      "Tác giả": book.author,
      "Có bìa": book.coverUrl ? "Có" : "Không",
      "Bản giấy": book.totalCopies,
    },
  ]);

  console.log(
    "Trang đọc sách:",
    book.readUrl
  );

  if (mode === "preview") {
    console.log(
      "Chỉ xem trước, chưa lưu vào database."
    );
    return;
  }

  const commands =
    require("@aws-sdk/lib-dynamodb");

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
        ? "Đã nhập sách Gutenberg vào thư viện."
        : "Sách đã tồn tại. " +
            "Giữ nguyên dữ liệu và số lượng hiện có."
    );

    console.log(
      "Mã sách:",
      saved.item.bookId
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