import { test, expect } from "@playwright/test";

test("Standard Ebooks shelf opens a complete book inside Cloud Library", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Hồ sơ của tôi", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Email", exact: true })
    .fill("reader@cloudlibrary.demo");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("ReaderDemo123!");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page.getByRole("button", { name: "Khám phá", exact: true }).click();
  const panel = page.locator(".source-books-panel");
  await expect(panel.getByText("12 sách có thể đọc ngay")).toBeVisible();
  await panel
    .getByRole("button", {
      name: "Xem chi tiết: Pride and Prejudice",
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator('a[href*="gutenberg"]')).toHaveCount(0);
  await dialog
    .getByRole("button", { name: "Đọc trong Cloud Library", exact: true })
    .click();
  await expect(page.locator(".online-reader-text")).toContainText(
    "It is a truth universally acknowledged",
  );
  await expect(
    page.locator(".online-reader-chapters select option"),
  ).toHaveCount(63);
  await page
    .locator(".online-reader-chapters select")
    .selectOption("chapter-61");
  await expect(page.locator(".online-reader-text")).toContainText(
    "Happy for all her maternal feelings",
  );
  expect(page.url()).toMatch(/^http:\/\/127\.0\.0\.1:5173\//);
});

test("readable source catalog has search and two pages without a remote source request", async ({
  page,
}) => {
  const sourceRequests = [];
  page.on("request", (request) => {
    if (/gutendex\.com|gutenberg\.org/.test(request.url()))
      sourceRequests.push(request.url());
  });
  await page.goto("/");
  const panel = page.locator(".source-books-panel");
  await expect(panel.locator(".book-tile")).toHaveCount(6);
  await panel.getByRole("button", { name: "Xem thêm sách" }).click();
  await expect(
    panel.getByRole("button", { name: "Xem chi tiết: Emma", exact: true }),
  ).toBeVisible();
  await panel
    .getByRole("searchbox", { name: "Tìm sách đọc trực tuyến" })
    .fill("Jane Austen");
  await panel.getByRole("button", { name: "Tìm sách", exact: true }).click();
  await expect(panel.locator(".book-tile")).toHaveCount(4);
  expect(sourceRequests).toEqual([]);
});
