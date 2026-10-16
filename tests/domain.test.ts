import { describe, it, expect } from "vitest";
import {
  code,
  previewCsv,
  distanceM,
  locationFlag,
  canAccessAssignment,
  mayTransition,
  csvCell,
  localeDirection,
  matchesFilter,
} from "../packages/domain/src";
const header = "code,structure_code,city,latitude,longitude\n";
describe("immutable identity input", () => {
  it("accepts canonical IDs and rejects tampering", () => {
    expect(code.safeParse("BGD-001-N").success).toBe(true);
    for (const value of ["a", "lower-001", "../ABC", "A".repeat(49), "A B"])
      expect(code.safeParse(value).success).toBe(false);
  });
});
describe("coordinate import", () => {
  it("defaults unknown orientation and explicit uncertainty", () => {
    const p = previewCsv(header + "BGD-001,STR-001,Baghdad,33.3,44.4");
    expect(p.errors).toEqual([]);
    expect(p.rows[0]).toMatchObject({
      uncertainty_m: 50,
      orientation: "unknown",
    });
  });
  it("rejects missing and out-of-range coordinates", () => {
    expect(
      previewCsv(header + "BGD-001,STR-001,Baghdad,,44.4").errors,
    ).toHaveLength(1);
    expect(
      previewCsv(header + "BGD-001,STR-001,Baghdad,91,44.4").errors,
    ).toHaveLength(1);
  });
  it("rejects duplicates in file and database", () => {
    const row = "BGD-001,STR-001,Baghdad,33.3,44.4";
    expect(previewCsv(header + row + "\n" + row).errors[0].row).toBe(3);
    expect(previewCsv(header + row, ["BGD-001"]).errors).toHaveLength(1);
  });
  it("handles BOM and quoted city", () => {
    expect(
      previewCsv(
        "\uFEFF" + header + 'BGD-001,STR-001,"Baghdad, Iraq",33.3,44.4',
      ).rows[0].city,
    ).toBe("Baghdad, Iraq");
  });
  it("rejects empty and malformed input", () => {
    expect(previewCsv(header).errors.length).toBeGreaterThan(0);
    expect(previewCsv(header + '"broken').errors.length).toBeGreaterThan(0);
  });
  it("rejects duplicate headers and prototype-related input", () => {
    expect(
      previewCsv(
        "code,code,structure_code,city,latitude,longitude\nGOOD-001,BAD-001,STR-001,Baghdad,33,44",
      ).errors,
    ).toHaveLength(1);
    const p = previewCsv(
      "__proto__,code,structure_code,city,latitude,longitude\nx,GOOD-001,STR-001,Baghdad,33,44",
    );
    expect(p.rows[0]?.code).toBe("GOOD-001");
  });
  it("limits batches", () => {
    expect(
      previewCsv(
        header +
          Array.from(
            { length: 1001 },
            (_, i) => `BGD-${i},STR-001,Baghdad,33,44`,
          ).join("\n"),
      ).errors[0].message,
    ).toContain("1000");
  });
});
describe("untrusted location", () => {
  it("calculates distance and uncertainty overlap", () => {
    expect(
      distanceM(
        { latitude: 33, longitude: 44 },
        { latitude: 33, longitude: 44 },
      ),
    ).toBe(0);
    expect(
      distanceM({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }),
    ).toBeCloseTo(111194.9, 0);
    expect(locationFlag(70, 30, 50)).toBe("overlapping_uncertainty");
    expect(locationFlag(90, 30, 50)).toBe("outside_uncertainty");
  });
});
describe("permissions and state", () => {
  const actor = {
    id: "one",
    organizationId: "org",
    role: "worker" as const,
    name: "Worker",
    email: "one@test.invalid",
  };
  it("scopes worker and admin to organization", () => {
    expect(
      canAccessAssignment(actor, { organization_id: "org", worker_id: "one" }),
    ).toBe(true);
    expect(
      canAccessAssignment(actor, { organization_id: "org", worker_id: "two" }),
    ).toBe(false);
    expect(
      canAccessAssignment(
        { ...actor, role: "admin" },
        { organization_id: "another", worker_id: "one" },
      ),
    ).toBe(false);
  });
  it("rejects fake local states and direct baseline approval", () => {
    expect(mayTransition("assigned", "baseline_verified")).toBe(false);
    expect(mayTransition("local_draft", "pending_review")).toBe(false);
    expect(mayTransition("pending_review", "baseline_verified")).toBe(true);
    expect(mayTransition("baseline_verified", "assigned")).toBe(false);
  });
});
it("isolates RTL and normalizes searching", () => {
  expect(localeDirection("ar")).toBe("rtl");
  expect(localeDirection("en")).toBe("ltr");
  expect(matchesFilter("Baghdad KARRADA", "karrada")).toBe(true);
  expect(matchesFilter("بغداد", "بغداد")).toBe(true);
});
it("neutralizes spreadsheet formulas and quotes", () => {
  expect(csvCell("=1+1")).toBe('"\'=1+1"');
  expect(csvCell("  @evil")).toBe('"\'  @evil"');
  expect(csvCell('a"b')).toBe('"a""b"');
});
