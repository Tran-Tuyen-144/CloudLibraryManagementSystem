
import test from "node:test";
import assert from "node:assert/strict";

import {
  demoCopyCode,
  deriveDemoBookCopies,
  freezeLegacyCopySlots,
  nextAvailableCopySlot,
} from "../src/ui/bookCopyInventory.js";

import {
  availableBooks,
  flattenRequests,
  transitionRequest,
} from "../src/ui/borrowWorkflow.js";

import {
  saveManagedBook,
} from "../src/data/managementActions.js";

import {
  readerActivityNotifications,
} from "../src/data/readerActivityNotifications.js";

function book(overrides = {}) {
  return {
    id: "book-1",
    title: "AWS cơ bản",
    author: "Tác giả mẫu",
    category: "Công nghệ",
    isbn: "",
    cover: "",
    description: "",
    availableCopies: 3,
    maintenanceCopySlots: [],
    ...overrides,
  };
}

function loan(
  id,
  status,
  overrides = {},
) {
  return {
    id,
    bookId: "book-1",
    status,
    title: "AWS cơ bản",
    createdAt:
      "2026-11-20T08:00:00.000Z",
    ...overrides,
  };
}

function libraryState(
  b,
  requestsByEmail,
) {
  return {
    books: [b],
    requestsByEmail,

    categories: [
      {
        id: "cat:tech",
        name: "Công nghệ",
        aliases: [],
      },
    ],

    accounts: [
      {
        email:
          "admin@cloudlibrary.demo",
        fullName: "Admin",
        role: "admin",
        status: "active",
      },
    ],

    session: {
      email:
        "admin@cloudlibrary.demo",
      sessionVersion: 2,
    },
  };
}

test(
  "Tồn kho trừ bản giữ/mượn và bảo trì",
  () => {
    const b = book({
      maintenanceCopySlots: [2],
    });

    const rows = [
      loan(
        "one",
        "approved",
        {
          readerEmail:
            "r@example.com",
        },
      ),
    ];

    assert.equal(
      availableBooks(
        [b],
        rows,
      )[0].availableCopies,
      1,
    );

    assert.equal(
      availableBooks(
        [b],
        [
          ...rows,

          loan(
            "two",
            "borrowed",
            {
              readerEmail:
                "s@example.com",
            },
          ),
        ],
      )[0].availableCopies,
      0,
    );
  },
);

test(
  "Không duyệt mượn vượt tồn kho",
  () => {
    const b = book({
      availableCopies: 1,
      maintenanceCopySlots: [0],
    });

    const state = {
      "r@example.com": [
        loan("p", "pending"),
      ],
    };

    assert.deepEqual(
      transitionRequest(
        state,
        [b],
        {
          readerEmail:
            "r@example.com",
          id: "p",
          action: "approve",
        },
      ),

      {
        ok: false,
        error: "unavailable",
      },
    );
  },
);

test(
  "Duyệt mượn gắn copySlot và giữ khi trả",
  () => {
    const b = book({
      maintenanceCopySlots: [0],
    });

    let state = {
      "r@example.com": [
        loan("p", "pending"),
      ],
    };

    let result = transitionRequest(
      state,
      [b],
      {
        readerEmail:
          "r@example.com",
        id: "p",
        action: "approve",
      },
    );

    assert.equal(
      result.ok,
      true,
    );

    state = result.state;

    assert.equal(
      state["r@example.com"][0]
        .copySlot,
      1,
    );

    result = transitionRequest(
      state,
      [b],
      {
        readerEmail:
          "r@example.com",
        id: "p",
        action: "handover",
        dueDate: "2026-11-30",
      },
      new Date(
        "2026-11-23T08:00:00",
      ),
    );

    assert.equal(
      result.ok,
      true,
    );

    state = result.state;

    assert.equal(
      state["r@example.com"][0]
        .copySlot,
      1,
    );

    const originalCode =
      demoCopyCode(b.id, 1);

    const projected =
      deriveDemoBookCopies(
        [book()],
        flattenRequests(state),
      );

    assert.equal(
      projected.find(
        (item) =>
          item.loanId === "p",
      )?.code,
      originalCode,
    );

    result = transitionRequest(
      state,
      [book()],
      {
        readerEmail:
          "r@example.com",
        id: "p",
        action: "return",
      },
    );

    assert.equal(
      result.ok,
      true,
    );

    assert.equal(
      deriveDemoBookCopies(
        [book()],
        flattenRequests(
          result.state,
        ),
      ).filter(
        (item) =>
          item.status ===
          "borrowed",
      ).length,
      0,
    );
  },
);

test(
  "Bỏ bảo trì không đổi mã bản đang mượn",
  () => {
    const b = book({
      maintenanceCopySlots: [0],
    });

    const rows = [
      loan(
        "p",
        "borrowed",
        {
          readerEmail:
            "r@example.com",
          copySlot: 1,
        },
      ),
    ];

    const before =
      deriveDemoBookCopies(
        [b],
        rows,
      ).find(
        (item) =>
          item.loanId === "p",
      );

    const after =
      deriveDemoBookCopies(
        [book()],
        rows,
      ).find(
        (item) =>
          item.loanId === "p",
      );

    assert.equal(
      after.code,
      before.code,
    );

    assert.equal(
      nextAvailableCopySlot(
        book(),
        rows,
      ),
      0,
    );
  },
);

test(
  "Phiếu cũ không chiếm slot của phiếu mới",
  () => {
    const rows = [
      loan(
        "legacy",
        "borrowed",
        {
          readerEmail:
            "r@example.com",
        },
      ),

      loan(
        "bound",
        "approved",
        {
          readerEmail:
            "s@example.com",
          copySlot: 0,
        },
      ),
    ];

    const projected =
      deriveDemoBookCopies(
        [book()],
        rows,
      );

    assert.equal(
      projected.find(
        (copy) =>
          copy.loanId === "bound",
      )?.slot,
      0,
    );

    assert.equal(
      projected.find(
        (copy) =>
          copy.loanId === "legacy",
      )?.slot,
      1,
    );
  },
);

test(
  "Không cho giảm tổng bản làm mất bản bảo trì",
  () => {
    const b = book({
      maintenanceCopySlots: [2],
    });

    const state =
      libraryState(b, {});

    const result =
      saveManagedBook(
        state,
        {
          ...b,
          availableCopies: 2,
        },
      );

    assert.equal(
      result.ok,
      false,
    );

    assert.equal(
      result.error,
      "stockBelowLoans",
    );
  },
);

test(
  "Không cho xóa slot đang mượn khi giảm tổng",
  () => {
    const b = book();

    const state =
      libraryState(
        b,
        {
          "r@example.com": [
            loan(
              "p",
              "borrowed",
              {
                copySlot: 2,
              },
            ),
          ],
        },
      );

    const result =
      saveManagedBook(
        state,
        {
          ...b,
          availableCopies: 2,
        },
      );

    assert.equal(
      result.ok,
      false,
    );

    assert.equal(
      result.error,
      "stockBelowLoans",
    );
  },
);

test(
  "Cho giảm khi không ảnh hưởng bản đang dùng",
  () => {
    const b = book({
      availableCopies: 4,
    });

    const state =
      libraryState(
        b,
        {
          "r@example.com": [
            loan(
              "p",
              "borrowed",
              {
                copySlot: 1,
              },
            ),
          ],
        },
      );

    const result =
      saveManagedBook(
        state,
        {
          ...b,
          availableCopies: 2,
        },
      );

    assert.equal(
      result.ok,
      true,
    );
  },
);

test(
  "Phiếu legacy được gắn slot trước khi sửa bảo trì",
  () => {
    const b = book({
      maintenanceCopySlots: [0],
    });

    const records = {
      "r@example.com": [
        loan(
          "p",
          "borrowed",
        ),
      ],
    };

    const projected =
      deriveDemoBookCopies(
        [b],
        flattenRequests(
          records,
        ),
      );

    const frozen =
      freezeLegacyCopySlots(
        records,
        "book-1",
        projected,
      );

    assert.equal(
      frozen["r@example.com"][0]
        .copySlot,
      1,
    );

    const changed =
      deriveDemoBookCopies(
        [book()],
        flattenRequests(
          frozen,
        ),
      );

    assert.equal(
      changed.find(
        (copy) =>
          copy.loanId === "p",
      )?.slot,
      1,
    );
  },
);

test(
  "Thông báo gia hạn và đặt trước đúng độc giả",
  () => {
    const user = {
      email: "r@example.com",
      role: "reader",
      status: "active",
    };

    const data = {
      books: [book()],
      notificationReads: {},

      requestsByEmail: {
        "r@example.com": [
          loan(
            "p",
            "borrowed",
            {
              renewalStatus:
                "approved",

              renewalRequestedAt:
                "2026-11-21T08:00:00.000Z",

              renewalApprovedAt:
                "2026-11-22T08:00:00.000Z",

              dueDate:
                "2026-12-01",
            },
          ),
        ],
      },
    };

    const reservations = [
      {
        id: "x",
        readerEmail:
          "r@example.com",
        bookId: "book-1",
        status: "ready",
        readyAt:
          "2026-11-22T10:00:00.000Z",
        expiresAt:
          "2026-11-24T10:00:00.000Z",
      },

      {
        id: "private",
        readerEmail:
          "s@example.com",
        bookId: "book-1",
        status: "ready",
        readyAt:
          "2026-11-22T10:00:00.000Z",
        expiresAt:
          "2026-11-24T10:00:00.000Z",
      },
    ];

    const notifications =
      readerActivityNotifications(
        data,
        user,
        reservations,
        new Date(
          "2026-11-23T10:00:00.000Z",
        ),
      );

    assert.ok(
      notifications.some(
        (item) =>
          item.type ===
          "renewalApproved",
      ),
    );

    assert.ok(
      notifications.some(
        (item) =>
          item.type ===
          "reservationReady",
      ),
    );

    assert.ok(
      notifications.some(
        (item) =>
          item.type ===
          "reservationExpiring",
      ),
    );

    assert.ok(
      !notifications.some(
        (item) =>
          item.id.includes(
            "private",
          ),
      ),
    );
  },
);

test(
  "Tiền phạt chuyển từ chưa thu sang đã thu",
  () => {
    const user = {
      email: "r@example.com",
      role: "reader",
      status: "active",
    };

    const overdue = loan(
      "p",
      "returned",
      {
        dueDate:
          "2026-11-20",

        returnedAt:
          "2026-11-22T08:00:00.000Z",
      },
    );

    const data = {
      books: [book()],
      notificationReads: {},

      requestsByEmail: {
        "r@example.com": [
          overdue,
        ],
      },
    };

    const now = new Date(
      "2026-11-23T12:00:00.000Z",
    );

    let alerts =
      readerActivityNotifications(
        data,
        user,
        [],
        now,
      );

    assert.equal(
      alerts.find(
        (item) =>
          item.type === "fineDue",
      )?.amount,
      10000,
    );

    data.requestsByEmail[
      "r@example.com"
    ][0] = {
      ...overdue,

      fineAmount: 10000,

      finePaymentStatus:
        "paid",

      fineCollectedAt:
        "2026-11-23T08:00:00.000Z",
    };

    alerts =
      readerActivityNotifications(
        data,
        user,
        [],
        now,
      );

    assert.ok(
      alerts.some(
        (item) =>
          item.type === "finePaid",
      ),
    );

    assert.ok(
      !alerts.some(
        (item) =>
          item.type === "fineDue",
      ),
    );
  },
);
