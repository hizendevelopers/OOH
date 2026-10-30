import { z } from "zod";
import type { Actor } from "@ibvs/domain";
import { requireAdmin } from "./service";
import { provision } from "./provision";

export const workerInput = z
  .object({
    name: z.string().trim().min(1).max(120),
    email: z
      .email()
      .max(254)
      .transform((value) => value.toLowerCase()),
    password: z.string().min(12).max(128),
  })
  .strict();

export async function createWorker(actor: Actor, body: unknown) {
  requireAdmin(actor);
  const input = workerInput.parse(body);
  const user = await provision(
    {
      ...input,
      role: "worker",
      organizationId: actor.organizationId,
    },
    actor.id,
  );
  // Never return credentials, password hashes, or a session for the new worker.
  return { id: user.id, name: user.name, email: user.email };
}
