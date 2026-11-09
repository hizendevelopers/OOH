import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { mkdir, writeFile, open, link, unlink } from "node:fs/promises";
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { root } from "./db";

// Private evidence storage behind one small interface. Callers use the functions at the
// bottom of this file; the backend is chosen by configuration and never by the client.

export const MAX_EVIDENCE_BYTES = 6 * 1024 * 1024;
const EVIDENCE_KEY =
  /^[a-f0-9-]{36}\/(?:front|wide|angle_[1-4])\/(?:[0-9]{1,2}-[a-f0-9]{64}|original-[a-f0-9]{64})$/;

export interface EvidenceStore {
  readonly kind: "s3" | "filesystem";
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
}

// Keys come from the server, never from a client path. Anything unexpected is refused.
export function validateEvidenceKey(key: string) {
  if (!EVIDENCE_KEY.test(key)) throw new Error("Invalid internal evidence key");
  return key;
}

function checkSize(data: Buffer) {
  if (data.length < 1 || data.length > MAX_EVIDENCE_BYTES)
    throw new Error("Invalid private evidence size");
}

export const sha256Hex = (data: Buffer) =>
  createHash("sha256").update(data).digest("hex");

// ----- Filesystem backend: single persistent host only. -----

export function evidenceRoot(env: NodeJS.ProcessEnv = process.env) {
  const configured = env.IBVS_EVIDENCE_DIR;
  if (configured && !path.isAbsolute(configured))
    throw new Error("IBVS_EVIDENCE_DIR must be absolute");
  const directory = path.resolve(
    /* turbopackIgnore: true */
    configured || path.join(root(), ".local", "evidence"),
  );
  const publicDirectory = path.resolve(root(), "apps", "web");
  const relative = path.relative(publicDirectory, directory);
  if (
    relative === "" ||
    (!relative.startsWith(".." + path.sep) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  )
    throw new Error(
      "Evidence cannot be stored under the web application directory",
    );
  return directory;
}

export class FilesystemEvidenceStore implements EvidenceStore {
  readonly kind = "filesystem" as const;
  constructor(private readonly directory: string) {}

  private file(key: string) {
    return path.join(this.directory, ...validateEvidenceKey(key).split("/"));
  }

  async put(key: string, data: Buffer) {
    checkSize(data);
    const file = this.file(key);
    await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    const temp = file + "." + randomUUID() + ".tmp";
    try {
      await writeFile(temp, data, { flag: "wx", mode: 0o600, flush: true });
      await link(temp, file);
    } catch (e) {
      if ((e as { code?: string }).code !== "EEXIST") throw e;
    } finally {
      await unlink(temp).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      });
    }
  }

  async get(key: string) {
    const handle = await open(this.file(key), "r");
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.size > MAX_EVIDENCE_BYTES)
        throw new Error("Invalid private evidence size");
      const data = Buffer.alloc(info.size);
      let offset = 0;
      while (offset < data.length) {
        const { bytesRead } = await handle.read(data, offset, data.length - offset, offset);
        if (!bytesRead) throw new Error("Interrupted private evidence read");
        offset += bytesRead;
      }
      return data;
    } finally {
      await handle.close();
    }
  }
}

// ----- S3-compatible backend (Cloudflare R2, Amazon S3, and similar). -----

type SendLike = Pick<S3Client, "send">;

export class S3EvidenceStore implements EvidenceStore {
  readonly kind = "s3" as const;
  constructor(
    private readonly client: SendLike,
    private readonly bucket: string,
    private readonly prefix = "evidence/",
    private readonly attempts = 3,
  ) {}

  private objectKey(key: string) {
    return this.prefix + validateEvidenceKey(key);
  }

  // Transient failures are retried with backoff. Anything else is raised to the caller,
  // which keeps the upload pending instead of issuing a receipt.
  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.attempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
        const transient = status === undefined || status === 429 || status >= 500;
        if (!transient || attempt === this.attempts) break;
        await new Promise((resolve) => setTimeout(resolve, 200 * 2 ** attempt));
      }
    }
    throw lastError;
  }

  async put(key: string, data: Buffer) {
    checkSize(data);
    const objectKey = this.objectKey(key);
    // Keys are content-addressed, so an existing object with the same size is the same photo.
    const existing = await this.head(objectKey);
    if (existing === data.length) return;
    await this.withRetry(() =>
      this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: objectKey,
          Body: data,
          ContentLength: data.length,
          ContentType: "application/octet-stream",
          ChecksumSHA256: Buffer.from(createHash("sha256").update(data).digest()).toString("base64"),
        }),
      ),
    );
  }

  private async head(objectKey: string): Promise<number | null> {
    try {
      const result = await this.withRetry(() =>
        this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: objectKey })),
      );
      return result.ContentLength ?? null;
    } catch (error) {
      if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404)
        return null;
      if ((error as { name?: string }).name === "NotFound") return null;
      throw error;
    }
  }

  async get(key: string) {
    const result = await this.withRetry(() =>
      this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: this.objectKey(key) })),
    );
    const body = result.Body as { transformToByteArray?: () => Promise<Uint8Array> } | undefined;
    if (!body?.transformToByteArray) throw new Error("Private evidence body unavailable");
    const data = Buffer.from(await body.transformToByteArray());
    checkSize(data);
    return data;
  }
}

// ----- Selection and configuration. -----

let configured: EvidenceStore | null = null;

export function createEvidenceStoreFromEnv(env: NodeJS.ProcessEnv = process.env): EvidenceStore {
  const choice = env.IBVS_EVIDENCE_STORE ?? (env.NODE_ENV === "production" ? "s3" : "filesystem");
  if (choice === "s3") {
    const bucket = env.IBVS_EVIDENCE_S3_BUCKET;
    const endpoint = env.IBVS_EVIDENCE_S3_ENDPOINT;
    const accessKeyId = env.IBVS_EVIDENCE_S3_ACCESS_KEY_ID;
    const secretAccessKey = env.IBVS_EVIDENCE_S3_SECRET_ACCESS_KEY;
    if (!bucket || !endpoint || !accessKeyId || !secretAccessKey)
      throw new Error("S3 evidence store requires bucket, endpoint and access key settings");
    const client = new S3Client({
      region: env.IBVS_EVIDENCE_S3_REGION || "auto",
      endpoint,
      forcePathStyle: env.IBVS_EVIDENCE_S3_FORCE_PATH_STYLE === "true",
      credentials: { accessKeyId, secretAccessKey },
    });
    return new S3EvidenceStore(client, bucket, env.IBVS_EVIDENCE_S3_PREFIX || "evidence/");
  }
  if (choice === "filesystem") {
    // Production filesystem storage needs an explicit single-host decision.
    if (env.NODE_ENV === "production" && env.IBVS_ALLOW_LOCAL_DB !== "true") {
      if (env.IBVS_EVIDENCE_STORE !== "filesystem")
        throw new Error("Production requires the S3 evidence store or an explicit filesystem choice");
      // Without an absolute directory the fallback would sit inside the project tree.
      if (!env.IBVS_EVIDENCE_DIR) throw new Error("Production filesystem storage requires IBVS_EVIDENCE_DIR");
    }
    return new FilesystemEvidenceStore(evidenceRoot(env));
  }
  throw new Error("IBVS_EVIDENCE_STORE must be s3 or filesystem");
}

export function evidenceStore(): EvidenceStore {
  configured ??= createEvidenceStoreFromEnv();
  return configured;
}

// Used by tests and by the one-time migration tool after configuration changes.
export function resetEvidenceStore(store: EvidenceStore | null = null) {
  configured = store;
}
