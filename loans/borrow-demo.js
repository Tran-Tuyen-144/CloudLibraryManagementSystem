const {
  TransactWriteCommand,
  TransactGetCommand,
} = require("@aws-sdk/lib-dynamodb");

const { client, docClient } = require("../config/db");

const loanId = "LOAN001";
const bookId = "BOOK001";
const copyId = "COPY001";
const readerId = "READER001";

const rules = {
  maxActiveLoans: 3,
  loanDays: 14,
  dailyFineVnd: 5000,
  maxRenewals: 1,
  extensionDays: 7,
};

async function borrowDemo() {
  let saved = false;

  try {
    const now = new Date();
    const timestamp = now.toISOString();

    // Tính ngày hạn trả theo múi giờ Việt Nam UTC+7.
    const vietnamDate = new Date(
      now.getTime() + 7 * 60 * 60 * 1000
    );

    vietnamDate.setUTCDate(
      vietnamDate.getUTCDate() + rules.loanDays
    );

    const dueDate = vietnamDate.toISOString().slice(0, 10);

    await docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: "Loans",
              Item: {
                loanId,
                bookId,
                copyId,
                readerId,
                status: "BORROWED",
                createdAt: timestamp,
                borrowedAt: timestamp,
                dueDate,
                returnedAt: null,
                renewalCount: 0,
                fineAmount: 0,
                finePaymentStatus: "NOT_ASSESSED",
                rulesSnapshot: rules,
                confirmedBy: "LIBRARIAN_DEMO",
                updatedAt: timestamp,
              },
              ConditionExpression:
                "attribute_not_exists(loanId)",
            },
          },
          {
            Update: {
              TableName: "BookCopies",
              Key: { copyId },
              UpdateExpression:
                "SET #s = :borrowed, " +
                "currentLoanId = :loan, updatedAt = :now",
              ConditionExpression:
                "bookId = :book AND #s = :available " +
                "AND attribute_not_exists(currentLoanId)",
              ExpressionAttributeNames: {
                "#s": "status",
              },
              ExpressionAttributeValues: {
                ":borrowed": "BORROWED",
                ":available": "AVAILABLE",
                ":loan": loanId,
                ":book": bookId,
                ":now": timestamp,
              },
            },
          },
          {
            Update: {
              TableName: "Books",
              Key: { bookId },
              UpdateExpression:
                "SET availableCopies = availableCopies - :one, " +
                "updatedAt = :now",
              ConditionExpression:
                "#s = :active AND availableCopies > :zero",
              ExpressionAttributeNames: {
                "#s": "status",
              },
              ExpressionAttributeValues: {
                ":one": 1,
                ":zero": 0,
                ":active": "ACTIVE",
                ":now": timestamp,
              },
            },
          },
          {
            Update: {
              TableName: "Readers",
              Key: { readerId },
              UpdateExpression:
                "SET activeLoanCount = activeLoanCount + :one, " +
                "updatedAt = :now",
              ConditionExpression:
                "#s = :active AND activeLoanCount >= :zero " +
                "AND activeLoanCount < :limit",
              ExpressionAttributeNames: {
                "#s": "status",
              },
              ExpressionAttributeValues: {
                ":one": 1,
                ":zero": 0,
                ":limit": rules.maxActiveLoans,
                ":active": "ACTIVE",
                ":now": timestamp,
              },
            },
          },
        ],
      })
    );

    saved = true;
    console.log("Da xac nhan muon sach thanh cong!");

    // Đọc lại cả 4 bản ghi trong một lần đọc giao dịch.
    const result = await docClient.send(
      new TransactGetCommand({
        TransactItems: [
          { Get: { TableName: "Loans", Key: { loanId } } },
          { Get: { TableName: "Books", Key: { bookId } } },
          { Get: { TableName: "BookCopies", Key: { copyId } } },
          { Get: { TableName: "Readers", Key: { readerId } } },
        ],
      })
    );

    const [loan, book, copy, reader] =
      result.Responses.map((response) => response.Item);

    console.table([
      { field: "loanId", value: loan.loanId },
      { field: "loanStatus", value: loan.status },
      { field: "copyStatus", value: copy.status },
      { field: "availableCopies", value: book.availableCopies },
      { field: "activeLoanCount", value: reader.activeLoanCount },
      { field: "dueDate", value: loan.dueDate },
    ]);
  } catch (error) {
    if (saved) {
      console.error(
        "Phieu da luu, nhung doc lai ket qua bi loi."
      );
    } else {
      console.error("Chua hoan tat xac nhan muon.");

      if (error.name === "TransactionCanceledException") {
        console.error(
          "Kiem tra: LOAN001 da ton tai, ban sach khong " +
          "san sang, hoac doc gia khong du dieu kien."
        );
      }
    }

    console.error(error.message);
    process.exitCode = 1;
  } finally {
    client.destroy();
  }
}

borrowDemo();