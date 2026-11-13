"use client";
import { useEffect, useState } from "react";
import { Languages } from "lucide-react";
import { localeDirection } from "@ibvs/domain";

// Administrator two-factor setup. Reachable before enrollment, because it is the only way out of the setup block.
// After verification the session is ended, so the next sign-in must pass the second factor.

type Me = { id: string; role: "admin" | "worker"; mfa: { enrolled: boolean | null } };
type Phase = "loading" | "status" | "password" | "verify" | "backup";
type Locale = "en" | "ar";
type ErrorKey = "" | "sessionCheck" | "wrongPassword" | "setupFailed" | "offline" | "badCode";

const words = {
  en: {
    title: "Security",
    switchLanguage: "Switch language",
    otherLanguage: "العربية",
    checkingAccount: "Checking your account…",
    heading: "Two-factor authentication",
    notRequired: "Two-factor authentication is required for administrator accounts. Your account is not affected.",
    isOn: "Two-factor authentication is on for this account.",
    recentSignIn: "Sensitive changes need a sign-in in the last 15 minutes. Sign out and sign in again to refresh it.",
    signOutAndIn: "Sign out and sign in again",
    mustEnroll: "Administrator accounts must use two-factor authentication before the workspace opens.",
    setUp: "Set up two-factor authentication",
    currentPassword: "Current password",
    continue: "Continue",
    addAccount: "Add this account to an authenticator app using the setup key, then enter the six-digit code it shows.",
    setupKey: "Setup key:",
    authenticatorCode: "Authenticator code",
    verify: "Verify",
    saveCodes: "Save these backup codes somewhere safe. Each code works once and they are not shown again.",
    toFinish: "To finish, the session ends and you sign in again with your authenticator code.",
    savedCodes: "I have saved the codes. Sign in again",
    errors: {
      sessionCheck: "Your session could not be checked. Sign in again.",
      wrongPassword: "The password is not correct.",
      setupFailed: "Set-up could not start. Try again.",
      offline: "Connection unavailable. Try again.",
      badCode: "That code is not valid. Check the code in your authenticator app and try again.",
    },
  },
  ar: {
    title: "الأمان",
    switchLanguage: "تغيير اللغة",
    otherLanguage: "English",
    checkingAccount: "جارٍ التحقق من حسابك…",
    heading: "التحقق بخطوتين",
    notRequired: "التحقق بخطوتين مطلوب لحسابات المديرين فقط. حسابك غير متأثر.",
    isOn: "التحقق بخطوتين مفعّل لهذا الحساب.",
    recentSignIn:
      "تتطلب التغييرات الحساسة تسجيل دخول خلال آخر ١٥ دقيقة. سجّل الخروج ثم سجّل الدخول مرة أخرى لتحديثه.",
    signOutAndIn: "سجّل الخروج ثم سجّل الدخول مرة أخرى",
    mustEnroll: "يجب على حسابات المديرين استخدام التحقق بخطوتين قبل فتح مساحة العمل.",
    setUp: "إعداد التحقق بخطوتين",
    currentPassword: "كلمة المرور الحالية",
    continue: "متابعة",
    addAccount: "أضف هذا الحساب إلى تطبيق المصادقة باستخدام مفتاح الإعداد، ثم أدخل الرمز المكوّن من ستة أرقام الذي يظهر فيه.",
    setupKey: "مفتاح الإعداد:",
    authenticatorCode: "رمز تطبيق المصادقة",
    verify: "تحقّق",
    saveCodes: "احفظ هذه الرموز الاحتياطية في مكان آمن. يعمل كل رمز مرة واحدة فقط، ولن تظهر مرة أخرى.",
    toFinish: "للإنهاء، تنتهي الجلسة وتسجّل الدخول مرة أخرى باستخدام رمز تطبيق المصادقة.",
    savedCodes: "حفظت الرموز. سجّل الدخول مرة أخرى",
    errors: {
      sessionCheck: "تعذّر التحقق من جلستك. سجّل الدخول مرة أخرى.",
      wrongPassword: "كلمة المرور غير صحيحة.",
      setupFailed: "تعذّر بدء الإعداد. حاول مرة أخرى.",
      offline: "الاتصال غير متاح. حاول مرة أخرى.",
      badCode: "هذا الرمز غير صالح. تحقّق من الرمز في تطبيق المصادقة وحاول مرة أخرى.",
    },
  },
} as const;

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
    [error, setError] = useState<ErrorKey>(""),
    [busy, setBusy] = useState(false),
    // English first, so the server render and the first client render match; the saved choice is applied on mount.
    [locale, setLocale] = useState<Locale>("en");
  const t = words[locale];

  useEffect(() => {
    if (localStorage.getItem("ibvs-locale") === "ar") setLocale("ar");
    void (async () => {
      const result = await call<Me>("/api/me");
      if (!result.ok || !result.data) {
        setError("sessionCheck");
        setPhase("status");
        return;
      }
      setMe(result.data);
      setPhase("status");
    })();
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = localeDirection(locale);
  }, [locale]);

  function switchLocale() {
    const next: Locale = locale === "en" ? "ar" : "en";
    setLocale(next);
    localStorage.setItem("ibvs-locale", next);
  }

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
        setError(result.status === 401 || result.status === 403 ? "wrongPassword" : "setupFailed");
        return;
      }
      setSetupKey(secretFrom(result.data.totpURI));
      setBackupCodes(result.data.backupCodes ?? []);
      setPassword("");
      setPhase("verify");
    } catch {
      setError("offline");
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
        setError("badCode");
        return;
      }
      setPhase("backup");
    } catch {
      setError("offline");
    } finally {
      setBusy(false);
    }
  }

  const header = (
    <>
      <button
        type="button"
        className="icon-button locale"
        aria-label={t.switchLanguage}
        onClick={switchLocale}
        style={{ float: "inline-end" }}
      >
        <Languages size={17} />
        <span>{t.otherLanguage}</span>
      </button>
      <h1>{t.title}</h1>
    </>
  );

  if (phase === "loading")
    return (
      <>
        {header}
        <p>{t.checkingAccount}</p>
      </>
    );

  if (me && me.role !== "admin")
    return (
      <>
        {header}
        <section className="panel">
          <h2>{t.heading}</h2>
          <p>{t.notRequired}</p>
        </section>
      </>
    );

  return (
    <>
      {header}
      <section className="panel">
        <h2>{t.heading}</h2>
        {error && (
          <div role="alert" className="notice danger">
            {t.errors[error]}
          </div>
        )}
        {phase === "status" && me?.mfa.enrolled === true && (
          <>
            <p>{t.isOn}</p>
            <p>{t.recentSignIn}</p>
            <button className="secondary" onClick={() => void endSessionAndSignIn()}>
              {t.signOutAndIn}
            </button>
          </>
        )}
        {phase === "status" && me?.mfa.enrolled !== true && (
          <>
            <p>{t.mustEnroll}</p>
            <button className="primary" onClick={() => setPhase("password")}>
              {t.setUp}
            </button>
          </>
        )}
        {phase === "password" && (
          <form onSubmit={startEnrollment}>
            <label>
              {t.currentPassword}
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
              {t.continue}
            </button>
          </form>
        )}
        {phase === "verify" && (
          <form onSubmit={confirmCode}>
            <p>{t.addAccount}</p>
            <p>
              {t.setupKey}{" "}
              <code data-testid="totp-secret" dir="ltr">
                {setupKey}
              </code>
            </p>
            <label>
              {t.authenticatorCode}
              <input
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                minLength={6}
                maxLength={8}
                disabled={busy}
                dir="ltr"
              />
            </label>
            <button className="primary" disabled={busy}>
              {t.verify}
            </button>
          </form>
        )}
        {phase === "backup" && (
          <>
            <p>{t.saveCodes}</p>
            <ul data-testid="backup-codes" dir="ltr">
              {backupCodes.map((code) => (
                <li key={code}>
                  <code>{code}</code>
                </li>
              ))}
            </ul>
            <p>{t.toFinish}</p>
            <button className="primary" onClick={() => void endSessionAndSignIn()}>
              {t.savedCodes}
            </button>
          </>
        )}
      </section>
    </>
  );
}
