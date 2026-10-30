import { z } from "zod";
import { currentActor } from "@/server/access";
import { getDb } from "@/server/db";
import { ApiError } from "@/server/service";
import {
  activeLocationException,
  authorizeLocationException,
} from "@/server/location-exceptions";

export const dynamic = "force-dynamic";
const json = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
async function handle(request: Request) {
  try {
    const actor = await currentActor();
    if (request.method === "GET") {
      const id = z
        .uuid()
        .parse(new URL(request.url).searchParams.get("assignmentId"));
      const [assignment] = await (
        await getDb()
      ).query<{ version: number }>(
        "SELECT version FROM assignments WHERE id=$1 AND organization_id=$2 AND ($3::text='admin' OR worker_id=$4)",
        [id, actor.organizationId, actor.role, actor.id],
      );
      if (!assignment) throw new ApiError(404, "Assignment not found");
      return json({
        exception: await activeLocationException(
          await getDb(),
          actor,
          id,
          assignment.version,
        ),
      });
    }
    if (
      request.headers.get("origin") !==
      (process.env.BETTER_AUTH_URL || "http://localhost:3000")
    )
      throw new ApiError(403, "Same-origin request required");
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      throw new ApiError(415, "JSON required");
    const reader = request.body?.getReader();
    let size = 0;
    const chunks: Uint8Array[] = [];
    if (reader)
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 8192) {
          await reader.cancel();
          throw new ApiError(413, "Request too large");
        }
        chunks.push(value);
      }
    let input: unknown;
    try {
      input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new ApiError(400, "Malformed JSON");
    }
    return json(await authorizeLocationException(actor, input), 201);
  } catch (error) {
    if (error instanceof ApiError)
      return json({ error: error.message }, error.status);
    if (error instanceof z.ZodError)
      return json(
        { error: "Invalid exception request", issues: error.issues },
        422,
      );
    return json({ error: "Location exception service unavailable" }, 503);
  }
}
export const GET = handle;
export const POST = handle;
