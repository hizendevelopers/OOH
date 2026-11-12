// City-wise inventory: grouping, dimension ratio, and display values. Pure functions; nothing is invented.

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
export function formatDimensions(widthM: number | null | undefined, heightM: number | null | undefined) {
  if (widthM == null || heightM == null || !Number.isFinite(widthM) || !Number.isFinite(heightM)) return null;
  const n = (v: number) => String(Number(v.toFixed(2)));
  return `${n(widthM)} × ${n(heightM)} m`;
}

// Address from saved fields only: the worker-entered address, otherwise "Area, City" from the site record.
export function siteAddress(site: { worker_address?: string | null; zone?: string | null; city?: string | null }) {
  const entered = (site.worker_address ?? "").trim();
  if (entered) return entered;
  const parts = [site.zone, site.city].map((p) => (p ?? "").trim()).filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

export function formatCoordinateValue(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? null : value.toFixed(6);
}
