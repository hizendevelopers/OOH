import { cityName } from "./arabic-names";
// Worker-facing rules for a visit card: status wording, address fallback, coordinates and map links, sorting.
// Shared by the field app and the tests. Pure functions only.

export type Lang = "en" | "ar";
export type WorkerStatus = "to_visit" | "submitted" | "needs_revisit";

const statusMap: Record<string, WorkerStatus> = {
  assigned: "to_visit",
  resurvey_requested: "needs_revisit",
  rejected: "needs_revisit",
  ambiguous: "needs_revisit",
  superseded: "needs_revisit",
  server_received: "submitted",
  approved: "submitted",
  baseline_verified: "submitted",
  pending_review: "submitted",
};

export const workerStatusLabels: Record<WorkerStatus, Record<Lang, string>> = {
  to_visit: { en: "To visit", ar: "للزيارة" },
  submitted: { en: "Submitted", ar: "أُرسلت" },
  needs_revisit: { en: "Needs revisit", ar: "تحتاج إعادة زيارة" },
};

// Any status the table does not know is treated as "to visit" so the worker is never shown a raw code.
export function workerStatus(status: string): WorkerStatus {
  return statusMap[status] ?? "to_visit";
}

export function statusLabel(status: string, lang: Lang) {
  return workerStatusLabels[workerStatus(status)][lang];
}

// City line without a dangling separator: "Baghdad · Karrada", or just "Baghdad" when there is no area.
export function cityLine(city: string | null | undefined, area: string | null | undefined, ar = false) {
  return [cityName(city, ar), area].map((part) => (part ?? "").trim()).filter(Boolean).join(" · ");
}

// The address the worker sees: the address the worker entered on a visit, otherwise the address from the import.
export function addressFor(workerAddress: string | null | undefined, importedAddress: string | null | undefined) {
  const worker = (workerAddress ?? "").trim();
  if (worker) return { text: worker, source: "worker" as const };
  const imported = (importedAddress ?? "").trim();
  if (imported) return { text: imported, source: "import" as const };
  return { text: null, source: "missing" as const };
}

export function formatCoordinate(value: number | null | undefined, positive: string, negative: string, digits = 6) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const hemisphere = value >= 0 ? positive : negative;
  return `${Math.abs(value).toFixed(digits)}° ${hemisphere}`;
}

// Plain "lat, lon" text, used for copying.
export function coordinatePair(latitude: number, longitude: number) {
  return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
}

export type MapLink = { id: "google" | "apple" | "device"; href: string };

// Map links the worker can tap. Google Maps works on every phone. Apple Maps is offered on iPhone and iPad.
// On Android, "geo:" opens the phone's chooser, so any installed map app can be used.
export function mapLinks(latitude: number, longitude: number, platform: "ios" | "android" | "other"): MapLink[] {
  const coords = `${latitude},${longitude}`;
  const links: MapLink[] = [
    { id: "google", href: `https://www.google.com/maps/search/?api=1&query=${coords}` },
  ];
  if (platform === "ios") links.push({ id: "apple", href: `https://maps.apple.com/?ll=${coords}&q=Billboard` });
  if (platform === "android") links.push({ id: "device", href: `geo:${coords}?q=${coords}` });
  return links;
}

export function haversineM(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLon = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(h)));
}

type Sortable = { due_date: string; code: string; latitude: number | null; longitude: number | null };

// "due": earliest due date first, then code. "nearest": distance from the worker's position; visits without
// coordinates go last, ordered by due date.
export function sortVisits<T extends Sortable>(visits: T[], mode: "due" | "nearest", origin: { latitude: number; longitude: number } | null): T[] {
  const byDue = (a: T, b: T) => (a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : a.code.localeCompare(b.code));
  if (mode === "nearest" && origin) {
    return [...visits].sort((a, b) => {
      const da = a.latitude !== null && a.longitude !== null ? haversineM(origin, { latitude: a.latitude, longitude: a.longitude }) : Infinity;
      const db = b.latitude !== null && b.longitude !== null ? haversineM(origin, { latitude: b.latitude, longitude: b.longitude }) : Infinity;
      if (da === db) return byDue(a, b);
      return da - db;
    });
  }
  return [...visits].sort(byDue);
}
