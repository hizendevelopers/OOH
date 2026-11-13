import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { testDirectory } from "../scripts/test-directory";
import {
  FilesystemEvidenceStore,
  S3EvidenceStore,
  createEvidenceStoreFromEnv,
  validateEvidenceKey,
} from "../apps/web/src/server/evidence-store";

const key = () => `${randomUUID()}/front/0-${"a".repeat(64)}`;
const photo = (size = 2048) => Buffer.from(Array.from({ length: size }, (_, i) => (i * 31) % 251));

// In-memory stand-in for an S3-compatible bucket. Restarting or redeploying the app keeps
// the same bucket, so a new store instance must read what an earlier instance wrote.
function fakeBucket(options: { failPutsWith?: number[] } = {}) {
  const objects = new Map<string, Buffer>();
  const sent: unknown[] = [];
  const failures = [...(options.failPutsWith ?? [])];
  const client = {
    objects,
    sent,
    async send(command: unknown) {
      sent.push(command);
      if (command instanceof PutObjectCommand) {
        const status = failures.shift();
        if (status) throw Object.assign(new Error("simulated"), { $metadata: { httpStatusCode: status } });
        objects.set(command.input.Key!, Buffer.from(command.input.Body as Buffer));
        return {};
      }
      if (command instanceof HeadObjectCommand) {
        const object = objects.get(command.input.Key!);
        if (!object) throw Object.assign(new Error("not found"), { name: "NotFound", $metadata: { httpStatusCode: 404 } });
        return { ContentLength: object.length };
      }
      if (command instanceof GetObjectCommand) {
        const object = objects.get(command.input.Key!);
        if (!object) throw Object.assign(new Error("missing"), { name: "NoSuchKey", $metadata: { httpStatusCode: 404 } });
        return { Body: { transformToByteArray: async () => new Uint8Array(object) } };
      }
      throw new Error("unexpected command");
    },
  };
  return client;
}

describe("evidence keys", () => {
  it("accepts only server-generated front, wide and angle keys", () => {
    expect(validateEvidenceKey(key())).toBeTruthy();
    expect(() => validateEvidenceKey("../../etc/passwd")).toThrow("Invalid");
    expect(() => validateEvidenceKey(`${randomUUID()}/side/0-${"a".repeat(64)}`)).toThrow("Invalid");
    expect(() => validateEvidenceKey(`${randomUUID()}/front/..-${"a".repeat(64)}`)).toThrow("Invalid");
  });
});

describe("S3-compatible store", () => {
  it("round-trips bytes and checks the SHA-256 checksum on write", async () => {
    const bucket = fakeBucket();
    const store = new S3EvidenceStore(bucket, "bucket", "evidence/");
    const data = photo();
    const k = key();
    await store.put(k, data);
    expect(await store.get(k)).toEqual(data);
    const put = bucket.sent.find((c) => c instanceof PutObjectCommand) as PutObjectCommand;
    expect(put.input.ChecksumSHA256).toBeTruthy();
    expect(put.input.Key).toBe("evidence/" + k);
  });

  it("keeps photos readable after simulated restart and redeploy", async () => {
    const bucket = fakeBucket();
    const first = new S3EvidenceStore(bucket, "bucket", "evidence/");
    const data = photo(4096);
    const k = key();
    await first.put(k, data);
    const afterRedeploy = new S3EvidenceStore(bucket, "bucket", "evidence/");
    expect(await afterRedeploy.get(k)).toEqual(data);
  });

  it("does not upload the same content-addressed photo twice", async () => {
    const bucket = fakeBucket();
    const store = new S3EvidenceStore(bucket, "bucket", "evidence/");
    const k = key();
    await store.put(k, photo());
    await store.put(k, photo());
    expect(bucket.sent.filter((c) => c instanceof PutObjectCommand)).toHaveLength(1);
  });

  it("retries transient failures and refuses to report success after permanent ones", async () => {
    const transient = new S3EvidenceStore(fakeBucket({ failPutsWith: [503] }), "bucket", "evidence/");
    const k = key();
    await transient.put(k, photo());
    expect(await transient.get(k)).toEqual(photo());

    const denied = new S3EvidenceStore(fakeBucket({ failPutsWith: [403, 403, 403] }), "bucket", "evidence/");
    await expect(denied.put(key(), photo())).rejects.toThrow("simulated");
  });

  it("rejects oversized and empty photos before any upload", async () => {
    const bucket = fakeBucket();
    const store = new S3EvidenceStore(bucket, "bucket", "evidence/");
    await expect(store.put(key(), Buffer.alloc(0))).rejects.toThrow("Invalid private evidence size");
    await expect(store.put(key(), Buffer.alloc(6 * 1024 * 1024 + 1))).rejects.toThrow("Invalid private evidence size");
    expect(bucket.sent).toHaveLength(0);
  });
});

describe("filesystem store", () => {
  it("keeps photos after a new store instance is created, as after a restart", async () => {
    const directory = await testDirectory("evidence-store-qa-");
    const k = key();
    const data = photo();
    await new FilesystemEvidenceStore(directory).put(k, data);
    expect(await new FilesystemEvidenceStore(directory).get(k)).toEqual(data);
  });
});

describe("configuration", () => {
  it("keeps hosted photos in the database unless a bucket is configured", () => {
    expect(createEvidenceStoreFromEnv({ NODE_ENV: "production" } as NodeJS.ProcessEnv).kind).toBe("database");
    expect(createEvidenceStoreFromEnv({ NODE_ENV: "production", VERCEL: "1" } as NodeJS.ProcessEnv).kind).toBe("database");
    // A bucket already in use stays in use, so its photos remain readable; incomplete settings still refuse.
    expect(() => createEvidenceStoreFromEnv({ NODE_ENV: "production", IBVS_EVIDENCE_S3_BUCKET: "b" } as NodeJS.ProcessEnv)).toThrow("requires bucket");
    expect(createEvidenceStoreFromEnv({ NODE_ENV: "production", IBVS_EVIDENCE_S3_BUCKET: "b", IBVS_EVIDENCE_STORE: "database" } as NodeJS.ProcessEnv).kind).toBe("database");
  });
  it("allows production filesystem storage only with an explicit persistent directory", async () => {
    const dir = await testDirectory("evidence-prod-");
    expect(() => createEvidenceStoreFromEnv({ NODE_ENV: "production", IBVS_EVIDENCE_STORE: "filesystem" } as NodeJS.ProcessEnv)).toThrow("requires IBVS_EVIDENCE_DIR");
    expect(createEvidenceStoreFromEnv({ NODE_ENV: "production", IBVS_EVIDENCE_STORE: "filesystem", IBVS_EVIDENCE_DIR: dir } as NodeJS.ProcessEnv).kind).toBe("filesystem");
  });
  it("refuses filesystem evidence on Vercel even when a directory is supplied", async () => {
    const dir = await testDirectory("evidence-vercel-");
    expect(() => createEvidenceStoreFromEnv({ NODE_ENV: "production", VERCEL: "1", IBVS_EVIDENCE_STORE: "filesystem", IBVS_EVIDENCE_DIR: dir } as NodeJS.ProcessEnv)).toThrow("Vercel cannot keep local evidence");
  });
  it("uses local filesystem storage for the local production test server", () => {
    const dir = process.cwd();
    const store = createEvidenceStoreFromEnv({ NODE_ENV: "production", IBVS_ALLOW_LOCAL_DB: "true", IBVS_EVIDENCE_DIR: dir + "/.local/test-evidence-store" } as NodeJS.ProcessEnv);
    expect(store.kind).toBe("filesystem");
  });
  it("requires complete S3 settings", () => {
    expect(() => createEvidenceStoreFromEnv({ NODE_ENV: "production", IBVS_EVIDENCE_STORE: "s3" } as NodeJS.ProcessEnv)).toThrow("requires bucket");
  });
  it("selects S3 when complete settings are present", () => {
    const store = createEvidenceStoreFromEnv({
      NODE_ENV: "production",
      IBVS_EVIDENCE_STORE: "s3",
      IBVS_EVIDENCE_S3_BUCKET: "ibvs-evidence",
      IBVS_EVIDENCE_S3_ENDPOINT: "https://example.invalid",
      IBVS_EVIDENCE_S3_ACCESS_KEY_ID: "test-id",
      IBVS_EVIDENCE_S3_SECRET_ACCESS_KEY: "test-secret",
    } as NodeJS.ProcessEnv);
    expect(store.kind).toBe("s3");
  });
  it("rejects an unknown store name", () => {
    expect(() => createEvidenceStoreFromEnv({ NODE_ENV: "development", IBVS_EVIDENCE_STORE: "disk" } as NodeJS.ProcessEnv)).toThrow("database, s3 or filesystem");
  });
});
