import type { Actor } from "@ibvs/domain";
import { FieldStore, capturedKinds, metadata, type Draft } from "./store";
import {
  retryDelay,
  type UploadSession,
  type Receipt,
} from "../../../../packages/domain/src/inspection";

export class SyncError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}
export const REQUEST_TIMEOUT_MS = 45000;
export const UPLOAD_TIMEOUT_MS = 180000;
// How often a dropped photo part is tried again inside one run, and how long to wait between tries.
const PART_ATTEMPTS = 3;
const partRetryDelay = (attempt: number) => 1000 * 2 ** attempt;

export async function fieldRequest<T>(
  url: string,
  body?: unknown,
  method = "POST",
): Promise<T> {
  const response = await fetch("/api/" + url, {
    method: body === undefined ? "GET" : method,
    cache: "no-store",
    credentials: "same-origin",
    headers:
      body instanceof Blob
        ? { "Content-Type": "application/octet-stream" }
        : body === undefined
          ? {}
          : { "Content-Type": "application/json" },
    body:
      body === undefined
        ? undefined
        : body instanceof Blob
          ? body
          : JSON.stringify(body),
    // A photo part goes up over the worker's mobile connection, which can be slow; the small JSON
    // calls should not wait anywhere near as long. Giving up too early looked like a lost connection
    // even when the server had received the part and stored it.
    signal: AbortSignal.timeout(body instanceof Blob ? UPLOAD_TIMEOUT_MS : REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: "Request failed" }));
    throw new SyncError(response.status, error.error || "Request failed", error.details);
  }
  return response.json();
}
export type Transport = typeof fieldRequest;

// A request that fails for a reason worth trying again: no response at all, or the server asking to wait.
function retryable(error: unknown) {
  const status = error instanceof SyncError ? error.status : 0;
  return status === 0 || status === 408 || status === 429 || status >= 500;
}

// One dropped request on a weak connection should not abandon the whole visit. Sending a part again is
// safe: the server compares it with the part it already holds and refuses a different one.
async function sendPart(request: Transport, url: string, chunk: Blob) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await request(url, chunk, "PUT");
    } catch (error) {
      if (attempt + 1 >= PART_ATTEMPTS || !retryable(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, partRetryDelay(attempt)));
    }
  }
}
export async function syncDraft(
  store: FieldStore,
  id: string,
  request: Transport = fieldRequest,
) {
  let draft = await store.drafts.get(id);
  if (
    !draft ||
    draft.state === "local_draft" ||
    draft.state === "server_received"
  )
    return;
  try {
    // Revalidate the real server identity before sending *any* evidence bytes.
    const actor = await request<Actor>("me");
    if (
      actor.id !== store.owner.id ||
      actor.organizationId !== store.owner.organizationId ||
      actor.role !== "worker"
    )
      throw new SyncError(403, "Account changed; original worker must sign in");
    await store.drafts.update(id, { state: "uploading", lastError: null });
    const upload = await request<UploadSession>("inspections", metadata(draft));
    await store.drafts.update(id, { serverId: upload.inspectionId });
    if (upload.receipt) {
      await acknowledge(store, id, upload.receipt);
      return;
    }
    let uploaded = 0;
    const kinds = capturedKinds(draft);
    const total = kinds.reduce(
      (sum, k) => sum + draft!.photos[k]!.bytes,
      0,
    );
    for (const kind of kinds) {
      const local = draft.photos[kind]!;
      const server = upload.photos.find((p) => p.kind === kind);
      if (!server) throw new SyncError(503, "Incomplete upload session");
      if (!server.receiptId) {
        for (
          let part = 0;
          part < Math.ceil(local.bytes / upload.chunkSize);
          part++
        ) {
          const chunk = local.blob.slice(
            part * upload.chunkSize,
            Math.min(local.bytes, (part + 1) * upload.chunkSize),
          );
          if (!server.receivedParts.includes(part))
            await sendPart(
              request,
              `inspections/${upload.inspectionId}/parts/${kind}/${part}`,
              chunk,
            );
          uploaded += chunk.size;
          // Each stored part is real progress, so the wait before the next try starts from zero again.
          // Without this a visit that failed often kept waiting the full five minutes between parts.
          // The wait already scheduled is cleared too, or a run cut short here would sit out that wait
          // even though the count is back to zero.
          await store.drafts.update(id, {
            progress: Math.min(95, Math.round((uploaded / total) * 95)),
            attempts: 0,
            nextAttemptAt: 0,
          });
        }
        await request(
          `inspections/${upload.inspectionId}/complete/${kind}`,
          {},
        );
      } else uploaded += local.bytes;
    }
    const result = await request<Receipt>(
      `inspections/${upload.inspectionId}/submit`,
      {},
    );
    await acknowledge(store, id, result);
  } catch (error) {
    draft = await store.drafts.get(id);
    if (!draft || draft.state === "server_received") return;
    const status = error instanceof SyncError ? error.status : 0;
    // Server verification rejected a gallery photo. The visit's photos stay on the device until it is
    // received. The worker replaces the rejected photo and sends again; the server keeps the rejected original.
    const details = error instanceof SyncError ? (error.details as { verification?: unknown } | undefined) : undefined;
    if (status === 422 && Array.isArray(details?.verification)) {
      await store.drafts.update(id, {
        state: "local_draft",
        verification: details.verification as Draft["verification"],
        lastError: "verification_failed",
        nextAttemptAt: 0,
        progress: 0,
      });
      return;
    }
    // 401 means the session expired while offline. The visit stays queued: after the worker
    // signs in again, the next replay resumes it without a manual step.
    const retryable =
      status === 0 || status === 401 || status === 408 || status === 429 || status >= 500;
    const attempts = draft.attempts + 1;
    await store.drafts.update(id, {
      state: retryable ? "queued" : "blocked",
      attempts,
      nextAttemptAt: Date.now() + retryDelay(attempts),
      lastError:
        status === 401
          ? "session_expired"
          : status === 403
            ? "account_mismatch"
            : retryable
              ? "connection_interrupted"
              : status === 409
                ? "task_conflict"
                : "validation_failed",
    });
  }
}
async function acknowledge(store: FieldStore, id: string, result: Receipt) {
  const draft = await store.drafts.get(id);
  if (
    result.inspectionId !== draft?.serverId ||
    result.status !== "server_received" ||
    !result.receiptId ||
    !result.receivedAt
  )
    throw new SyncError(503, "Missing server receipt");
  // The server holds the photos now; the phone keeps only the receipt.
  await store.drafts.update(id, {
    state: "server_received",
    photos: {},
    receipt: result,
    progress: 100,
    lastError: null,
    updatedAt: new Date().toISOString(),
  });
}
// Asks the phone to keep the screen on while a visit is being sent, and returns the way to let go.
// Not every browser offers this, and the request can be refused, so it never blocks sending.
async function keepScreenAwake(): Promise<() => void> {
  try {
    const lock = await navigator?.wakeLock?.request("screen");
    return () => void lock?.release().catch(() => {});
  } catch {
    return () => {};
  }
}
const inFlight = new Map<string, Promise<void>>();
export async function replayQueue(
  store: FieldStore,
  request: Transport = fieldRequest,
) {
  const existing = inFlight.get(store.name);
  if (existing) return existing;
  const run = async () => {
    const drafts = await store.drafts.toArray();
    for (const draft of drafts)
      if (
        ["queued", "uploading"].includes(draft.state) &&
        draft.nextAttemptAt <= Date.now()
      )
        await syncDraft(store, draft.id, request);
  };
  const promise = (async () => {
    // A phone suspends a page whose screen has gone dark, which cuts off whatever is being sent.
    const wake = await keepScreenAwake();
    try {
      if (typeof navigator !== "undefined" && navigator.locks)
        await navigator.locks.request(store.name, run);
      else await run();
    } finally {
      wake();
    }
  })().finally(() => inFlight.delete(store.name));
  inFlight.set(store.name, promise);
  return promise;
}
