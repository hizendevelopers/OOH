import { describe, expect, it } from "vitest";
import {
  UNASSIGNED_CITY,
  dimensionRatio,
  formatCoordinateValue,
  formatDimensions,
  groupSitesByCity,
  siteAddress,
  siteSummary,
} from "../packages/domain/src/site-inventory";

describe("city grouping", () => {
  it("groups by city, sorts cities, and puts sites without a city last", () => {
    const groups = groupSitesByCity([
      { code: "B-2", city: "Erbil" },
      { code: "A-1", city: "Baghdad" },
      { code: "C-3", city: "" },
      { code: "A-0", city: "Baghdad" },
      { code: "D-4", city: null },
    ]);
    expect(groups.map((g) => g.city)).toEqual(["Baghdad", "Erbil", UNASSIGNED_CITY]);
    expect(groups[0].sites.map((s) => s.code)).toEqual(["A-0", "A-1"]);
    expect(groups[2].sites.map((s) => s.code)).toEqual(["C-3", "D-4"]);
  });
  it("regroups automatically when a site's city changes", () => {
    const site = { code: "X-1", city: "Basra" };
    expect(groupSitesByCity([site])[0].city).toBe("Basra");
    expect(groupSitesByCity([{ ...site, city: "Najaf" }])[0].city).toBe("Najaf");
  });
});

describe("dimensions", () => {
  it("simplifies the width:height ratio exactly", () => {
    expect(dimensionRatio(12, 4)).toBe("3:1");
    expect(dimensionRatio(20, 9)).toBe("20:9");
    expect(dimensionRatio(6.5, 3)).toBe("13:6");
    expect(dimensionRatio(4, 12)).toBe("1:3");
  });
  it("returns nothing when a dimension is missing or invalid", () => {
    expect(dimensionRatio(null, 4)).toBeNull();
    expect(dimensionRatio(12, 0)).toBeNull();
    expect(formatDimensions(undefined, 4)).toBeNull();
  });
  it("formats dimensions with the unit", () => {
    expect(formatDimensions(12, 4)).toBe("12 × 4 m");
    expect(formatDimensions(6.5, 3.25)).toBe("6.5 × 3.25 m");
  });
});

describe("address and coordinates", () => {
  it("uses the worker's address, then area and city, and never invents one", () => {
    expect(siteAddress({ worker_address: "Street 5", zone: "Karrada", city: "Baghdad" })).toBe("Street 5");
    expect(siteAddress({ zone: "Karrada", city: "Baghdad" })).toBe("Karrada, Baghdad");
    expect(siteAddress({ zone: "", city: "Hit" })).toBe("Hit");
    expect(siteAddress({ zone: null, city: null })).toBeNull();
  });
  it("shows coordinates to six decimals, or nothing when unsaved", () => {
    expect(formatCoordinateValue(33.3152)).toBe("33.315200");
    expect(formatCoordinateValue(null)).toBeNull();
  });
});

describe("site summary", () => {
  const base = { code: "IQ-BGD-0719", city: "Baghdad", zone: "Karrada", latitude: null, longitude: null };
  it("names the site by its description and keeps the code separate", () => {
    const s = siteSummary({ ...base, description: "  Ramp down from Amana Bridge  " });
    expect(s).toMatchObject({ name: "Ramp down from Amana Bridge", hasName: true, code: "IQ-BGD-0719" });
  });
  it("falls back to the code only when there is no description", () => {
    expect(siteSummary({ ...base, description: " " })).toMatchObject({ name: "IQ-BGD-0719", hasName: false });
  });
  it("uses the worker's address first, then area and city", () => {
    expect(siteSummary({ ...base, worker_address: "Street 52, near the bridge" })).toMatchObject({
      address: "Street 52, near the bridge",
      addressFromWorker: true,
    });
    expect(siteSummary(base)).toMatchObject({ address: "Karrada, Baghdad", addressFromWorker: false });
  });
  it("puts size and ratio on one line, and nothing when unmeasured", () => {
    expect(siteSummary({ ...base, width_m: 4, height_m: 3 }).size).toBe("4 × 3 m · 4:3");
    expect(siteSummary({ ...base, width_m: 15.1, height_m: 2 }).size).toBe("15.1 × 2 m · 151:20");
    expect(siteSummary(base).size).toBeNull();
  });
  it("reports a location only when both coordinates exist", () => {
    expect(siteSummary(base).location).toBeNull();
    expect(siteSummary({ ...base, latitude: 33.3, longitude: null }).location).toBeNull();
    expect(siteSummary({ ...base, latitude: 33.3152, longitude: 44.3661 }).location).toEqual({
      latitude: 33.3152,
      longitude: 44.3661,
      text: "33.315200, 44.366100",
    });
  });
});
