import "fake-indexeddb/auto";
import { it, expect, afterEach, vi } from "vitest";
import { FieldStore, metadata, digestBlob } from "../apps/web/src/field/store";
import {
  replayQueue,
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
  latitude: 33,
  longitude: 44,
  uncertainty_m: 10,
} as Assignment;
async function prepared() {
  const store = create();
  await store.start(task);
  await store.setBrand(task.assignment_id, { kind: "blank", text: "" });
  for (const kind of ["front", "wide", "angle_1"] as const) {
    const blob = new Blob([kind], { type: "image/jpeg" });
    await store.savePhoto(task.assignment_id, {
      kind,
      blob,
      bytes: blob.size,
      sha256: await digestBlob(blob),
      capturedAt: new Date().toISOString(),
      captureMode: "offline",
      gps: { status: "ok", latitude: 33, longitude: 44, accuracy: 10, observedAt: new Date().toISOString() },
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
  await store.setBrand(task.assignment_id, { kind: "blank", text: "" });
  await expect(store.queue(task.assignment_id)).rejects.toThrow(
    "Front and wide",
  );
  expect((await store.drafts.get(task.assignment_id))!.state).toBe(
    "local_draft",
  );
});
it("keeps denied-location photos as editable drafts instead of queueing them", async () => {
  const store = create();
  await store.start(task);
  await store.setBrand(task.assignment_id, { kind: "blank", text: "" });
  for (const kind of ["front", "wide", "angle_1"] as const) {
    const blob = new Blob([kind], { type: "image/jpeg" });
    await store.savePhoto(task.assignment_id, { kind, blob, bytes: blob.size, sha256: await digestBlob(blob), capturedAt: new Date().toISOString(), captureMode: "offline", gps: { status: "denied", observedAt: new Date().toISOString() } });
  }
  await expect(store.queue(task.assignment_id)).rejects.toThrow("Location is not available");
  const draft = (await store.drafts.get(task.assignment_id))!;
  expect(draft.state).toBe("local_draft");
  expect(draft.photos.front!.blob.size).toBeGreaterThan(0);
  await expect(store.savePhoto(task.assignment_id, draft.photos.front!)).resolves.toBeUndefined();
});
it("storage exhaustion never marks a photo as saved", async () => {
  const store = create();
  await store.start(task);
  await store.setBrand(task.assignment_id, { kind: "blank", text: "" });
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
      gps: { status: "ok", latitude: 33, longitude: 44, accuracy: 10, observedAt: new Date().toISOString() },
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
          {
            kind: "angle_1",
            receivedParts: [],
            receiptId: completed ? "photo-angle_1" : null,
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
  expect(parts).toBe(3);
});
it("task conflicts pause retry without losing originals", async () => {
  for (const status of [409, 422]) {
    const store = await prepared();
    await syncDraft(store, task.assignment_id, (async () => {
      throw new SyncError(status, "blocked");
    }) as Transport);
    const draft = await store.drafts.get(task.assignment_id);
    expect(draft!.state).toBe("blocked");
    expect(draft!.photos.front!.blob.size).toBeGreaterThan(0);
  }
});
it("session expiry keeps the visit queued and uploads after sign-in", async () => {
  const store = await prepared();
  await syncDraft(store, task.assignment_id, (async () => {
    throw new SyncError(401, "expired");
  }) as Transport);
  const expired = (await store.drafts.get(task.assignment_id))!;
  expect(expired).toMatchObject({ state: "queued", lastError: "session_expired" });
  expect(expired.photos.front!.blob.size).toBeGreaterThan(0);
  // Simulate the retry window passing and a fresh session.
  await store.drafts.update(task.assignment_id, { nextAttemptAt: 0 });
  const transport = (async (url: string) => {
    if (url === "me") return { ...store.owner, role: "worker" };
    throw new SyncError(409, "stop after identity check");
  }) as Transport;
  await replayQueue(store, transport);
  expect((await store.drafts.get(task.assignment_id))!.state).toBe("blocked");
});
it("skips acknowledged pieces when resuming within a photograph", async () => {
  const store = create();
  await store.start(task);
  await store.setBrand(task.assignment_id, { kind: "blank", text: "" });
  for (const kind of ["front", "wide", "angle_1"] as const) {
    const blob = new Blob(
      [new Uint8Array(kind === "front" ? 256 * 1024 + 41 : 50)],
      { type: "image/jpeg" },
    );
    await store.savePhoto(task.assignment_id, {
      kind,
      blob,
      bytes: blob.size,
      sha256: await digestBlob(blob),
      capturedAt: new Date().toISOString(),
      captureMode: "offline",
      gps: { status: "ok", latitude: 33, longitude: 44, accuracy: 10, observedAt: new Date().toISOString() },
    });
  }
  await store.queue(task.assignment_id);
  const calls: string[] = [];
  const receipt: Receipt = {
    inspectionId: crypto.randomUUID(),
    receiptId: crypto.randomUUID(),
    receivedAt: new Date().toISOString(),
    status: "server_received",
    flags: [],
  };
  const transport = (async (url: string) => {
    calls.push(url);
    if (url === "me") return { ...store.owner, role: "worker" };
    if (url === "inspections")
      return {
        inspectionId: receipt.inspectionId,
        chunkSize: 256 * 1024,
        photos: [
          { kind: "front", receivedParts: [0], receiptId: null },
          { kind: "wide", receivedParts: [], receiptId: null },
          { kind: "angle_1", receivedParts: [], receiptId: null },
        ],
        receipt: null,
      };
    if (url.endsWith("/submit")) return receipt;
    return { receiptId: "photo" };
  }) as Transport;
  await syncDraft(store, task.assignment_id, transport);
  expect(calls).not.toContain(
    `inspections/${receipt.inspectionId}/parts/front/0`,
  );
  expect(calls).toContain(`inspections/${receipt.inspectionId}/parts/front/1`);
  expect((await store.drafts.get(task.assignment_id))!.receipt).toEqual(
    receipt,
  );
});

// F-05: visits queued with only front and wide photos, before angle photos were required.
it("reopens an old two-photo draft for its angle photo without losing photos", async () => {
  const store = create();
  await store.start(task);
  await store.setBrand(task.assignment_id, { kind: "blank", text: "" });
  for (const kind of ["front", "wide"] as const) {
    const blob = new Blob([kind], { type: "image/jpeg" });
    await store.savePhoto(task.assignment_id, {
      kind,
      blob,
      bytes: blob.size,
      sha256: await digestBlob(blob),
      capturedAt: new Date().toISOString(),
      captureMode: "offline",
      gps: { status: "ok", latitude: 33, longitude: 44, accuracy: 10, observedAt: new Date().toISOString() },
    });
  }
  // Simulate a draft written by the previous version: queued with two photos.
  await store.drafts.update(task.assignment_id, { state: "queued" });

  expect(await store.reopenIncomplete()).toBe(1);
  const reopened = (await store.drafts.get(task.assignment_id))!;
  expect(reopened).toMatchObject({ state: "local_draft", lastError: "needs_angle_photo" });
  expect(Object.keys(reopened.photos).sort()).toEqual(["front", "wide"]);
  expect(await store.reopenIncomplete()).toBe(0);
});

it("never reopens a visit the server has already received", async () => {
  const store = create();
  await store.start(task);
  await store.drafts.update(task.assignment_id, { state: "server_received", serverId: "server-1" });
  expect(await store.reopenIncomplete()).toBe(0);
  expect((await store.drafts.get(task.assignment_id))!.state).toBe("server_received");
});

it("keeps a complete queued visit queued", async () => {
  const store = await prepared();
  expect(await store.reopenIncomplete()).toBe(0);
  expect((await store.drafts.get(task.assignment_id))!.state).toBe("queued");
});

// Pending GPS: the location has no verified coordinate, so the visit's own GPS readings are the only evidence.
const pendingTask = {
  assignment_id: "33333333-3333-4333-8333-333333333333",
  id: "44444444-4444-4444-8444-444444444444",
  code: "PENDING-001",
  version: 1,
  latitude: null,
  longitude: null,
  uncertainty_m: null,
  gps_status: "pending_gps",
} as unknown as Assignment;
const reading = (accuracy = 10) => ({ status: "ok" as const, latitude: 33.3, longitude: 44.1, accuracy, observedAt: new Date().toISOString() });
async function pendingDraft(gps: ReturnType<typeof reading> | { status: "denied"; observedAt: string }, kinds = ["front", "wide", "angle_1"] as const) {
  const store = create();
  await store.start(pendingTask);
  await store.setBrand(pendingTask.assignment_id, { kind: "blank", text: "" });
  for (const kind of kinds) {
    const blob = new Blob([kind + "-pending"], { type: "image/jpeg" });
    await store.savePhoto(pendingTask.assignment_id, {
      kind,
      blob,
      bytes: blob.size,
      sha256: await digestBlob(blob),
      capturedAt: new Date().toISOString(),
      captureMode: "offline",
      gps,
    });
  }
  return store;
}
it("queues a pending-GPS visit when every photo has a fresh, accurate reading", async () => {
  const store = await pendingDraft(reading());
  await store.queue(pendingTask.assignment_id);
  expect((await store.drafts.get(pendingTask.assignment_id))!.state).toBe("queued");
});
it("refuses to queue a pending-GPS visit when a photo has no location or a weak one", async () => {
  const denied = await pendingDraft({ status: "denied", observedAt: new Date().toISOString() });
  await expect(denied.queue(pendingTask.assignment_id)).rejects.toThrow("Location is not available");
  expect((await denied.drafts.get(pendingTask.assignment_id))!.state).toBe("local_draft");
  const weak = await pendingDraft(reading(300));
  await expect(weak.queue(pendingTask.assignment_id)).rejects.toThrow("GPS signal is weak");
});
it("keeps photos and their GPS readings when a pending-GPS upload is interrupted", async () => {
  const store = await pendingDraft(reading());
  await store.queue(pendingTask.assignment_id);
  await syncDraft(store, pendingTask.assignment_id, (async () => {
    throw new TypeError("Offline");
  }) as Transport);
  const draft = (await store.drafts.get(pendingTask.assignment_id))!;
  expect(draft).toMatchObject({ state: "queued", lastError: "connection_interrupted" });
  expect(draft.receipt).toBeUndefined();
  for (const kind of ["front", "wide", "angle_1"] as const) {
    expect(draft.photos[kind]!.blob.size).toBeGreaterThan(0);
    expect(draft.photos[kind]!.gps).toMatchObject({ status: "ok", latitude: 33.3, longitude: 44.1 });
  }
});
