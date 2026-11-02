import { randomUUID } from "node:crypto";
import { z } from "zod";
import { normalizeBrandKey, type Actor } from "@ibvs/domain";
import { getDb, type Database } from "./db";
import { ApiError, audit, requireAdmin } from "./service";

export type BrandObservation = {
  kind: string;
  observed_text: string;
  recorded_at: string;
};
export type CurrentAdvertiser = {
  outcome: string;
  advertiser_id: string | null;
  advertiser_name: string;
  confirmed_by_name: string;
  confirmed_at: string;
};
export type AdvertiserOption = { id: string; name: string };

// Advertiser names are shown in the language they were entered in.
const displayName = (row: { name_en: string; name_ar: string }) =>
  row.name_en || row.name_ar;

export async function brandForInspection(
  db: Database,
  organizationId: string,
  inspectionId: string,
) {
  const [observation] = await db.query<BrandObservation>(
    "SELECT kind,observed_text,recorded_at FROM brand_observations WHERE inspection_id=$1 AND organization_id=$2",
    [inspectionId, organizationId],
  );
  const [face] = await db.query<{ face_id: string }>(
    "SELECT face_id FROM inspections WHERE id=$1 AND organization_id=$2",
    [inspectionId, organizationId],
  );
  const [current] = face
    ? await db.query<{
        outcome: string;
        advertiser_id: string | null;
        name_en: string;
        name_ar: string;
        confirmed_by_name: string;
        confirmed_at: string;
      }>(
        `SELECT c.outcome,c.advertiser_id,coalesce(a.name_en,'') name_en,coalesce(a.name_ar,'') name_ar,u.name confirmed_by_name,c.confirmed_at
         FROM current_face_advertiser c
         LEFT JOIN advertisers a ON a.id=c.advertiser_id AND a.organization_id=c.organization_id
         JOIN "user" u ON u.id=c.confirmed_by
         WHERE c.face_id=$1 AND c.organization_id=$2`,
        [face.face_id, organizationId],
      )
    : [];
  const advertisers = await db.query<{ id: string; name_en: string; name_ar: string }>(
    "SELECT id,name_en,name_ar FROM advertisers WHERE organization_id=$1 ORDER BY normalized_key LIMIT 200",
    [organizationId],
  );
  return {
    observation: observation ?? null,
    current: current
      ? {
          outcome: current.outcome,
          advertiser_id: current.advertiser_id,
          advertiser_name: displayName(current),
          confirmed_by_name: current.confirmed_by_name,
          confirmed_at: current.confirmed_at,
        }
      : null,
    advertisers: advertisers.map((a) => ({ id: a.id, name: displayName(a) })),
  };
}

export const confirmInput = z
  .object({
    outcome: z.enum(["advertiser", "blank", "unreadable"]),
    advertiserId: z.string().min(1).max(100).optional(),
    newName: z.string().trim().max(120).optional(),
    reason: z.string().trim().max(1000).default(""),
    // Client retry key sent by the review workspace; accepted, not stored.
    operationId: z.string().min(1).max(100).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.outcome !== "advertiser") {
      if (value.advertiserId || value.newName)
        context.addIssue({
          code: "custom",
          path: ["outcome"],
          message: "A blank or unreadable face has no advertiser",
        });
      return;
    }
    if (Boolean(value.advertiserId) === Boolean(value.newName))
      context.addIssue({
        code: "custom",
        path: ["advertiserId"],
        message: "Choose an existing advertiser or enter a new name",
      });
    if (value.newName && normalizeBrandKey(value.newName).length < 2)
      context.addIssue({
        code: "custom",
        path: ["newName"],
        message: "Enter the advertiser name (at least 2 characters)",
      });
  });

// Supervisor confirmation. Brand observed by a worker stays unconfirmed until this
// runs. Each confirmation is a new row, so earlier ones remain visible.
export async function confirmBrand(
  actor: Actor,
  inspectionId: string,
  input: unknown,
) {
  requireAdmin(actor);
  const data = confirmInput.parse(input);
  return (await getDb()).transaction(async (tx) => {
    const [inspection] = await tx.query<{ face_id: string }>(
      "SELECT face_id FROM inspections WHERE id=$1 AND organization_id=$2 FOR UPDATE",
      [inspectionId, actor.organizationId],
    );
    if (!inspection) throw new ApiError(404, "Inspection not found");
    const [observation] = await tx.query<{ id: string }>(
      "SELECT id FROM brand_observations WHERE inspection_id=$1",
      [inspectionId],
    );
    const advertiserId =
      data.outcome === "advertiser"
        ? await resolveAdvertiser(tx, actor, data.advertiserId, data.newName)
        : null;
    const id = randomUUID();
    await tx.query(
      "INSERT INTO advertiser_confirmations(id,organization_id,face_id,observation_id,outcome,advertiser_id,reason,confirmed_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        id,
        actor.organizationId,
        inspection.face_id,
        observation?.id ?? null,
        data.outcome,
        advertiserId,
        data.reason,
        actor.id,
      ],
    );
    await audit(tx, actor, "advertiser.confirm", inspection.face_id, {
      confirmationId: id,
      inspectionId,
      outcome: data.outcome,
      advertiserId,
    });
    return { id, outcome: data.outcome, advertiserId };
  });
}

async function resolveAdvertiser(
  tx: Database,
  actor: Actor,
  advertiserId: string | undefined,
  newName: string | undefined,
) {
  if (advertiserId) {
    const [existing] = await tx.query<{ id: string }>(
      "SELECT id FROM advertisers WHERE id=$1 AND organization_id=$2",
      [advertiserId, actor.organizationId],
    );
    if (!existing) throw new ApiError(404, "Advertiser not found");
    return existing.id;
  }
  const key = normalizeBrandKey(newName ?? "");
  const [same] = await tx.query<{ id: string }>(
    "SELECT id FROM advertisers WHERE organization_id=$1 AND normalized_key=$2",
    [actor.organizationId, key],
  );
  if (same) return same.id;
  const arabic = /\p{Script=Arabic}/u.test(newName ?? "");
  const id = randomUUID();
  await tx.query(
    "INSERT INTO advertisers(id,organization_id,name_en,name_ar,normalized_key,created_by) VALUES($1,$2,$3,$4,$5,$6)",
    [
      id,
      actor.organizationId,
      arabic ? "" : (newName ?? ""),
      arabic ? (newName ?? "") : "",
      key,
      actor.id,
    ],
  );
  return id;
}
