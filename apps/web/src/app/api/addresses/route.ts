import { purposeForMethod, requireAccess } from "@/server/mfa-gate";
import { z } from "zod";
import { currentActor } from "@/server/access";
import { ApiError } from "@/server/service";
import { recordWorkerAddress } from "@/server/worker-address";

export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

// Saves the street or landmark the worker found for an assigned visit.
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    if (request.headers.get("origin") !== (process.env.BETTER_AUTH_URL || "http://localhost:3000"))
      throw new ApiError(403, "Same-origin request required");
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      throw new ApiError(415, "JSON required");
    const actor = await currentActor();
    requireAccess(actor, purposeForMethod("POST"));
    const body = z.object({ assignmentId: z.uuid(), address: z.string().max(400) }).parse(await request.json());
    return json(await recordWorkerAddress(actor, body.assignmentId, body.address), 201);
  } catch (e) {
    if (e instanceof ApiError) return json({ error: e.message, requestId }, e.status);
    if (e instanceof z.ZodError) return json({ error: "Enter a street or landmark.", requestId }, 422);
    console.error(JSON.stringify({ requestId, category: "address_save_failed" }));
    return json({ error: "Address not saved. Retry when connected.", requestId }, 503);
  }
}
