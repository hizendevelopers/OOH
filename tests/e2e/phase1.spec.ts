import { test, expect } from "@playwright/test";
const password = process.env.IBVS_DEMO_PASSWORD;
test.skip(
  !password,
  "Set IBVS_DEMO_PASSWORD and seed an isolated demo database before browser acceptance.",
);
async function login(page: import("@playwright/test").Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password!);
  const signedIn = page.waitForResponse(
    (response) => response.url().endsWith("/api/auth/sign-in/email"),
    { timeout: 60000 },
  );
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  expect((await signedIn).status()).toBe(200);
  await expect(
    page.getByRole("heading", { name: "A clearer view of the field." }),
  ).toBeVisible();
  await expect(
    page.getByText("Billboard faces", { exact: true }),
  ).toBeVisible();
}
test("admin imports, assigns, worker sees authorized visit; CSRF and scope are enforced", async ({
  page,
  browser,
}) => {
  await login(page, "admin@demo.ibvs.test");
  await expect(
    page.getByText("DEMO WORKSPACE", { exact: false }),
  ).toBeVisible();
  const suffix = Date.now().toString();
  const face = `E2E-${suffix}`;
  await page.getByRole("button", { name: "Import inventory" }).click();
  await page
    .getByLabel("CSV contents")
    .fill(
      `code,structure_code,city,latitude,longitude\n${face},STR-${suffix},Baghdad,33.3,44.4`,
    );
  await page.getByRole("button", { name: "Validate & preview" }).click();
  await expect(page.getByText("1 valid rows · 0 errors")).toBeVisible();
  await page.getByRole("button", { name: "Import valid rows" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Inventory", exact: true })
    .first()
    .click();
  await page
    .getByRole("checkbox", { name: `Select ${face}`, exact: true })
    .check();
  await page.getByRole("button", { name: "Assign visits" }).click();
  await page
    .getByRole("combobox", { name: "Worker", exact: true })
    .selectOption({ label: "DEMO Ali Hassan" });
  await page.getByLabel("Due date").fill("2026-11-15");
  await page.getByRole("button", { name: "Create assignments" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const tasks = await (await page.request.get("/api/assignments")).json();
  const task = tasks.find((t: { code: string }) => t.code === face);
  expect(task).toBeTruthy();
  expect(
    (
      await page.request.post("/api/assignments", {
        headers: { Origin: "https://evil.invalid" },
        data: {},
      })
    ).status(),
  ).toBe(403);
  const context = await browser.newContext();
  const worker = await context.newPage();
  await worker.goto("/sign-in");
  await worker.getByLabel("Email address").fill("worker@demo.ibvs.test");
  await worker.getByLabel("Password", { exact: true }).fill(password!);
  await worker.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    worker.getByRole("heading", { name: "My assignments" }),
  ).toBeVisible();
  await worker
    .getByRole("button")
    .filter({ has: worker.getByRole("heading", { name: face, exact: true }) })
    .click();
  await expect(
    worker.getByRole("heading", { name: face, exact: true }),
  ).toBeVisible();
  await expect(
    worker.getByText("Open the field workspace for live capture", {
      exact: false,
    }),
  ).toBeVisible();
  expect((await worker.request.get("/api/inventory")).status()).toBe(403);
  await context.close();
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  await other.goto("/sign-in");
  await other.getByLabel("Email address").fill("worker2@demo.ibvs.test");
  await other.getByLabel("Password", { exact: true }).fill(password!);
  await other.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    other.getByRole("heading", { name: "My assignments" }),
  ).toBeVisible();
  expect(
    (
      await other.request.get("/api/assignments/" + task.assignment_id)
    ).status(),
  ).toBe(404);
  await otherContext.close();
});
test("responsive widths, RTL, themes, offline warning and CSV validation", async ({
  page,
  context,
}) => {
  await login(page, "admin@demo.ibvs.test");
  for (const width of [360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(
      page.getByRole("heading", { name: "A clearer view of the field." }),
    ).toBeVisible();
    if (width < 700) await expect(page.locator("aside")).toBeHidden();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/overview-${width}.png`,
      fullPage: true,
    });
  }
  await page.getByRole("button", { name: "Switch language" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.getByRole("button", { name: "Toggle theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({
    path: "test-results/arabic-dark.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Switch language" }).click();
  await context.setOffline(true);
  await expect(
    page.getByText("You are offline.", { exact: false }),
  ).toBeVisible();
  await context.setOffline(false);
  await page.getByRole("button", { name: "Import inventory" }).click();
  await page
    .getByLabel("CSV contents")
    .fill(
      "code,structure_code,city,latitude,longitude\nBAD-001,STR-001,Baghdad,91,44",
    );
  await page.getByRole("button", { name: "Validate & preview" }).click();
  await expect(page.getByText("0 valid rows · 1 errors")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Import valid rows" }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("anonymous endpoints refuse access", async ({ request }) => {
  for (const route of ["me", "inventory", "assignments", "audit", "export"])
    expect((await request.get("/api/" + route)).status()).toBe(401);
  expect((await request.get("/api/health")).status()).toBe(200);
});
