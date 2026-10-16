import { it, expect } from "vitest";
import sharp from "sharp";
import { randomBytes } from "node:crypto";
import { imageAnalysis } from "../apps/web/src/server/image-analysis";
import {
  geoDistance,
  nearbyFaces,
  spatialEngine,
} from "../apps/web/src/server/spatial";
import type { Database } from "../apps/web/src/server/db";
import {
  hamming,
  signal,
  summarize,
  travelSignal,
  decisionInput,
  RULE_VERSION,
} from "../packages/domain/src/risk";

it("prioritizes explainable signals without probability scores", () => {
  const report = summarize([
    signal(
      "integrity_failure",
      "critical",
      { hashMismatch: true },
      { blocksApproval: true },
    ),
    signal(
      "neighboring_faces",
      "high",
      { distanceM: 4 },
      { independent: true },
    ),
  ]);
  expect(report).toEqual({
    level: "critical",
    blocksApproval: true,
    requiresIndependentReview: true,
  });
  expect(report).not.toHaveProperty("score");
  expect(
    signal("gps_missing", "medium", { status: "denied" }).ruleVersion,
  ).toBe(RULE_VERSION);
});
it("handles uncertainty and overlapping claimed capture windows conservatively", () => {
  expect(travelSignal(1000, 800, 800, 1, false)).toBeNull();
  expect(travelSignal(100000, 10, 10, 60, false)?.code).toBe(
    "impossible_travel",
  );
  expect(travelSignal(10000, 20, 20, 0, true)?.code).toBe(
    "overlapping_inspections",
  );
  expect(travelSignal(10000, 20, 20, 0, false)).toBeNull();
});
it("requires a reason and precise resurvey instructions", () => {
  const base = {
    operationId: crypto.randomUUID(),
    expectedVersion: 1,
    assessmentHash: "a".repeat(64),
    action: "reject",
    reason: "",
  };
  expect(decisionInput.safeParse(base).success).toBe(false);
  expect(
    decisionInput.safeParse({
      ...base,
      action: "resurvey",
      reason: "Need more context",
    }).success,
  ).toBe(false);
  expect(
    decisionInput.safeParse({
      ...base,
      action: "resurvey",
      reason: "Need more context",
      instructions: "Capture the left mounting frame and facing direction.",
      dueDate: "2026-11-01",
    }).success,
  ).toBe(true);
});
it("computes genuine DCT perceptual hashes for compressed visual variants", async () => {
  const original = await sharp(randomBytes(640 * 480 * 3), {
    raw: { width: 640, height: 480, channels: 3 },
  })
    .jpeg({ quality: 95 })
    .toBuffer();
  const variant = await sharp(original).jpeg({ quality: 80 }).toBuffer();
  const [a, b] = await Promise.all([
    imageAnalysis(original),
    imageAnalysis(variant),
  ]);
  expect(a.sha256).not.toBe(b.sha256);
  expect(a.phash).toMatch(/^[a-f0-9]{16}$/);
  expect(hamming(a.phash, b.phash)).toBeLessThanOrEqual(8);
  expect(hamming("0".repeat(16), "f".repeat(16))).toBe(64);
  await expect(imageAnalysis(Buffer.from("<script/>"))).rejects.toThrow(
    "Invalid JPEG",
  );
});
it("uses PostGIS geography queries with bound longitude/latitude and scoped candidates", async () => {
  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "postgresql://test.invalid/test";
  const calls: { sql: string; params?: unknown[] }[] = [];
  const db = {
    query: async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      return sql.includes("pg_extension")
        ? [{ present: 1 }]
        : sql.includes("ST_DWithin")
          ? []
          : [{ distance: 123 }];
    },
  } as Database;
  try {
    expect(await spatialEngine(db)).toBe("postgis");
    expect(
      await geoDistance(
        db,
        { longitude: 44, latitude: 33 },
        { longitude: 45, latitude: 34 },
        "postgis",
      ),
    ).toBe(123);
    await nearbyFaces(
      db,
      "tenant-a",
      "face-a",
      { longitude: 44, latitude: 33, uncertainty_m: 50 },
      "postgis",
    );
    expect(calls[1].params).toEqual([44, 33, 45, 34]);
    expect(calls[2].sql).toContain("ST_DWithin");
    expect(calls[2].sql).toContain("f.organization_id=$1");
    expect(calls[2].params).toEqual(["tenant-a", "face-a"]);
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  }
});
