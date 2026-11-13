import { purposeForMethod, requireAccess } from "@/server/mfa-gate";
import { z } from "zod";
import { currentActor } from "@/server/access";
import { ApiError } from "@/server/service";
import { registerSite } from "@/server/site-registration";

export const dynamic = "force-dynamic";
// How long this route may run. The database is far from the server, so every query is a round trip;
// without an explicit limit the platform's short default cut requests off mid-write.
// Worker site registration: several writes in one transaction.
export const maxDuration = 30;
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

// Registers a site the worker found in the field. The server assigns the site ID and the pin.
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    if (request.headers.get("origin") !== (process.env.BETTER_AUTH_URL || "http://localhost:3000"))
      throw new ApiError(403, "Same-origin request required");
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      throw new ApiError(415, "JSON required");
    const actor = await currentActor();
    requireAccess(actor, purposeForMethod("POST"));
    let data: unknown;
    try {
      data = await request.json();
    } catch {
      throw new ApiError(400, "Malformed JSON");
    }
    return json(await registerSite(actor, data), 201);
  } catch (e) {
    if (e instanceof ApiError) return json({ error: e.message, requestId }, e.status);
    if (e instanceof z.ZodError) return json({ error: "Enter all site details, including a GPS reading of 50 m or better.", requestId }, 422);
    console.error(JSON.stringify({ requestId, category: "site_registration_failed" }));
    return json({ error: "Site registration unavailable. Your photos are safe on this device; retry later.", requestId }, 503);
  }
}
