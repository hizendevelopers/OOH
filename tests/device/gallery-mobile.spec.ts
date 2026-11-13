import { test, expect, type Page } from "@playwright/test";
import sharp from "sharp";

// Gallery pick on phone browsers (iPhone Safari profile and Android Chrome profile).
// Needs the isolated demo worker account, like field.spec.ts.
const password = process.env.IBVS_DEMO_PASSWORD;
test.skip(!password, "Isolated demo credentials are required");

async function signIn(page: Page) {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill("worker@demo.ibvs.test");
  await page.getByLabel("Password", { exact: true }).fill(password!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/field$/);
  await expect(page.getByRole("heading", { name: "Field workspace", exact: true })).toBeVisible();
}

test("a gallery photo without location shows guidance, and is kept for the server to judge", async ({ page }) => {
  test.setTimeout(180000);
  await signIn(page);
  await page.getByRole("button", { name: "Download assignments", exact: true }).click();
  await page.locator("article.field-visit").first().getByRole("button", { name: "Open inspection", exact: true }).click();
  // A plain JPEG has no EXIF location, like a screenshot or a copy stripped by the picker.
  const jpeg = await sharp({ create: { width: 640, height: 480, channels: 3, background: "#777" } }).jpeg().toBuffer();
  await page.locator('input[type="file"]').setInputFiles({ name: "IMG_9999.jpg", mimeType: "image/jpeg", buffer: jpeg });
  await expect(page.getByRole("status").filter({ hasText: /location|موقع/ }).first()).toBeVisible();
  await expect(page.getByText("Gallery original", { exact: false }).first()).toBeVisible();
});
