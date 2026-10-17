import { test, expect, type Page } from "@playwright/test";
import sharp from "sharp";
import { randomBytes, createHash, randomUUID } from "node:crypto";
const password = process.env.IBVS_DEMO_PASSWORD;
test.skip(!password, "Isolated demo credentials required");
test.use({ actionTimeout: 30000 });
async function login(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password!);
  for (let attempt = 0; attempt < 2; attempt++) {
    const signedIn = page.waitForResponse((response) =>
      response.url().endsWith("/api/auth/sign-in/email"),
    );
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    const response = await signedIn;
    if (response.status() === 429 && attempt === 0) {
      // Keep real throttling enabled: the combined suite shares one loopback IP.
      const seconds = Math.max(
        1,
        Math.min(60, Number(response.headers()["retry-after"]) || 60),
      );
      await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
      await new Promise((resolve) => setTimeout(resolve, 1000));
      continue;
    }
    expect(response.status()).toBe(200);
    break;
  }
  await expect(page).toHaveURL("http://localhost:3000/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}
test("supervisors review adjacent faces, explicitly version references and request an offline resurvey", async ({
  page,
  browser,
}) => {
  test.setTimeout(240000);
  await login(page, "worker@demo.ibvs.test");
  expect((await page.request.get("/api/reviews")).status()).toBe(403);
  const tasks = await (await page.request.get("/api/assignments")).json();
  const task = tasks.find((t: { code: string }) => t.code === "DEMO-BGD-002");
  const bytes = await Promise.all(
    [0, 1].map(async () =>
      sharp(randomBytes(800 * 800 * 3), {
        raw: { width: 800, height: 800, channels: 3 },
      })
        .jpeg({ quality: 80 })
        .toBuffer(),
    ),
  );
  const photos = bytes.map((b, n) => ({
    kind: n ? "wide" : "front",
    sha256: createHash("sha256").update(b).digest("hex"),
    bytes: b.length,
    capturedAt: new Date().toISOString(),
    captureMode: "offline",
    gps: {
      status: "ok",
      latitude: task.latitude,
      longitude: task.longitude,
      accuracy: 180,
      observedAt: new Date().toISOString(),
    },
  }));
  const post = async (path: string, data: unknown) =>
    page.request.post(path, {
      headers: { Origin: "http://localhost:3000" },
      data,
    });
  const begun = await post("/api/inspections", {
    operationId: randomUUID(),
    assignmentId: task.assignment_id,
    faceId: task.id,
    faceCode: task.code,
    assignmentVersion: task.version,
    challengeId: null,
    photos,
  });
  expect(begun.status()).toBe(201);
  const { inspectionId: id } = await begun.json();
  for (let n = 0; n < 2; n++) {
    const kind = n ? "wide" : "front";
    for (let offset = 0; offset < bytes[n].length; offset += 262144) {
      const part = await page.request.put(
        `/api/inspections/${id}/parts/${kind}/${offset / 262144}`,
        {
          headers: {
            Origin: "http://localhost:3000",
            "Content-Type": "application/octet-stream",
          },
          data: bytes[n].subarray(offset, offset + 262144),
        },
      );
      expect(part.ok()).toBe(true);
    }
    expect(
      (await post(`/api/inspections/${id}/complete/${kind}`, {})).ok(),
    ).toBe(true);
  }
  expect((await post(`/api/inspections/${id}/submit`, {})).ok()).toBe(true);
  const adminContext = await browser.newContext(),
    admin = await adminContext.newPage();
  await login(admin, "admin@demo.ibvs.test");
  await admin.getByRole("link", { name: "Review center", exact: true }).click();
  await expect(
    admin.getByRole("heading", { name: "Evidence, in perspective." }),
  ).toBeVisible();
  await admin
    .locator(".review-queue-item")
    .filter({ hasText: "DEMO-BGD-002" })
    .click();
  await expect(
    admin.getByRole("button", {
      name: "Enlarge front photograph",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    admin.getByRole("button", { name: "Enlarge wide photograph", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      admin
        .locator(".review-photo img")
        .evaluateAll((images) =>
          images.every((img) => (img as HTMLImageElement).naturalWidth > 0),
        ),
    )
    .toBe(true);
  await admin.screenshot({
    path: "test-results/review-english-evidence.png",
    fullPage: true,
  });
  await admin
    .getByRole("button", { name: "Enlarge front photograph", exact: true })
    .click();
  await expect(admin.getByRole("dialog")).toBeVisible();
  await admin.keyboard.press("Escape");
  await admin.getByRole("tab", { name: "Risk analysis", exact: true }).click();
  await expect(
    admin.getByText("Nearby faces require identity disambiguation", {
      exact: true,
    }),
  ).toBeVisible();
  const d = await (await admin.request.get("/api/reviews/" + id)).json();
  const filters = new URLSearchParams({
    state: "pending",
    worker: task.worker_id,
    city: "Baghdad",
    date: new Date(d.inspection.received_at).toISOString().slice(0, 10),
    billboard: task.code,
    risk: "high",
    evidence: "offline",
  });
  const filtered = await (
    await admin.request.get("/api/reviews?" + filters)
  ).json();
  expect(filtered.map((i: { id: string }) => i.id)).toEqual([id]);
  expect(
    d.report.signals.some(
      (s: { code: string }) => s.code === "gps_low_accuracy",
    ),
  ).toBe(true);
  expect(
    d.report.signals.some(
      (s: { code: string }) => s.code === "offline_capture",
    ),
  ).toBe(true);
  const decision = {
    operationId: randomUUID(),
    expectedVersion: d.review.version,
    assessmentHash: d.report.assessmentHash,
    action: "approve",
    reason: "Exact face and mounting independently reviewed",
    identityConfirmed: true,
    riskAcknowledged: true,
  };
  expect(
    (
      await admin.request.post("/api/reviews/" + id + "/decision", {
        data: decision,
      })
    ).status(),
  ).toBe(403); // Missing same-origin header.
  await admin.getByLabel("Decision reason (required)").fill(decision.reason);
  await admin
    .getByLabel(
      "I confirmed the exact billboard face, its structure and surroundings.",
    )
    .check();
  await admin
    .getByLabel("I reviewed the anomalies and supporting evidence.")
    .check();
  await admin
    .getByRole("button", { name: "Record decision", exact: true })
    .click();
  await expect(admin.getByRole("status")).toContainText("Saved on server");
  await admin
    .getByLabel("Decision reason (required)")
    .fill("Attempt repeated independent approval");
  await admin
    .getByLabel(
      "I confirmed the exact billboard face, its structure and surroundings.",
    )
    .check();
  await admin
    .getByLabel("I reviewed the anomalies and supporting evidence.")
    .check();
  await admin
    .getByRole("button", { name: "Record decision", exact: true })
    .click();
  await expect(
    admin.getByRole("alert").filter({ hasText: "Another supervisor" }),
  ).toBeVisible();
  const secondContext = await browser.newContext(),
    second = await secondContext.newPage();
  await login(second, "reviewer2@demo.ibvs.test");
  await second.goto("/review");
  await second.getByLabel("Status", { exact: true }).selectOption("ambiguous");
  await second
    .locator(".review-queue-item")
    .filter({ hasText: "DEMO-BGD-002" })
    .click();
  await second
    .getByLabel("Decision reason (required)")
    .fill("Independent supervisor confirms exact south facing face");
  await second
    .getByLabel(
      "I confirmed the exact billboard face, its structure and surroundings.",
    )
    .check();
  await second
    .getByLabel("I reviewed the anomalies and supporting evidence.")
    .check();
  await second
    .getByRole("button", { name: "Record decision", exact: true })
    .click();
  await expect(second.getByRole("status")).toContainText("Saved on server");
  await second.getByRole("tab", { name: "References", exact: true }).click();
  await second
    .getByRole("button", { name: "Enroll exact-face reference", exact: true })
    .click();
  for (const [label, value] of [
    ["Shape", "Rectangle"],
    ["Mounting", "Twin steel posts"],
    ["Distinctive landmarks", "Road junction and neighboring north face"],
    ["Enrollment reason", "Two supervisors confirmed the exact billboard face"],
  ])
    await second.getByLabel(label, { exact: true }).fill(value);
  await second.getByLabel("Number of faces", { exact: true }).fill("2");
  await second
    .getByLabel("Facing direction", { exact: true })
    .selectOption("S");
  await second
    .getByLabel(
      "I confirm these references belong to this exact billboard face.",
    )
    .check();
  await second
    .getByRole("button", { name: "Approve reference enrollment", exact: true })
    .click();
  await expect(
    second.getByText("Active reference", { exact: true }),
  ).toBeVisible();
  await second
    .getByLabel("Withdrawal reason", { exact: true })
    .fill("Baseline requires additional landmark evidence");
  await second
    .getByRole("button", { name: "Withdraw reference", exact: true })
    .click();
  await expect(second.getByText("Withdrawn", { exact: true })).toBeVisible();
  await second.getByRole("button", { name: "Reject", exact: true }).click();
  await second
    .getByLabel("Decision reason (required)")
    .fill("Context requires a more distinctive landmark");
  await second
    .getByRole("button", { name: "Record decision", exact: true })
    .click();
  await expect(second.getByRole("status")).toContainText("Saved on server");
  await second
    .getByRole("button", { name: "Request resurvey", exact: true })
    .click();
  await second
    .getByLabel("Decision reason (required)")
    .fill("Please capture mounting and adjacent billboard");
  const instructions =
    "Photograph the south face mounting and the road junction separately.";
  await second.getByLabel("Specific worker instructions").fill(instructions);
  await second.getByLabel("Resurvey due date").fill("2026-11-20");
  await second
    .getByRole("button", { name: "Record decision", exact: true })
    .click();
  await expect(second.getByRole("status")).toContainText("Saved on server");
  const updated = await (await second.request.get("/api/reviews/" + id)).json();
  expect(updated.decisions).toHaveLength(4);
  expect(updated.review.state).toBe("resurvey_requested");
  await second.getByRole("tab", { name: "Audit & sync", exact: true }).click();
  await second
    .getByRole("button", { name: "View recorded assessment", exact: true })
    .first()
    .click();
  await expect(
    second.getByRole("heading", {
      name: "Recorded supporting evidence",
      exact: true,
    }),
  ).toBeVisible();
  await second
    .getByRole("button", { name: "Switch language", exact: true })
    .click();
  await second
    .getByRole("button", { name: "Toggle theme", exact: true })
    .click();
  await second.getByRole("tab", { name: "الأدلة", exact: true }).click();
  for (const width of [360, 390, 768, 1440]) {
    await second.setViewportSize({ width, height: 900 });
    expect(
      await second.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await second.screenshot({
      path: `test-results/review-arabic-${width}.png`,
      fullPage: true,
    });
  }
  await page.goto("/field");
  await expect(
    page.getByText("Offline shell ready", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Download assignments", exact: true })
    .click();
  await expect(page.getByText(instructions, { exact: true })).toBeVisible();
  const resurvey = page
    .locator("article.field-visit")
    .filter({ hasText: instructions });
  await resurvey
    .getByRole("button", { name: "Open inspection", exact: true })
    .click();
  await page.context().grantPermissions(["camera"]);
  await page
    .getByRole("button", { name: "Start live camera", exact: true })
    .click();
  await expect
    .poll(() =>
      page.locator("video").evaluate((v) => (v as HTMLVideoElement).readyState),
    )
    .toBeGreaterThanOrEqual(2);
  await page.context().setOffline(true);
  await page.getByRole("button", { name: "Capture", exact: true }).click();
  const frame = await page
    .locator("video")
    .evaluate((v) => (v as HTMLVideoElement).currentTime);
  await expect
    .poll(() =>
      page
        .locator("video")
        .evaluate((v) => (v as HTMLVideoElement).currentTime),
    )
    .toBeGreaterThan(frame + 0.1);
  await page.getByRole("button", { name: "Capture", exact: true }).click();
  await expect(
    page.getByText("Photo saved locally", { exact: true }),
  ).toHaveCount(2);
  await page
    .getByRole("button", { name: "Queue for upload", exact: true })
    .click();
  // A click starts an IndexedDB transaction; wait for its durable acknowledgement.
  await expect(
    page.getByText("Queued — no server receipt", { exact: true }).first(),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Queued — no server receipt", { exact: true }).first(),
  ).toBeVisible();
  await page.context().setOffline(false);
  await expect(
    page
      .getByText("Server received — awaiting human review", { exact: true })
      .first(),
  ).toBeVisible();
  const currentTasks = await (
    await page.request.get("/api/assignments")
  ).json();
  const followup = currentTasks.find(
    (t: { parent_inspection_id: string }) => t.parent_inspection_id === id,
  );
  const history = await (await page.request.get("/api/inspections")).json();
  const received = history.find(
    (i: { assignment_id: string }) =>
      i.assignment_id === followup.assignment_id,
  );
  expect(received.id).not.toBe(id);
  expect(received.receipt_id).toBeTruthy();
  const linked = await (
    await second.request.get("/api/reviews/" + received.id)
  ).json();
  expect(linked.inspection.parent_inspection_id).toBe(id);
  await secondContext.close();
  await adminContext.close();
});
