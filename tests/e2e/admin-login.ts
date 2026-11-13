import { createHmac } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, type Page } from "@playwright/test";

// Signs in the demo administrator through the real two-factor flow. The first sign-in in a run enrolls the account
// through the Security page and stores the setup key in test-results/ (git-ignored, regenerated each run).
// Later sign-ins compute the current authenticator code from that key. Nothing here weakens the server checks.
const defaultAdmin = "admin@demo.ibvs.test";
// One setup key per administrator account, kept with the run output.
const secretFileFor = (email: string) => path.join(process.cwd(), "test-results", `e2e-totp-${email.replace(/[^a-z0-9]/gi, "_")}.json`);

function base32Decode(input: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of input.replace(/=+$/, "").toUpperCase()) {
    const index = alphabet.indexOf(char);
    if (index < 0) continue;
    value = ((value << 5) | index) & 0xffffff;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

// RFC 6238 with the authenticator defaults: SHA-1, 6 digits, 30-second step.
export function totpAt(secret: string, timeMs: number) {
  const counter = Math.floor(timeMs / 1000 / 30);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", base32Decode(secret)).update(buffer).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const code =
    ((digest[offset]! & 0x7f) << 24) |
    (digest[offset + 1]! << 16) |
    (digest[offset + 2]! << 8) |
    digest[offset + 3]!;
  return String(code % 1_000_000).padStart(6, "0");
}

async function savedSecret(email: string) {
  try {
    return JSON.parse(await readFile(secretFileFor(email), "utf8")).secret as string;
  } catch {
    throw new Error("The administrator's authenticator setup key is missing from this run. Run the browser suite from the start.");
  }
}

async function enterPassword(page: Page, email: string, password: string) {
  // The sign-in limiter is real and shared by the whole suite. Honour Retry-After instead of disabling it.
  for (let attempt = 0; attempt < 4; attempt++) {
    await page.goto("/sign-in");
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    const response = page.waitForResponse((r) => r.url().endsWith("/api/auth/sign-in/email"));
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    const result = await response;
    if (result.status() === 429 && attempt < 3) {
      const seconds = Math.min(60, Math.max(1, Number(result.headers()["retry-after"]) || 60));
      await page.waitForTimeout((seconds + 1) * 1000);
      continue;
    }
    expect(result.status()).toBe(200);
    return (await result.json().catch(() => ({}))) as { twoFactorRedirect?: boolean };
  }
  throw new Error("Sign-in was refused repeatedly by the rate limiter");
}

async function completeAuthenticatorStep(page: Page, secret: string) {
  // The code check has a real rate limit shared by the whole suite, and a code can be refused near a 30-second
  // boundary. Read the server's answer: after a 429 wait as long as it asks, after a refused code use the next
  // window's code, then try again. The server checks are unchanged.
  for (let attempt = 0; attempt < 4; attempt++) {
    await page.getByLabel("Authenticator code").fill(totpAt(secret, Date.now()));
    const response = page.waitForResponse((r) => r.url().endsWith("/api/auth/two-factor/verify-totp"));
    await page.getByRole("button", { name: "Verify and sign in", exact: true }).click();
    const result = await response;
    if (result.ok()) break;
    if (attempt === 3) throw new Error(`Authenticator code refused (${result.status()}) after ${attempt + 1} attempts`);
    if (result.status() === 429) {
      const seconds = Math.min(60, Math.max(1, Number(result.headers()["retry-after"]) || 60));
      await page.waitForTimeout((seconds + 1) * 1000);
    } else {
      await page.waitForTimeout(30000 - (Date.now() % 30000) + 1000);
    }
  }
  await page.waitForURL((url) => url.pathname === "/", { timeout: 30000 });
}

export async function loginAdmin(page: Page, email: string = defaultAdmin) {
  const password = process.env.IBVS_DEMO_PASSWORD;
  if (!password) throw new Error("IBVS_DEMO_PASSWORD is required for the browser suite");
  const first = await enterPassword(page, email, password);
  if (first.twoFactorRedirect === true) {
    await completeAuthenticatorStep(page, await savedSecret(email));
    return;
  }
  // Not yet enrolled: the workspace sends the administrator to Security. Enroll, then sign in again with the code.
  await page.waitForURL(/\/security$/, { timeout: 30000 });
  await page.getByRole("button", { name: "Set up two-factor authentication", exact: true }).click();
  await page.getByLabel("Current password").fill(password);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const secret = (await page.getByTestId("totp-secret").textContent())?.trim() ?? "";
  expect(secret.length).toBeGreaterThan(10);
  await mkdir(path.dirname(secretFileFor(email)), { recursive: true });
  await writeFile(secretFileFor(email), JSON.stringify({ secret }), { mode: 0o600 });
  await page.getByLabel("Authenticator code").fill(totpAt(secret, Date.now()));
  await page.getByRole("button", { name: "Verify", exact: true }).click();
  await expect(page.getByTestId("backup-codes")).toBeVisible();
  await page.getByRole("button", { name: "I have saved the codes. Sign in again", exact: true }).click();
  await page.waitForURL(/\/sign-in\?enrolled=1$/, { timeout: 30000 });
  // A code from the same 30-second window as enrollment may be refused, so wait for the next window.
  const untilNext = 30000 - (Date.now() % 30000) + 1000;
  await page.waitForTimeout(untilNext);
  const second = await enterPassword(page, email, password);
  expect(second.twoFactorRedirect).toBe(true);
  await completeAuthenticatorStep(page, secret);
}
