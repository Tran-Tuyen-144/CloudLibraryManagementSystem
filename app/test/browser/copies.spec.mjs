import { test, expect } from "@playwright/test";

test("librarian finds a scanned copy and confirms handover and return in place", async ({
  page,
  request,
}) => {
  const adminResult = await request.post("/api/v1/auth/login", {
    data: { email: "admin@cloudlibrary.demo", password: "AdminDemo123!" },
  });
  expect(adminResult.ok()).toBeTruthy();
  const admin = (await adminResult.json()).accessToken;
  const readerResult = await request.post("/api/v1/auth/register", {
    data: {
      email: "copy-reader-" + Date.now() + "@example.invalid",
      password: "CopyReader123!",
      fullName: "Độc giả kiểm thử quét mã",
    },
  });
  expect(readerResult.ok()).toBeTruthy();
  const reader = (await readerResult.json()).accessToken;
  async function command(token, command, input) {
    const response = await request.post("/api/v1/commands", {
      headers: {
        Authorization: "Bearer " + token,
        "Idempotency-Key": crypto.randomUUID(),
      },
      data: { command, input },
    });
    expect(response.ok()).toBeTruthy();
    return response.json();
  }
  const created = await command(admin, "book.save", {
    title: "Sách kiểm thử quét mã " + Date.now(),
    author: "Cloud Library",
    category: "Hướng dẫn sử dụng",
    description: "Dữ liệu kiểm thử thao tác quét bản sách tại quầy.",
    availableCopies: 1,
  });
  const book = created.record;
  let loan;
  try {
    loan = (await command(reader, "loan.create", { bookId: book.id })).record;
    loan = (
      await command(admin, "loan.action", {
        id: loan.id,
        version: loan.version,
        action: "approve",
      })
    ).record;
    const copy = created.data.bookCopies.find((c) => c.bookId === book.id);
    await page.goto("/");
    await page
      .getByRole("button", { name: "Hồ sơ của tôi", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Email", exact: true })
      .fill("librarian@cloudlibrary.demo");
    await page.getByLabel("Mật khẩu", { exact: true }).fill("LibraryDemo123!");
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    await page
      .getByRole("button", { name: "Dịch vụ thư viện", exact: true })
      .click();
    await page.getByRole("button", { name: "Bản sách", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Mã bản sách", exact: true })
      .fill(copy.code);
    const row = page
      .locator(".operations-list article")
      .filter({ hasText: copy.code });
    await row
      .getByRole("button", { name: "Xác nhận giao sách", exact: true })
      .click();
    await expect(row).toContainText("Đang mượn");
    await row
      .getByRole("button", { name: "Xác nhận nhận trả", exact: true })
      .click();
    await expect(row).toContainText("Sẵn sàng");
    const current = await request.get("/api/v1/loans/" + loan.id, {
      headers: { Authorization: "Bearer " + admin },
    });
    expect((await current.json()).data.status).toBe("returned");
    await page.screenshot({
      path: "test-results/copy-counter.png",
      fullPage: true,
    });
  } finally {
    if (loan) {
      const current = await request.get("/api/v1/loans/" + loan.id, {
        headers: { Authorization: "Bearer " + admin },
      });
      const latest = (await current.json()).data;
      if (latest && ["pending", "approved", "borrowed"].includes(latest.status))
        await command(admin, "loan.action", {
          id: latest.id,
          version: latest.version,
          action: latest.status === "borrowed" ? "return" : "cancel",
        });
    }
    await command(admin, "book.archive", { id: book.id, archived: true });
  }
});
