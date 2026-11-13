import { readFileSync } from "node:fs";
import { loginAdmin } from "./admin-login";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";

// Imports the fixture through the same API the administrator uses, then checks city navigation in both dashboards.
// Runs only against the isolated browser-check database.
const password = process.env.IBVS_DEMO_PASSWORD;
test.skip(!password, "Requires the isolated browser-check database");
test.use({ actionTimeout: 30000 });

const origin = "http://localhost:3000";

async function login(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password!);
  const response = page.waitForResponse((r) => r.url().endsWith("/api/auth/sign-in/email"));
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  expect((await response).status()).toBe(200);
}

test("imported cities, pending GPS and worker assignment appear in admin and field tabs", async ({ page, browser }) => {
  test.setTimeout(240000);
  await loginAdmin(page);

  const csv = readFileSync(path.join(process.cwd(), "tests", "fixtures", "fizzion-sample.csv"), "utf8");
  const headers = { origin, "content-type": "application/json" };
  const imported = await page.request.post("/api/locations/import", { headers, data: { csv, apply: true } });
  expect(imported.status()).toBe(200);
  const result = await imported.json();
  // The fixture has 10 data rows: 8 importable, 2 deliberately invalid. Another spec may import first, so only the outcomes are checked.
  expect(result.report).toHaveLength(10);
  expect(result.report.filter((r: { outcome: string }) => r.outcome === "failed")).toHaveLength(2);
  expect(result.report.filter((r: { outcome: string }) => ["imported", "skipped_existing"].includes(r.outcome))).toHaveLength(8);

  const workers = await (await page.request.get("/api/workers")).json();
  const worker = workers.find((w: { email: string }) => w.email === "worker@demo.ibvs.test");
  expect(worker).toBeTruthy();
  const due = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const assigned = await page.request.post("/api/locations/import/assign", {
    headers,
    data: { workerId: worker.id, expectedEmail: "worker@demo.ibvs.test", dueDate: due, apply: true },
  });
  expect(assigned.status()).toBe(200);

  // Administrator dashboard: city tabs with counts, and the pending GPS label.
  await page.goto("/");
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  const adminCities = page.getByRole("navigation", { name: "Cities" });
  await expect(adminCities.getByRole("button", { name: /All cities/ })).toBeVisible();
  await expect(adminCities.getByRole("button", { name: /Kura \(as listed\)/ })).toBeVisible();
  await expect(adminCities.getByRole("button", { name: /Unspecified City, Anbar/ })).toBeVisible();
  await adminCities.getByRole("button", { name: /Erbil/ }).click();
  await expect(page.getByText("Pending GPS").first()).toBeVisible();
  await expect(page.getByText("IQ-TST-0003").first()).toBeVisible();
  await adminCities.getByRole("button", { name: /All cities/ }).click();

  // Field dashboard for the assigned worker: only that worker's locations, with city tabs.
  const workerContext = await browser.newContext({ baseURL: origin });
  const workerPage = await workerContext.newPage();
  await login(workerPage, "worker@demo.ibvs.test");
  await expect(workerPage).toHaveURL(/\/field$/);
  // The field workspace filters by city with one dropdown in the toolbar.
  const fieldCities = workerPage.getByRole("combobox", { name: "City", exact: true });
  await expect(fieldCities.locator("option", { hasText: /^All cities/ })).toHaveCount(1);
  const kura = fieldCities.locator("option", { hasText: /Kura \(as listed\)/ });
  await expect(kura).toHaveCount(1);
  await fieldCities.selectOption({ value: (await kura.getAttribute("value"))! });
  await expect(workerPage.getByText("IQ-TST-0005").first()).toBeVisible();
  await expect(workerPage.getByText("IQ-TST-0001")).toHaveCount(0);
  await expect(workerPage.getByText("Pending GPS").first()).toBeVisible();
  await workerContext.close();
});
