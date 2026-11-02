import { z } from "zod";

export const dimensionStatuses = [
  "unverified",
  "owner_supplied",
  "surveyed",
  "remeasure_required",
] as const;
export type DimensionStatus = (typeof dimensionStatuses)[number];

// A stated status must be backed by a source note; "unverified" needs none.
const requiresSource = (status: DimensionStatus) =>
  status === "owner_supplied" || status === "surveyed";

const metres = z.coerce
  .number()
  .finite()
  .gt(0, "Must be greater than 0 m")
  .max(100, "Must be at most 100 m")
  .refine(
    (value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-9,
    "Use at most two decimal places",
  );

const blankToUndefined = (value: unknown) =>
  value === "" || value === null || value === undefined ? undefined : value;

// Optional CSV and form fields. Blank means "not recorded".
export const dimensionShape = {
  width_m: z.preprocess(blankToUndefined, metres.optional()),
  height_m: z.preprocess(blankToUndefined, metres.optional()),
  dimension_status: z.preprocess(
    blankToUndefined,
    z.enum(dimensionStatuses).optional(),
  ),
  dimension_source: z.preprocess(
    blankToUndefined,
    z.string().trim().max(1000).optional(),
  ),
};

// Width and height go together; a recorded size needs a status, and a stated
// source must be described.
export const dimensionFields = z
  .object(dimensionShape)
  .superRefine((value, context) => {
    const hasWidth = value.width_m !== undefined;
    const hasHeight = value.height_m !== undefined;
    if (hasWidth !== hasHeight)
      context.addIssue({
        code: "custom",
        path: [hasWidth ? "height_m" : "width_m"],
        message: "Enter both width and height, or neither",
      });
    if (!hasWidth && !hasHeight) return;
    if (value.dimension_status === undefined)
      context.addIssue({
        code: "custom",
        path: ["dimension_status"],
        message: "Choose a dimension status",
      });
    if (
      value.dimension_status &&
      requiresSource(value.dimension_status) &&
      (value.dimension_source ?? "").length < 5
    )
      context.addIssue({
        code: "custom",
        path: ["dimension_source"],
        message: "Describe the source of this size (at least 5 characters)",
      });
  });

export const dimensionInput = z
  .object({
    faceId: z.string().min(1).max(100),
    widthM: metres,
    heightM: metres,
    status: z.enum(dimensionStatuses),
    sourceNote: z.string().trim().max(1000).default(""),
    sourceDocumentRef: z.string().trim().max(200).default(""),
  })
  .strict()
  .superRefine((value, context) => {
    if (requiresSource(value.status) && value.sourceNote.length < 5)
      context.addIssue({
        code: "custom",
        path: ["sourceNote"],
        message: "Describe the source of this size (at least 5 characters)",
      });
  });
export type DimensionInput = z.infer<typeof dimensionInput>;

export type DimensionData = z.infer<typeof dimensionFields>;
