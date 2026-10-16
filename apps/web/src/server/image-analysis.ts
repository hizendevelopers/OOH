import sharp from "sharp";
import { createHash } from "node:crypto";
export const IMAGE_ALGORITHM = "jpeg-dct64-v1";
export const sha256 = (bytes: Buffer | string) =>
  createHash("sha256").update(bytes).digest("hex");
// DCT perceptual hash, not a place/face recognition model. Similarity is a review candidate.
export async function imageAnalysis(bytes: Buffer) {
  if (bytes.length > 6 * 1024 * 1024 || bytes[0] !== 255 || bytes[1] !== 216)
    throw new Error("Invalid JPEG");
  const image = sharp(bytes, { limitInputPixels: 24000000, failOn: "warning" });
  const metadata = await image.metadata();
  if (
    metadata.format !== "jpeg" ||
    !metadata.width ||
    !metadata.height ||
    Math.min(metadata.width, metadata.height) < 320
  )
    throw new Error("Invalid dimensions");
  const pixels = await image
    .clone()
    .rotate()
    .resize(32, 32, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer();
  const coefficients: number[] = [];
  for (let v = 0; v < 8; v++)
    for (let u = 0; u < 8; u++) {
      let total = 0;
      for (let y = 0; y < 32; y++)
        for (let x = 0; x < 32; x++)
          total +=
            pixels[y * 32 + x] *
            Math.cos(((2 * x + 1) * u * Math.PI) / 64) *
            Math.cos(((2 * y + 1) * v * Math.PI) / 64);
      coefficients.push(total);
    }
  const sorted = coefficients.slice(1).sort((a, b) => a - b),
    median = sorted[31];
  let bits = 0n;
  for (let i = 0; i < 64; i++)
    bits = (bits << 1n) | BigInt(i !== 0 && coefficients[i] > median ? 1 : 0);
  const mean = pixels.reduce((sum, value) => sum + value, 0) / pixels.length;
  const deviation = Math.sqrt(
    pixels.reduce((sum, value) => sum + (value - mean) ** 2, 0) / pixels.length,
  );
  let edges = 0;
  for (let y = 1; y < 32; y++)
    for (let x = 1; x < 32; x++)
      edges +=
        (pixels[y * 32 + x] - pixels[y * 32 + x - 1]) ** 2 +
        (pixels[y * 32 + x] - pixels[(y - 1) * 32 + x]) ** 2;
  return {
    width: metadata.width,
    height: metadata.height,
    sha256: sha256(bytes),
    phash: bits.toString(16).padStart(16, "0"),
    mean,
    deviation,
    edgeEnergy: edges / (31 * 31 * 2),
  };
}
