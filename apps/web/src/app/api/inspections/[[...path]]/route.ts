import { z } from "zod";
import { currentActor } from "@/server/access";
import { ApiError } from "@/server/service";
import {
  beginInspection,
  issueChallenge,
  uploadPart,
  completePhoto,
  submitInspection,
  inspectionStatus,
  inspectionHistory,
  evidenceAccess,
} from "@/server/inspections";
import {
  inspectionInput,
  CHUNK_SIZE,
} from "../../../../../../../packages/domain/src/inspection";

export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
async function body(request: Request, limit: number) {
  if (Number(request.headers.get("content-length") || 0) > limit)
    throw new ApiError(413, "Request too large");
  const chunks: Uint8Array[] = [];
  let length = 0;
  const reader = request.body?.getReader();
  if (reader)
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel();
        throw new ApiError(413, "Request too large");
      }
      chunks.push(value);
    }
  return Buffer.concat(chunks);
}
async function handle(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const actor = await currentActor();
    const segments = new URL(request.url).pathname
      .split("/")
      .filter(Boolean)
      .slice(2);
    if (request.method === "GET") {
      if (!segments.length) return json(await inspectionHistory(actor));
      const id = z.uuid().parse(segments[0]);
      if (segments.length === 1) return json(await inspectionStatus(actor, id));
      if (segments.length === 3 && segments[1] === "media") {
        const kind = z.enum(["front", "wide"]).parse(segments[2]);
        const bytes = await evidenceAccess(actor, id, kind);
        return new Response(new Uint8Array(bytes), {
          headers: {
            "Content-Type": "image/jpeg",
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'; sandbox",
            "Content-Disposition": `inline; filename="${kind}.jpg"`,
          },
        });
      }
    }
    if (request.method === "POST" || request.method === "PUT") {
      if (
        request.headers.get("origin") !==
        (process.env.BETTER_AUTH_URL || "http://localhost:3000")
      )
        throw new ApiError(403, "Same-origin request required");
      if (
        request.method === "PUT" &&
        segments.length === 4 &&
        segments[1] === "parts"
      ) {
        const id = z.uuid().parse(segments[0]),
          kind = z.enum(["front", "wide"]).parse(segments[2]);
        const part = z.coerce.number().int().min(0).max(23).parse(segments[3]);
        return json(
          await uploadPart(
            actor,
            id,
            kind,
            part,
            await body(request, CHUNK_SIZE),
          ),
        );
      }
      if (request.method === "POST") {
        if (
          !request.headers.get("content-type")?.startsWith("application/json")
        )
          throw new ApiError(415, "JSON required");
        let data: unknown;
        try {
          data = JSON.parse((await body(request, 32768)).toString("utf8"));
        } catch (e) {
          if (e instanceof ApiError) throw e;
          throw new ApiError(400, "Malformed JSON");
        }
        if (!segments.length)
          return json(
            await beginInspection(actor, inspectionInput.parse(data)),
            201,
          );
        if (segments.length === 1 && segments[0] === "challenge") {
          const input = z.object({ assignmentId: z.uuid() }).parse(data);
          return json(await issueChallenge(actor, input.assignmentId));
        }
        const id = z.uuid().parse(segments[0]);
        if (segments.length === 3 && segments[1] === "complete")
          return json(
            await completePhoto(
              actor,
              id,
              z.enum(["front", "wide"]).parse(segments[2]),
            ),
          );
        if (segments.length === 2 && segments[1] === "submit")
          return json(await submitInspection(actor, id));
      }
    }
    throw new ApiError(404, "Endpoint not found");
  } catch (e) {
    if (e instanceof ApiError)
      return json({ error: e.message, requestId }, e.status);
    if (e instanceof z.ZodError)
      return json({ error: "Invalid inspection request", requestId }, 422);
    console.error(
      JSON.stringify({ requestId, category: "inspection_request_failed" }),
    );
    return json(
      {
        error:
          "Evidence service unavailable; local evidence is safe. Retry later.",
        requestId,
      },
      503,
    );
  }
}
export const GET = handle;
export const POST = handle;
export const PUT = handle;
