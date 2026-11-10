const {
  GetCommand,
  TransactWriteCommand,
  TransactGetCommand,
} = require("@aws-sdk/lib-dynamodb");

const { client, docClient } = require("../config/db");

const loanId = "LOAN001";

function vietnamDay(date) {
  return new Date(
    date.getTime() + 7 * 60 * 60 * 1000
  ).toISOString().slice(0, 10);
}

function dayNumber(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Ngay phai co dang YYYY-MM-DD.");
  }

  const date = new Date(`${value}T00:00:00Z`);

  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new Error("Ngay khong hop le.");
  }

  return date.getTime() / 86400000;
}

async function returnDemo() {
  let saved = false;

  try {
    const args = process.argv.slice(2);
    const preview = args[0] === "--preview";

    if (args.length !== 0 && !(preview && args.length === 2)) {
      throw new Error(
        "Cach dung: node loans/return-demo.js " +
        "[--preview YYYY-MM-DD]"
      );
    }

    const result = await docClient.send(
      new GetCommand({
        TableName: "Loans",
        Key: { loanId },
        ConsistentRead: true,
      })
    );

    const loan = result.Item;

    if (!loan) {
      throw new Error("Khong tim thay phieu LOAN001.");
    }

    if (loan.status === "RETURNED") {
      console.log("Phieu nay da tra. Khong cap nhat lan nua.");
      return;
    }

    if (!["BORROWED", "OVERDUE"].includes(loan.status)) {
      throw new Error("Trang thai phieu khong cho phep tra.");
    }

    const now = new Date();
    const timestamp = now.toISOString();
    const returnDate = preview ? args[1] : vietnamDay(now);

    const returnDay = dayNumber(returnDate);
    const dueDay = dayNumber(loan.dueDate);

    if (returnDay < dayNumber(vietnamDay(new Date(loan.borrowedAt)))) {
      throw new Error("Ngay tra khong the truoc ngay muon.");
    }

    const dailyFine = loan.rulesSnapshot?.dailyFineVnd;

    if (!Number.isSafeInteger(dailyFine) || dailyFine < 0) {
      throw new Error("Muc phat trong phieu khong hop le.");
    }

    const overdueDays = Math.max(0, returnDay - dueDay);
    const fineAmount = overdueDays * dailyFine;

    if (!Number.isSafeInteger(fineAmount)) {
      throw new Error("So tien phat khong hop le.");
    }

    console.table([
      { field: "dueDate", value: loan.dueDate },
      { field: "returnDate", value: returnDate },
      { field: "overdueDays", value: overdueDays },
      { field: "fineAmount_VND", value: fineAmount },
    ]);

    if (preview) {
      console.log("Chi xem thu. Chua thay doi database.");
      return;
    }

    const { bookId, copyId, readerId } = loan;

    await docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: "Loans",
              Key: { loanId },
              UpdateExpression:
                "SET #s = :returned, returnedAt = :now, " +
                "overdueDays = :days, fineAmount = :fine, " +
                "finePaymentStatus = :payment, " +
                "returnedBy = :staff, updatedAt = :now",
              ConditionExpression:
                "#s = :oldStatus AND dueDate = :due " +
                "AND updatedAt = :version",
              ExpressionAttributeNames: { "#s": "status" },
              ExpressionAttributeValues: {
                ":returned": "RETURNED",
                ":oldStatus": loan.status,
                ":due": loan.dueDate,
                ":version": loan.updatedAt,
                ":now": timestamp,
                ":days": overdueDays,
                ":fine": fineAmount,
                ":payment": fineAmount > 0
                  ? "UNPAID"
                  : "NOT_REQUIRED",
                ":staff": "LIBRARIAN_DEMO",
              },
            },
          },
          {
            Update: {
              TableName: "BookCopies",
              Key: { copyId },
              UpdateExpression:
                "SET #s = :available, updatedAt = :now " +
                "REMOVE currentLoanId",
              ConditionExpression:
                "#s = :borrowed AND currentLoanId = :loan " +
                "AND bookId = :book",
              ExpressionAttributeNames: { "#s": "status" },
              ExpressionAttributeValues: {
                ":available": "AVAILABLE",
                ":borrowed": "BORROWED",
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
                "SET availableCopies = availableCopies + :one, " +
                "updatedAt = :now",
              ConditionExpression:
                "availableCopies >= :zero " +
                "AND availableCopies < totalCopies",
              ExpressionAttributeValues: {
                ":one": 1,
                ":zero": 0,
                ":now": timestamp,
              },
            },
          },
          {
            Update: {
              TableName: "Readers",
              Key: { readerId },
              UpdateExpression:
                "SET activeLoanCount = activeLoanCount - :one, " +
                "updatedAt = :now",
              ConditionExpression: "activeLoanCount > :zero",
              ExpressionAttributeValues: {
                ":one": 1,
                ":zero": 0,
                ":now": timestamp,
              },
            },
          },
        ],
      })
    );

    saved = true;
    console.log("Da xac nhan tra sach thanh cong!");

    const state = await docClient.send(
      new TransactGetCommand({
        TransactItems: [
          { Get: { TableName: "Loans", Key: { loanId } } },
          { Get: { TableName: "Books", Key: { bookId } } },
          { Get: { TableName: "BookCopies", Key: { copyId } } },
          { Get: { TableName: "Readers", Key: { readerId } } },
        ],
      })
    );

    const [savedLoan, book, copy, reader] =
      state.Responses.map((response) => response.Item);

    console.table([
      { field: "loanStatus", value: savedLoan.status },
      { field: "copyStatus", value: copy.status },
      { field: "availableCopies", value: book.availableCopies },
      { field: "activeLoanCount", value: reader.activeLoanCount },
      { field: "fineAmount_VND", value: savedLoan.fineAmount },
      { field: "finePaymentStatus", value: savedLoan.finePaymentStatus },
    ]);
  } catch (error) {
    console.error(
      saved
        ? "Da luu tra sach, nhung doc lai ket qua bi loi."
        : "Chua hoan tat thao tac."
    );
    console.error(error.message);

    if (error.name === "TransactionCanceledException") {
      console.error(
        "Du lieu da thay doi hoac khong dat dieu kien. " +
        "Giao dich tra sach bi huy."
      );
    }

    process.exitCode = 1;
  } finally {
    client.destroy();
  }
}

returnDemo();