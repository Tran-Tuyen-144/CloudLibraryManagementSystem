import { createRepository } from "../server/repository.mjs";
import { config } from "../server/config.mjs";
import { ensure } from "../server/errors.mjs";
import { randomUUID } from "node:crypto";
import { syncCognitoRole } from "../server/auth.mjs";
const email = process.argv[2]?.trim().toLowerCase();
ensure(
  email && email.includes("@"),
  "emailRequired",
  "Cách dùng: node scripts/promote-admin.mjs email-đã-đăng-ký",
);
ensure(
  config.mode === "aws",
  "awsOnly",
  "Chỉ dùng lệnh này trong môi trường AWS, sau khi xác minh đúng tài khoản triển khai.",
);
const repo = createRepository();
try {
  await repo.mutate(
    "deployment-operator",
    randomUUID(),
    { action: "bootstrap-admin", email },
    (state) => {
      const account = state.accounts.find(
        (a) => a.email === email && a.cognitoSub,
      );
      ensure(
        account,
        "accountMissing",
        "Tài khoản cần đăng ký, xác minh và đăng nhập một lần trước khi cấp quyền.",
      );
      account.role = "admin";
      state.auditLogs.unshift({
        id: randomUUID(),
        at: new Date().toISOString(),
        actorName: "Deployment operator",
        actorRole: "operator",
        action: "bootstrap-admin",
        targetId: account.id,
        result: "success",
      });
      return { state };
    },
  );
  await syncCognitoRole(
    (await repo.read()).accounts.find((a) => a.email === email),
  );
  console.log("Đã cấp quyền quản trị cho tài khoản đã xác minh.");
} finally {
  repo.client.destroy();
}
