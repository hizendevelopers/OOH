import { randomUUID } from "node:crypto";
import { z } from "zod";
import { faceInput, type Actor } from "@ibvs/domain";
import { getDb } from "./db";
import { ApiError, audit, requireAdmin } from "./service";

const coordinates = {
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  uncertainty_m: z.number().finite().min(0).max(10000),
};
export const locationInput = faceInput
  .extend({
    description: z.string().trim().max(1000).default(""),
    is_test: z.boolean().default(true),
    ...coordinates,
  })
  .strict();
export const correctionInput = z
  .object({
    faceId: z.string().uuid(),
    reason: z.string().trim().min(10).max(1000),
    ...coordinates,
  })
  .strict();

export async function createLocation(
  actor: Actor,
  input: z.infer<typeof locationInput>,
) {
  requireAdmin(actor);
  const data = locationInput.parse(input);
  try {
    return await (
      await getDb()
    ).transaction(async (tx) => {
      await tx.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [
        actor.organizationId,
      ]);
      let [structure] = await tx.query<{
        id: string;
        city: string;
        zone: string;
      }>(
        "SELECT id,city,zone FROM billboard_structures WHERE organization_id=$1 AND code=$2",
        [actor.organizationId, data.structure_code],
      );
      if (
        structure &&
        (structure.city !== data.city || structure.zone !== data.zone)
      )
        throw new ApiError(
          422,
          "This structure already has a different city or zone. Use its existing details or another structure code.",
        );
      if (!structure)
        [structure] = await tx.query<{
          id: string;
          city: string;
          zone: string;
        }>(
          "INSERT INTO billboard_structures(id,organization_id,code,city,zone) VALUES($1,$2,$3,$4,$5) RETURNING id,city,zone",
          [
            randomUUID(),
            actor.organizationId,
            data.structure_code,
            data.city,
            data.zone,
          ],
        );
      const id = randomUUID();
      await tx.query(
        "INSERT INTO billboard_faces(id,organization_id,structure_id,code,orientation,description,is_test) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          id,
          actor.organizationId,
          structure.id,
          data.code,
          data.orientation,
          data.description,
          data.is_test,
        ],
      );
      await tx.query(
        "INSERT INTO source_coordinates(id,face_id,latitude,longitude,uncertainty_m,source_name,imported_by) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          randomUUID(),
          id,
          data.latitude,
          data.longitude,
          data.uncertainty_m,
          "Manual location entry",
          actor.id,
        ],
      );
      await audit(tx, actor, "location.create", id, { ...data });
      return { id, code: data.code };
    });
  } catch (error) {
    if ((error as { code?: string }).code === "23505")
      throw new ApiError(
        409,
        "This billboard code already exists. Choose a unique face code.",
      );
    throw error;
  }
}

export async function correctLocation(
  actor: Actor,
  input: z.infer<typeof correctionInput>,
) {
  requireAdmin(actor);
  const data = correctionInput.parse(input);
  return (await getDb()).transaction(async (tx) => {
    const [face] = await tx.query<{ id: string }>(
      "SELECT id FROM billboard_faces WHERE id=$1 AND organization_id=$2 FOR UPDATE",
      [data.faceId, actor.organizationId],
    );
    if (!face) throw new ApiError(404, "Location not found");
    const [previous] = await tx.query(
      "SELECT latitude,longitude,uncertainty_m FROM effective_source_coordinates WHERE face_id=$1",
      [face.id],
    );
    const id = randomUUID();
    await tx.query(
      "INSERT INTO location_coordinate_corrections(id,organization_id,face_id,latitude,longitude,uncertainty_m,reason,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        id,
        actor.organizationId,
        face.id,
        data.latitude,
        data.longitude,
        data.uncertainty_m,
        data.reason,
        actor.id,
      ],
    );
    await tx.query(
      "UPDATE assignments SET version=version+1 WHERE face_id=$1 AND organization_id=$2 AND status IN ('assigned','resurvey_requested')",
      [face.id, actor.organizationId],
    );
    await audit(tx, actor, "location.coordinates.correct", face.id, {
      previous,
      correction: data,
      correctionId: id,
    });
    return { id, faceId: face.id };
  });
}

export async function locationHistory(actor: Actor, faceId: string) {
  requireAdmin(actor);
  z.string().uuid().parse(faceId);
  return (await getDb()).query(
    'SELECT c.id,c.latitude,c.longitude,c.uncertainty_m,c.reason,c.created_at,u.name actor_name FROM location_coordinate_corrections c JOIN billboard_faces f ON f.id=c.face_id JOIN "user" u ON u.id=c.created_by WHERE c.face_id=$1 AND f.organization_id=$2 ORDER BY c.created_at DESC,c.id DESC',
    [faceId, actor.organizationId],
  );
}
