import { requireAccess } from "@/server/mfa-gate";
import { z } from "zod";
import { currentActor } from "@/server/access";
import { ApiError } from "@/server/service";
import { nearbyLocations } from "@/server/nearby-locations";
export const dynamic = "force-dynamic";
// How long this route may run. The database is far from the server, so every query is a round trip;
// without an explicit limit the platform's short default cut requests off mid-write.
// Nearby search over the inventory.
export const maxDuration = 30;
export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  try {
    const params = new URL(request.url).searchParams;
    if (!params.has("latitude") || !params.has("longitude"))
      throw new ApiError(422, "Latitude and longitude required");
    return Response.json(
      await (async () => {
        const actor = await currentActor();
        requireAccess(actor, "ordinary");
        return nearbyLocations(actor, Object.fromEntries(params));
      })(),
      { headers },
    );
  } catch (error) {
    if (error instanceof ApiError)
      return Response.json(
        { error: error.message },
        { status: error.status, headers },
      );
    if (error instanceof z.ZodError)
      return Response.json(
        { error: "Invalid coordinates or search radius" },
        { status: 422, headers },
      );
    return Response.json(
      { error: "Location search unavailable" },
      { status: 503, headers },
    );
  }
}
