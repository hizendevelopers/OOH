import "fake-indexeddb/auto";
import { it, expect, afterEach, vi } from "vitest";
import { FieldStore, metadata, digestBlob } from "../apps/web/src/field/store";
import {
  syncDraft,
  SyncError,
  type Transport,
} from "../apps/web/src/field/sync";
import {
  retryDelay,
  storageError,
  type UploadSession,
  type Receipt,
} from "../packages/domain/src/inspection";
import type { Assignment } from "../apps/web/src/server/service";
const owner = { id: "worker", organizationId: "org" };
const stores: FieldStore[] = [];
const create = () => {
  const store = new FieldStore({
    ...owner,
    id: "worker-" + crypto.randomUUID(),
  });
  stores.push(store);
  return store;
};
const task = {
  assignment_id: "11111111-1111-4111-8111-111111111111",
  id: "22222222-2222-4222-8222-222222222222",
  code: "TST-001",
  version: 1,
} as Assignment;
async function prepared() {
  const store = create();
  await store.start(task);
  for (const kind of ["front", "wide"] as const) {
    const blob = new Blob([kind], { type: "image/jpeg" });
    await store.savePhoto(task.assignment_id, {
      kind,
      blob,
      bytes: blob.size,
      sha256: await digestBlob(blob),
      capturedAt: new Date().toISOString(),
      captureMode: "offline",
      gps: { status: "denied", observedAt: new Date().toISOString() },
    });
  }
  await store.queue(task.assignment_id);
  return store;
}
afterEach(async () => {
  vi.restoreAllMocks();
  for (const s of stores.splice(0)) {
    s.close();
    await s.delete();
  }
});
it("atomically stores original blobs and frozen task binding through close/reopen", async () => {
  const store = await prepared();
  const operation = (await store.drafts.get(task.assignment_id))!.operationId;
  store.close();
  await store.open();
  const draft = (await store.drafts.get(task.assignment_id))!;
  expect(draft.photos.front!.blob).toBeInstanceOf(Blob);
  expect(await draft.photos.front!.blob.text()).toBe("front");
  expect(metadata(draft).operationId).toBe(operation);
  await expect(store.savePhoto(draft.id, draft.photos.front!)).rejects.toThrow(
    "locked",
  );
});
it("refuses to queue without both locally saved photos", async () => {
  const store = create();
  await store.start(task);
  await expect(store.queue(task.assignment_id)).rejects.toThrow(
    "Front and wide",
  );
  expect((await store.drafts.get(task.assignment_id))!.state).toBe(
    "local_draft",
  );
});
it("storage exhaustion never marks a photo as saved", async () => {
  const store = create();
  await store.start(task);
  const fail = vi
    .spyOn(store.drafts, "update")
    .mockRejectedValueOnce(new DOMException("Full", "QuotaExceededError"));
  const blob = new Blob(["x"]);
  await expect(
    store.savePhoto(task.assignment_id, {
      kind: "front",
      blob,
      bytes: 1,
      sha256: "a".repeat(64),
      capturedAt: new Date().toISOString(),
      captureMode: "offline",
      gps: { status: "denied", observedAt: new Date().toISOString() },
    }),
  ).rejects.toHaveProperty("name", "QuotaExceededError");
  fail.mockRestore();
  expect(
    (await store.drafts.get(task.assignment_id))!.photos.front,
  ).toBeUndefined();
  expect(storageError(new DOMException("Full", "QuotaExceededError"))).toBe(
    "storage_full",
  );
});
it("interruptions retain blobs, back off and never fabricate server receipt", async () => {
  const store = await prepared();
  const transport = (async () => {
    throw new TypeError("Offline");
  }) as Transport;
  await syncDraft(store, task.assignment_id, transport);
  const draft = (await store.drafts.get(task.assignment_id))!;
  expect(draft).toMatchObject({
    state: "queued",
    attempts: 1,
    lastError: "connection_interrupted",
  });
  expect(draft.receipt).toBeUndefined();
  expect(draft.photos.wide!.blob.size).toBeGreaterThan(0);
  expect(draft.nextAttemptAt).toBeGreaterThan(Date.now());
  expect(retryDelay(99)).toBe(300000);
});
it("requires matching server identity before uploading evidence", async () => {
  const store = await prepared();
  const transport = vi.fn(async () => ({
    ...owner,
    id: "other",
    role: "worker",
  })) as unknown as Transport;
  await syncDraft(store, task.assignment_id, transport);
  expect(transport).toHaveBeenCalledTimes(1);
  expect((await store.drafts.get(task.assignment_id))!.state).toBe("blocked");
});
it("recovers from lost final response using the stable operation key", async () => {
  const store = await prepared();
  let completed = false;
  let seen = "";
  const receipt: Receipt = {
    inspectionId: crypto.randomUUID(),
    receiptId: crypto.randomUUID(),
    receivedAt: new Date().toISOString(),
    status: "server_received",
    flags: ["human_review_required"],
  };
  let parts = 0;
  const transport = (async (url: string, body?: unknown) => {
    if (url === "me") return { ...store.owner, role: "worker" };
    if (url === "inspections") {
      const op = (body as { operationId: string }).operationId;
      if (seen) expect(op).toBe(seen);
      seen = op;
      const session: UploadSession = {
        inspectionId: receipt.inspectionId,
        chunkSize: 256 * 1024,
        photos: [
          {
            kind: "front",
            receivedParts: [],
            receiptId: completed ? "photo-front" : null,
          },
          {
            kind: "wide",
            receivedParts: [],
            receiptId: completed ? "photo-wide" : null,
          },
        ],
        receipt: completed ? receipt : null,
      };
      return session;
    }
    if (url.endsWith("/submit")) {
      completed = true;
      throw new TypeError("Response lost");
    }
    if (url.includes("/parts/")) parts++;
    return { receiptId: "photo-receipt" };
  }) as Transport;
  await syncDraft(store, task.assignment_id, transport);
  expect((await store.drafts.get(task.assignment_id))!.state).toBe("queued");
  await syncDraft(store, task.assignment_id, transport);
  const draft = (await store.drafts.get(task.assignment_id))!;
  expect(draft.receipt).toEqual(receipt);
  expect(draft.state).toBe("server_received");
  expect(parts).toBe(2);
});
it("session expiry and task conflicts pause retry without losing originals", async () => {
  for (const status of [401, 409, 422]) {
    const store = await prepared();
    await syncDraft(store, task.assignment_id, (async () => {
      throw new SyncError(status, "blocked");
    }) as Transport);
    const draft = await store.drafts.get(task.assignment_id);
    expect(draft!.state).toBe("blocked");
    expect(draft!.photos.front!.blob.size).toBeGreaterThan(0);
  }
});
