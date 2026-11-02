import { randomUUID } from "node:crypto";
import type { DimensionData } from "@ibvs/domain";
import type { Database } from "./db";

// Shared by CSV import and location creation. Writes one append-only size row
// only when a complete size was supplied; blank input leaves the face "Not recorded".
export async function insertRecordedDimension(
  tx: Database,
  input: {
    organizationId: string;
    faceId: string;
    recordedBy: string;
    dimensions: DimensionData;
  },
) {
  const { width_m, height_m, dimension_status, dimension_source } =
    input.dimensions;
  if (
    width_m === undefined ||
    height_m === undefined ||
    dimension_status === undefined
  )
    return null;
  const id = randomUUID();
  await tx.query(
    "INSERT INTO face_dimensions(id,organization_id,face_id,width_m,height_m,status,source_note,source_document_ref,recorded_by) VALUES($1,$2,$3,$4,$5,$6,$7,'',$8)",
    [
      id,
      input.organizationId,
      input.faceId,
      width_m,
      height_m,
      dimension_status,
      dimension_source ?? "",
      input.recordedBy,
    ],
  );
  return id;
}
