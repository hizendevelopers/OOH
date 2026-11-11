import { z } from "zod";

// Cities a worker can choose for a newly found site. Each has a fixed three-letter code used in site IDs,
// so an ID such as IQ-BGD-0001 always means Baghdad. Free-typed cities are not accepted.
export const siteCities = {
  Baghdad: { en: "Baghdad", ar: "بغداد", code: "BGD" },
  Basra: { en: "Basra", ar: "البصرة", code: "BSR" },
  Mosul: { en: "Mosul", ar: "الموصل", code: "MSL" },
  Erbil: { en: "Erbil", ar: "أربيل", code: "ERB" },
  Sulaymaniyah: { en: "Sulaymaniyah", ar: "السليمانية", code: "SLM" },
  Kirkuk: { en: "Kirkuk", ar: "كركوك", code: "KRK" },
  Najaf: { en: "Najaf", ar: "النجف", code: "NJF" },
  Karbala: { en: "Karbala", ar: "كربلاء", code: "KBL" },
  Hilla: { en: "Hilla", ar: "الحلة", code: "HLA" },
  Diwaniyah: { en: "Diwaniyah", ar: "الديوانية", code: "DWN" },
  Nasiriyah: { en: "Nasiriyah", ar: "الناصرية", code: "NSR" },
  Amarah: { en: "Amarah", ar: "العمارة", code: "AMR" },
  Ramadi: { en: "Ramadi", ar: "الرمادي", code: "RMD" },
  Fallujah: { en: "Fallujah", ar: "الفلوجة", code: "FLJ" },
  Samarra: { en: "Samarra", ar: "سامراء", code: "SMR" },
  Tikrit: { en: "Tikrit", ar: "تكريت", code: "TKR" },
  Baqubah: { en: "Baqubah", ar: "بعقوبة", code: "BQB" },
  Kut: { en: "Kut", ar: "الكوت", code: "KUT" },
  Duhok: { en: "Duhok", ar: "دهوك", code: "DHK" },
  Zakho: { en: "Zakho", ar: "زاخو", code: "ZKH" },
} as const;
export type SiteCity = keyof typeof siteCities;
export const siteCityNames = Object.keys(siteCities) as [SiteCity, ...SiteCity[]];
export const billboardFormats = ["unipole", "wall", "bridge", "gantry", "rooftop", "other"] as const;

export const SITE_MAX_ACCURACY_M = 50;
export const SITE_DUPLICATE_RADIUS_M = 50;
export const SITE_DUE_DAYS = 14;

export const siteRegistrationInput = z.object({
  operationId: z.uuid(),
  city: z.enum(siteCityNames),
  area: z.string().trim().min(2).max(120),
  region: z.string().trim().min(2).max(120),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyM: z.number().min(0).max(SITE_MAX_ACCURACY_M),
  observedAt: z.iso.datetime(),
  widthM: z.number().min(0.1).max(100),
  heightM: z.number().min(0.1).max(100),
  format: z.enum(billboardFormats),
  description: z.string().trim().max(1000).default(""),
});
export type SiteRegistrationInput = z.infer<typeof siteRegistrationInput>;

// Width-to-height ratio shown to the worker and the supervisor, for example "3.00 : 1".
export function aspectRatio(widthM: number, heightM: number) {
  const ratio = widthM / heightM;
  return `${ratio.toFixed(2)} : 1`;
}

// Site ID for a city and sequence number, for example IQ-BGD-0001.
export function siteCode(city: SiteCity, sequence: number) {
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 9999) throw new Error("Site sequence out of range");
  return `IQ-${siteCities[city].code}-${String(sequence).padStart(4, "0")}`;
}
