import { z } from "zod";
import { currentActor } from "@/server/access";
import { ApiError } from "@/server/service";
import { nearbyLocations } from "@/server/nearby-locations";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  try {
    const params = new URL(request.url).searchParams;
    if (!params.has("latitude") || !params.has("longitude"))
      throw new ApiError(422, "Latitude and longitude required");
    return Response.json(
      await nearbyLocations(await currentActor(), Object.fromEntries(params)),
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
