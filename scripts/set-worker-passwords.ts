// Sets a new sign-in password for worker accounts that have lost theirs. Operator-only: it needs direct
// database access and is never reachable from the web app. Dry run unless --apply is given.
//
//   node scripts/with-app-env.mjs scripts/set-worker-passwords.ts --org <orgId> --out <file> [--match <fragment>] [--apply]
//
// Passwords are generated here, hashed with the application's own hasher, and written only to the file given
// by --out. They are never printed, never logged and never stored in plain text in the database. The file is
// created with owner-only permissions and the script refuses to overwrite an existing one: move it into a
// password manager and delete it.
//
// --passwords <file> sets passwords an administrator has chosen instead, from a CSV of email,password. A
// chosen password shorter than the sign-up minimum, or one that contains the local part of its own email,
// is weak by the standard the application enforces at sign-up, which this path bypasses; the script names
// each one and refuses to continue without --allow-weak, so the exception is deliberate and on the record.
//
// Each account's sessions are ended, so anyone holding the previous password is signed out, and an audit event
// records that an operator did this. Accounts keep their identity, so their assignments are untouched.
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import { closeDb, getDb } from "../apps/web/src/server/db";
import { createAuth } from "../apps/web/src/server/auth";

const option = (name: string) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

// The minimum the application enforces when an account is created (auth.ts emailAndPassword).
const MINIMUM_LENGTH = 12;

// Reads email,password pairs. Blank lines, comments and a header row are ignored. A password may be
// quoted, which is how a value containing a comma survives the round trip.
export function readChosenPasswords(text: string) {
  const chosen = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const row = line.trim();
    if (!row || row.startsWith("#") || /^email\s*,/i.test(row)) continue;
    const comma = row.indexOf(",");
    if (comma < 0) throw new Error(`Expected "email,password": ${row.slice(0, 40)}`);
    const email = row.slice(0, comma).trim().toLowerCase();
    let password = row.slice(comma + 1).trim();
    if (password.startsWith('"') && password.endsWith('"') && password.length > 1)
      password = password.slice(1, -1).replace(/""/g, '"');
    if (!email || !password) throw new Error(`Expected "email,password": ${row.slice(0, 40)}`);
    chosen.set(email, password);
  }
  return chosen;
}

// Why a chosen password is weak, or null when it is not. Length is the application's own rule; the
// second check catches a password derived from the account it unlocks, which anyone who knows the
// email address can guess.
export function weakness(email: string, password: string) {
  const local = email.split("@")[0]?.replace(/[^a-z0-9]/gi, "").toLowerCase() ?? "";
  const stripped = password.replace(/[^a-z0-9]/gi, "").toLowerCase();
  if (password.length < MINIMUM_LENGTH) return `under ${MINIMUM_LENGTH} characters`;
  if (local.length > 2 && (stripped.includes(local) || local.includes(stripped)))
    return "derived from its own email address";
  return null;
}

// Letters and digits that cannot be confused with one another on a phone screen: no I/l/1, no O/0.
// 54 symbols over 16 positions is about 92 bits, well beyond what a sign-in rate limit allows.
const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const LENGTH = 16;

// Rejection sampling, so every symbol is equally likely. Taking a byte modulo 54 would favour the
// first 40 symbols, and a password generator that leans is a password generator that is guessed.
export function generatePassword(length = LENGTH, alphabet = ALPHABET) {
  const limit = Math.floor(256 / alphabet.length) * alphabet.length;
  let out = "";
  while (out.length < length) {
    for (const byte of randomBytes(length * 2)) {
      if (byte >= limit) continue;
      out += alphabet[byte % alphabet.length];
      if (out.length === length) break;
    }
  }
  return out;
}

type Worker = { user_id: string; name: string; email: string; has_credential: boolean };

async function main() {
  const organizationId = option("--org");
  const out = option("--out");
  const match = option("--match");
  const apply = process.argv.includes("--apply");
  const passwordsFile = option("--passwords");
  const allowWeak = process.argv.includes("--allow-weak");
  if (!organizationId) throw new Error("Required: --org <organizationId>");
  if (!out) throw new Error("Required: --out <file> for the generated passwords");
  if (existsSync(out)) throw new Error(`${out} already exists. Choose a path that does not, so nothing is overwritten.`);
  const chosen = passwordsFile ? readChosenPasswords(readFileSync(passwordsFile, "utf8")) : null;
  if (chosen && !chosen.size) throw new Error(`${passwordsFile} lists no passwords. Nothing was changed.`);

  const db = await getDb();
  const pattern = match ? `%${match.replace(/[%_\\]/g, (c) => `\\${c}`)}%` : null;
  const workers = await db.query<Worker>(
    `SELECT u.id AS user_id, u.name, u.email,
       EXISTS (SELECT 1 FROM account a WHERE a."userId"=u.id AND a."providerId"='credential') AS has_credential
     FROM "user" u
     JOIN organization_members m ON m.user_id=u.id
     JOIN worker_profiles p ON p.user_id=u.id AND p.organization_id=m.organization_id
     WHERE m.organization_id=$1 AND m.role='worker' AND p.active=true
       AND ($2::text IS NULL OR u.name ILIKE $2 OR u.email ILIKE $2)
     ORDER BY u.name`,
    [organizationId, pattern],
  );
  if (!workers.length) throw new Error("No active worker accounts matched. Nothing was changed.");

  // An account with no password row cannot be given one here: it would need the full sign-up path.
  const withoutCredential = workers.filter((w) => !w.has_credential);
  // With --passwords, an account the file does not name keeps the password it has.
  const targets = workers.filter((w) => w.has_credential && (!chosen || chosen.has(w.email.toLowerCase())));
  const unlisted = chosen ? workers.filter((w) => w.has_credential && !chosen.has(w.email.toLowerCase())) : [];
  console.log(`Organization: ${organizationId}`);
  console.log(`Matched ${workers.length} active worker account(s); ${targets.length} can be given a new password.`);
  for (const w of targets) console.log(`  ${w.name} <${w.email}>`);
  for (const w of withoutCredential) console.log(`  SKIPPED (no password sign-in): ${w.name} <${w.email}>`);
  for (const w of unlisted) console.log(`  SKIPPED (not in --passwords): ${w.name} <${w.email}>`);
  if (chosen) {
    // An address in the file that matched no account is a typo worth seeing before it is explained
    // away as "that worker cannot sign in".
    const emails = new Set(workers.map((w) => w.email.toLowerCase()));
    for (const email of chosen.keys())
      if (!emails.has(email)) console.log(`  NOT AN ACCOUNT HERE: ${email}`);
    const weak = targets
      .map((w) => ({ email: w.email, reason: weakness(w.email, chosen.get(w.email.toLowerCase())!) }))
      .filter((w) => w.reason);
    for (const w of weak) console.log(`  WEAK: ${w.email} — ${w.reason}`);
    if (weak.length && !allowWeak)
      throw new Error(
        `${weak.length} chosen password(s) are weaker than the application requires at sign-up. Nothing was changed. Re-run with --allow-weak to set them anyway.`,
      );
  }
  console.log(`Mode: ${apply ? "APPLY (writes)" : "DRY RUN (no writes)"}`);
  if (!apply) {
    console.log("Re-run with --apply to set new passwords, end these accounts' sessions and write the list.");
    return;
  }
  if (!targets.length) throw new Error("No matched account has password sign-in. Nothing was changed.");

  // The application's own hasher, so a password set here verifies exactly like one set at sign-up.
  const hashPassword = (await (await createAuth()).$context).password.hash;
  const issued: { name: string; email: string; password: string }[] = [];
  for (const worker of targets)
    issued.push({
      name: worker.name,
      email: worker.email,
      password: chosen?.get(worker.email.toLowerCase()) ?? generatePassword(),
    });

  // The file is written before the database changes. A written file whose passwords were never applied is a
  // harmless false alarm; a changed password that reached nobody locks the worker out of their own account.
  const body = [
    `# Worker sign-in passwords set ${new Date().toISOString()}`,
    `# Organization ${organizationId}. Move these into a password manager and delete this file.`,
    "name,email,password",
    ...issued.map((i) => [i.name, i.email, i.password].map((v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(",")),
    "",
  ].join("\n");
  writeFileSync(out, body, { mode: 0o600, flag: "wx" });
  try {
    chmodSync(out, 0o600);
  } catch {
    // Windows ignores POSIX modes; the file still inherits the directory's permissions.
  }

  const hashed = await Promise.all(issued.map((i) => hashPassword(i.password)));
  await db.transaction(async (tx) => {
    for (const [index, worker] of targets.entries()) {
      const rows = await tx.query<{ id: string }>(
        `UPDATE account SET password=$1,"updatedAt"=now() WHERE "userId"=$2 AND "providerId"='credential' RETURNING id`,
        [hashed[index], worker.user_id],
      );
      if (!rows.length) throw new Error(`No password sign-in for ${worker.email}; nothing was changed.`);
      // Anyone holding the previous password is signed out.
      await tx.query(`DELETE FROM session WHERE "userId"=$1`, [worker.user_id]);
      await tx.query(
        "INSERT INTO audit_events(id,organization_id,actor_id,action,entity_id,detail) VALUES($1,$2,$3,$4,$5,$6)",
        // actor_id must reference a user, so the account itself is recorded as the actor, as in admin-mfa-reset.
        [randomUUID(), organizationId, worker.user_id, "worker.password_set_by_operator", worker.user_id, JSON.stringify({ operatorRecovery: true })],
      );
    }
  });
  console.log(`New passwords set for ${targets.length} account(s) and written to ${out}. They were not printed.`);
  console.log("Sessions for those accounts were ended. Share each password with its own worker only.");
}

if (process.argv[1]?.endsWith("set-worker-passwords.ts")) {
  main()
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(closeDb);
}
