import { describe, expect, it } from "vitest";
import { jpegWithExif, plainJpeg } from "./helpers/exif-jpeg";
import {
  captureInstant,
  decideGalleryPhoto,
  detectFormat,
  dmsToDecimal,
  haversineMeters,
  parseExifLocal,
  readExif,
  siteDate,
  type DecisionInput,
  type RawExif,
} from "../apps/web/src/server/gallery-verification";

const SITE = { latitude: 33.3152, longitude: 44.3661, uncertaintyM: 5 };
const NOW = Date.parse("2026-11-11T12:00:00Z");
const WINDOW = { startDate: "2026-11-10", endDate: "2026-11-12" };
const GOOD_EXIF: RawExif = {
  DateTimeOriginal: "2026:11:11 10:30:00",
  OffsetTimeOriginal: "+03:00",
  GPSLatitude: [33, 18, 54.72],
  GPSLatitudeRef: "N",
  GPSLongitude: [44, 21, 57.96],
  GPSLongitudeRef: "E",
};

function input(overrides: Partial<DecisionInput> = {}): DecisionInput {
  return {
    format: "jpeg",
    exif: GOOD_EXIF,
    uploadedAtMs: NOW,
    nowMs: NOW,
    visitWindow: WINDOW,
    site: SITE,
    ownership: { workerMatches: true, assignmentMatches: true },
    duplicate: "none",
    ...overrides,
  };
}
const codes = (d: { reasons: { code: string }[] }) => d.reasons.map((r) => r.code);

describe("geometry", () => {
  it("measures distance on a sphere", () => {
    expect(haversineMeters(SITE, SITE)).toBe(0);
    // 0.001 degrees of latitude is about 111.2 m.
    const north = haversineMeters(SITE, { latitude: SITE.latitude + 0.001, longitude: SITE.longitude });
    expect(north).toBeGreaterThan(111);
    expect(north).toBeLessThan(111.4);
  });
  it("converts degrees, minutes and seconds with hemisphere references", () => {
    expect(dmsToDecimal([33, 18, 54.72], "N", "lat")).toBeCloseTo(33.3152, 6);
    expect(dmsToDecimal([44, 21, 57.96], "E", "lon")).toBeCloseTo(44.3661, 6);
    expect(dmsToDecimal([33, 0, 0], "S", "lat")).toBeCloseTo(-33, 9);
    expect(dmsToDecimal([44, 0, 0], "W", "lon")).toBeCloseTo(-44, 9);
  });
  it("rejects invalid DMS values and references", () => {
    expect(dmsToDecimal([33, 18], "N", "lat")).toBeNull();
    expect(dmsToDecimal([33, 60, 0], "N", "lat")).toBeNull();
    expect(dmsToDecimal([91, 0, 0], "N", "lat")).toBeNull();
    expect(dmsToDecimal([33, 0, 0], "E", "lat")).toBeNull();
    expect(dmsToDecimal([33, 0, 0], undefined, "lat")).toBeNull();
  });
});

describe("capture time", () => {
  it("reads the wall clock and camera offset without reinterpreting the time zone", () => {
    const local = parseExifLocal("2026:11:11 10:30:00", "+03:00");
    expect(local).toMatchObject({ offsetText: "+03:00" });
    expect(siteDate(captureInstant(local!))).toBe("2026-11-11");
  });
  it("uses the site's calendar date, not the camera's, across midnight", () => {
    // 23:30 at -05:00 on the 10th is 07:30 on the 11th in Baghdad.
    const local = parseExifLocal("2026:11:10 23:30:00", "-05:00")!;
    expect(siteDate(captureInstant(local))).toBe("2026-11-11");
  });
  it("assumes the site timezone when no offset is present", () => {
    const local = parseExifLocal("2026:11:11 10:30:00", undefined)!;
    expect(local.offsetText).toBeNull();
    expect(new Date(captureInstant(local)).toISOString()).toBe("2026-11-11T07:30:00.000Z");
  });
  it("rejects malformed date text and offsets", () => {
    expect(parseExifLocal("2026-11-11 10:30:00", "+03:00")).toBeNull();
    expect(parseExifLocal("2026:13:11 10:30:00", undefined)).toBeNull();
    expect(parseExifLocal("2026:11:11 10:30:00", "03:00")).toBeNull();
    expect(parseExifLocal(undefined, "+03:00")).toBeNull();
  });
});

describe("approval rules", () => {
  it("approves a photo that passes every rule", () => {
    const d = decideGalleryPhoto(input());
    expect(d.status).toBe("approved");
    expect(d.reasons).toEqual([]);
    expect(d.distanceM!).toBeLessThan(100);
    expect(d.capture).toMatchObject({ localDate: "2026-11-11", localTime: "10:30:00", offset: "+03:00", timezone: "Asia/Baghdad" });
  });
  it("judges late uploads by capture date, not upload date", () => {
    const threeDaysLater = decideGalleryPhoto(input({ uploadedAtMs: NOW + 3 * 86400000, nowMs: NOW + 3 * 86400000, visitWindow: { startDate: "2026-11-10", endDate: "2026-11-14" } }));
    expect(threeDaysLater.status).toBe("approved");
  });
  it("rejects an unsupported or corrupt original", () => {
    const d = decideGalleryPhoto(input({ format: null }));
    expect(d.status).toBe("rejected");
    expect(codes(d)).toEqual(["unsupported_or_corrupt"]);
  });
  it("rejects each missing mandatory tag by name", () => {
    const d = decideGalleryPhoto(input({ exif: { ...GOOD_EXIF, GPSLatitude: undefined, DateTimeOriginal: "" } }));
    expect(d.status).toBe("rejected");
    expect(codes(d)).toEqual(expect.arrayContaining(["exif_missing:DateTimeOriginal", "exif_missing:GPSLatitude"]));
  });
  it("rejects unreadable date text", () => {
    const d = decideGalleryPhoto(input({ exif: { ...GOOD_EXIF, DateTimeOriginal: "yesterday" } }));
    expect(codes(d)).toContain("exif_invalid:DateTimeOriginal");
    expect(d.status).toBe("rejected");
  });
  it("rejects a capture on another calendar day", () => {
    const d = decideGalleryPhoto(input({ visitWindow: { startDate: "2026-11-12", endDate: "2026-11-12" } }));
    expect(codes(d)).toContain("capture_date_mismatch");
    expect(d.status).toBe("rejected");
  });
  it("rejects a future capture time", () => {
    const d = decideGalleryPhoto(input({ nowMs: Date.parse("2026-11-11T06:00:00Z") }));
    expect(codes(d)).toContain("capture_in_future");
  });
  it("rejects a photo more than 100 m from the site", () => {
    const far = { ...GOOD_EXIF, GPSLatitude: [33, 18, 58.0], GPSLatitudeRef: "N" as const };
    const d = decideGalleryPhoto(input({ exif: far }));
    expect(codes(d)).toContain("distance_exceeded");
    expect(d.status).toBe("rejected");
    expect(d.distanceM!).toBeGreaterThan(100);
  });
  it("rejects 0,0 as a null fix", () => {
    const d = decideGalleryPhoto(input({ exif: { ...GOOD_EXIF, GPSLatitude: [0, 0, 0], GPSLongitude: [0, 0, 0] } }));
    expect(codes(d)).toContain("gps_null_island");
    expect(d.status).toBe("rejected");
  });
  it("blocks approval with a site-configuration error when the site has no coordinates", () => {
    const d = decideGalleryPhoto(input({ site: { latitude: null, longitude: null } }));
    expect(codes(d)).toContain("site_configuration_error");
    expect(d.status).toBe("needs_review");
    expect(d.distanceM).toBeNull();
  });
  it("rejects a photo from another worker or assignment", () => {
    expect(codes(decideGalleryPhoto(input({ ownership: { workerMatches: false, assignmentMatches: true } })))).toContain("owner_mismatch");
    expect(codes(decideGalleryPhoto(input({ ownership: { workerMatches: true, assignmentMatches: false } })))).toContain("assignment_mismatch");
  });
  it("rejects an exact duplicate and sends a similar image to review", () => {
    expect(decideGalleryPhoto(input({ duplicate: "exact" })).status).toBe("rejected");
    const similar = decideGalleryPhoto(input({ duplicate: "candidate" }));
    expect(similar.status).toBe("needs_review");
    expect(codes(similar)).toContain("duplicate_candidate");
  });
  it("sends a GPS-clock mismatch to review rather than rejecting it", () => {
    const d = decideGalleryPhoto(input({ exif: { ...GOOD_EXIF, GPSDateStamp: "2026:11:11", GPSTimeStamp: [2, 0, 0] } }));
    expect(codes(d)).toContain("gps_time_mismatch");
    expect(d.status).toBe("needs_review");
  });
  it("records every failure, with rejection outranking review", () => {
    const d = decideGalleryPhoto(input({ duplicate: "candidate", ownership: { workerMatches: false, assignmentMatches: true } }));
    expect(codes(d)).toEqual(expect.arrayContaining(["owner_mismatch", "duplicate_candidate"]));
    expect(d.status).toBe("rejected");
  });
});

describe("format detection", () => {
  it("recognises JPEG and HEIC/HEIF by their bytes, not the file name", () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0]);
    expect(detectFormat(jpeg)).toBe("jpeg");
    const heic = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypheic", "ascii"), Buffer.alloc(8)]);
    expect(detectFormat(heic)).toBe("heic");
    expect(detectFormat(Buffer.from("GIF89a-not-a-photo-at-all"))).toBeNull();
  });
});

describe("reading EXIF from the original bytes", () => {
  it("extracts date, offset and GPS from the original file and approves it", async () => {
    const bytes = await jpegWithExif({ lat: 33.3152, lon: 44.3661, dateTime: "2026:11:11 10:30:00" });
    const exif = await readExif(bytes);
    expect(exif.DateTimeOriginal).toBe("2026:11:11 10:30:00");
    expect(exif.OffsetTimeOriginal).toBe("+03:00");
    expect(decideGalleryPhoto(input({ exif })).status).toBe("approved");
  });
  it("finds a photo taken at a distant location and rejects it", async () => {
    const bytes = await jpegWithExif({ lat: 33.5, lon: 44.3661, dateTime: "2026:11:11 10:30:00" });
    const d = decideGalleryPhoto(input({ exif: await readExif(bytes) }));
    expect(codes(d)).toContain("distance_exceeded");
  });
  it("finds no GPS tags in a photo without location and rejects it by name", async () => {
    const bytes = await plainJpeg();
    const d = decideGalleryPhoto(input({ exif: await readExif(bytes) }));
    expect(d.status).toBe("rejected");
    expect(codes(d)).toEqual(expect.arrayContaining(["exif_missing:DateTimeOriginal", "exif_missing:GPSLatitude"]));
  });
});
