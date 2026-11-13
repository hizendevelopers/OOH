import { after } from "next/server";

// Runs work after the HTTP response is sent, so a slow step does not keep the worker's phone waiting.
// Outside a request (unit tests, scripts) there is no response to wait for, so the work runs inline.
export async function afterResponse(work: () => Promise<void>) {
  try {
    after(work);
  } catch {
    await work();
  }
}
