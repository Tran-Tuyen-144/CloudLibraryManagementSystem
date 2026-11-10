const {
  ScanCommand,
  GetCommand,
  TransactWriteCommand,
} = require("@aws-sdk/lib-dynamodb");

const { client, docClient } = require("../config/db");

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

function reminderFor(loan, today) {
  if (!["BORROWED", "OVERDUE"].includes(loan.status)) {
    return null;
  }

  const todayDay = dayNumber(today);
  const daysLeft = dayNumber(loan.dueDate) - todayDay;
  const borrowed = new Date(loan.borrowedAt);

  if (!Number.isFinite(borrowed.getTime())) {
    throw new Error("Ngay muon khong hop le.");
  }

  if (
    todayDay < dayNumber(vietnamDay(borrowed)) ||
    daysLeft > 2
  ) {
    return null;
  }

  const rate = loan.rulesSnapshot?.dailyFineVnd;

  if (!Number.isSafeInteger(rate) || rate < 0) {
    throw new Error("Muc phat khong hop le.");
  }

  const overdueDays = Math.max(0, -daysLeft);
  const fineAmountEstimate = overdueDays * rate;

  if (!Number.isSafeInteger(fineAmountEstimate)) {
    throw new Error("Tien phat khong hop le.");
  }

  return {
    type: overdueDays > 0 ? "OVERDUE" : "DUE_SOON",
    daysLeft,
    overdueDays,
    fineAmountEstimate,
  };
}

async function loadActiveLoans() {
  const loans = new Map();
  let lastKey;

  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: "Loans",
        FilterExpression: "#s IN (:borrowed, :overdue)",
        ExpressionAttributeNames: {
          "#s": "status",
        },
        ExpressionAttributeValues: {
          ":borrowed": "BORROWED",
          ":overdue": "OVERDUE",
        },
        ConsistentRead: true,
        ExclusiveStartKey: lastKey,
      })
    );

    for (const loan of result.Items || []) {
      loans.set(loan.loanId, loan);
    }

    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  return [...loans.values()];
}

async function getBookTitle(bookId) {
  const result = await docClient.send(
    new GetCommand({
      TableName: "Books",
      Key: { bookId },
      ConsistentRead: true,
    })
  );

  return result.Item?.title || `Sách có mã ${bookId}`;
}

async function main() {
  let created = 0;
  let skipped = 0;

  try {
    const args = process.argv.slice(2);
    const mode = args[0];

    const valid =
      (mode === "preview" && [1, 2].includes(args.length)) ||
      (mode === "run" && args.length === 1);

    if (!valid) {
      throw new Error(
        "Cach dung:\n" +
        "node notifications/reminders-demo.js preview [YYYY-MM-DD]\n" +
        "node notifications/reminders-demo.js run"
      );
    }

    const today =
      mode === "preview" && args[1]
        ? args[1]
        : vietnamDay(new Date());

    dayNumber(today);

    console.log("Ngay kiem tra (Viet Nam):", today);

    const loans = await loadActiveLoans();
    const candidates = [];

    for (const loan of loans) {
      const reminder = reminderFor(loan, today);

      if (reminder) {
        if (
          !loan.loanId ||
          !loan.readerId ||
          !loan.bookId ||
          !loan.updatedAt
        ) {
          throw new Error("Phieu muon thieu thong tin bat buoc.");
        }

        candidates.push({ loan, reminder });
      }
    }

    if (candidates.length === 0) {
      console.log("Khong co phieu can nhac vao ngay nay.");
      return;
    }

    console.table(
      candidates.map(({ loan, reminder }) => ({
        bookId: loan.bookId,
        dueDate: loan.dueDate,
        type: reminder.type,
        daysLeft: reminder.daysLeft,
        fineEstimateVND: reminder.fineAmountEstimate,
      }))
    );

    if (mode === "preview") {
      console.log("Chi xem thu. Chua luu thong bao.");
      return;
    }

    for (const { loan, reminder } of candidates) {
      const timestamp = new Date().toISOString();
      const title = await getBookTitle(loan.bookId);

      const notificationId =
        `REMINDER#${loan.loanId}#${loan.dueDate}#${today}`;

      const message =
        reminder.type === "OVERDUE"
          ? `${title} đã quá hạn ${reminder.overdueDays} ngày. ` +
            `Tiền phạt tạm tính: ` +
            `${reminder.fineAmountEstimate.toLocaleString("vi-VN")} đồng.`
          : reminder.daysLeft === 0
            ? `${title} đến hạn trả hôm nay (${loan.dueDate}).`
            : `${title} còn ${reminder.daysLeft} ngày đến hạn trả ` +
              `(${loan.dueDate}).`;

      try {
        await docClient.send(
          new TransactWriteCommand({
            TransactItems: [
              {
                ConditionCheck: {
                  TableName: "Loans",
                  Key: { loanId: loan.loanId },
                  ConditionExpression:
                    "#s = :status AND readerId = :reader " +
                    "AND dueDate = :due AND updatedAt = :version",
                  ExpressionAttributeNames: {
                    "#s": "status",
                  },
                  ExpressionAttributeValues: {
                    ":status": loan.status,
                    ":reader": loan.readerId,
                    ":due": loan.dueDate,
                    ":version": loan.updatedAt,
                  },
                },
              },
              {
                Put: {
                  TableName: "Notifications",
                  Item: {
                    notificationId,
                    readerId: loan.readerId,
                    bookId: loan.bookId,
                    copyId: loan.copyId,
                    loanId: loan.loanId,
                    type: reminder.type,
                    channel: "IN_APP",
                    deliveryStatus: "STORED",
                    message,
                    asOfDate: today,
                    dueDate: loan.dueDate,
                    overdueDays: reminder.overdueDays,
                    fineAmountEstimate: reminder.fineAmountEstimate,
                    readAt: null,
                    createdAt: timestamp,
                    updatedAt: timestamp,
                  },
                  ConditionExpression:
                    "attribute_not_exists(notificationId)",
                },
              },
            ],
          })
        );

        created += 1;
      } catch (error) {
        const conditionFailed =
          error.name === "TransactionCanceledException" &&
          error.CancellationReasons?.some(
            (reason) => reason.Code === "ConditionalCheckFailed"
          );

        if (conditionFailed) {
          // Thông báo đã tồn tại hoặc phiếu đã thay đổi.
          skipped += 1;
          continue;
        }

        throw error;
      }
    }

    console.log(`Da tao: ${created} thong bao local.`);
    console.log(`Bo qua do trung hoac du lieu thay doi: ${skipped}.`);
  } catch (error) {
    console.error("Khong hoan tat kiem tra:", error.message);

    if (created > 0) {
      console.error(
        `Da luu ${created} thong bao truoc khi gap loi.`
      );
    }

    process.exitCode = 1;
  } finally {
    client.destroy();
  }
}

main();