import { describe, expect, it } from "vitest";
import { cityName, cityNameAr } from "../packages/domain/src/arabic-names";
import { siteSummary } from "../packages/domain/src/site-inventory";
import { cityLine } from "../packages/domain/src/worker-visit";
import { localizeError } from "../apps/web/src/lib/server-messages";

describe("Arabic city names", () => {
  it("translates known cities whatever their spelling or prefix", () => {
    expect(cityNameAr("Baghdad")).toBe("بغداد");
    expect(cityNameAr("Al-Najaf")).toBe("النجف");
    expect(cityNameAr("al najaf")).toBe("النجف");
    expect(cityNameAr("Sulaimaniya")).toBe("السليمانية");
    expect(cityNameAr("Al-Shamiya")).toBe("الشامية");
  });
  it("translates the labels made at import part by part", () => {
    expect(cityNameAr("Kura (as listed)")).toBe("كورة (كما وردت)");
    expect(cityNameAr("Unspecified City, Anbar")).toBe("مدينة غير محددة، الأنبار");
  });
  it("leaves unknown names unchanged and English untouched", () => {
    expect(cityNameAr("Atlantis")).toBe("Atlantis");
    expect(cityName("Baghdad", false)).toBe("Baghdad");
    expect(cityName("Baghdad", true)).toBe("بغداد");
    expect(cityName(null, true)).toBe("");
  });
});

describe("Arabic site details", () => {
  const site = { code: "IQ-1", description: "Opposite the hospital", zone: "Karrada", city: "Baghdad", width_m: 12, height_m: 4, latitude: null, longitude: null };
  it("shows the city and the size unit in Arabic, keeping saved names as entered", () => {
    const ar = siteSummary(site, true);
    expect(ar.name).toBe("Opposite the hospital");
    expect(ar.address).toBe("Karrada، بغداد");
    expect(ar.size).toBe("12 × 4 م · 3:1");
  });
  it("is unchanged in English", () => {
    const en = siteSummary(site);
    expect(en.address).toBe("Karrada, Baghdad");
    expect(en.size).toBe("12 × 4 m · 3:1");
    expect(cityLine("Baghdad", "Karrada")).toBe("Baghdad · Karrada");
    expect(cityLine("Baghdad", "Karrada", true)).toBe("بغداد · Karrada");
  });
});

describe("server messages in Arabic", () => {
  it("translates known messages and never shows English in Arabic", () => {
    expect(localizeError("Assignment not found", true)).toBe("المهمة غير موجودة.");
    expect(localizeError("Review changed. Refresh before deciding.", true)).toBe("تغيّرت المراجعة. حدّثها قبل اتخاذ القرار.");
    expect(localizeError("Something unexpected", true)).not.toMatch(/[A-Za-z]/);
    expect(localizeError("Assignment not found", false)).toBe("Assignment not found");
    expect(localizeError("رسالة عربية", true)).toBe("رسالة عربية");
  });
});

describe("Arabic site names", () => {
  const site = { code: "IQ-2", description: "Opposite Al-Kindi Hospital Gate", description_ar: "مقابل بوابة مستشفى الكندي", city: "Baghdad", latitude: null, longitude: null };
  it("shows the translated name in Arabic and the English name otherwise", () => {
    expect(siteSummary(site, true).name).toBe("مقابل بوابة مستشفى الكندي");
    expect(siteSummary(site).name).toBe("Opposite Al-Kindi Hospital Gate");
  });
  it("falls back to the English name, then the code, when there is no translation", () => {
    expect(siteSummary({ ...site, description_ar: null }, true).name).toBe("Opposite Al-Kindi Hospital Gate");
    expect(siteSummary({ ...site, description: "", description_ar: null }, true).name).toBe("IQ-2");
  });
});
