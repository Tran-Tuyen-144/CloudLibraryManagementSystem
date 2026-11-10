const {
  GetCommand,
  TransactWriteCommand,
} = require("@aws-sdk/lib-dynamodb");

const { client, docClient } = require("../config/db");

const readerId = "READER001";
const bookId = "BOOK002";
const copyId = "COPY004";

async function getItem(table, key) {
  const result = await docClient.send(
    new GetCommand({
      TableName: table,
      Key: key,
      ConsistentRead: true,
    })
  );

  return result.Item;
}

function addDays(value, days) {
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

  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function condition(table, key, expression, values, names) {
  return {
    ConditionCheck: {
      TableName: table,
      Key: key,
      ConditionExpression: expression,
      ExpressionAttributeValues: values,
      ...(names ? { ExpressionAttributeNames: names } : {}),
    },
  };
}

async function loadLoan() {
  const copy = await getItem("BookCopies", { copyId });

  if (
    !copy ||
    copy.status !== "BORROWED" ||
    copy.bookId !== bookId ||
    !copy.currentLoanId
  ) {
    throw new Error("COPY004 hien khong o trang thai dang muon.");
  }

  const loan = await getItem("Loans", {
    loanId: copy.currentLoanId,
  });

  if (
    !loan ||
    loan.readerId !== readerId ||
    loan.bookId !== bookId ||
    loan.copyId !== copyId
  ) {
    throw new Error("Phieu muon khong khop doc gia va ban sach.");
  }

  return loan;
}

function showLoan(loan) {
  console.log("Ma phieu:", loan.loanId);

  console.table([
    { field: "readerId", value: loan.readerId },
    { field: "copyId", value: loan.copyId },
    { field: "status", value: loan.status },
    { field: "dueDate", value: loan.dueDate },
    { field: "renewalCount", value: loan.renewalCount },
    {
      field: "renewalRequestStatus",
      value: loan.renewalRequestStatus || "NONE",
    },
  ]);
}

async function processRenewal(loan, action) {
  if (
    action === "request" &&
    loan.renewalRequestStatus === "PENDING"
  ) {
    console.log("Da co yeu cau dang cho duyet.");
    return false;
  }

  const now = new Date();
  const timestamp = now.toISOString();

  const today = new Date(
    now.getTime() + 7 * 60 * 60 * 1000
  ).toISOString().slice(0, 10);

  const maxRenewals = loan.rulesSnapshot?.maxRenewals;
  const extensionDays = loan.rulesSnapshot?.extensionDays;

  if (
    !Number.isSafeInteger(maxRenewals) ||
    maxRenewals < 1 ||
    !Number.isSafeInteger(extensionDays) ||
    extensionDays < 1 ||
    !Number.isSafeInteger(loan.renewalCount) ||
    loan.renewalCount < 0
  ) {
    throw new Error("Quy dinh hoac so lan gia han khong hop le.");
  }

  const newDueDate = addDays(loan.dueDate, extensionDays);

  if (loan.status !== "BORROWED") {
    throw new Error("Chi gia han phieu dang muon.");
  }

  if (loan.dueDate < today) {
    throw new Error("Phieu da qua han, khong duoc gia han.");
  }

  if (loan.renewalCount >= maxRenewals) {
    throw new Error("Da het luot gia han cho phep.");
  }

  if (
    action === "approve" &&
    loan.renewalRequestStatus !== "PENDING"
  ) {
    throw new Error("Chua co yeu cau PENDING de duyet.");
  }

  const values = {
    ":borrowed": "BORROWED",
    ":reader": readerId,
    ":book": bookId,
    ":copy": copyId,
    ":oldDue": loan.dueDate,
    ":today": today,
    ":oldCount": loan.renewalCount,
    ":max": maxRenewals,
    ":version": loan.updatedAt,
    ":now": timestamp,
    ":pending": "PENDING",
  };

  let expression;
  let requestCondition;

  if (action === "request") {
    expression =
      "SET renewalRequestStatus = :pending, " +
      "renewalRequestedAt = :now, " +
      "renewalRequestedBy = :reader, updatedAt = :now";

    requestCondition =
      "(attribute_not_exists(renewalRequestStatus) " +
      "OR renewalRequestStatus = :rejected)";

    values[":rejected"] = "REJECTED";
  } else {
    expression =
      "SET dueDate = :newDue, " +
      "renewalCount = renewalCount + :one, " +
      "renewalRequestStatus = :approved, " +
      "renewalApprovedAt = :now, " +
      "renewalApprovedBy = :staff, updatedAt = :now, " +
      "renewalHistory = list_append(" +
      "if_not_exists(renewalHistory, :empty), :history)";

    requestCondition = "renewalRequestStatus = :pending";

    Object.assign(values, {
      ":newDue": newDueDate,
      ":one": 1,
      ":approved": "APPROVED",
      ":staff": "LIBRARIAN_DEMO",
      ":empty": [],
      ":history": [
        {
          previousDueDate: loan.dueDate,
          newDueDate,
          approvedAt: timestamp,
          approvedBy: "LIBRARIAN_DEMO",
        },
      ],
    });
  }

  await docClient.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Update: {
            TableName: "Loans",
            Key: { loanId: loan.loanId },
            UpdateExpression: expression,
            ConditionExpression:
              "#s = :borrowed AND readerId = :reader " +
              "AND bookId = :book AND copyId = :copy " +
              "AND dueDate = :oldDue AND dueDate >= :today " +
              "AND renewalCount = :oldCount " +
              "AND renewalCount < :max " +
              "AND updatedAt = :version AND " +
              requestCondition,
            ExpressionAttributeNames: {
              "#s": "status",
            },
            ExpressionAttributeValues: values,
          },
        },

        condition(
          "Readers",
          { readerId },
          "#s = :active",
          { ":active": "ACTIVE" },
          { "#s": "status" }
        ),

        condition(
          "Books",
          { bookId },
          "#s = :active " +
            "AND (attribute_not_exists(waitingReservationCount) " +
            "OR waitingReservationCount = :zero) " +
            "AND (attribute_not_exists(heldCopies) " +
            "OR heldCopies = :zero)",
          {
            ":active": "ACTIVE",
            ":zero": 0,
          },
          { "#s": "status" }
        ),

        condition(
          "BookCopies",
          { copyId },
          "#s = :borrowed AND currentLoanId = :loan " +
            "AND bookId = :book",
          {
            ":borrowed": "BORROWED",
            ":loan": loan.loanId,
            ":book": bookId,
          },
          { "#s": "status" }
        ),
      ],
    })
  );

  console.log(
    action === "request"
      ? "Da gui yeu cau gia han. Han tra chua thay doi."
      : "Da duyet gia han thanh cong!"
  );

  return true;
}

async function main() {
  let saved = false;

  try {
    const action = process.argv[2];

    if (
      process.argv.length !== 3 ||
      !["show", "request", "approve"].includes(action)
    ) {
      throw new Error(
        "Cach dung: node loans/renewal-demo.js " +
        "show|request|approve"
      );
    }

    const loan = await loadLoan();

    if (action === "show") {
      showLoan(loan);
      return;
    }

    saved = await processRenewal(loan, action);

    const refreshed = await getItem("Loans", {
      loanId: loan.loanId,
    });

    if (!refreshed) {
      throw new Error("Khong doc lai duoc phieu muon.");
    }

    showLoan(refreshed);
  } catch (error) {
    console.error(
      saved
        ? "Thao tac da luu, nhung doc lai ket qua bi loi."
        : "Chua hoan tat thao tac."
    );

    console.error(error.message);

    if (error.name === "TransactionCanceledException") {
      console.error(
        "Kiem tra trang thai phieu, tai khoan, " +
        "han tra va nguoi dat truoc sach."
      );
    }

    process.exitCode = 1;
  } finally {
    client.destroy();
  }
}

main();