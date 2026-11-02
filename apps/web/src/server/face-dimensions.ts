import { randomUUID } from "node:crypto";
import { dimensionInput, type Actor } from "@ibvs/domain";
import { getDb } from "./db";
import { ApiError, audit, requireAdmin } from "./service";

export type FaceDimension = {
  id: string;
  face_id: string;
  width_m: number;
  height_m: number;
  status: string;
  source_note: string;
  source_document_ref: string;
  recorded_by: string;
  recorded_at: string;
};

// Administrator-only. Records are append-only; a correction is a newer row.
export async function recordDimensions(actor: Actor, input: unknown) {
  requireAdmin(actor);
  const data = dimensionInput.parse(input);
  return (await getDb()).transaction(async (tx) => {
    const [face] = await tx.query<{ id: string }>(
      "SELECT id FROM billboard_faces WHERE id=$1 AND organization_id=$2",
      [data.faceId, actor.organizationId],
    );
    if (!face) throw new ApiError(404, "Location not found");
    const id = randomUUID();
    await tx.query(
      "INSERT INTO face_dimensions(id,organization_id,face_id,width_m,height_m,status,source_note,source_document_ref,recorded_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [
        id,
        actor.organizationId,
        face.id,
        data.widthM,
        data.heightM,
        data.status,
        data.sourceNote,
        data.sourceDocumentRef,
        actor.id,
      ],
    );
    await audit(tx, actor, "face.dimensions.record", face.id, {
      id,
      widthM: data.widthM,
      heightM: data.heightM,
      status: data.status,
    });
    return { id, faceId: face.id };
  });
}

// Newest first. An empty list means "Not recorded", never a default size.
export async function dimensionHistory(
  actor: Actor,
  faceId: string,
): Promise<FaceDimension[]> {
  requireAdmin(actor);
  const db = await getDb();
  const [face] = await db.query<{ id: string }>(
    "SELECT id FROM billboard_faces WHERE id=$1 AND organization_id=$2",
    [faceId, actor.organizationId],
  );
  if (!face) throw new ApiError(404, "Location not found");
  const rows = await db.query<FaceDimension>(
    "SELECT id,face_id,width_m,height_m,status,source_note,source_document_ref,recorded_by,recorded_at FROM face_dimensions WHERE face_id=$1 AND organization_id=$2 ORDER BY recorded_at DESC, id DESC",
    [face.id, actor.organizationId],
  );
  // numeric columns come back as strings from PostgreSQL drivers.
  return rows.map((row) => ({
    ...row,
    width_m: Number(row.width_m),
    height_m: Number(row.height_m),
  }));
}
