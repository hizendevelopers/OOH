import { z } from "zod";
import { currentActor } from "@/server/access";
import { ApiError } from "@/server/service";
import {
  createLocation,
  correctLocation,
  locationHistory,
  locationInput,
  correctionInput,
} from "@/server/location-management";

export const dynamic = "force-dynamic";
const json = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
async function handle(request: Request) {
  try {
    const actor = await currentActor();
    if (request.method === "GET")
      return json(
        await locationHistory(
          actor,
          new URL(request.url).searchParams.get("faceId") || "",
        ),
      );
    if (
      request.headers.get("origin") !==
      (process.env.BETTER_AUTH_URL || "http://localhost:3000")
    )
      throw new ApiError(403, "Same-origin request required");
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      throw new ApiError(415, "JSON required");
    const limit = 16000;
    if (Number(request.headers.get("content-length") || 0) > limit)
      throw new ApiError(413, "Request too large");
    const reader = request.body?.getReader();
    let length = 0;
    const chunks: Uint8Array[] = [];
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
    let body: unknown;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new ApiError(400, "Invalid JSON");
    }
    if (request.method === "PATCH")
      return json(await correctLocation(actor, correctionInput.parse(body)));
    return json(await createLocation(actor, locationInput.parse(body)), 201);
  } catch (error) {
    if (error instanceof z.ZodError)
      return json(
        {
          error: error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        },
        422,
      );
    if (error instanceof ApiError)
      return json({ error: error.message }, error.status);
    console.error(JSON.stringify({ category: "location_request_error" }));
    return json({ error: "Unable to save location. Please try again." }, 500);
  }
}
export const POST = handle;
export const PATCH = handle;
export const GET = handle;
