import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
const password = process.env.IBVS_DEMO_PASSWORD;
test.skip(!password, "Requires isolated browser-check database");

test("admin creates worker, assigns billboard, and worker signs in with restricted access", async ({
  page,
  browser,
  baseURL,
}) => {
  const suffix = Date.now();
  const email = `worker-${suffix}@example.test`;
  const workerName = `Field Worker ${suffix}`;
  const workerPassword = randomBytes(24).toString("base64url");
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill("admin@demo.ibvs.test");
  await page.getByLabel("Password", { exact: true }).fill(password!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page
    .getByRole("button", { name: "Workers", exact: true })
    .first()
    .click();
  await page.getByLabel("Worker name", { exact: true }).fill(workerName);
  await page.getByLabel("Worker email", { exact: true }).fill(email);
  await page
    .getByLabel("Worker password", { exact: true })
    .fill(workerPassword);
  await page
    .getByRole("button", { name: "Create worker", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Worker account created",
  );
  await expect(
    page.getByRole("cell", { name: email, exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Worker password", { exact: true })).toHaveValue(
    "",
  );
  const me = await (await page.request.get("/api/me")).json();
  expect(me.role).toBe("admin");
  for (const [headers, extra, expected] of [
    [{ Origin: "https://evil.invalid" }, {}, 403],
    [{ Origin: baseURL! }, { role: "admin" }, 422],
    [{ Origin: baseURL! }, { organizationId: "foreign" }, 422],
    [{ Origin: baseURL! }, {}, 409],
  ] as const) {
    const response = await page.request.post("/api/workers", {
      headers,
      data: { name: workerName, email, password: workerPassword, ...extra },
    });
    expect(response.status()).toBe(expected);
    expect(await response.text()).not.toContain(workerPassword);
  }
  const code = `WORKER-${suffix}`;
  expect(
    (
      await page.request.post("/api/inventory/import", {
        headers: { Origin: baseURL! },
        data: {
          csv: `code,structure_code,city,latitude,longitude\n${code},STR-${suffix},Baghdad,33.3,44.4`,
          sourceName: "workers.csv",
        },
      })
    ).ok(),
  ).toBe(true);
  await page.reload();
  await page
    .getByRole("button", { name: "Inventory", exact: true })
    .first()
    .click();
  await page
    .getByRole("checkbox", { name: `Select ${code}`, exact: true })
    .check();
  await page
    .getByRole("button", { name: /^Assign visits/ })
    .click();
  await page
    .getByRole("combobox", { name: "Worker", exact: true })
    .selectOption({ label: workerName });
  await page.getByLabel("Due date", { exact: true }).fill("2026-12-01");
  await page
    .getByRole("button", { name: "Create assignments", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const context = await browser.newContext();
  expect(
    (
      await context.request.post(`${baseURL}/api/workers`, {
        headers: { Origin: baseURL! },
        data: {},
      })
    ).status(),
  ).toBe(401);
  const worker = await context.newPage();
  await worker.goto(`${baseURL}/sign-in`);
  await worker.getByLabel("Email address").fill(email);
  await worker.getByLabel("Password", { exact: true }).fill(workerPassword);
  await worker.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    worker.getByRole("heading", { name: "My assignments", exact: true }),
  ).toBeVisible();
  await expect(
    worker.getByRole("heading", { name: code, exact: true }),
  ).toBeVisible();
  expect((await worker.request.get("/api/workers")).status()).toBe(403);
  expect(
    (
      await worker.request.post("/api/workers", {
        headers: { Origin: baseURL! },
        data: {
          name: "Forbidden",
          email: "forbidden@example.test",
          password: workerPassword,
        },
      })
    ).status(),
  ).toBe(403);
  await expect(
    worker.getByRole("button", { name: "Workers", exact: true }),
  ).toHaveCount(0);
  await worker
    .getByRole("link", { name: "Open field workspace", exact: true })
    .click();
  await expect(worker).toHaveURL(/\/field$/);
  await expect(worker.getByText(code, { exact: true }).first()).toBeVisible();
  await context.close();
});
