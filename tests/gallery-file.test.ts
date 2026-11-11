import { describe, expect, it } from "vitest";
import {
  advisoryGalleryCheck,
  normalizedGalleryType,
  platformOf,
  withGalleryType,
} from "../apps/web/src/field/gallery-file";
import { jpegWithExif, plainJpeg } from "./helpers/exif-jpeg";

describe("gallery file types across Android and iOS pickers", () => {
  it("keeps specific image types the browser reports", () => {
    expect(normalizedGalleryType("IMG_1.HEIC", "image/heic")).toBe("image/heic");
    expect(normalizedGalleryType("a.jpg", "image/jpeg")).toBe("image/jpeg");
  });
  it("takes HEIC and JPEG from the extension when the type is missing or generic", () => {
    expect(normalizedGalleryType("IMG_2.HEIC", "")).toBe("image/heic");
    expect(normalizedGalleryType("IMG_3.heif", "application/octet-stream")).toBe("image/heif");
    expect(normalizedGalleryType("photo.JPG", "image/*")).toBe("image/jpeg");
  });
  it("leaves unknown formats for the server to reject", () => {
    expect(normalizedGalleryType("scan.png", "image/png")).toBe("image/png");
  });
  it("retypes a file without changing its bytes", async () => {
    const original = new File([new Uint8Array([1, 2, 3])], "IMG_4.HEIC", { type: "" });
    const typed = withGalleryType(original);
    expect(typed.type).toBe("image/heic");
    expect(new Uint8Array(await typed.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });
});

describe("advisory check before upload", () => {
  it("reports nothing for a photo with location and date", async () => {
    const bytes = await jpegWithExif({ lat: 33, lon: 44, dateTime: "2026:11:11 10:30:00" });
    expect(await advisoryGalleryCheck(new Blob([bytes], { type: "image/jpeg" }))).toEqual([]);
  });
  it("warns when location is missing, such as a screenshot or stripped copy", async () => {
    const bytes = await plainJpeg();
    const warnings = await advisoryGalleryCheck(new Blob([bytes], { type: "image/jpeg" }));
    expect(warnings).toEqual(expect.arrayContaining(["no_location", "no_date"]));
  });
  it("reports unreadable data rather than throwing", async () => {
    expect(await advisoryGalleryCheck(new Blob([new Uint8Array([9, 9, 9])]))).toEqual(
      expect.arrayContaining([expect.stringMatching(/no_location|unreadable|no_date/)]),
    );
  });
});

describe("platform detection", () => {
  it("recognises iPhone, iPad and Android user agents", () => {
    expect(platformOf("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe("ios");
    expect(platformOf("Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)")).toBe("ios");
    expect(platformOf("Mozilla/5.0 (Linux; Android 15; Pixel 8)")).toBe("android");
    expect(platformOf("Mozilla/5.0 (X11; Linux x86_64)")).toBe("other");
  });
});
