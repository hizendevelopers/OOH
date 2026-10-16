import type { Actor } from "@ibvs/domain";
import { FieldStore, metadata } from "./store";
import {
  retryDelay,
  type UploadSession,
  type Receipt,
  photoKinds,
} from "../../../../packages/domain/src/inspection";

export class SyncError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
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
    signal: AbortSignal.timeout(45000),
  });
  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: "Request failed" }));
    throw new SyncError(response.status, error.error || "Request failed");
  }
  return response.json();
}
export type Transport = typeof fieldRequest;
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
    const total = photoKinds.reduce(
      (sum, k) => sum + draft!.photos[k]!.bytes,
      0,
    );
    for (const kind of photoKinds) {
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
            await request(
              `inspections/${upload.inspectionId}/parts/${kind}/${part}`,
              chunk,
              "PUT",
            );
          uploaded += chunk.size;
          await store.drafts.update(id, {
            progress: Math.min(95, Math.round((uploaded / total) * 95)),
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
    const retryable =
      status === 0 || status === 408 || status === 429 || status >= 500;
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
  if (
    result.status !== "server_received" ||
    !result.receiptId ||
    !result.receivedAt
  )
    throw new SyncError(503, "Missing server receipt");
  await store.drafts.update(id, {
    state: "server_received",
    receipt: result,
    progress: 100,
    lastError: null,
    updatedAt: new Date().toISOString(),
  });
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
    if (typeof navigator !== "undefined" && navigator.locks)
      await navigator.locks.request(store.name, run);
    else await run();
  })().finally(() => inFlight.delete(store.name));
  inFlight.set(store.name, promise);
  return promise;
}
