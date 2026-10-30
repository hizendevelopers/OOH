import { test, expect, type Page } from "@playwright/test";
const password = process.env.IBVS_DEMO_PASSWORD;
test.skip(!password, "Requires the isolated browser-check database");
test.use({ actionTimeout: 30000 });
async function login(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password!);
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = page.waitForResponse((r) =>
      r.url().endsWith("/api/auth/sign-in/email"),
    );
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    const result = await response;
    if (result.status() === 429 && attempt < 2) {
      await page.waitForTimeout(
        (Math.min(
          60,
          Math.max(1, Number(result.headers()["retry-after"]) || 60),
        ) +
          1) *
          1000,
      );
      continue;
    }
    expect(result.status()).toBe(200);
    break;
  }
}
test("admin creates GPS test location, corrects coordinates, worker finds it and captures fresh GPS", async ({
  page,
  context,
  browser,
}) => {
  test.setTimeout(240000);
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({
    latitude: 24.86,
    longitude: 67.01,
    accuracy: 10,
  });
  await login(page, "admin@demo.ibvs.test");
  await page.getByRole("button", { name: "Add location", exact: true }).click();
  const modal = page.getByRole("dialog");
  const code = `QA-LOC-${Date.now()}`;
  await modal.getByLabel("Billboard face code", { exact: true }).fill(code);
  await modal.getByLabel("Structure code", { exact: true }).fill(code);
  await modal.getByLabel("City", { exact: true }).fill("Karachi");
  await modal
    .getByRole("button", { name: "Use my current location", exact: true })
    .click();
  await expect(modal.getByLabel("Latitude", { exact: true })).toHaveValue(
    "24.8600000",
  );
  const map = modal.getByRole("img", {
    name: "Location map preview",
    exact: true,
  });
  const box = (await map.boundingBox())!;
  await map.click({ position: { x: box.width / 2, y: box.height / 2 } });
  const clickedLatitude = Number(
    await modal.getByLabel("Latitude", { exact: true }).inputValue(),
  );
  const clickedLongitude = Number(
    await modal.getByLabel("Longitude", { exact: true }).inputValue(),
  );
  expect(
    Math.hypot(
      (clickedLatitude - 24.86) * 111320,
      (clickedLongitude - 67.01) * 111320 * Math.cos((24.86 * Math.PI) / 180),
    ),
  ).toBeLessThanOrEqual(5);
  // Browser pointer coordinates round to pixels; keep the registered fixture exact.
  await modal
    .getByRole("button", { name: "Use my current location", exact: true })
    .click();
  await expect(modal.getByLabel("Latitude", { exact: true })).toHaveValue(
    "24.8600000",
  );
  await modal
    .getByRole("button", { name: "Confirm & save location", exact: true })
    .click();
  await expect(modal).toHaveCount(0);
  await page
    .getByRole("button", { name: "Inventory", exact: true })
    .first()
    .click();
  const row = page.getByRole("row").filter({ hasText: code });
  await expect(row.getByText("Test", { exact: true })).toBeVisible();
  await row.getByRole("button", { name: "Map / correct", exact: true }).click();
  await modal.getByLabel("Latitude", { exact: true }).fill("24.8601");
  await modal
    .getByLabel("Reason for correction", { exact: false })
    .fill("Confirmed roadside location during QA");
  await modal
    .getByRole("button", { name: "Record correction", exact: true })
    .click();
  await expect(modal).toHaveCount(0);
  const faces = await (await page.request.get("/api/inventory")).json();
  const face = faces.find((f: { code: string }) => f.code === code);
  expect(face).toMatchObject({
    latitude: 24.8601,
    original_latitude: 24.86,
    is_test: true,
  });
  await page
    .getByRole("checkbox", { name: `Select ${code}`, exact: true })
    .check();
  await page
    .getByRole("button", { name: "Assign visits (1)", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Worker", exact: true })
    .selectOption({ label: "DEMO Ali Hassan" });
  await page.getByLabel("Due date").fill("2026-11-15");
  await page
    .getByRole("button", { name: "Create assignments", exact: true })
    .click();
  await expect(modal).toHaveCount(0);

  const workerContext = await browser.newContext({
    baseURL: "http://localhost:3000",
    permissions: ["camera", "geolocation"],
    geolocation: { latitude: 24.8601, longitude: 67.01, accuracy: 10 },
  });
  const workerPage = await workerContext.newPage();
  try {
    await login(workerPage, "worker@demo.ibvs.test");
    await workerPage
      .getByRole("link", { name: "Open field workspace" })
      .click();
    await expect(
      workerPage.getByText("Offline shell ready", { exact: true }),
    ).toBeVisible();
    await workerPage
      .getByRole("button", { name: "Find nearby billboards", exact: true })
      .click();
    await expect(
      workerPage.getByText("No permitted assigned billboards", {
        exact: false,
      }),
    ).toBeVisible();
    await workerPage
      .getByLabel("Include test locations", { exact: true })
      .check();
    await workerPage
      .getByRole("button", { name: "Find nearby billboards", exact: true })
      .click();
    const nearby = workerPage
      .locator(".field-nearby article")
      .filter({ hasText: code });
    await expect(nearby).toBeVisible();
    await nearby
      .getByRole("button", { name: "Open assigned visit", exact: true })
      .click();
    await workerPage
      .getByRole("button", { name: "Start live camera", exact: true })
      .click();
    await expect
      .poll(() =>
        workerPage
          .locator("video")
          .evaluate((v) => (v as HTMLVideoElement).readyState),
      )
      .toBeGreaterThanOrEqual(2);
    await workerPage
      .getByRole("button", { name: "Capture", exact: true })
      .click();
    await expect(
      workerPage.getByText("Photo saved locally", { exact: true }),
    ).toHaveCount(1);
    await expect(
      workerPage.getByText("Location at capture:", { exact: false }),
    ).toBeVisible();
    await workerPage.screenshot({
      path: "test-results/location-capture.png",
      fullPage: true,
    });
  } finally {
    await workerContext.close();
  }
});
