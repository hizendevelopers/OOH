import { describe, expect, it } from "vitest";
import { evaluateAccess, purposeForMethod, SECOND_FACTOR_WINDOW_SECONDS, type ServerActor } from "../apps/web/src/server/mfa-gate";

const now = Date.parse("2027-01-31T12:00:00.000Z");
const minutesAgo = (m: number) => now - m * 60 * 1000;
const admin = (secondFactor: ServerActor["secondFactor"] | undefined, extra: Partial<ServerActor> = {}): ServerActor => ({
  id: "admin-1",
  organizationId: "org-1",
  role: "admin",
  name: "Admin",
  email: "admin@example.invalid",
  ...(secondFactor === undefined ? {} : { secondFactor }),
  ...extra,
});
const enrolledFresh = { enrolled: true, verifiedAt: minutesAgo(600), sessionCreatedAt: minutesAgo(2) };

describe("administrator second-factor gate (fails closed)", () => {
  it("allows an enrolled administrator with a fresh second-factor session for reads and sensitive changes", () => {
    expect(evaluateAccess(admin(enrolledFresh), "ordinary", { now })).toEqual({ allowed: true });
    expect(evaluateAccess(admin(enrolledFresh), "sensitive", { now })).toEqual({ allowed: true });
  });

  it("refuses an unenrolled administrator outside setup, and allows setup only", () => {
    const unenrolled = admin({ enrolled: false, verifiedAt: null, sessionCreatedAt: minutesAgo(2) });
    expect(evaluateAccess(unenrolled, "ordinary", { now })).toMatchObject({ allowed: false, code: "MFA_SETUP_REQUIRED", status: 403 });
    expect(evaluateAccess(unenrolled, "sensitive", { now })).toMatchObject({ allowed: false, code: "MFA_SETUP_REQUIRED" });
    expect(evaluateAccess(unenrolled, "setup", { now })).toEqual({ allowed: true });
  });

  it("requires re-authentication for a sensitive change once the second-factor sign-in is older than the window", () => {
    const expired = admin({ enrolled: true, verifiedAt: minutesAgo(600), sessionCreatedAt: minutesAgo(SECOND_FACTOR_WINDOW_SECONDS / 60 + 1) });
    expect(evaluateAccess(expired, "sensitive", { now })).toMatchObject({ allowed: false, code: "MFA_REAUTH_REQUIRED" });
    // Reads are allowed for the life of the session; only changes need the recent sign-in.
    expect(evaluateAccess(expired, "ordinary", { now })).toEqual({ allowed: true });
  });

  it("refuses a session created before the authenticator was verified, even if it is recent", () => {
    const predates = admin({ enrolled: true, verifiedAt: minutesAgo(1), sessionCreatedAt: minutesAgo(5) });
    expect(evaluateAccess(predates, "ordinary", { now })).toMatchObject({ allowed: false, code: "MFA_REAUTH_REQUIRED" });
    expect(evaluateAccess(predates, "sensitive", { now })).toMatchObject({ allowed: false, code: "MFA_REAUTH_REQUIRED" });
  });

  it("fails closed when any security fact is missing or invalid", () => {
    expect(evaluateAccess(admin(undefined), "ordinary", { now })).toMatchObject({ allowed: false, code: "MFA_STATE_MISSING" });
    expect(evaluateAccess(admin({ enrolled: true, verifiedAt: null, sessionCreatedAt: minutesAgo(1) }), "ordinary", { now })).toMatchObject({ allowed: false, code: "MFA_REAUTH_REQUIRED" });
    expect(evaluateAccess(admin({ enrolled: true, verifiedAt: minutesAgo(600), sessionCreatedAt: null }), "ordinary", { now })).toMatchObject({ allowed: false, code: "MFA_REAUTH_REQUIRED" });
    expect(evaluateAccess(admin({ enrolled: true, verifiedAt: minutesAgo(600), sessionCreatedAt: Number.NaN }), "ordinary", { now })).toMatchObject({ allowed: false, code: "MFA_REAUTH_REQUIRED" });
    // A session dated in the future is not trusted.
    expect(evaluateAccess(admin({ enrolled: true, verifiedAt: minutesAgo(600), sessionCreatedAt: now + 10 * 60 * 1000 }), "ordinary", { now })).toMatchObject({ allowed: false, code: "MFA_REAUTH_REQUIRED" });
  });

  it("refuses an administrator with no organization or no identity", () => {
    expect(evaluateAccess(admin(enrolledFresh, { organizationId: "" }), "ordinary", { now })).toMatchObject({ allowed: false, code: "ORGANIZATION_MISSING" });
    expect(evaluateAccess(admin(enrolledFresh, { id: "" }), "ordinary", { now })).toMatchObject({ allowed: false, code: "ORGANIZATION_MISSING" });
  });

  it("does not apply administrator rules to workers, whose role and scope are checked where data is read", () => {
    const worker: ServerActor = { id: "w", organizationId: "org-1", role: "worker", name: "W", email: "w@example.invalid" };
    expect(evaluateAccess(worker, "sensitive", { now })).toEqual({ allowed: true });
  });

  it("allows the local open workspace only outside hosted production", () => {
    const local = admin({ localOpen: true });
    expect(evaluateAccess(local, "sensitive", { now, production: false })).toEqual({ allowed: true });
    expect(evaluateAccess(local, "sensitive", { now, production: true })).toMatchObject({ allowed: false, code: "MFA_STATE_MISSING" });
  });

  it("maps reads to the ordinary purpose and every other method to the sensitive purpose", () => {
    expect(purposeForMethod("GET")).toBe("ordinary");
    expect(purposeForMethod("HEAD")).toBe("ordinary");
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) expect(purposeForMethod(method)).toBe("sensitive");
  });
});

describe("operator command line exemption", () => {
  it("lets the audited operator script act as an administrator without a web session", () => {
    const operator: ServerActor = { id: "admin-1", organizationId: "org-1", role: "admin", name: "Admin", email: "a@example.invalid", operatorCli: true };
    expect(evaluateAccess(operator, "sensitive", { now })).toEqual({ allowed: true });
  });

  it("does not let a web actor without a second factor use the same path", () => {
    const web: ServerActor = { id: "admin-1", organizationId: "org-1", role: "admin", name: "Admin", email: "a@example.invalid" };
    expect(evaluateAccess(web, "sensitive", { now })).toMatchObject({ allowed: false, code: "MFA_STATE_MISSING" });
  });
});
