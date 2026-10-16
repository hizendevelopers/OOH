"use client";
import { useState } from "react";
import {
  ArrowRight,
  Compass,
  ShieldCheck,
  MapPin,
  LockKeyhole,
} from "lucide-react";
export default function SignIn() {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    try {
      const response = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
        }),
      });
      if (!response.ok) {
        setError(
          response.status === 429
            ? "Too many attempts. Try again shortly."
            : "Unable to sign in. Check your credentials or contact your administrator.",
        );
        return;
      }
      localStorage.removeItem("ibvs-field-locked");
      localStorage.removeItem("ibvs-field-owner-v2");
      location.assign("/");
    } catch {
      setError("Connection unavailable. Reconnect to sign in.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login">
      <section className="login-story">
        <div className="brand">
          <span className="brand-icon">
            <Compass />
          </span>
          <span>
            IBVS<span className="brand-sub">IRAQ BILLBOARD VERIFICATION</span>
          </span>
        </div>
        <div>
          <span className="eyebrow">CLARITY FROM THE FIELD</span>
          <h1>
            Every location.
            <br />
            Every face.
            <br />
            <em>Accounted for.</em>
          </h1>
          <p>
            A shared workspace for dependable billboard operations across Iraq.
          </p>
          <div className="login-facts">
            <span>
              <MapPin size={17} /> Location-aware operations
            </span>
            <span>
              <ShieldCheck size={17} /> Human-led verification
            </span>
          </div>
        </div>
        <small>Built for the realities of fieldwork.</small>
      </section>
      <section className="login-panel">
        <div className="login-card">
          <span className="small-icon">
            <LockKeyhole />
          </span>
          <span className="eyebrow">YOUR OPERATIONS WORKSPACE</span>
          <h2>Welcome back</h2>
          <p>Sign in with your organization account.</p>
          <form onSubmit={submit}>
            <label>
              Email address
              <input
                name="email"
                type="email"
                autoComplete="username"
                required
                placeholder="you@organization.com"
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </label>
            {error && (
              <div role="alert" className="notice danger">
                {error}
              </div>
            )}
            <button className="primary" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
              <ArrowRight size={17} />
            </button>
          </form>
          <p className="login-note">
            Accounts are provisioned by your administrator. Public registration
            is closed.
          </p>
        </div>
        <small>IBVS · Iraq Billboard Verification System</small>
      </section>
    </main>
  );
}
