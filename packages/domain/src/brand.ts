import { z } from "zod";

// What the worker observed on the advertising face. "advertiser" carries the
// brand text; blank and unreadable faces carry none. Brand is an occupancy fact,
// never evidence that the assigned face was photographed.
export const brandKinds = ["advertiser", "blank", "unreadable"] as const;
export type BrandKind = (typeof brandKinds)[number];

export const brandEntry = z
  .object({
    kind: z.enum(brandKinds),
    text: z.string().trim().max(120).default(""),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.kind === "advertiser" && normalizeBrandKey(value.text).length < 2)
      context.addIssue({
        code: "custom",
        path: ["text"],
        message: "Enter the advertised brand (at least 2 characters)",
      });
    if (value.kind !== "advertiser" && value.text !== "")
      context.addIssue({
        code: "custom",
        path: ["text"],
        message: "Brand text is only allowed for an advertised brand",
      });
  });
export type BrandEntry = z.infer<typeof brandEntry>;

// Matching key for brand names: NFKC, Arabic letter variants folded, diacritics
// and tatweel removed, case folded, punctuation collapsed to single spaces.
// Two spellings with the same key are offered as the same advertiser.
export function normalizeBrandKey(text: string) {
  return text
    .normalize("NFKC")
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[آأإٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
