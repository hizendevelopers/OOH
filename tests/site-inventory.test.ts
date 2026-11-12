import { describe, expect, it } from "vitest";
import {
  UNASSIGNED_CITY,
  dimensionRatio,
  formatCoordinateValue,
  formatDimensions,
  groupSitesByCity,
  siteAddress,
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
