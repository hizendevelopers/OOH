import { test, expect, type Page } from "@playwright/test";
const password = process.env.IBVS_DEMO_PASSWORD;
test.skip(!password, "Isolated demo credentials are required");
async function field(page: Page, code: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill("worker@demo.ibvs.test");
  await page.getByLabel("Password", { exact: true }).fill(password!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("link", { name: "Open field workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Field workspace", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Offline shell ready", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Download assignments", exact: true })
    .click();
  const card = page
    .locator("article.field-visit")
    .filter({ has: page.getByRole("heading", { name: code, exact: true }) });
  await expect(
    card.getByText("Downloaded for this device", { exact: true }),
  ).toBeVisible();
  await card
    .getByRole("button", { name: "Open inspection", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: code, exact: true }),
  ).toBeVisible();
}
async function camera(page: Page) {
  await page
    .getByRole("button", { name: "Start live camera", exact: true })
    .click();
  await expect
    .poll(async () =>
      page.locator("video").evaluate((v) => (v as HTMLVideoElement).readyState),
    )
    .toBeGreaterThanOrEqual(2);
}
test("offline camera evidence survives reload and interrupted upload; server receipt is idempotent", async ({
  page,
  context,
  browser,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await context.grantPermissions(["camera"]);
  await field(page, "DEMO-BGD-001");
  const tasks = await (await page.request.get("/api/assignments")).json();
  const bound = tasks.find(
    (task: { code: string }) => task.code === "DEMO-BGD-001",
  );
  const forged = {
    operationId: crypto.randomUUID(),
    assignmentId: bound.assignment_id,
    faceId: crypto.randomUUID(),
    faceCode: bound.code,
    assignmentVersion: bound.version,
    challengeId: null,
    photos: ["front", "wide"].map((kind) => ({
      kind,
      bytes: 1,
      sha256: "a".repeat(64),
      capturedAt: new Date().toISOString(),
      captureMode: "offline",
      gps: { status: "denied", observedAt: new Date().toISOString() },
    })),
  };
  expect(
    (
      await page.request.post("/api/inspections", {
        headers: { Origin: "http://localhost:3000" },
        data: forged,
      })
    ).status(),
  ).toBe(409);
  await page
    .getByRole("button", { name: "Record location fix", exact: true })
    .click();
  await expect(
    page.getByText("Location permission denied.", { exact: false }),
  ).toBeVisible();
  await camera(page);
  await context.setOffline(true);
  await page.getByRole("button", { name: "Capture", exact: true }).click();
  await expect(
    page.getByText("Photo saved locally", { exact: true }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Capture", exact: true }).click();
  await expect(
    page.getByText("Photo saved locally", { exact: true }),
  ).toHaveCount(2);
  await expect(
    page.getByText("Offline capture • device claim", { exact: true }),
  ).toHaveCount(2);
  await page
    .getByRole("button", { name: "Queue for upload", exact: true })
    .click();
  await expect(
    page.getByText("Queued — no server receipt", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Field workspace", exact: true }),
  ).toBeVisible();
  const card = page.locator("article.field-visit").filter({
    has: page.getByRole("heading", { name: "DEMO-BGD-001", exact: true }),
  });
  await card
    .getByRole("button", { name: "Continue inspection", exact: true })
    .click();
  await expect(
    page.getByText("Photo saved locally", { exact: true }),
  ).toHaveCount(2);
  await expect(
    page.getByText("Queued — no server receipt", { exact: true }),
  ).toBeVisible();
  await page.route("**/api/inspections/*/parts/wide/*", (route) =>
    route.abort("internetdisconnected"),
  );
  await context.setOffline(false);
  await expect(
    page.getByText(
      "Connection interrupted. Your saved photos will retry with backoff.",
      { exact: true },
    ),
  ).toBeVisible();
  const history = await (await page.request.get("/api/inspections")).json();
  const row = history.find((i: { status: string }) => i.status === "uploading");
  expect(row.receipt_id).toBeNull();
  const upload = await (
    await page.request.get("/api/inspections/" + row.id)
  ).json();
  expect(
    upload.photos.find((p: { kind: string }) => p.kind === "front").receiptId,
  ).toBeTruthy();
  expect(upload.receipt).toBeNull();
  await page.unroute("**/api/inspections/*/parts/wide/*");
  await page
    .getByRole("button", { name: "Retry synchronization", exact: true })
    .click();
  await expect(
    page.getByText("Server received — awaiting human review", { exact: true }),
  ).toBeVisible();
  const receipt = await (
    await page.request.get("/api/inspections/" + row.id)
  ).json();
  const repeated = await page.request.post(
    "/api/inspections/" + row.id + "/submit",
    { headers: { Origin: "http://localhost:3000" }, data: {} },
  );
  expect(await repeated.json()).toEqual(receipt.receipt);
  expect(receipt.receipt.flags).toEqual(
    expect.arrayContaining([
      "gps_denied",
      "offline_capture_device_claim",
      "human_review_required",
    ]),
  );
  expect(
    (
      await page.request.get("/api/inspections/" + row.id + "/media/front")
    ).headers()["cache-control"],
  ).toContain("no-store");
  await page.screenshot({
    path: "test-results/field-received-390.png",
    fullPage: true,
  });
  const cached = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const key of await caches.keys())
      for (const request of await (await caches.open(key)).keys())
        urls.push(new URL(request.url).pathname);
    return urls;
  });
  expect(cached.some((url) => url.startsWith("/api/"))).toBe(false);
  expect(cached).toContain("/field");
  expect(
    (
      await page.request.post("/api/inspections/" + row.id + "/submit", {
        headers: { Origin: "https://evil.invalid" },
        data: {},
      })
    ).status(),
  ).toBe(403);
  const outsider = await browser.newContext({
    baseURL: "http://localhost:3000",
  });
  expect((await outsider.request.get("/api/inspections")).status()).toBe(401);
  expect(
    (
      await outsider.request.post("/api/auth/sign-in/email", {
        headers: { Origin: "http://localhost:3000" },
        data: { email: "worker2@demo.ibvs.test", password },
      })
    ).status(),
  ).toBe(200);
  for (const route of [row.id, row.id + "/media/front"])
    expect(
      (await outsider.request.get("/api/inspections/" + route)).status(),
    ).toBe(404);
  expect(
    (
      await outsider.request.post("/api/inspections/" + row.id + "/submit", {
        headers: { Origin: "http://localhost:3000" },
        data: {},
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await outsider.request.put(
        "/api/inspections/" + row.id + "/parts/front/0",
        {
          headers: {
            Origin: "http://localhost:3000",
            "Content-Type": "application/octet-stream",
          },
          data: Buffer.from([0]),
        },
      )
    ).status(),
  ).toBe(404);
  await outsider.close();
});
test("GPS success, simulated storage exhaustion and denied camera preserve honest states", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["camera", "geolocation"]);
  await context.setGeolocation({
    latitude: 33.3102,
    longitude: 44.4351,
    accuracy: 17,
  });
  await field(page, "DEMO-BGD-002");
  await page
    .getByRole("button", { name: "Record location fix", exact: true })
    .click();
  await expect(
    page.getByText("33.310200, 44.435100", { exact: false }),
  ).toBeVisible();
  await camera(page);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    let full = true;
    window.addEventListener("test-clear-quota", () => {
      full = false;
    });
    IDBObjectStore.prototype.put = function (value, ...args) {
      if (full && this.name === "drafts" && value.photos?.front)
        throw new DOMException(
          "Simulated quota exhaustion",
          "QuotaExceededError",
        );
      return original.call(this, value, ...args);
    };
  });
  await page.getByRole("button", { name: "Capture", exact: true }).click();
  await expect(
    page.getByText("Device storage is full.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("Photo saved locally", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Photo is not saved.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Queue for upload", exact: true }),
  ).toBeDisabled();
  await page.evaluate(() =>
    window.dispatchEvent(new Event("test-clear-quota")),
  );
  await page
    .getByRole("button", { name: "Retry saving photo", exact: true })
    .click();
  await expect(
    page.getByText("Photo saved locally", { exact: true }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Stop camera", exact: true }).click();
  await page.evaluate(() => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: async () => {
        throw new DOMException("Denied", "NotAllowedError");
      },
      configurable: true,
    });
  });
  await page
    .getByRole("button", { name: "Start live camera", exact: true })
    .click();
  await expect(
    page.getByText("Camera permission denied.", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Switch language", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.getByRole("button", { name: "تغيير المظهر", exact: true }).click();
  for (const width of [360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/field-arabic-${width}.png`,
      fullPage: true,
    });
  }
});
