// City-wise inventory: grouping, dimension ratio, and display values. Pure functions; nothing is invented.
import { cityName } from "./arabic-names";

export const UNASSIGNED_CITY = "__unassigned__";

type Groupable = { city: string | null | undefined; code: string };

// Groups sites by their assigned city. Sites with no city go to one "unassigned" group, listed last.
// Cities are sorted by name; sites inside a city keep a stable order by code.
export function groupSitesByCity<T extends Groupable>(sites: T[]) {
  const groups = new Map<string, T[]>();
  for (const site of sites) {
    const key = (site.city ?? "").trim() || UNASSIGNED_CITY;
    const list = groups.get(key);
    if (list) list.push(site);
    else groups.set(key, [site]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === UNASSIGNED_CITY ? 1 : b === UNASSIGNED_CITY ? -1 : a.localeCompare(b)))
    .map(([city, list]) => ({ city, sites: [...list].sort((x, y) => x.code.localeCompare(y.code)) }));
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

// Simplified width:height ratio from the saved dimensions, e.g. 12 × 4 → "3:1", 20 × 9 → "20:9", 6.5 × 3 → "13:6".
// Works in whole centimetres so decimal metres stay exact. Returns null when a dimension is missing or invalid.
export function dimensionRatio(widthM: number | null | undefined, heightM: number | null | undefined) {
  if (widthM == null || heightM == null || !Number.isFinite(widthM) || !Number.isFinite(heightM)) return null;
  const w = Math.round(widthM * 100), h = Math.round(heightM * 100);
  if (w <= 0 || h <= 0) return null;
  const d = gcd(w, h);
  return `${w / d}:${h / d}`;
}

// "12 × 4 m", with decimals only where the saved value has them.
export function formatDimensions(widthM: number | null | undefined, heightM: number | null | undefined, ar = false) {
  if (widthM == null || heightM == null || !Number.isFinite(widthM) || !Number.isFinite(heightM)) return null;
  const n = (v: number) => String(Number(v.toFixed(2)));
  return `${n(widthM)} × ${n(heightM)} ${ar ? "م" : "m"}`;
}

// Address from saved fields only: the worker-entered address, otherwise "Area, City" from the site record.
export function siteAddress(site: { worker_address?: string | null; zone?: string | null; city?: string | null }, ar = false) {
  const entered = (site.worker_address ?? "").trim();
  if (entered) return entered;
  const parts = [site.zone, cityName(site.city, ar)].map((p) => (p ?? "").trim()).filter(Boolean);
  return parts.length ? parts.join(ar ? "، " : ", ") : null;
}

export function formatCoordinateValue(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? null : value.toFixed(6);
}

export type SiteSummaryInput = {
  code: string;
  description?: string | null;
  worker_address?: string | null;
  zone?: string | null;
  city?: string | null;
  width_m?: number | null;
  height_m?: number | null;
  latitude: number | null;
  longitude: number | null;
};

// Everything a site card shows, decided in one place so the field list, the open visit and the admin
// inventory always agree. The description names the site; the code is only an identifier.
// With ar, the city and the size unit are shown in Arabic; saved names and addresses stay as entered.
export function siteSummary(site: SiteSummaryInput, ar = false) {
  const name = (site.description ?? "").trim();
  const size = formatDimensions(site.width_m, site.height_m, ar);
  const ratio = dimensionRatio(site.width_m, site.height_m);
  const pinned =
    site.latitude != null && site.longitude != null && Number.isFinite(site.latitude) && Number.isFinite(site.longitude);
  return {
    name: name || site.code,
    hasName: Boolean(name),
    code: site.code,
    address: siteAddress(site, ar),
    addressFromWorker: Boolean((site.worker_address ?? "").trim()),
    // "4 × 3 m · 4:3" on one line; null when the size was never measured.
    size: size ? (ratio ? `${size} · ${ratio}` : size) : null,
    location: pinned
      ? { latitude: site.latitude as number, longitude: site.longitude as number, text: `${formatCoordinateValue(site.latitude)}, ${formatCoordinateValue(site.longitude)}` }
      : null,
  };
}
