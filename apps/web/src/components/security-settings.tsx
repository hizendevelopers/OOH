"use client";
import { useEffect, useState } from "react";

// Administrator two-factor setup. Reachable before enrollment, because it is the only way out of the setup block.
// After verification the session is ended, so the next sign-in must pass the second factor.

type Me = { id: string; role: "admin" | "worker"; mfa: { enrolled: boolean | null } };
type Phase = "loading" | "status" | "password" | "verify" | "backup";

async function call<T>(url: string, body?: unknown): Promise<{ ok: boolean; status: number; data: T | null }> {
  const response = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = (await response.json().catch(() => null)) as T | null;
  return { ok: response.ok, status: response.status, data };
}

// The setup key is the secret parameter of the otpauth URI. It is shown once, for manual entry in an authenticator app.
function secretFrom(totpURI: string) {
  try {
    return new URL(totpURI).searchParams.get("secret") ?? "";
  } catch {
    return "";
  }
}

export default function SecuritySettings() {
  const [phase, setPhase] = useState<Phase>("loading"),
    [me, setMe] = useState<Me | null>(null),
    [password, setPassword] = useState(""),
    [setupKey, setSetupKey] = useState(""),
    [backupCodes, setBackupCodes] = useState<string[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const result = await call<Me>("/api/me");
      if (!result.ok || !result.data) {
        setError("Your session could not be checked. Sign in again.");
        setPhase("status");
        return;
      }
      setMe(result.data);
      setPhase("status");
    })();
  }, []);

  async function endSessionAndSignIn() {
    await call("/api/auth/sign-out", {});
    location.assign("/sign-in?enrolled=1");
  }

  async function startEnrollment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await call<{ totpURI?: string; backupCodes?: string[]; message?: string }>(
        "/api/auth/two-factor/enable",
        { password, method: "totp" },
      );
      if (!result.ok || !result.data?.totpURI) {
        setError(result.status === 401 || result.status === 403 ? "The password is not correct." : "Set-up could not start. Try again.");
        return;
      }
      setSetupKey(secretFrom(result.data.totpURI));
      setBackupCodes(result.data.backupCodes ?? []);
      setPassword("");
      setPhase("verify");
    } catch {
      setError("Connection unavailable. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    try {
      const result = await call("/api/auth/two-factor/verify-totp", { code: form.get("code"), trustDevice: false });
      if (!result.ok) {
        setError("That code is not valid. Check the code in your authenticator app and try again.");
        return;
      }
      setPhase("backup");
    } catch {
      setError("Connection unavailable. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (phase === "loading") return <p>Checking your account…</p>;

  if (me && me.role !== "admin")
    return (
      <section className="panel">
        <h2>Two-factor authentication</h2>
        <p>Two-factor authentication is required for administrator accounts. Your account is not affected.</p>
      </section>
    );

  return (
    <section className="panel">
      <h2>Two-factor authentication</h2>
      {error && (
        <div role="alert" className="notice danger">
          {error}
        </div>
      )}
      {phase === "status" && me?.mfa.enrolled === true && (
        <>
          <p>Two-factor authentication is on for this account.</p>
          <p>Sensitive changes need a sign-in in the last 15 minutes. Sign out and sign in again to refresh it.</p>
          <button className="secondary" onClick={() => void endSessionAndSignIn()}>
            Sign out and sign in again
          </button>
        </>
      )}
      {phase === "status" && me?.mfa.enrolled !== true && (
        <>
          <p>Administrator accounts must use two-factor authentication before the workspace opens.</p>
          <button className="primary" onClick={() => setPhase("password")}>
            Set up two-factor authentication
          </button>
        </>
      )}
      {phase === "password" && (
        <form onSubmit={startEnrollment}>
          <label>
            Current password
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
            />
          </label>
          <button className="primary" disabled={busy}>
            Continue
          </button>
        </form>
      )}
      {phase === "verify" && (
        <form onSubmit={confirmCode}>
          <p>
            Add this account to an authenticator app using the setup key, then enter the six-digit code it shows.
          </p>
          <p>
            Setup key: <code data-testid="totp-secret">{setupKey}</code>
          </p>
          <label>
            Authenticator code
            <input name="code" inputMode="numeric" autoComplete="one-time-code" required minLength={6} maxLength={8} disabled={busy} />
          </label>
          <button className="primary" disabled={busy}>
            Verify
          </button>
        </form>
      )}
      {phase === "backup" && (
        <>
          <p>Save these backup codes somewhere safe. Each code works once and they are not shown again.</p>
          <ul data-testid="backup-codes">
            {backupCodes.map((code) => (
              <li key={code}>
                <code>{code}</code>
              </li>
            ))}
          </ul>
          <p>To finish, the session ends and you sign in again with your authenticator code.</p>
          <button className="primary" onClick={() => void endSessionAndSignIn()}>
            I have saved the codes. Sign in again
          </button>
        </>
      )}
    </section>
  );
}
