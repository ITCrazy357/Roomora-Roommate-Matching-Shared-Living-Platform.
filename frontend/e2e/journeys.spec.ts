import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

async function login(page: Page, role: string, project: string) {
  await page.goto("/dang-nhap");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`e2e-${role}-${project}@example.test`);
  await page
    .getByLabel("Mật khẩu", { exact: true })
    .fill("Roomora-browser-test-only-2026");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect
    .poll(async () => (await page.request.get("/api/v1/auth/me")).status())
    .toBe(200);
}

test("performance reports use coarse labels and respect Do Not Track", async ({
  browser,
}) => {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:3411",
  });
  try {
    await context.addInitScript(() =>
      Object.defineProperty(navigator, "webdriver", { get: () => false }),
    );
    const page = await context.newPage();
    const reports: Record<string, unknown>[] = [];
    const statuses: number[] = [];
    page.on("request", (r) => {
      if (new URL(r.url()).pathname === "/api/v1/telemetry/web-vitals")
        reports.push(r.postDataJSON());
    });
    page.on("response", (r) => {
      if (new URL(r.url()).pathname === "/api/v1/telemetry/web-vitals")
        statuses.push(r.status());
    });
    await page.goto("/tim-phong?search=must-not-appear-in-metrics");
    await expect
      .poll(() => statuses.filter((x) => x === 204).length)
      .toBeGreaterThan(0);
    for (const report of reports) {
      expect(Object.keys(report).sort()).toEqual([
        "device",
        "id",
        "name",
        "route",
        "value",
      ]);
      expect(report.route).toBe("listings");
      expect(JSON.stringify(report)).not.toContain("must-not-appear");
    }
  } finally {
    await context.close();
  }
  const privateContext = await browser.newContext({
    baseURL: "http://127.0.0.1:3411",
  });
  try {
    await privateContext.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
      Object.defineProperty(navigator, "doNotTrack", { get: () => "1" });
    });
    const page = await privateContext.newPage();
    let sent = 0;
    page.on("request", (r) => {
      if (new URL(r.url()).pathname === "/api/v1/telemetry/web-vitals") sent++;
    });
    await page.goto("/tim-phong", { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    expect(sent).toBe(0);
  } finally {
    await privateContext.close();
  }
});

test("guest finds a room and understands monthly cost and deposit", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/tim-phong");
  await page.getByLabel("Tìm kiếm tin đăng").fill(`E2E ${info.project.name}`);
  await page.getByRole("button", { name: "Tìm tin", exact: true }).click();
  await expect(page.locator(".listing-card")).toHaveCount(1);
  await expect(page.locator(".listing-cover img")).toHaveAttribute(
    "src",
    /\/_next\/image/,
  );
  await page
    .locator(".listing-card")
    .getByRole("link", {
      name: `E2E ${info.project.name} phòng thử nghiệm`,
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Chi phí dự kiến hằng tháng" }),
  ).toBeVisible();
  const total = page.locator(".listing-total");
  await expect(total).toContainText("3.500.000");
  await expect(total).toContainText("/ phòng / tháng");
  await expect(page.locator(".listing-costs")).toContainText(
    "Tiền cọc ban đầu",
  );
  await expect(page.locator("main")).not.toContainText(
    "PRIVATE ADDRESS MUST NOT LEAK",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("public search renders useful content without JavaScript", async ({
  browser,
}) => {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:3411",
    javaScriptEnabled: false,
  });
  try {
    const page = await context.newPage();
    await page.goto("/tim-phong");
    await expect(page.locator(".listing-card")).toHaveCount(2);
    await expect(page.locator(".listing-card").first()).toBeVisible();
  } finally {
    await context.close();
  }
});

test("two people connect, accept and exchange a persisted message", async ({
  page,
  browser,
}, info) => {
  const project = info.project.name;
  await login(page, "viewer", project);
  const listing = (
    await (
      await page.request.get(
        `/api/v1/listings?search=${encodeURIComponent(`E2E ${project}`)}`,
      )
    ).json()
  ).items[0];
  await page.goto(`/phong/${listing.id}`);
  await page.getByRole("link", { name: "Xem hồ sơ và kết nối →" }).click();
  await page
    .getByLabel("Lời nhắn kết nối (không bắt buộc)")
    .fill("Mình muốn trao đổi về phòng thử nghiệm.");
  await page
    .getByRole("button", { name: "Gửi lời kết nối", exact: true })
    .click();
  await expect(
    page.getByText("Bạn đã gửi lời mời", { exact: false }),
  ).toBeVisible();
  const second = await browser.newContext({
    baseURL: "http://127.0.0.1:3411",
    viewport: page.viewportSize()!,
  });
  try {
    const owner = await second.newPage();
    await login(owner, "owner", project);
    const viewer = (await (await page.request.get("/api/v1/auth/me")).json())
      .user;
    await owner.goto(`/ho-so/${viewer.id}`);
    await owner
      .getByRole("button", { name: "Chấp nhận kết nối", exact: true })
      .click();
    await expect(
      owner.getByRole("link", { name: "Mở hộp thư", exact: true }),
    ).toBeVisible();
    const connections = await (
      await page.request.get("/api/v1/conversations")
    ).json();
    const id = connections.items[0].id;
    await page.goto(`/tin-nhan/${id}`);
    const text = `Tin kiểm thử ${project} ${randomUUID()}`;
    await page.getByPlaceholder("Viết lời nhắn…").fill(text);
    await page
      .getByRole("button", { name: "Gửi tin nhắn", exact: true })
      .click();
    await expect(
      page.getByLabel("Lịch sử tin nhắn").getByText(text, { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByLabel("Lịch sử tin nhắn").getByText(text, { exact: true }),
    ).toBeVisible();
    await owner.goto(`/tin-nhan/${id}`);
    await expect(
      owner.getByLabel("Lịch sử tin nhắn").getByText(text, { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    await second.close();
  }
});

test("household separates total expense, amount paid and remaining supplier balance", async ({
  page,
}, info) => {
  await login(page, "owner", info.project.name);
  const headers = { Origin: "http://127.0.0.1:3411" };
  const user = (await (await page.request.get("/api/v1/auth/me")).json()).user;
  const houseResponse = await page.request.post("/api/v1/houses", {
    headers,
    data: { name: `E2E house ${info.project.name}` },
  });
  expect(houseResponse.status()).toBe(201);
  const house = await houseResponse.json();
  const response = await page.request.post(
    `/api/v1/houses/${house.id}/expenses`,
    {
      headers,
      data: {
        clientId: randomUUID(),
        title: "Điện thử nghiệm thanh toán một phần",
        amount: 1000000,
        paidAmount: 200000,
        payerId: user.id,
        splits: [{ userId: user.id, amount: 1000000 }],
      },
    },
  );
  expect(response.status()).toBe(201);
  const expense = await response.json();
  expect(expense).toMatchObject({
    paidAmount: 200000,
    remainingAmount: 800000,
  });
  await page.goto(`/nha-chung/${house.id}/chi-phi`);
  const supplier = page.getByRole("region", {
    name: "Thanh toán khoản chi",
    exact: true,
  });
  await expect(supplier).toContainText("200.000");
  await expect(supplier).toContainText("800.000");
  await expect(supplier).toContainText("Còn phải thanh toán");
  await page.getByRole("button", { name: "Khoản chi", exact: true }).click();
  const card = page
    .locator(".expense-card")
    .filter({
      has: page.getByRole("heading", {
        name: "Điện thử nghiệm thanh toán một phần",
        exact: true,
      }),
    });
  await expect(card).toContainText("200.000");
  await expect(card).toContainText("800.000");
  await expect(card).toContainText("Đã thanh toán");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
