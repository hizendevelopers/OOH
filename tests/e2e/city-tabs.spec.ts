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

  // Administrator dashboard: one city dropdown with counts, and the pending GPS label.
  await page.goto("/");
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  const adminCities = page.getByRole("combobox", { name: "City", exact: true });
  await expect(adminCities.locator("option", { hasText: /^All cities/ })).toHaveCount(1);
  await expect(adminCities.locator("option", { hasText: /Kura \(as listed\)/ })).toHaveCount(1);
  await expect(adminCities.locator("option", { hasText: /Unspecified City, Anbar/ })).toHaveCount(1);
  await adminCities.selectOption("Erbil");
  await expect(page.getByText("Pending GPS").first()).toBeVisible();
  await expect(page.getByText("IQ-TST-0003").first()).toBeVisible();
  await adminCities.selectOption("");

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

test("administrator assigns every unassigned site in one city to a worker", async ({ page }) => {
  test.setTimeout(180000);
  await loginAdmin(page);
  // A city name used only by this run, so the assignment cannot touch other tests' sites.
  const suffix = Date.now().toString();
  const city = `E2E City ${suffix}`;
  const codes = [1, 2, 3].map((n) => `E2E-CITY-${suffix}-${n}`);
  const csv = ["code,structure_code,city,latitude,longitude", ...codes.map((code, i) => `${code},STR-${suffix}-${i},${city},33.3${i},44.4${i}`)].join("\n");
  const imported = await page.request.post("/api/inventory/import", {
    headers: { origin, "content-type": "application/json" },
    data: { csv, sourceName: "whole-city.csv" },
  });
  expect(imported.status()).toBe(200);

  await page.goto("/");
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  await page.getByRole("combobox", { name: "City", exact: true }).selectOption(city);
  await page.getByRole("button", { name: "Assign whole city (3)", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(`All 3 unassigned sites in ${city}`, { exact: true })).toBeVisible();
  await dialog.getByRole("combobox", { name: "Worker", exact: true }).selectOption({ label: "DEMO Ali Hassan" });
  await dialog.getByLabel("Due date").fill("2026-12-31");
  await dialog.getByRole("button", { name: "Create assignments", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  const tasks = await (await page.request.get("/api/assignments")).json();
  const assigned = tasks.filter((t: { code: string }) => codes.includes(t.code));
  expect(assigned).toHaveLength(3);
  expect(new Set(assigned.map((t: { worker_name: string }) => t.worker_name))).toEqual(new Set(["DEMO Ali Hassan"]));
  // Nothing in the city is left to assign, so the button is disabled.
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  await page.getByRole("combobox", { name: "City", exact: true }).selectOption(city);
  await expect(page.getByRole("button", { name: "Assign whole city (0)", exact: true })).toBeDisabled();
});
