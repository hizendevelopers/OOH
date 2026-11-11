import sharp from "sharp";

// Builds a real JPEG with an EXIF APP1 segment (date, offset, GPS). Test fixtures only.
// Pass lat/lon as null to omit GPS tags entirely. dateTime uses the EXIF form "YYYY:MM:DD HH:MM:SS".
export async function jpegWithExif(options: {
  lat?: number | null;
  lon?: number | null;
  dateTime?: string | null;
  offset?: string | null;
  width?: number;
  height?: number;
}) {
  const base = await sharp({
    create: { width: options.width ?? 320, height: options.height ?? 240, channels: 3, background: "#4a7" },
  })
    .jpeg()
    .toBuffer();
  const ascii = (s: string) => Buffer.from(s + "\0", "ascii");
  const u16 = (v: number) => { const b = Buffer.alloc(2); b.writeUInt16LE(v); return b; };
  const u32 = (v: number) => { const b = Buffer.alloc(4); b.writeUInt32LE(v); return b; };
  const entry = (tag: number, type: number, count: number, v: Buffer) => Buffer.concat([u16(tag), u16(type), u32(count), v]);
  const inl = (b: Buffer) => Buffer.concat([b, Buffer.alloc(4 - b.length)]);
  const dms = (deg: number) => {
    const a = Math.abs(deg);
    const d = Math.floor(a);
    const m = Math.floor((a - d) * 60);
    const s = ((a - d) * 60 - m) * 60;
    return [[d, 1], [m, 1], [Math.round(s * 1e4), 1e4]];
  };
  const withGps = options.lat !== undefined && options.lat !== null && options.lon !== undefined && options.lon !== null;
  const withDate = Boolean(options.dateTime);
  const ifd0Entries = (withDate ? 1 : 0) + (withGps ? 1 : 0);
  const exifEntries = (withDate ? 2 : 0);
  const gpsEntries = withGps ? 4 : 0;
  // Build data area after the IFDs.
  const ifd0Size = 2 + ifd0Entries * 12 + 4;
  const exifSize = exifEntries ? 2 + exifEntries * 12 + 4 : 0;
  const gpsSize = gpsEntries ? 2 + gpsEntries * 12 + 4 : 0;
  const exifOff = 8 + ifd0Size;
  const gpsOff = exifOff + exifSize;
  let dataOff = gpsOff + gpsSize;
  const data: Buffer[] = [];
  const put = (b: Buffer) => {
    const off = dataOff;
    data.push(b, ...(b.length % 2 ? [Buffer.alloc(1)] : []));
    dataOff += b.length + (b.length % 2);
    return off;
  };
  const ifd0Parts: Buffer[] = [];
  if (withDate) ifd0Parts.push(entry(0x8769, 4, 1, u32(exifOff)));
  if (withGps) ifd0Parts.push(entry(0x8825, 4, 1, u32(gpsOff)));
  const ifd0 = Buffer.concat([u16(ifd0Entries), ...ifd0Parts, u32(0)]);
  let exif = Buffer.alloc(0);
  if (withDate) {
    const dateOff = put(ascii(options.dateTime!));
    const offsetText = options.offset ?? "+03:00";
    const offOff = put(ascii(offsetText));
    exif = Buffer.concat([u16(2), entry(0x9003, 2, 20, u32(dateOff)), entry(0x9011, 2, 7, u32(offOff)), u32(0)]);
  }
  let gps = Buffer.alloc(0);
  if (withGps) {
    const lat = options.lat!, lon = options.lon!;
    const latOff = put(Buffer.concat(dms(lat).flatMap(([n, d]) => [u32(n), u32(d)])));
    const lonOff = put(Buffer.concat(dms(lon).flatMap(([n, d]) => [u32(n), u32(d)])));
    gps = Buffer.concat([
      u16(4),
      entry(1, 2, 2, inl(ascii(lat >= 0 ? "N" : "S"))),
      entry(2, 5, 3, u32(latOff)),
      entry(3, 2, 2, inl(ascii(lon >= 0 ? "E" : "W"))),
      entry(4, 5, 3, u32(lonOff)),
      u32(0),
    ]);
  }
  const tiff = Buffer.concat([Buffer.from("II*\0", "ascii"), u32(8), ifd0, exif, gps, ...data]);
  const payload = Buffer.concat([Buffer.from("Exif\0\0", "ascii"), tiff]);
  const len = payload.length + 2;
  const segment = Buffer.concat([Buffer.from([0xff, 0xe1, len >> 8, len & 255]), payload]);
  return Buffer.concat([base.subarray(0, 2), segment, base.subarray(2)]);
}

export async function plainJpeg() {
  return sharp({ create: { width: 320, height: 240, channels: 3, background: "#777" } }).jpeg().toBuffer();
}

// Wall-clock text of an instant in Asia/Baghdad, in EXIF form.
export function baghdadExifText(ms: number) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Baghdad",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(ms));
  const g = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${g("year")}:${g("month")}:${g("day")} ${g("hour")}:${g("minute")}:${g("second")}`;
}
