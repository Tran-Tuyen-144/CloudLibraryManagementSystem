import { test } from "node:test";
import assert from "node:assert/strict";
import { answerQuestion } from "../server/ai.mjs";

test("assistant personal context contains only the authenticated reader loans", async () => {
  const state = {
    version: 2,
    settings: {
      maxActiveLoans: 3,
      loanDays: 14,
      dailyFineVnd: 5000,
      maxRenewals: 1,
      extensionDays: 7,
      holdHours: 48,
    },
    accounts: [
      { id: "me", email: "me@example.invalid", status: "active" },
      { id: "other", email: "other@example.invalid", status: "active" },
    ],
    books: [],
    bookCopies: [],
    reservations: [],
    knowledgeSources: [],
    requestsByEmail: {
      "me@example.invalid": [
        { id: "own", title: "Sách của tôi", status: "returned" },
      ],
      "other@example.invalid": [
        {
          id: "private",
          title: "Bí mật của người khác",
          status: "borrowed",
          dueDate: "2020-01-01",
        },
      ],
    },
  };
  const reply = await answerQuestion(state, "Tôi đang mượn sách nào?", [], {
    mode: "local",
    actorId: "me",
  });
  assert.ok(reply.text.includes("Sách của tôi"));
  assert.ok(!reply.text.includes("Bí mật của người khác"));
  assert.equal(reply.sources[0].id, "my-loans");
  const guest = await answerQuestion(state, "Tôi đang mượn sách nào?", [], {
    mode: "local",
  });
  assert.ok(!guest.text.includes("Bí mật của người khác"));
  assert.ok(!guest.text.includes("Sách của tôi"));
});
