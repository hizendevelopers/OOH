import { z } from "zod";
import { currentActor, signInRequired } from "@/server/access";
import { createWorker } from "@/server/worker-management";
import { getDb } from "@/server/db";
import { ConfigurationError } from "@/server/env";
import {
  ApiError,
  inventory,
  assignments,
  workers,
  previewImport,
  importCsv,
  assignmentInput,
  assign,
  overview,
  auditLog,
  requireAdmin,
} from "@/server/service";
import { csvCell } from "@ibvs/domain";
export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
async function handle(request: Request) {
  const requestId = crypto.randomUUID();
  const route = new URL(request.url).pathname.replace("/api/", "");
  try {
    if (route === "health") {
      const db = await getDb();
      const migrations = await db.query(
        "SELECT name FROM schema_migrations WHERE name=$1",
        ["006_location_management.sql"],
      );
      if (!migrations.length)
        throw new ApiError(503, "Database migrations are incomplete");
      await db.query("SELECT id FROM organizations LIMIT 1");
      return json({
        status: "ok",
        service: "ibvs",
        database: process.env.DATABASE_URL ? "postgresql" : "local",
        migrations: "006_location_management.sql",
      });
    }
    const actor = await currentActor();
    if (route === "workers" && request.method === "POST") {
      if (!signInRequired())
        throw new ApiError(403, "Enable sign-in before creating worker accounts");
      requireAdmin(actor);
    }
    if (request.method === "GET") {
      if (route === "me") return json(actor);
      if (route === "overview") return json(await overview(actor));
      if (route === "inventory") return json(await inventory(actor));
      if (route === "workers") return json(await workers(actor));
      if (route === "audit") return json(await auditLog(actor));
      if (route === "assignments") return json(await assignments(actor));
      if (route.startsWith("assignments/")) {
        const [task] = await assignments(actor, route.split("/")[1]);
        if (!task) throw new ApiError(404, "Assignment not found");
        return json(task);
      }
      if (route === "export") {
        requireAdmin(actor);
        const tasks = await assignments(actor);
        const rows = [
          ["face_code", "city", "worker", "due_date", "status"],
          ...tasks.map((t) => [
            t.code,
            t.city,
            t.worker_name,
            t.due_date,
            t.status,
          ]),
        ];
        return new Response(
          "\uFEFF" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n"),
          {
            headers: {
              "Content-Type": "text/csv; charset=utf-8",
              "Content-Disposition":
                'attachment; filename="ibvs-assignments.csv"',
              "Cache-Control": "no-store",
            },
          },
        );
      }
    }
    if (request.method === "POST") {
      if (
        request.headers.get("origin") !==
        (process.env.BETTER_AUTH_URL || "http://localhost:3000")
      )
        throw new ApiError(403, "Same-origin request required");
      if (!request.headers.get("content-type")?.startsWith("application/json"))
        throw new ApiError(415, "JSON required");
      if (Number(request.headers.get("content-length") || 0) > 1048576)
        throw new ApiError(413, "Request too large");
      const reader = request.body?.getReader();
      let length = 0;
      const chunks: Uint8Array[] = [];
      if (reader)
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          length += value.byteLength;
          if (length > 1048576) {
            await reader.cancel();
            throw new ApiError(413, "Request too large");
          }
          chunks.push(value);
        }
      let body: unknown;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        throw new ApiError(400, "Malformed JSON");
      }
      if (route === "inventory/preview" || route === "inventory/import") {
        const input = z
          .object({
            csv: z.string().min(1).max(1000000),
            sourceName: z
              .string()
              .trim()
              .min(1)
              .max(120)
              .default("inventory.csv"),
          })
          .parse(body);
        return json(
          route.endsWith("preview")
            ? await previewImport(actor, input.csv)
            : await importCsv(actor, input.csv, input.sourceName),
        );
      }
      if (route === "assignments")
        return json(await assign(actor, assignmentInput.parse(body)), 201);
      if (route === "workers")
        return json(await createWorker(actor, body), 201);
    }
    throw new ApiError(404, "Endpoint not found");
  } catch (error) {
    if (error instanceof ConfigurationError) {
      console.error(
        JSON.stringify({
          requestId,
          category: "configuration_error",
          settings: error.fields,
        }),
      );
      return json(
        {
          error: "Server configuration is incomplete.",
          code: "CONFIGURATION_ERROR",
          ...(route === "health" ? { settings: error.fields } : {}),
          requestId,
        },
        503,
      );
    }
    if (error instanceof ApiError)
      return json({ error: error.message, requestId }, error.status);
    if (error instanceof z.ZodError)
      return json(
        { error: "Invalid request", issues: error.issues, requestId },
        422,
      );
    console.error(JSON.stringify({ requestId, category: "request_failed" }));
    return json(
      {
        error:
          "Service unavailable. Check server configuration and migrations.",
        ...(route === "health"
          ? {
              code:
                typeof (error as { code?: unknown })?.code === "string" &&
                /^[A-Z0-9_]{2,40}$/.test((error as { code: string }).code)
                  ? (error as { code: string }).code
                  : "SERVICE_UNAVAILABLE",
            }
          : {}),
        requestId,
      },
      503,
    );
  }
}
export const GET = handle;
export const POST = handle;
