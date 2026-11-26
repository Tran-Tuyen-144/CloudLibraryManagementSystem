import { test, expect } from "@playwright/test";

async function login(page, email, password) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Hồ sơ của tôi", exact: true })
    .click();
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
}
test("reader signs in, opens protected content, changes reading mode and resumes", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page, "reader@cloudlibrary.demo", "ReaderDemo123!");
  await expect(
    page.getByRole("heading", { name: "Thông tin cá nhân", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Danh mục sách", exact: true })
    .click();
  await page
    .getByText("Hướng dẫn sử dụng Cloud Library", { exact: true })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("button", { name: /Đọc online|Đọc trực tuyến|Đọc sách/ })
    .last()
    .click();
  await expect(page.locator(".online-reader")).toBeVisible();
  await page.getByRole("button", { name: "Bản PDF", exact: true }).click();
  await expect(page.locator(".online-reader canvas").first()).toBeVisible({
    timeout: 25000,
  });
  await page.getByRole("button", { name: "Đọc chữ", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Chương", exact: true })
    .selectOption({ index: 0 });
  await expect(
    page.getByRole("heading", { name: "Tìm và đọc tác phẩm", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Hướng dẫn sử dụng Cloud Library", { exact: true }).first(),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/reader-desktop.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("librarian only sees operational navigation and can inspect copies", async ({
  page,
}) => {
  await login(page, "librarian@cloudlibrary.demo", "LibraryDemo123!");
  await expect(
    page.getByRole("button", { name: "Quản lý mượn trả", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Duyệt tác giả", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Tổng quan", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Dịch vụ thư viện", exact: true })
    .click();
  await page.getByRole("button", { name: "Bản sách", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Tra cứu mã bản sách" }),
  ).toBeVisible();
});
test("author creates and submits a draft with explicit rights confirmation", async ({
  page,
}) => {
  await login(page, "author@cloudlibrary.demo", "AuthorDemo123!");
  await expect(
    page.getByText("Tác giả đã được duyệt", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Tạo bản thảo/ })
    .first()
    .click();
  const title = "Tác phẩm thử giao diện " + Date.now();
  await page.locator('input[name="title"]').fill(title);
  await page.locator('input[name="category"]').fill("Lập trình");
  await page
    .locator('textarea[name="description"]')
    .fill(
      "Đây là tác phẩm dùng kiểm thử luồng soạn thảo và gửi xét duyệt trên giao diện.",
    );
  await page.getByRole("button", { name: "Thêm chương", exact: true }).click();
  const chapter = page.locator(".author-chapter-card").last();
  await chapter.locator("input").fill("Chương đầu tiên");
  await chapter
    .locator("textarea")
    .fill("Nội dung chương do bộ kiểm thử của dự án tự tạo.");
  await page
    .getByRole("button", { name: /Lưu bản nháp|Lưu bản thảo|Lưu thay đổi/ })
    .last()
    .click();
  const row = page
    .locator(".author-work-list li")
    .filter({ hasText: title })
    .last();
  await row.getByRole("checkbox").check();
  await row.getByRole("button", { name: "Gửi duyệt xuất bản" }).click();
  await expect(row).toContainText("Chờ duyệt");
});
test("mobile catalog does not overflow horizontally", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".sidebar")).toBeVisible();
  await page.screenshot({
    path: "test-results/mobile-home.png",
    fullPage: true,
  });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth + 2,
  );
  expect(overflow).toBe(false);
});

test("reader resumes PDF page three and turning mode immediately after leaving", async ({
  page,
}) => {
  await login(page, "reader@cloudlibrary.demo", "ReaderDemo123!");
  async function open() {
    await page
      .getByRole("button", { name: "Danh mục sách", exact: true })
      .click();
    await page
      .getByText("Hướng dẫn sử dụng Cloud Library", { exact: true })
      .first()
      .click();
    await page
      .getByRole("button", { name: /Đọc online|Đọc trực tuyến|Đọc sách/ })
      .last()
      .click();
    await expect(page.locator(".online-reader")).toBeVisible();
  }
  await open();
  await page.getByRole("button", { name: "Bản PDF", exact: true }).click();
  await expect(page.locator(".online-reader canvas").first()).toBeVisible({
    timeout: 25000,
  });
  await page.getByRole("spinbutton", { name: "Trang", exact: true }).fill("3");
  await page.getByRole("button", { name: "Đi đến", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Cách chuyển trang/chương", exact: true })
    .selectOption("swipe");
  await page.getByRole("button", { name: "Về danh mục", exact: true }).click();
  await open();
  await expect(
    page.getByRole("spinbutton", { name: "Trang", exact: true }),
  ).toHaveValue("3");
  await expect(
    page.getByRole("combobox", {
      name: "Cách chuyển trang/chương",
      exact: true,
    }),
  ).toHaveValue("swipe");
  await page.screenshot({
    path: "test-results/pdf-resume.png",
    fullPage: true,
  });
});

test("library services and password form follow the English language selection", async ({
  page,
}) => {
  await login(page, "reader@cloudlibrary.demo", "ReaderDemo123!");
  await expect(
    page.getByRole("heading", { name: "Thông tin cá nhân", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Ngôn ngữ", exact: true })
    .selectOption("en");
  await expect(
    page.getByRole("heading", { name: "Change password", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Reservations & renewals", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Library services",
      exact: true,
      level: 2,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Renewals & fines", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Renewals & fines", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "My loans and renewals", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/services-english.png",
    fullPage: true,
  });
});

test("a returning applicant sees the latest pending application after a rejection", async ({
  page,
  request,
}) => {
  const email = "browser-applicant-" + Date.now() + "@example.invalid";
  const password = "BrowserTest123!";
  const registered = await request.post("/api/v1/auth/register", {
    data: { email, password, fullName: "Người nộp hồ sơ thử" },
  });
  expect(registered.ok()).toBeTruthy();
  const reader = (await registered.json()).accessToken;
  async function submit() {
    const r = await request.post("/api/v1/commands", {
      headers: {
        Authorization: "Bearer " + reader,
        "Idempotency-Key": crypto.randomUUID(),
      },
      data: {
        command: "application.submit",
        input: {
          fullName: "Người nộp hồ sơ thử",
          penName: "Bút danh kiểm thử",
          phone: "0901234567",
          bio: "Giới thiệu tác giả có đầy đủ thông tin để xét duyệt hồ sơ.",
          portfolioUrl: "https://example.com/portfolio",
          confirmation: true,
        },
      },
    });
    expect(r.ok()).toBeTruthy();
    return (await r.json()).record;
  }
  const first = await submit();
  const admin = await request.post("/api/v1/auth/login", {
    data: { email: "admin@cloudlibrary.demo", password: "AdminDemo123!" },
  });
  const adminToken = (await admin.json()).accessToken;
  expect(
    (
      await request.post("/api/v1/commands", {
        headers: {
          Authorization: "Bearer " + adminToken,
          "Idempotency-Key": crypto.randomUUID(),
        },
        data: {
          command: "application.review",
          input: {
            id: first.id,
            expectedSubmittedAt: first.submittedAt,
            decision: "reject",
            reason: "Cần bổ sung thêm hồ sơ.",
          },
        },
      })
    ).ok(),
  ).toBeTruthy();
  await submit();
  await login(page, email, password);
  await page
    .getByRole("button", { name: "Đăng ký tác giả", exact: true })
    .click();
  await expect(page.locator(".reader-badge")).toContainText("Chờ duyệt");
  await expect(page.locator('input[name="penName"]')).toBeDisabled();
});

test("a delayed response from the previous account cannot replace the newly signed-in account", async ({
  page,
}) => {
  await login(page, "reader@cloudlibrary.demo", "ReaderDemo123!");
  await expect(
    page.getByRole("heading", { name: "Thông tin cá nhân", exact: true }),
  ).toBeVisible();
  const token = await page.evaluate(
    () => JSON.parse(sessionStorage.getItem("cloudlibrary:access")).accessToken,
  );
  let release, ready, finished;
  const released = new Promise((r) => {
      release = r;
    }),
    held = new Promise((r) => {
      ready = r;
    }),
    done = new Promise((r) => {
      finished = r;
    });
  let captured = false;
  await page.route("**/api/v1/snapshot", async (route) => {
    if (
      !captured &&
      route.request().headers().authorization === "Bearer " + token
    ) {
      captured = true;
      const response = await route.fetch();
      ready();
      await released;
      await route.fulfill({ response });
      finished();
    } else await route.continue();
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await held;
  await page.getByRole("button", { name: "Đăng xuất", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Đăng xuất", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Hồ sơ của tôi", exact: true })
    .first()
    .click();
  await page
    .getByRole("textbox", { name: "Email", exact: true })
    .fill("author@cloudlibrary.demo");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("AuthorDemo123!");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(
    page.getByText("Tác giả đã được duyệt", { exact: true }),
  ).toBeVisible();
  release();
  await done;
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await expect(
    page.getByText("Tác giả đã được duyệt", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Khu vực tác giả", exact: true }),
  ).toBeVisible();
});
