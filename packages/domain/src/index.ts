import { z } from "zod";
import { parse } from "csv-parse/sync";

export const code = z
  .string()
  .trim()
  .regex(
    /^[A-Z0-9][A-Z0-9_-]{2,47}$/,
    "Use 3–48 uppercase letters, digits, _ or -",
  );
export const faceInput = z.object({
  code,
  structure_code: code,
  city: z.string().trim().min(1).max(80),
  zone: z.string().trim().max(80).default(""),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  uncertainty_m: z.coerce.number().min(0).max(10000).default(50),
  orientation: z
    .enum(["N", "NE", "E", "SE", "S", "SW", "W", "NW", "unknown"])
    .default("unknown"),
  description: z.string().trim().max(1000).default(""),
  is_test: z.preprocess(
    (value) =>
      value === "true"
        ? true
        : value === "false" || value === ""
          ? false
          : value,
    z.boolean().default(false),
  ),
});
export type FaceInput = z.infer<typeof faceInput>;
export type Role = "admin" | "worker";
export type Actor = {
  id: string;
  organizationId: string;
  role: Role;
  name: string;
  email: string;
};
export function canAccessAssignment(
  actor: Actor,
  task: { organization_id: string; worker_id: string },
) {
  return (
    task.organization_id === actor.organizationId &&
    (actor.role === "admin" || task.worker_id === actor.id)
  );
}
export const localeDirection = (locale: string) =>
  locale === "ar" ? "rtl" : "ltr";
export function matchesFilter(value: string, query: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .includes(query.normalize("NFKC").toLocaleLowerCase());
}
export function distanceM(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) {
  const rad = Math.PI / 180;
  const dlat = (b.latitude - a.latitude) * rad,
    dlon = (b.longitude - a.longitude) * rad;
  const h =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(a.latitude * rad) *
      Math.cos(b.latitude * rad) *
      Math.sin(dlon / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}
export function locationFlag(
  distance: number,
  accuracy: number,
  sourceUncertainty: number,
) {
  return distance > accuracy + sourceUncertainty
    ? "outside_uncertainty"
    : "overlapping_uncertainty";
}
export const serverTransitions: Record<string, string[]> = {
  assigned: ["server_received"],
  server_received: ["pending_review"],
  pending_review: ["baseline_verified", "rejected", "resurvey_requested"],
  resurvey_requested: ["server_received"],
  rejected: [],
  baseline_verified: [],
};
export function mayTransition(from: string, to: string) {
  return serverTransitions[from]?.includes(to) ?? false;
}
export function csvCell(value: unknown) {
  let s = String(value ?? "");
  if (/^[\s]*[=+@-]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
export type Preview = {
  rows: FaceInput[];
  errors: { row: number; message: string }[];
};
export function previewCsv(
  csv: string,
  existing: Iterable<string> = [],
): Preview {
  const errors: Preview["errors"] = [],
    rows: FaceInput[] = [];
  const seen = new Set(existing);
  try {
    const records = parse(csv, {
      columns: (headers: string[]) => {
        if (new Set(headers).size !== headers.length)
          throw new Error("Duplicate CSV headers");
        return headers;
      },
      bom: true,
      skip_empty_lines: true,
      trim: true,
      max_record_size: 16384,
    }) as Record<string, string>[];
    if (!records.length || records.length > 1000)
      return {
        rows,
        errors: [{ row: 0, message: "CSV must contain 1–1000 rows" }],
      };
    for (const [i, record] of records.entries()) {
      for (const k of ["latitude", "longitude"])
        if (record[k]?.trim() === "") record[k] = "invalid";
      if (!record.uncertainty_m) delete record.uncertainty_m;
      if (!record.orientation) delete record.orientation;
      const result = faceInput.safeParse(record);
      if (!result.success) {
        errors.push({
          row: i + 2,
          message: result.error.issues
            .map((e) => `${e.path.join(".")}: ${e.message}`)
            .join("; "),
        });
        continue;
      }
      if (seen.has(result.data.code)) {
        errors.push({
          row: i + 2,
          message: `Duplicate face code: ${result.data.code}`,
        });
        continue;
      }
      seen.add(result.data.code);
      rows.push(result.data);
    }
  } catch {
    errors.push({
      row: 0,
      message:
        "Malformed CSV or oversized row; check quoted fields and headers",
    });
  }
  return { rows, errors };
}
