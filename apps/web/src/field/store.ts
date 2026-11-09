import Dexie, { type EntityTable } from "dexie";
import type { Actor } from "@ibvs/domain";
import type { Assignment } from "../server/service";
import { assessPhotoLocation, locationMessages } from "./location-policy";
import {
  brandEntry,
  type BrandEntry,
} from "../../../../packages/domain/src/brand";
import {
  inspectionInput,
  allPhotoKinds,
  angleKinds,
  type PhotoKind,
  type InspectionInput,
  type Receipt,
} from "../../../../packages/domain/src/inspection";

export type LocalPhoto = InspectionInput["photos"][number] & { blob: Blob };
export type Draft = {
  id: string;
  operationId: string;
  task: Assignment;
  photos: Partial<Record<PhotoKind, LocalPhoto>>;
  challenge: { id: string; nonce: string; expiresAt: string } | null;
  brand?: BrandEntry | null;
  state: "local_draft" | "queued" | "uploading" | "blocked" | "server_received";
  attempts: number;
  nextAttemptAt: number;
  lastError: string | null;
  serverId?: string;
  progress: number;
  receipt?: Receipt;
  updatedAt: string;
};
type CachedTask = Assignment & { downloadedAt: string };
export class FieldStore extends Dexie {
  tasks!: EntityTable<CachedTask, "assignment_id">;
  drafts!: EntityTable<Draft, "id">;
  constructor(readonly owner: Pick<Actor, "organizationId" | "id">) {
    super(
      `ibvs-field-v2:${encodeURIComponent(owner.organizationId)}:${encodeURIComponent(owner.id)}`,
    );
    this.version(1).stores({
      tasks: "assignment_id",
      drafts: "id,state,nextAttemptAt",
    });
  }
  async download(tasks: Assignment[]) {
    const downloadedAt = new Date().toISOString();
    await this.transaction("rw", this.tasks, async () => {
      await this.tasks.clear();
      await this.tasks.bulkPut(
        tasks.map((task) => ({ ...task, downloadedAt })),
      );
    });
  }
  async start(task: Assignment, challenge: Draft["challenge"] = null) {
    return this.transaction("rw", this.drafts, async () => {
      const existing = await this.drafts.get(task.assignment_id);
      if (existing) return existing;
      const draft: Draft = {
        id: task.assignment_id,
        operationId: crypto.randomUUID(),
        task,
        challenge,
        photos: {},
        state: "local_draft",
        attempts: 0,
        nextAttemptAt: 0,
        lastError: null,
        progress: 0,
        updatedAt: new Date().toISOString(),
      };
      await this.drafts.add(draft);
      return draft;
    });
  }
  async savePhoto(id: string, photo: LocalPhoto) {
    await this.transaction("rw", this.drafts, async () => {
      const draft = await this.drafts.get(id);
      if (!draft || draft.state !== "local_draft")
        throw new Error("Draft is locked for synchronization");
      await this.drafts.update(id, {
        photos: { ...draft.photos, [photo.kind]: photo },
        updatedAt: new Date().toISOString(),
      });
    });
  }
  async setBrand(id: string, brand: BrandEntry) {
    const parsed = brandEntry.parse(brand);
    await this.transaction("rw", this.drafts, async () => {
      const draft = await this.drafts.get(id);
      if (!draft || draft.state !== "local_draft")
        throw new Error("Draft is locked for synchronization");
      await this.drafts.update(id, {
        brand: parsed,
        updatedAt: new Date().toISOString(),
      });
    });
  }
  // Visits queued before angle photos were required hold only two photos and can never
  // be sent as they are. Reopen them for the missing angle photo. Nothing is deleted, and
  // visits the server has already seen are left alone.
  async reopenIncomplete() {
    let reopened = 0;
    await this.transaction("rw", this.drafts, async () => {
      const candidates = await this.drafts.toArray();
      for (const draft of candidates) {
        if (draft.serverId || (draft.state !== "queued" && draft.state !== "blocked")) continue;
        if (hasRequiredPhotos(draft)) continue;
        await this.drafts.update(draft.id, {
          state: "local_draft",
          lastError: "needs_angle_photo",
          nextAttemptAt: 0,
          updatedAt: new Date().toISOString(),
        });
        reopened++;
      }
    });
    return reopened;
  }
  async queue(id: string) {
    await this.transaction("rw", this.drafts, async () => {
      const draft = await this.drafts.get(id);
      if (!draft || draft.state !== "local_draft")
        throw new Error("Draft is locked");
      if (!draft.brand) throw new Error("brand-required");
      metadata(draft);
      const exception = draft.task.location_exception;
      const hasException =
        exception &&
        exception.assignment_version === draft.task.version &&
        Date.parse(exception.expires_at) > Date.now();
      if (!hasException)
        for (const photo of Object.values(draft.photos)) {
          const result = assessPhotoLocation(photo, draft.task);
          // first_capture: no verified location yet. The reading is valid and the server checks the whole visit.
          if (result.status !== "within_area" && result.status !== "first_capture")
            throw new Error(locationMessages[result.status]);
        }
      await this.drafts.update(id, {
        state: "queued",
        nextAttemptAt: 0,
        lastError: null,
      });
    });
  }
}
// Kinds captured for this visit, in a fixed order (front, wide, then angles).
export function capturedKinds(draft: Draft): PhotoKind[] {
  return allPhotoKinds.filter((kind) => draft.photos[kind]);
}
// A visit needs front, wide and at least one angle photograph.
export function hasRequiredPhotos(draft: Draft) {
  return Boolean(
    draft.photos.front &&
      draft.photos.wide &&
      angleKinds.some((kind) => draft.photos[kind]),
  );
}
export function metadata(draft: Draft): InspectionInput {
  return inspectionInput.parse({
    operationId: draft.operationId,
    assignmentId: draft.task.assignment_id,
    faceId: draft.task.id,
    faceCode: draft.task.code,
    assignmentVersion: draft.task.version,
    challengeId: draft.challenge?.id ?? null,
    brand: draft.brand ?? null,
    photos: capturedKinds(draft).map((kind) => {
      const photo = draft.photos[kind];
      if (!photo || !photo.blob || photo.blob.size !== photo.bytes)
        throw new Error("Front and wide photos must be saved locally");
      const { blob: _, ...meta } = photo;
      void _;
      return meta;
    }),
  });
}
export async function digestBlob(blob: Blob) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await blob.arrayBuffer(),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
