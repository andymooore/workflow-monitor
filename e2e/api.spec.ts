import { test, expect } from "@playwright/test";

// Use page context to login (preserves cookies for request context)
async function loginViaPage(page: any) {
  await page.goto("/login");
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  await page.fill('input[type="email"]', "alice@jis.gov.jm");
  await page.fill('input[type="password"]', "WorkFlow@2026!");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard", { timeout: 30000 });
}

test.describe("API Endpoints", () => {
  test("list users with pagination", async ({ page }) => {
    await loginViaPage(page);
    const res = await page.request.get("/api/users?limit=2");
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.data).toHaveLength(2);
    expect(body.total).toBeGreaterThan(0);
    expect(body.hasMore).toBe(true);
    expect(body.limit).toBe(2);
    expect(body.offset).toBe(0);
  });

  test("list published templates", async ({ page }) => {
    await loginViaPage(page);
    const res = await page.request.get("/api/workflows/templates?published=true");
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data[0].isPublished).toBe(true);
  });

  test("list clients with search", async ({ page }) => {
    await loginViaPage(page);
    const res = await page.request.get("/api/clients?search=Ministry");
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.data.length).toBeGreaterThan(0);
  });

  test("dashboard stats", async ({ page }) => {
    await loginViaPage(page);
    const res = await page.request.get("/api/workflows/dashboard/stats");
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty("activeWorkflows");
    expect(body).toHaveProperty("myPendingTasks");
    expect(body).toHaveProperty("pendingApprovals");
    expect(body).toHaveProperty("completedThisWeek");
  });

  test("password policy enforcement", async ({ page }) => {
    await loginViaPage(page);
    const res = await page.request.post("/api/users", {
      data: {
        name: "Test User",
        email: "test-policy@jis.gov.jm",
        password: "weak",
      },
    });
    expect(res.status()).toBe(400);

    const body = await res.json();
    expect(body.error.details.fields.password).toBeDefined();
  });

  test("delegations endpoint accessible", async ({ page }) => {
    await loginViaPage(page);
    const res = await page.request.get("/api/delegations");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("given");
    expect(body).toHaveProperty("received");
  });

  test("notifications with pagination", async ({ page }) => {
    await loginViaPage(page);
    const res = await page.request.get("/api/notifications?limit=5");
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty("data");
    expect(body).toHaveProperty("unreadCount");
    expect(body).toHaveProperty("total");
    expect(body).toHaveProperty("hasMore");
  });
});
