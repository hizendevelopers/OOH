// Browser-side helpers for gallery files. They never decide approval: the server verifies the original.
// Android and iOS pickers report types differently (HEIC is often missing or generic), so the type is
// taken from the file extension when the browser does not give a specific image type.
import exifr from "exifr";

const EXTENSIONS: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  heic: "image/heic",
  heif: "image/heif",
};
const SPECIFIC = ["image/jpeg", "image/heic", "image/heif"];

export function normalizedGalleryType(name: string, type: string) {
  const reported = type.toLowerCase();
  if (SPECIFIC.includes(reported)) return reported;
  const extension = name.toLowerCase().split(".").pop() ?? "";
  return EXTENSIONS[extension] ?? reported;
}

export function withGalleryType(file: File): Blob {
  const type = normalizedGalleryType(file.name, file.type);
  return type === file.type ? file : new File([file], file.name, { type });
}

export type GalleryWarning = "no_location" | "no_date" | "unreadable";

// Advisory only, so the worker can re-pick before leaving the site. Works offline. The server
// performs the authoritative check after upload.
export async function advisoryGalleryCheck(blob: Blob): Promise<GalleryWarning[]> {
  try {
    // Bytes, not the Blob, so the same code works in every browser and in tests.
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const tags = (await exifr.parse(bytes, {
      reviveValues: false,
      tiff: true,
      exif: true,
      gps: true,
      pick: ["DateTimeOriginal", "GPSLatitude", "GPSLongitude"],
    })) as Record<string, unknown> | undefined;
    const warnings: GalleryWarning[] = [];
    if (!tags) return ["no_date", "no_location"];
    if (!tags.GPSLatitude || !tags.GPSLongitude) warnings.push("no_location");
    if (!tags.DateTimeOriginal) warnings.push("no_date");
    return warnings;
  } catch {
    return ["unreadable"];
  }
}

export function platformOf(userAgent: string): "ios" | "android" | "other" {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  return "other";
}
