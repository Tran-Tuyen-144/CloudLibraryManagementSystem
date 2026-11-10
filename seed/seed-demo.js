const {
  TransactWriteCommand,
  GetCommand,
} = require("@aws-sdk/lib-dynamodb");

const { client, docClient } = require("../config/db");

const now = new Date().toISOString();

// Dữ liệu hư cấu để thử chức năng.
const book = {
  bookId: "BOOK001",
  title: "AWS cho người mới bắt đầu - Sách mẫu",
  author: "Tác giả mẫu",
  category: "Cloud Computing",
  description: "Dữ liệu mẫu dùng để kiểm tra hệ thống thư viện.",
  totalCopies: 3,
  availableCopies: 3,
  coverImageKey: null,
  status: "ACTIVE",
  createdAt: now,
  updatedAt: now,
};

const reader = {
  readerId: "READER001",
  fullName: "Độc giả mẫu",
  studentId: "SV001",
  email: "reader001@example.com",
  status: "ACTIVE",
  activeLoanCount: 0,
  createdAt: now,
  updatedAt: now,
};

const copies = ["COPY001", "COPY002", "COPY003"].map(
  (copyId) => ({
    copyId,
    bookId: book.bookId,
    barcode: copyId,
    status: "AVAILABLE",
    createdAt: now,
    updatedAt: now,
  })
);

const records = [
  { table: "Books", key: "bookId", item: book },
  ...copies.map((item) => ({
    table: "BookCopies",
    key: "copyId",
    item,
  })),
  { table: "Readers", key: "readerId", item: reader },
];

async function seedDemo() {
  try {
    // Ghi cả 5 bản ghi trong một giao dịch.
    // Chỉ thêm khi mã chưa tồn tại, tránh ghi đè dữ liệu cũ.
    await docClient.send(
      new TransactWriteCommand({
        TransactItems: records.map((record) => ({
          Put: {
            TableName: record.table,
            Item: record.item,
            ConditionExpression: "attribute_not_exists(#id)",
            ExpressionAttributeNames: {
              "#id": record.key,
            },
          },
        })),
      })
    );

    console.log("Da them du lieu mau thanh cong!");

    // Đọc lại dữ liệu vừa lưu để kiểm tra.
    const savedRecords = await Promise.all(
      records.map(async (record) => {
        const result = await docClient.send(
          new GetCommand({
            TableName: record.table,
            Key: {
              [record.key]: record.item[record.key],
            },
            ConsistentRead: true,
          })
        );

        if (!result.Item) {
          throw new Error(
            `Khong doc duoc: ${record.item[record.key]}`
          );
        }

        return {
          table: record.table,
          id: result.Item[record.key],
          bookId: result.Item.bookId || "-",
          status: result.Item.status,
        };
      })
    );

    console.table(savedRecords);
    console.log("Da doc lai du 5 ban ghi tu database.");
  } catch (error) {
    console.error("Khong hoan tat:", error.message);

    if (error.name === "TransactionCanceledException") {
      console.error(
        "Giao dich bi huy. Neu da chay thanh cong truoc do, " +
        "cac ma mau co the da ton tai. Script khong ghi de."
      );
    }

    process.exitCode = 1;
  } finally {
    client.destroy();
  }
}

seedDemo();