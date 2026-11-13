import { getAuth } from "@/server/auth";
export async function GET(request: Request) {
  return (await getAuth()).handler(request);
}
export async function POST(request: Request) {
  return (await getAuth()).handler(request);
}
export const dynamic = "force-dynamic";
// How long this route may run. The database is far from the server, so every query is a round trip;
// without an explicit limit the platform's short default cut requests off mid-write.
// Sign-in and two-factor checks.
export const maxDuration = 30;
