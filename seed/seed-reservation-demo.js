const {
  TransactWriteCommand,
  TransactGetCommand,
} = require("@aws-sdk/lib-dynamodb");

const { client, docClient } = require("../config/db");

async function seedReservationDemo() {
  let saved = false;

  try {
    const now = new Date();
    const timestamp = now.toISOString();

    const vietnamDate = new Date(
      now.getTime() + 7 * 60 * 60 * 1000
    );

    vietnamDate.setUTCDate(
      vietnamDate.getUTCDate() + 14
    );

    const dueDate = vietnamDate.toISOString().slice(0, 10);

    const records = [
      {
        table: "Books",
        key: "bookId",
        item: {
          bookId: "BOOK002",
          title: "Lập trình Node.js - Sách mẫu",
          author: "Tác giả mẫu",
          category: "Programming",
          description: "Sách mẫu để thử chức năng đặt trước.",
          totalCopies: 1,
          availableCopies: 0,
          coverImageKey: null,
          status: "ACTIVE",
        },
      },
      {
        table: "BookCopies",
        key: "copyId",
        item: {
          copyId: "COPY004",
          bookId: "BOOK002",
          barcode: "COPY004",
          status: "BORROWED",
          currentLoanId: "LOAN002",
        },
      },
      {
        table: "Readers",
        key: "readerId",
        item: {
          readerId: "READER002",
          fullName: "Độc giả mẫu số 2",
          studentId: "SV002",
          email: "reader002@example.com",
          status: "ACTIVE",
          activeLoanCount: 1,
        },
      },
      {
        table: "Loans",
        key: "loanId",
        item: {
          loanId: "LOAN002",
          bookId: "BOOK002",
          copyId: "COPY004",
          readerId: "READER002",
          status: "BORROWED",
          borrowedAt: timestamp,
          dueDate,
          returnedAt: null,
          renewalCount: 0,
          fineAmount: 0,
          finePaymentStatus: "NOT_ASSESSED",
          confirmedBy: "LIBRARIAN_DEMO",
          rulesSnapshot: {
            maxActiveLoans: 3,
            loanDays: 14,
            dailyFineVnd: 5000,
            maxRenewals: 1,
            extensionDays: 7,
          },
        },
      },
    ];

    await docClient.send(
      new TransactWriteCommand({
        TransactItems: records.map((record) => ({
          Put: {
            TableName: record.table,
            Item: {
              ...record.item,
              createdAt: timestamp,
              updatedAt: timestamp,
            },
            ConditionExpression: "attribute_not_exists(#id)",
            ExpressionAttributeNames: {
              "#id": record.key,
            },
          },
        })),
      })
    );

    saved = true;
    console.log("Da tao tinh huong sach het ban san co!");

    const result = await docClient.send(
      new TransactGetCommand({
        TransactItems: records.map((record) => ({
          Get: {
            TableName: record.table,
            Key: {
              [record.key]: record.item[record.key],
            },
          },
        })),
      })
    );

    const [book, copy, reader, loan] =
      result.Responses.map((response) => response.Item);

    console.table([
      { field: "bookId", value: book.bookId },
      { field: "totalCopies", value: book.totalCopies },
      { field: "availableCopies", value: book.availableCopies },
      { field: "copyStatus", value: copy.status },
      { field: "borrower", value: reader.readerId },
      { field: "activeLoanCount", value: reader.activeLoanCount },
      { field: "loanStatus", value: loan.status },
    ]);
  } catch (error) {
    console.error(
      saved
        ? "Du lieu da luu, nhung doc lai ket qua bi loi."
        : "Chua hoan tat tao du lieu mau."
    );

    console.error(error.message);

    if (error.name === "TransactionCanceledException") {
      console.error(
        "Giao dich bi huy. Neu cac ma mau da ton tai, " +
        "script se khong ghi de."
      );
    }

    process.exitCode = 1;
  } finally {
    client.destroy();
  }
}

seedReservationDemo();