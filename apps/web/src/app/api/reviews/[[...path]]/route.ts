import { z } from "zod";
import { currentActor } from "@/server/access";
import { ApiError, requireAdmin } from "@/server/service";
import {
  reviewQueue,
  reviewDetail,
  decide,
  enrollBaseline,
  withdrawBaseline,
} from "@/server/review";
import { assessInspection } from "@/server/risk-analysis";
export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
async function handle(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const actor = await currentActor();
    requireAdmin(actor);
    const url = new URL(request.url),
      segments = url.pathname.split("/").filter(Boolean).slice(2);
    if (request.method === "GET") {
      if (!segments.length)
        return json(await reviewQueue(actor, url.searchParams));
      if (segments.length === 1)
        return json(await reviewDetail(actor, z.uuid().parse(segments[0])));
    }
    if (request.method === "POST" && segments.length === 2) {
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
          size += value.length;
          if (size > 32768) {
            await reader.cancel();
            throw new ApiError(413, "Request too large");
          }
          chunks.push(value);
        }
      let data: unknown;
      try {
        data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        throw new ApiError(400, "Malformed JSON");
      }
      const id = z.uuid().parse(segments[0]);
      if (segments[1] === "analyze")
        return json(await assessInspection(actor, id));
      if (segments[1] === "decision")
        return json(await decide(actor, id, data));
      if (segments[1] === "baseline")
        return json(await enrollBaseline(actor, id, data));
      if (segments[1] === "withdraw")
        return json(await withdrawBaseline(actor, id, data));
    }
    throw new ApiError(404, "Endpoint not found");
  } catch (e) {
    if (e instanceof ApiError)
      return json({ error: e.message, requestId }, e.status);
    if (e instanceof z.ZodError)
      return json({ error: "Invalid review request", requestId }, 422);
    console.error(
      JSON.stringify({ category: "review_request_failed", requestId }),
    );
    return json(
      { error: "Review unavailable. Refresh and retry.", requestId },
      503,
    );
  }
}
export const GET = handle;
export const POST = handle;
