// Server-side verification of gallery photos. Pure decision logic plus an EXIF reader.
// The browser never supplies EXIF, coordinates or dates for approval: they are read here from the
// original bytes, and site coordinates come from the database.
import exifr from "exifr";

export const VERIFIER_VERSION = "gallery-exif-v1";
export const SITE_TIMEZONE = "Asia/Baghdad";
export const MAX_PHOTO_DISTANCE_M = 100;
export const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
export const GPS_TIME_TOLERANCE_MS = 10 * 60 * 1000;

export type ImageFormat = "jpeg" | "heic" | "heif";
export type ReasonSeverity = "reject" | "review";
export type Reason = { code: string; severity: ReasonSeverity; detail?: string };
export type Decision = {
  status: "approved" | "rejected" | "needs_review";
  reasons: Reason[];
  distanceM: number | null;
  capture: { localDate: string | null; localTime: string | null; offset: string | null; timezone: string; instant: string | null };
  photo: { latitude: number | null; longitude: number | null };
};

export type RawExif = {
  DateTimeOriginal?: unknown;
  OffsetTimeOriginal?: unknown;
  GPSLatitude?: unknown;
  GPSLatitudeRef?: unknown;
  GPSLongitude?: unknown;
  GPSLongitudeRef?: unknown;
  GPSDateStamp?: unknown;
  GPSTimeStamp?: unknown;
};

// Haversine distance on a spherical Earth (R = 6,371,008.8 m). Sufficient for a 100 m rule.
export function haversineMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLon = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Converts EXIF degrees/minutes/seconds with its hemisphere reference. Returns null when anything is invalid.
export function dmsToDecimal(value: unknown, ref: unknown, axis: "lat" | "lon"): number | null {
  if (!Array.isArray(value) || value.length !== 3) return null;
  const [d, m, s] = value.map(Number);
  if (![d, m, s].every(Number.isFinite) || d < 0 || m < 0 || m >= 60 || s < 0 || s > 60) return null;
  const allowed = axis === "lat" ? ["N", "S"] : ["E", "W"];
  if (typeof ref !== "string" || !allowed.includes(ref.trim().toUpperCase())) return null;
  const limit = axis === "lat" ? 90 : 180;
  const decimal = d + m / 60 + s / 3600;
  if (decimal > limit) return null;
  const sign = ref.trim().toUpperCase() === allowed[1] ? -1 : 1;
  return sign * decimal;
}

const DATE_RE = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/;
const OFFSET_RE = /^([+-])(\d{2}):(\d{2})$/;

// Parses the raw EXIF local date-time. Returns the wall clock parts and the optional camera offset.
export function parseExifLocal(raw: unknown, offset: unknown) {
  if (typeof raw !== "string") return null;
  const m = DATE_RE.exec(raw.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m.map(Number) as unknown as number[];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 60) return null;
  let offsetMinutes: number | null = null;
  let offsetText: string | null = null;
  if (offset !== undefined && offset !== null) {
    const o = OFFSET_RE.exec(String(offset).trim());
    if (!o) return null;
    const hours = Number(o[2]), minutes = Number(o[3]);
    if (hours > 14 || minutes > 59) return null;
    offsetMinutes = (o[1] === "-" ? -1 : 1) * (hours * 60 + minutes);
    offsetText = `${o[1]}${o[2]}:${o[3]}`;
  }
  return { y, mo, d, h, mi, s, offsetMinutes, offsetText };
}

// Calendar date (YYYY-MM-DD) of an instant in the site's timezone.
export function siteDate(instantMs: number, timeZone = SITE_TIMEZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(instantMs));
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

// Instant of an EXIF wall-clock time. With a camera offset it is exact; without one, the site timezone is assumed.
export function captureInstant(local: NonNullable<ReturnType<typeof parseExifLocal>>, timeZone = SITE_TIMEZONE) {
  const utcAsIfLocal = Date.UTC(local.y, local.mo - 1, local.d, local.h, local.mi, local.s);
  if (local.offsetMinutes !== null) return utcAsIfLocal - local.offsetMinutes * 60000;
  // Site-timezone wall clock: find the offset in effect at that wall time.
  const guess = utcAsIfLocal;
  const shown = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(guess));
  const g = (t: string) => Number(shown.find((p) => p.type === t)!.value);
  const shownAsUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second"));
  return guess - (shownAsUtc - guess);
}

export function visitWindowContains(localDate: string, window: { startDate: string; endDate: string }) {
  return localDate >= window.startDate && localDate <= window.endDate;
}

// Reads the EXIF values from the original file. Raw values, no date revival, so the wall clock is never reinterpreted.
export async function readExif(bytes: Buffer): Promise<RawExif> {
  const raw = await exifr.parse(bytes, {
    reviveValues: false,
    tiff: true,
    exif: true,
    gps: true,
    pick: ["DateTimeOriginal", "OffsetTimeOriginal", "GPSLatitude", "GPSLatitudeRef", "GPSLongitude", "GPSLongitudeRef", "GPSDateStamp", "GPSTimeStamp"],
  });
  return (raw ?? {}) as RawExif;
}

export const MANDATORY_EXIF = ["DateTimeOriginal", "GPSLatitude", "GPSLatitudeRef", "GPSLongitude", "GPSLongitudeRef"] as const;

export type DecisionInput = {
  format: ImageFormat | null;
  exif: RawExif;
  uploadedAtMs: number;
  nowMs: number;
  visitWindow: { startDate: string; endDate: string };
  site: { latitude: number | null; longitude: number | null; uncertaintyM?: number | null } | null;
  ownership: { workerMatches: boolean; assignmentMatches: boolean };
  duplicate: "none" | "exact" | "candidate";
  timeZone?: string;
};

// Applies the approval rules in the agreed order. All failures are recorded; the status is the strongest outcome.
export function decideGalleryPhoto(input: DecisionInput): Decision {
  const reasons: Reason[] = [];
  const timeZone = input.timeZone ?? SITE_TIMEZONE;
  const reject = (code: string, detail?: string) => reasons.push({ code, severity: "reject", detail });
  const review = (code: string, detail?: string) => reasons.push({ code, severity: "review", detail });
  const empty: Decision["capture"] = { localDate: null, localTime: null, offset: null, timezone: timeZone, instant: null };
  const photoNone: Decision["photo"] = { latitude: null, longitude: null };
  const finish = (distanceM: number | null, capture = empty, photo = photoNone): Decision => ({
    status: reasons.some((r) => r.severity === "reject") ? "rejected" : reasons.length ? "needs_review" : "approved",
    reasons,
    distanceM,
    capture,
    photo,
  });

  // 1. Original image.
  if (!input.format) {
    reject("unsupported_or_corrupt", "Use an original JPEG or HEIC/HEIF photo from the phone gallery.");
    return finish(null);
  }

  // 2. Mandatory EXIF tags.
  const missing = MANDATORY_EXIF.filter((tag) => input.exif[tag] === undefined || input.exif[tag] === null || input.exif[tag] === "");
  for (const tag of missing) reject(`exif_missing:${tag}`, `The photo has no ${tag} value.`);

  // 3. Capture date and time.
  const local = missing.includes("DateTimeOriginal") ? null : parseExifLocal(input.exif.DateTimeOriginal, input.exif.OffsetTimeOriginal);
  if (!missing.includes("DateTimeOriginal") && !local) reject("exif_invalid:DateTimeOriginal", "The capture date or offset is unreadable.");
  let captureMs: number | null = null;
  let capture = empty;
  if (local) {
    captureMs = captureInstant(local, timeZone);
    const localDate = siteDate(captureMs, timeZone);
    capture = {
      localDate,
      localTime: `${String(local.h).padStart(2, "0")}:${String(local.mi).padStart(2, "0")}:${String(local.s).padStart(2, "0")}`,
      offset: local.offsetText,
      timezone: timeZone,
      instant: new Date(captureMs).toISOString(),
    };
    if (captureMs > input.nowMs + FUTURE_TOLERANCE_MS) reject("capture_in_future", "The capture time is in the future.");
    if (!visitWindowContains(localDate, input.visitWindow))
      reject("capture_date_mismatch", `Captured on ${localDate}; the visit is ${input.visitWindow.startDate} to ${input.visitWindow.endDate}.`);
    // Cross-check with the GPS clock (UTC) when present. A large gap is a review signal, not an automatic reject.
    const gpsDate = input.exif.GPSDateStamp, gpsTime = input.exif.GPSTimeStamp;
    if (typeof gpsDate === "string" && Array.isArray(gpsTime) && gpsTime.length === 3) {
      const dm = /^(\d{4}):(\d{2}):(\d{2})$/.exec(gpsDate.trim());
      if (dm) {
        const [h, mi, s] = gpsTime.map(Number);
        const gpsMs = Date.UTC(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]), h, mi, Math.floor(s));
        if (Number.isFinite(gpsMs) && Math.abs(gpsMs - captureMs) > GPS_TIME_TOLERANCE_MS) review("gps_time_mismatch", "The GPS clock and the camera clock differ by more than 10 minutes.");
      }
    }
  }

  // 4. Photo coordinates.
  const lat = missing.includes("GPSLatitude") || missing.includes("GPSLatitudeRef") ? null : dmsToDecimal(input.exif.GPSLatitude, input.exif.GPSLatitudeRef, "lat");
  const lon = missing.includes("GPSLongitude") || missing.includes("GPSLongitudeRef") ? null : dmsToDecimal(input.exif.GPSLongitude, input.exif.GPSLongitudeRef, "lon");
  const coordinatesPresent = !missing.some((t) => t.startsWith("GPS"));
  if (coordinatesPresent && (lat === null || lon === null)) reject("exif_invalid:GPS", "The GPS coordinates are unreadable.");
  const zeroZero = lat === 0 && lon === 0;
  if (zeroZero) reject("gps_null_island", "The GPS coordinates are 0,0, which means no real fix.");
  const photo = lat !== null && lon !== null && !zeroZero ? { latitude: lat, longitude: lon } : photoNone;

  // 5. Site coordinates (authoritative, from the database).
  const siteOk = input.site && input.site.latitude !== null && input.site.longitude !== null;
  if (!siteOk) review("site_configuration_error", "The site has no verified coordinates. Approval is blocked until they are set.");

  // 6. Distance.
  let distanceM: number | null = null;
  if (siteOk && photo.latitude !== null && photo.longitude !== null) {
    distanceM = haversineMeters({ latitude: photo.latitude, longitude: photo.longitude }, { latitude: input.site!.latitude!, longitude: input.site!.longitude! });
    if (distanceM > MAX_PHOTO_DISTANCE_M) reject("distance_exceeded", `The photo is ${Math.round(distanceM)} m from the site; the limit is ${MAX_PHOTO_DISTANCE_M} m.`);
  }

  // 7. Worker and assignment.
  if (!input.ownership.workerMatches) reject("owner_mismatch", "The photo was not uploaded by the assigned worker.");
  if (!input.ownership.assignmentMatches) reject("assignment_mismatch", "The photo does not belong to this assignment and visit.");

  // 8. Integrity and duplicates.
  if (input.duplicate === "exact") reject("duplicate_exact", "This exact photo was already received for another visit.");
  if (input.duplicate === "candidate") review("duplicate_candidate", "A visually similar photo exists; a supervisor must check it.");

  return finish(distanceM, capture, photo);
}

// Detects the real format from the first bytes. Never trusts the file extension or the browser's MIME type.
export function detectFormat(bytes: Buffer): ImageFormat | null {
  if (bytes.length > 12 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length > 12 && bytes.toString("ascii", 4, 8) === "ftyp") {
    const brand = bytes.toString("ascii", 8, 12);
    if (["heic", "heix", "hevc", "hevx", "heim", "heis"].includes(brand)) return "heic";
    if (["mif1", "msf1"].includes(brand)) return "heif";
  }
  return null;
}
