import Dexie, { type EntityTable } from "dexie";
import type { Actor } from "@ibvs/domain";
import type { Assignment } from "../server/service";
import {
  inspectionInput,
  photoKinds,
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
  async queue(id: string) {
    await this.transaction("rw", this.drafts, async () => {
      const draft = await this.drafts.get(id);
      if (!draft || draft.state !== "local_draft")
        throw new Error("Draft is locked");
      metadata(draft);
      await this.drafts.update(id, {
        state: "queued",
        nextAttemptAt: 0,
        lastError: null,
      });
    });
  }
}
export function metadata(draft: Draft): InspectionInput {
  return inspectionInput.parse({
    operationId: draft.operationId,
    assignmentId: draft.task.assignment_id,
    faceId: draft.task.id,
    faceCode: draft.task.code,
    assignmentVersion: draft.task.version,
    challengeId: draft.challenge?.id ?? null,
    photos: photoKinds.map((kind) => {
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
