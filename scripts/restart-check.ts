import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  request,
  type APIRequestContext,
  type APIResponse,
} from "@playwright/test";
import sharp from "sharp";
import { testDirectory } from "./test-directory";
import type { Assignment } from "../apps/web/src/server/service";
import {
  CHUNK_SIZE,
  type UploadSession,
  type Receipt,
} from "../packages/domain/src/inspection";

// Isolated local HTTP drill against an existing production build. Never targets
// a configured deployment, existing database, evidence directory, or process.
const root = process.cwd();
const startedAt = Date.now();
const directory = await testDirectory("process-restart-");
const password = randomBytes(32).toString("base64url");
const environment: {
  -readonly [K in keyof NodeJS.ProcessEnv]: NodeJS.ProcessEnv[K];
} = {
  ...process.env,
  IBVS_ROOT: root,
  IBVS_LOCAL_DB: path.join(directory, "database"),
  IBVS_EVIDENCE_DIR: path.join(directory, "evidence"),
  TMP: directory,
  TEMP: directory,
  IBVS_DEMO_PASSWORD: password,
  BETTER_AUTH_SECRET: randomBytes(48).toString("base64url"),
  IBVS_ALLOW_LOCAL_DB: "true",
  NODE_ENV: "development",
};
delete environment.DATABASE_URL;
let stage = "allocate_loopback_port";
let server: ChildProcess | undefined;
let client: APIRequestContext | undefined;
let starts = 0;
let diagnostic = "not_started";
const pause = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
const hash = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");

async function exited(child: ChildProcess, timeout: number) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Owned child exit timeout")),
      timeout,
    );
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    child.once("error", () => {
      clearTimeout(timer);
      reject(new Error("Owned child failed"));
    });
  });
}
async function stop(signal: NodeJS.Signals) {
  const owned = server;
  if (!owned) return;
  if (owned.exitCode === null && owned.signalCode === null) owned.kill(signal);
  await exited(owned, 15000);
  server = undefined;
}
async function expectOk(response: APIResponse) {
  diagnostic = `http_status_${response.status()}`;
  assert(response.ok(), `HTTP check failed (${response.status()})`);
  return response;
}

try {
  // Next loads dotenv files independently. Refuse a database setting there so
  // an isolated drill cannot fall back to a configured PostgreSQL target.
  stage = "verify_database_isolation";
  for (const base of [root, path.join(root, "apps", "web")]) {
    for (const filename of [
      ".env",
      ".env.local",
      ".env.production",
      ".env.production.local",
    ]) {
      const content = await readFile(path.join(base, filename), "utf8").catch(
        (error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return "";
          throw error;
        },
      );
      assert(!/^\s*(?:export\s+)?DATABASE_URL\s*=/m.test(content));
    }
  }
  stage = "allocate_loopback_port";
  const port = await new Promise<number>((resolve, reject) => {
    const reservation = createServer();
    reservation.once("error", reject);
    reservation.listen(0, "127.0.0.1", () => {
      const address = reservation.address();
      assert(address && typeof address !== "string");
      reservation.close((error) =>
        error ? reject(error) : resolve(address.port),
      );
    });
  });
  const origin = `http://127.0.0.1:${port}`;
  environment.BETTER_AUTH_URL = origin;
  stage = "seed_generated_fixture";
  const seed = spawn(process.execPath, ["--import", "tsx", "scripts/seed.ts"], {
    cwd: root,
    env: environment,
    stdio: "ignore",
    windowsHide: true,
  });
  try {
    await exited(seed, 120000);
    assert.equal(seed.exitCode, 0);
  } finally {
    if (seed.exitCode === null && seed.signalCode === null) {
      seed.kill("SIGKILL");
      await exited(seed, 15000);
    }
  }
  environment.NODE_ENV = "production";
  async function start() {
    let ready = false;
    let failed = false;
    let startup = "";
    diagnostic = "waiting_for_owned_server_ready";
    const child = spawn(
      process.execPath,
      [
        path.join(root, "node_modules", "next", "dist", "bin", "next"),
        "start",
        path.join(root, "apps", "web"),
        "--hostname",
        "127.0.0.1",
        "--port",
        String(port),
      ],
      {
        cwd: root,
        env: environment,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );
    server = child;
    starts++;
    child.once("error", () => {
      failed = true;
      diagnostic = "owned_server_spawn_error";
    });
    const observeStartup = (chunk: Buffer) => {
      startup = (
        startup + chunk.toString().replace(/\u001b\[[0-9;]*m/g, "")
      ).slice(-8192);
      if (/Ready in/.test(startup)) ready = true;
      if (/EADDRINUSE/.test(startup)) diagnostic = "selected_port_reused";
      if (/Could not find a production build/.test(startup))
        diagnostic = "production_build_missing";
    };
    child.stdout!.on("data", observeStartup);
    // Drain logs without printing private operational details. A port-bind failure
    // exits this owned child; never adopt an already-running server on that port.
    child.stderr!.on("data", observeStartup);
    child.once("exit", (code) => {
      if (!ready) diagnostic = `owned_server_exit_${code}`;
    });
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      assert(!failed && child.exitCode === null && child.signalCode === null);
      if (ready) {
        diagnostic = "owned_server_health_request";
        const response = await fetch(origin + "/sign-in", {
          signal: AbortSignal.timeout(5000),
        });
        diagnostic = `owned_server_health_${response.status}`;
        assert.equal(response.status, 200);
        await response.body?.cancel();
        return;
      }
      await pause(200);
    }
    throw new Error("Owned server readiness timeout");
  }
  stage = "start_first_owned_production_server";
  await start();
  client = await request.newContext({
    baseURL: origin,
    extraHTTPHeaders: { Origin: origin },
    timeout: 45000,
  });
  stage = "authenticate_generated_worker";
  await expectOk(
    await client.post("/api/auth/sign-in/email", {
      data: { email: "worker@demo.ibvs.test", password },
    }),
  );
  stage = "list_generated_worker_tasks";
  const tasks: Assignment[] = await (
    await expectOk(await client.get("/api/assignments"))
  ).json();
  const task = tasks.find((item) => item.code === "DEMO-BGD-001");
  assert(task);
  stage = "generate_multichunk_fixture_images";
  const images = await Promise.all(
    [0, 1].map(() =>
      sharp(randomBytes(1024 * 1024 * 3), {
        raw: { width: 1024, height: 1024, channels: 3 },
      })
        .jpeg({ quality: 90 })
        .toBuffer(),
    ),
  );
  assert(images.every((bytes) => bytes.length > CHUNK_SIZE));
  const input = {
    operationId: randomUUID(),
    assignmentId: task.assignment_id,
    faceId: task.id,
    faceCode: task.code,
    assignmentVersion: task.version,
    challengeId: null,
    photos: images.map((bytes, index) => ({
      kind: index ? "wide" : "front",
      sha256: hash(bytes),
      bytes: bytes.length,
      capturedAt: new Date().toISOString(),
      captureMode: "offline",
      gps: { status: "denied", observedAt: new Date().toISOString() },
    })),
  };
  stage = "persist_first_partial_upload";
  const session: UploadSession = await (
    await expectOk(await client.post("/api/inspections", { data: input }))
  ).json();
  const id = session.inspectionId;
  await expectOk(
    await client.put(`/api/inspections/${id}/parts/front/0`, {
      headers: { "Content-Type": "application/octet-stream" },
      data: images[0].subarray(0, CHUNK_SIZE),
    }),
  );
  const before: UploadSession = await (
    await expectOk(await client.get(`/api/inspections/${id}`))
  ).json();
  assert.deepEqual(
    before.photos.find((photo) => photo.kind === "front")?.receivedParts,
    [0],
  );
  assert.equal(before.receipt, null);
  const firstPid = server?.pid;
  stage = "abruptly_terminate_owned_server";
  await stop("SIGKILL");
  stage = "restart_owned_server_and_reuse_session";
  await start();
  assert.notEqual(server?.pid, firstPid);
  const after: UploadSession = await (
    await expectOk(await client.get(`/api/inspections/${id}`))
  ).json();
  assert.deepEqual(after, before);
  const replay: UploadSession = await (
    await expectOk(await client.post("/api/inspections", { data: input }))
  ).json();
  assert.equal(replay.inspectionId, id);
  stage = "resume_complete_and_verify_originals";
  let resumedParts = 0;
  for (let index = 0; index < 2; index++) {
    const kind = index ? "wide" : "front";
    for (
      let part = index ? 0 : 1;
      part * CHUNK_SIZE < images[index].length;
      part++
    ) {
      await expectOk(
        await client.put(`/api/inspections/${id}/parts/${kind}/${part}`, {
          headers: { "Content-Type": "application/octet-stream" },
          data: images[index].subarray(
            part * CHUNK_SIZE,
            (part + 1) * CHUNK_SIZE,
          ),
        }),
      );
      resumedParts++;
    }
    await expectOk(
      await client.post(`/api/inspections/${id}/complete/${kind}`, {
        data: {},
      }),
    );
  }
  const receipt: Receipt = await (
    await expectOk(
      await client.post(`/api/inspections/${id}/submit`, { data: {} }),
    )
  ).json();
  assert.equal(receipt.status, "server_received");
  assert.equal(receipt.inspectionId, id);
  assert(receipt.receiptId);
  assert.deepEqual(
    await (
      await expectOk(
        await client.post(`/api/inspections/${id}/submit`, { data: {} }),
      )
    ).json(),
    receipt,
  );
  for (let index = 0; index < 2; index++) {
    const response = await expectOk(
      await client.get(
        `/api/inspections/${id}/media/${index ? "wide" : "front"}`,
      ),
    );
    assert.match(response.headers()["cache-control"], /no-store/);
    assert.equal(hash(await response.body()), hash(images[index]));
  }
  const history: { id: string }[] = await (
    await expectOk(await client.get("/api/inspections"))
  ).json();
  assert.equal(history.filter((inspection) => inspection.id === id).length, 1);
  stage = "cleanup_owned_server";
  await stop("SIGTERM");
  await client.dispose();
  client = undefined;
  console.log(
    JSON.stringify({
      check: "owned_production_process_restart",
      status: "passed",
      serverStarts: starts,
      resumedParts,
      receivedInspections: 1,
      originalHashesVerified: 2,
      durationMs: Date.now() - startedAt,
      database: "isolated_pglite",
      boundary: "loopback_http_process_restart_not_power_loss_or_postgis",
    }),
  );
} catch {
  console.error(
    JSON.stringify({
      check: "owned_production_process_restart",
      status: "failed",
      stage,
      diagnostic,
    }),
  );
  process.exitCode = 1;
} finally {
  await client?.dispose().catch(() => {});
  if (server) {
    try {
      await stop("SIGKILL");
    } catch {
      console.error(
        JSON.stringify({
          check: "owned_production_process_restart",
          status: "cleanup_failed",
        }),
      );
      process.exitCode = 1;
    }
  }
}
