import { readFileSync } from "node:fs";
import { loginAdmin } from "./admin-login";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";

// Pending-GPS location end to end: the worker captures the three required photos with the phone's GPS,
// an interrupted upload keeps the photos, the retry is accepted by the server, and a supervisor verifies the
// captured position. Runs only against the isolated browser-check database.
const password = process.env.IBVS_DEMO_PASSWORD;
test.skip(!password, "Requires the isolated browser-check database");
test.use({ actionTimeout: 30000 });

const origin = "http://localhost:3000";
const code = "IQ-TST-0005";

async function login(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password!);
  const response = page.waitForResponse((r) => r.url().endsWith("/api/auth/sign-in/email"));
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  expect((await response).status()).toBe(200);
}

async function camera(page: Page) {
  await page.getByRole("button", { name: "Open camera", exact: true }).click();
  await expect
    .poll(async () => page.locator("video").evaluate((v) => (v as HTMLVideoElement).readyState))
    .toBeGreaterThanOrEqual(2);
}

test("pending-GPS location: capture, interrupted upload, server acceptance and supervisor verification", async ({ page, browser }) => {
  test.setTimeout(300000);
  await loginAdmin(page);
  const csv = readFileSync(path.join(process.cwd(), "tests", "fixtures", "fizzion-sample.csv"), "utf8");
  const headers = { origin, "content-type": "application/json" };
  expect((await page.request.post("/api/locations/import", { headers, data: { csv, apply: true } })).status()).toBe(200);
  const workers = await (await page.request.get("/api/workers")).json();
  const worker = workers.find((w: { email: string }) => w.email === "worker@demo.ibvs.test");
  const due = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  expect(
    (await page.request.post("/api/locations/import/assign", { headers, data: { workerId: worker.id, expectedEmail: "worker@demo.ibvs.test", dueDate: due, apply: true } })).status(),
  ).toBe(200);

  const workerContext = await browser.newContext({ baseURL: origin });
  const field = await workerContext.newPage();
  await workerContext.grantPermissions(["camera", "geolocation"]);
  await workerContext.setGeolocation({ latitude: 33.31, longitude: 44.13, accuracy: 10 });
  await login(field, "worker@demo.ibvs.test");
  await expect(field).toHaveURL(/\/field$/);
  await expect(field.locator('[data-offline-ready="true"]')).toBeAttached();
  const card = field.locator("article.field-visit").filter({ has: field.getByRole("heading", { name: code, exact: true }) });
  await field.getByRole("button", { name: "Download assignments", exact: true }).click();
  await expect(card.getByText("Downloaded for this device", { exact: true })).toBeVisible();
  await card.getByRole("button", { name: "Open inspection", exact: true }).click();
  await expect(field.getByRole("heading", { name: code, exact: true })).toBeVisible();

  // Location is pending: the visit records its own GPS reading for each photo.
  await field.getByRole("button", { name: "Record location fix", exact: true }).click();
  await camera(field);
  await field.getByRole("button", { name: "Capture", exact: true }).click();
  await expect(field.getByText("Photo saved", { exact: true })).toHaveCount(1);
  await field.getByRole("button", { name: "Capture", exact: true }).click();
  await expect(field.getByText("Photo saved", { exact: true })).toHaveCount(2);
  await field.getByRole("button", { name: "Add an angle photo", exact: true }).click();
  await field.getByRole("button", { name: "Capture", exact: true }).click();
  await expect(field.getByText("Photo saved", { exact: true })).toHaveCount(3);

  // Upload is interrupted on the wide photo. Saved photos must survive and the visit must not show a receipt.
  await field.route("**/api/inspections/*/parts/wide/*", (route) => route.abort("internetdisconnected"));
  await field.getByRole("button", { name: "Blank face", exact: true }).click();
  await field.getByRole("button", { name: "Submit visit", exact: true }).click();
  await expect(field.getByText("Connection lost. Your photos will send automatically when you are back online.", { exact: true })).toBeVisible();
  await field.reload();
  await field.locator("article.field-visit").filter({ has: field.getByRole("heading", { name: code, exact: true }) })
    .getByRole("button", { name: "Continue inspection", exact: true }).click();
  await expect(field.getByText("Photo saved", { exact: true })).toHaveCount(3);

  // Connection restored: the retry succeeds and the server accepts the visit, validating every GPS reading.
  await field.unroute("**/api/inspections/*/parts/wide/*");
  await field.getByRole("button", { name: "Try sending again", exact: true }).click();
  await expect(field.getByText("Submitted — waiting for review", { exact: true })).toBeVisible();

  // Supervisor review: the captured position is listed for review and is not yet a verified coordinate.
  const admin = await (await page.request.get("/api/inventory")).json();
  const before = admin.find((f: { code: string }) => f.code === code);
  expect(before).toMatchObject({ gps_status: "pending_gps", latitude: null });
  const captures = await (await page.request.get("/api/locations/captures")).json();
  const capture = captures.find((c: { code: string }) => c.code === code);
  expect(capture).toBeTruthy();
  expect(capture.latitude).toBeCloseTo(33.31, 2);
  const verified = await page.request.post("/api/locations/gps/verify", {
    headers,
    data: { captureId: capture.id, reason: "Supervisor confirmed the position on site" },
  });
  expect(verified.status()).toBe(200);
  const after = (await (await page.request.get("/api/inventory")).json()).find((f: { code: string }) => f.code === code);
  expect(after).toMatchObject({ gps_status: "verified", latitude: expect.any(Number) });
  await workerContext.close();
});
