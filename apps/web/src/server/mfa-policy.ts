// Pure decisions for administrator two-factor authentication. Kept separate so the rules
// can be tested exhaustively without a running server.

// A sensitive change needs a sign-in (and its second factor) this recent.
export const RECENT_SECOND_FACTOR_SECONDS = 15 * 60;

export type MfaInput = {
  // Set IBVS_REQUIRE_ADMIN_MFA=true only after every administrator has enrolled.
  enforced: boolean;
  role: "admin" | "worker";
  enrolled: boolean;
  // Undefined when there is no session to measure, such as a local development workspace.
  sessionAgeSeconds?: number;
};

export type MfaDecision =
  | { allowed: true }
  | { allowed: false; code: "MFA_SETUP_REQUIRED" | "MFA_REAUTH_REQUIRED"; message: string };

// Access to ordinary administrator screens. Workers are never affected by this policy.
export function mayUseWorkspace(input: MfaInput, allowWithoutEnrollment = false): MfaDecision {
  if (input.role !== "admin" || !input.enforced || input.enrolled || allowWithoutEnrollment)
    return { allowed: true };
  return {
    allowed: false,
    code: "MFA_SETUP_REQUIRED",
    message: "Set up two-factor authentication in Security settings before continuing.",
  };
}

// Sensitive actions (decisions, references, assignments, worker accounts, corrections).
// Once an administrator is enrolled, the sign-in must be recent, so an unattended browser
// cannot be used for approvals. Before enrollment the rollout setting governs access.
export function mayPerformSensitiveAction(input: MfaInput): MfaDecision {
  if (input.role !== "admin") return { allowed: true };
  if (!input.enrolled) return mayUseWorkspace(input);
  if (input.sessionAgeSeconds === undefined || input.sessionAgeSeconds <= RECENT_SECOND_FACTOR_SECONDS)
    return { allowed: true };
  return {
    allowed: false,
    code: "MFA_REAUTH_REQUIRED",
    message: "Sign in again with your authenticator code to make this change.",
  };
}
