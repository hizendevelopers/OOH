import { ApiError } from "./service";
import type { Actor } from "@ibvs/domain";

// Server-side second-factor gate for administrators. Fails closed: anything missing, inconsistent or
// unverifiable is refused. Nothing here reads a client-supplied flag or claim.

// Sensitive actions need a second-factor sign-in this recent.
export const SECOND_FACTOR_WINDOW_SECONDS = 15 * 60;
const CLOCK_SKEW_MS = 60 * 1000;

// Facts the server derives from the database and the authenticated session for each request.
export type SecondFactorState =
  | {
      // The account has an enrolled, verified authenticator, and the session it belongs to.
      enrolled: boolean;
      // When the authenticator was verified (set by the database trigger in migration 012).
      verifiedAt: number | null;
      // When the authenticated session was created. A session created by a password alone, before
      // enrollment, is older than verifiedAt and is refused.
      sessionCreatedAt: number | null;
    }
  // Only the local development workspace without sign-in. Never produced in production.
  | { localOpen: true };

// operatorCli is set only by the operator scripts in scripts/ (they need direct database access and run from an
// operator's machine). Web requests never build an actor with it, so it cannot be set from a request.
export type ServerActor = Actor & { secondFactor?: SecondFactorState; operatorCli?: true };

export type AccessPurpose =
  // Enrollment and account status only. Reachable before enrollment.
  | "setup"
  // Reading administrator data.
  | "ordinary"
  // Changing data, promoting positions or approving decisions.
  | "sensitive";

export type MfaCode =
  | "MFA_SETUP_REQUIRED"
  | "MFA_REAUTH_REQUIRED"
  | "MFA_STATE_MISSING"
  | "ORGANIZATION_MISSING"
  | "ROLE_FORBIDDEN";

export class MfaError extends ApiError {
  constructor(
    status: number,
    message: string,
    public readonly code: MfaCode,
  ) {
    super(status, message);
  }
}

export type AccessDecision = { allowed: true } | { allowed: false; status: number; code: MfaCode; message: string };

export function evaluateAccess(
  actor: ServerActor,
  purpose: AccessPurpose,
  options: { now?: number; production?: boolean } = {},
): AccessDecision {
  const now = options.now ?? Date.now();
  // Hosted production is the default. The local-only exception cannot be used there.
  const production = options.production ?? (process.env.NODE_ENV === "production" && process.env.IBVS_ALLOW_LOCAL_DB !== "true");
  const deny = (status: number, code: MfaCode, message: string): AccessDecision => ({ allowed: false, status, code, message });
  if (!actor.id || !actor.organizationId)
    return deny(403, "ORGANIZATION_MISSING", "Organization authorization could not be verified. Sign in again.");
  // The operator command line has direct database access, so it is not a web session. It is audited by the script.
  if (actor.operatorCli === true && actor.role === "admin") return { allowed: true };
  // Workers are not subject to administrator second-factor rules; their role and scope are checked where the data is read.
  if (actor.role !== "admin") return { allowed: true };
  const state = actor.secondFactor;
  if (!state)
    return deny(403, "MFA_STATE_MISSING", "Security state could not be verified. Sign in again.");
  if ("localOpen" in state) {
    if (production) return deny(403, "MFA_STATE_MISSING", "Security state could not be verified. Sign in again.");
    return { allowed: true };
  }
  if (purpose === "setup") return { allowed: true };
  if (!state.enrolled)
    return deny(403, "MFA_SETUP_REQUIRED", "Set up two-factor authentication in Security settings before continuing.");
  if (state.verifiedAt === null || state.sessionCreatedAt === null)
    return deny(403, "MFA_REAUTH_REQUIRED", "Sign in again with your authenticator code.");
  if (!Number.isFinite(state.verifiedAt) || !Number.isFinite(state.sessionCreatedAt))
    return deny(403, "MFA_REAUTH_REQUIRED", "Sign in again with your authenticator code.");
  if (state.sessionCreatedAt > now + CLOCK_SKEW_MS)
    return deny(403, "MFA_REAUTH_REQUIRED", "Sign in again with your authenticator code.");
  // The session must have been created after the authenticator was verified, so it went through the second factor.
  if (state.sessionCreatedAt < state.verifiedAt)
    return deny(403, "MFA_REAUTH_REQUIRED", "Sign in again with your authenticator code.");
  if (purpose === "sensitive" && now - state.sessionCreatedAt > SECOND_FACTOR_WINDOW_SECONDS * 1000)
    return deny(403, "MFA_REAUTH_REQUIRED", "Sign in again with your authenticator code to make this change.");
  return { allowed: true };
}

// Throws an MfaError (403) unless the request is authorized for this purpose.
export function requireAccess(actor: ServerActor, purpose: AccessPurpose, options: { now?: number; production?: boolean } = {}) {
  const decision = evaluateAccess(actor, purpose, options);
  if (!decision.allowed) throw new MfaError(decision.status, decision.message, decision.code);
}

// Route policy for administrators: reads need an enrolled, verified session; any change needs a recent one.
export function purposeForMethod(method: string): AccessPurpose {
  return method.toUpperCase() === "GET" || method.toUpperCase() === "HEAD" ? "ordinary" : "sensitive";
}
