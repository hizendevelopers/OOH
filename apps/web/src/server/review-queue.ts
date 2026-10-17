import { createHash } from "node:crypto";
import { z } from "zod";
import type { Actor } from "@ibvs/domain";
import { getDb } from "./db";
import { ApiError, requireAdmin } from "./service";

export type QueueItem = {
  id: string;
  code: string;
  city: string;
  worker_name: string;
  worker_id: string;
  received_at: string;
  state: string;
  version: number;
  risk_level: string;
  evidence_type: "offline" | "online";
};
export type ReviewPage = { items: QueueItem[]; nextCursor: string | null };
const inputSchema = z.object({
  state: z
    .enum([
      "pending",
      "ambiguous",
      "approved",
      "rejected",
      "resurvey_requested",
    ])
    .nullable(),
  worker: z.string().max(100).nullable(),
  city: z.string().max(200).nullable(),
  billboard: z.string().max(100).nullable(),
  risk: z
    .enum(["unknown", "info", "low", "medium", "high", "critical"])
    .nullable(),
  date: z.iso.date().nullable(),
  evidence: z.enum(["online", "offline"]).nullable(),
});
const cursorSchema = z.object({
  v: z.literal(1),
  organizationId: z.string(),
  filterHash: z.string().length(64),
  receivedAt: z.iso.datetime({ offset: true }),
  id: z.uuid(),
});
// Only explicit photo capture modes classify evidence; codes/notes are not observations.
const offline = `EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(i.metadata->'photos')='array' THEN i.metadata->'photos' ELSE '[]'::jsonb END) photo WHERE photo->>'captureMode'='offline')`;
function parseFilters(filters: URLSearchParams) {
  const raw = Object.fromEntries(
    ["state", "worker", "city", "billboard", "risk", "date", "evidence"].map(
      (key) => [key, filters.get(key) || null],
    ),
  );
  const result = inputSchema.safeParse(raw);
  if (!result.success) throw new ApiError(422, "Invalid queue filters");
  return result.data;
}
async function queryQueue(
  actor: Actor,
  filters: URLSearchParams,
  limit: number,
  cursor?: z.infer<typeof cursorSchema>,
) {
  const f = parseFilters(filters);
  return (await getDb()).query<QueueItem>(
    `SELECT i.id,f.code,s.city,u.name worker_name,i.worker_id,to_char(i.received_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') received_at,r.state,r.version,r.risk_level,CASE WHEN ${offline} THEN 'offline' ELSE 'online' END evidence_type FROM review_cases r JOIN inspections i ON i.id=r.inspection_id JOIN billboard_faces f ON f.id=i.face_id JOIN billboard_structures s ON s.id=f.structure_id JOIN "user" u ON u.id=i.worker_id WHERE r.organization_id=$1 AND i.organization_id=$1 AND i.status='server_received' AND ($2::text IS NULL OR r.state=$2) AND ($3::text IS NULL OR i.worker_id=$3) AND ($4::text IS NULL OR s.city ILIKE '%'||$4||'%') AND ($5::text IS NULL OR f.code ILIKE '%'||$5||'%') AND ($6::text IS NULL OR r.risk_level=$6) AND ($7::date IS NULL OR (i.received_at AT TIME ZONE 'UTC')::date=$7::date) AND ($8::text IS NULL OR ($8='offline')=(${offline})) AND ($9::timestamptz IS NULL OR (i.received_at,i.id)<($9::timestamptz,$10::text)) ORDER BY i.received_at DESC,i.id DESC LIMIT $11`,
    [
      actor.organizationId,
      f.state,
      f.worker,
      f.city,
      f.billboard,
      f.risk,
      f.date,
      f.evidence,
      cursor?.receivedAt || null,
      cursor?.id || null,
      limit,
    ],
  );
}
export async function reviewQueue(
  actor: Actor,
  filters = new URLSearchParams(),
) {
  requireAdmin(actor);
  return queryQueue(actor, filters, 500);
}
export async function reviewPage(
  actor: Actor,
  filters = new URLSearchParams(),
): Promise<ReviewPage> {
  requireAdmin(actor);
  const pageSize = z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .safeParse(filters.get("pageSize") || 50);
  if (!pageSize.success) throw new ApiError(422, "Invalid queue page size");
  const filterHash = createHash("sha256")
    .update(JSON.stringify(parseFilters(filters)))
    .digest("hex");
  let cursor: z.infer<typeof cursorSchema> | undefined;
  const encoded = filters.get("cursor");
  if (encoded) {
    if (encoded.length > 2000 || !/^[A-Za-z0-9_-]+$/.test(encoded))
      throw new ApiError(422, "Invalid queue cursor");
    try {
      cursor = cursorSchema.parse(
        JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")),
      );
    } catch {
      throw new ApiError(422, "Invalid queue cursor");
    }
    if (
      cursor.organizationId !== actor.organizationId ||
      cursor.filterHash !== filterHash
    )
      throw new ApiError(
        422,
        "Queue cursor does not match organization or filters",
      );
  }
  const rows = await queryQueue(actor, filters, pageSize.data + 1, cursor);
  const items = rows.slice(0, pageSize.data),
    last = items.at(-1);
  const nextCursor =
    rows.length > pageSize.data && last
      ? Buffer.from(
          JSON.stringify({
            v: 1,
            organizationId: actor.organizationId,
            filterHash,
            receivedAt: last.received_at,
            id: last.id,
          }),
        ).toString("base64url")
      : null;
  return { items, nextCursor };
}
