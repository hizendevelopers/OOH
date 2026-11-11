import { test, expect } from "@playwright/test";

// No credentials needed. Confirms the field app's public pages load in each phone browser profile.
test("sign-in page renders and the field shell is served on this browser", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByLabel("Email address")).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  const manifest = await page.request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBeTruthy();
});
