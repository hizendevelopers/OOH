// Emergency recovery for an administrator who has lost the authenticator and every backup code.
// Operator-only: needs database access. Dry run unless --apply is given. Requires a written reason and the name of the
// operator. Ends the account's sessions and records an audit event. It does not sign anyone in.
//   node scripts/with-app-env.mjs scripts/admin-mfa-reset.ts --org <orgId> --user <adminUserId> --operator "<name>" --reason "<at least 20 characters>"
//   add --apply to make the change
import { closeDb, getDb } from "../apps/web/src/server/db";
import { randomUUID } from "node:crypto";

const option = (name: string) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

async function main() {
  const organizationId = option("--org");
  const userId = option("--user");
  const operator = (option("--operator") ?? "").trim();
  const reason = (option("--reason") ?? "").trim();
  const apply = process.argv.includes("--apply");
  if (!organizationId || !userId) throw new Error("Required: --org and --user");
  if (operator.length < 3) throw new Error("Required: --operator with the operator's name");
  if (reason.length < 20) throw new Error("Required: --reason of at least 20 characters describing why this recovery is authorized");

  const db = await getDb();
  const [account] = await db.query<{ name: string; email: string; role: string; enabled: boolean | null }>(
    `SELECT u.name, u.email, m.role, u."twoFactorEnabled" AS enabled FROM "user" u JOIN organization_members m ON m.user_id=u.id WHERE u.id=$1 AND m.organization_id=$2`,
    [userId, organizationId],
  );
  if (!account) throw new Error("No account with this ID in this organization. Nothing was changed.");
  if (account.role !== "admin") throw new Error("This recovery applies only to administrator accounts. Nothing was changed.");
  console.log(`Account: ${account.name} <${account.email}>`);
  console.log(`Two-factor currently enabled: ${account.enabled === true ? "yes" : "no"}`);
  console.log(`Mode: ${apply ? "APPLY (writes)" : "DRY RUN (no writes)"}`);
  if (!apply) {
    console.log("Re-run with --apply to remove the authenticator, end the account's sessions, and record the audit event.");
    return;
  }
  await db.transaction(async (tx) => {
    await tx.query(`DELETE FROM "twoFactor" WHERE "userId"=$1`, [userId]);
    await tx.query(`UPDATE "user" SET "twoFactorEnabled"=false WHERE id=$1`, [userId]);
    await tx.query(`DELETE FROM session WHERE "userId"=$1`, [userId]);
    await tx.query(
      "INSERT INTO audit_events(id,organization_id,actor_id,action,entity_id,detail) VALUES($1,$2,$3,$4,$5,$6)",
      // actor_id must reference a user, so the recovered account is recorded as the actor. The operator is in the detail.
      [randomUUID(), organizationId, userId, "admin.mfa_reset_by_operator", userId, JSON.stringify({ reason, operator, operatorRecovery: true, previouslyEnabled: account.enabled === true })],
    );
  });
  console.log("Recovery applied. The account must enroll again before the workspace opens.");
}

if (process.argv[1]?.endsWith("admin-mfa-reset.ts")) {
  main()
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(closeDb);
}
