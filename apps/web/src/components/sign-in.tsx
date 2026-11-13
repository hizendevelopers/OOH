"use client";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Compass,
  ShieldCheck,
  MapPin,
  LockKeyhole,
  Languages,
} from "lucide-react";
import { localeDirection } from "@ibvs/domain";

type Step = "password" | "totp" | "backup";
type Locale = "en" | "ar";
type ErrorKey = "" | "tooMany" | "badCredentials" | "offline" | "badCode";
type NoticeKey = "" | "reauth" | "enrolled";

const words = {
  en: {
    brandSub: "IRAQ BILLBOARD VERIFICATION",
    eyebrow: "CLARITY FROM THE FIELD",
    heroLine1: "Every location.",
    heroLine2: "Every face.",
    heroLine3: "Accounted for.",
    heroText: "A shared workspace for dependable billboard operations across Iraq.",
    factLocation: "Location-aware operations",
    factHuman: "Human-led verification",
    footerStory: "Built for the realities of fieldwork.",
    cardEyebrow: "YOUR OPERATIONS WORKSPACE",
    welcome: "Welcome back",
    intro: "Sign in with your organization account.",
    email: "Email address",
    password: "Password",
    signingIn: "Signing in…",
    signIn: "Sign in",
    backupCode: "Backup code",
    authenticatorCode: "Authenticator code",
    checking: "Checking…",
    verifyAndSignIn: "Verify and sign in",
    useAuthenticator: "Use an authenticator code",
    useBackup: "Use a backup code",
    loginNote: "Accounts are provisioned by your administrator. Public registration is closed.",
    footer: "IBVS · Iraq Billboard Verification System",
    switchLanguage: "Switch language",
    otherLanguage: "العربية",
    notices: {
      reauth: "For security, sign in again with your authenticator code to continue.",
      enrolled: "Two-factor authentication is on. Sign in with your password and authenticator code.",
    },
    errors: {
      tooMany: "Too many attempts. Try again shortly.",
      badCredentials: "Unable to sign in. Check your credentials or contact your administrator.",
      offline: "Connection unavailable. Reconnect to sign in.",
      badCode: "That code is not valid. Check the code in your authenticator app and try again.",
    },
  },
  ar: {
    brandSub: "نظام التحقق من اللوحات الإعلانية في العراق",
    eyebrow: "وضوح من الميدان",
    heroLine1: "كل موقع.",
    heroLine2: "كل واجهة.",
    heroLine3: "محسوبة بدقة.",
    heroText: "مساحة عمل مشتركة لإدارة موثوقة للوحات الإعلانية في جميع أنحاء العراق.",
    factLocation: "عمليات مرتبطة بالموقع",
    factHuman: "تحقق يقوده الإنسان",
    footerStory: "صُمّم لواقع العمل الميداني.",
    cardEyebrow: "مساحة عمل العمليات",
    welcome: "مرحباً بعودتك",
    intro: "سجّل الدخول بحساب مؤسستك.",
    email: "البريد الإلكتروني",
    password: "كلمة المرور",
    signingIn: "جارٍ تسجيل الدخول…",
    signIn: "تسجيل الدخول",
    backupCode: "رمز احتياطي",
    authenticatorCode: "رمز تطبيق المصادقة",
    checking: "جارٍ التحقق…",
    verifyAndSignIn: "تحقّق وسجّل الدخول",
    useAuthenticator: "استخدم رمز تطبيق المصادقة",
    useBackup: "استخدم رمزاً احتياطياً",
    loginNote: "ينشئ المدير الحسابات. التسجيل العام مغلق.",
    footer: "IBVS · نظام التحقق من اللوحات الإعلانية في العراق",
    switchLanguage: "تغيير اللغة",
    otherLanguage: "English",
    notices: {
      reauth: "لأمان حسابك، سجّل الدخول مرة أخرى باستخدام رمز تطبيق المصادقة للمتابعة.",
      enrolled: "تم تفعيل التحقق بخطوتين. سجّل الدخول بكلمة المرور ورمز تطبيق المصادقة.",
    },
    errors: {
      tooMany: "محاولات كثيرة. حاول مرة أخرى بعد قليل.",
      badCredentials: "تعذّر تسجيل الدخول. تحقّق من بياناتك أو تواصل مع المدير.",
      offline: "الاتصال غير متاح. أعد الاتصال لتسجيل الدخول.",
      badCode: "هذا الرمز غير صالح. تحقّق من الرمز في تطبيق المصادقة وحاول مرة أخرى.",
    },
  },
} as const;

export default function SignIn() {
  const [error, setError] = useState<ErrorKey>(""),
    [busy, setBusy] = useState(false),
    // "totp" or "backup" appears only after the password is accepted for an account with two-factor sign-in.
    [step, setStep] = useState<Step>("password"),
    [notice, setNotice] = useState<NoticeKey>(""),
    // English first, so the server render and the first client render match; the saved choice is applied on mount.
    [locale, setLocale] = useState<Locale>("en");
  const t = words[locale];

  useEffect(() => {
    if (localStorage.getItem("ibvs-locale") === "ar") setLocale("ar");
    const params = new URLSearchParams(location.search);
    if (params.get("reauth") === "1") setNotice("reauth");
    if (params.get("enrolled") === "1") setNotice("enrolled");
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

  function finishSignIn() {
    localStorage.removeItem("ibvs-field-locked");
    localStorage.removeItem("ibvs-field-owner-v2");
    location.assign("/");
  }

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
        setError(response.status === 429 ? "tooMany" : "badCredentials");
        return;
      }
      const result = (await response.json().catch(() => ({}))) as { twoFactorRedirect?: boolean };
      if (result.twoFactorRedirect === true) {
        // The password was accepted. The session is created only after the authenticator code is verified.
        setStep("totp");
        return;
      }
      finishSignIn();
    } catch {
      setError("offline");
    } finally {
      setBusy(false);
    }
  }

  async function verifySecondFactor(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    try {
      const response = await fetch(
        step === "backup" ? "/api/auth/two-factor/verify-backup-code" : "/api/auth/two-factor/verify-totp",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            step === "backup"
              ? { code: form.get("code") }
              : { code: form.get("code"), trustDevice: false },
          ),
        },
      );
      if (!response.ok) {
        setError(response.status === 429 ? "tooMany" : "badCode");
        return;
      }
      finishSignIn();
    } catch {
      setError("offline");
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
            IBVS<span className="brand-sub">{t.brandSub}</span>
          </span>
        </div>
        <div>
          <span className="eyebrow">{t.eyebrow}</span>
          <h1>
            {t.heroLine1}
            <br />
            {t.heroLine2}
            <br />
            <em>{t.heroLine3}</em>
          </h1>
          <p>{t.heroText}</p>
          <div className="login-facts">
            <span>
              <MapPin size={17} /> {t.factLocation}
            </span>
            <span>
              <ShieldCheck size={17} /> {t.factHuman}
            </span>
          </div>
        </div>
        <small>{t.footerStory}</small>
      </section>
      <section className="login-panel">
        <button
          type="button"
          className="icon-button locale"
          aria-label={t.switchLanguage}
          onClick={switchLocale}
          style={{ position: "absolute", top: 24, insetInlineEnd: 24 }}
        >
          <Languages size={17} />
          <span>{t.otherLanguage}</span>
        </button>
        <div className="login-card">
          <span className="small-icon">
            <LockKeyhole />
          </span>
          <span className="eyebrow">{t.cardEyebrow}</span>
          <h2>{t.welcome}</h2>
          <p>{t.intro}</p>
          {notice && <div className="notice">{t.notices[notice]}</div>}
          {step === "password" ? (
            <form onSubmit={submit}>
              <label>
                {t.email}
                <input
                  name="email"
                  type="email"
                  autoComplete="username"
                  required
                  placeholder="you@organization.com"
                  dir="ltr"
                />
              </label>
              <label>
                {t.password}
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </label>
              {error && (
                <div role="alert" className="notice danger">
                  {t.errors[error]}
                </div>
              )}
              <button className="primary" disabled={busy}>
                {busy ? t.signingIn : t.signIn}
                <ArrowRight size={17} />
              </button>
            </form>
          ) : (
            <form onSubmit={verifySecondFactor}>
              <label>
                {step === "backup" ? t.backupCode : t.authenticatorCode}
                <input
                  name="code"
                  inputMode={step === "backup" ? "text" : "numeric"}
                  autoComplete="one-time-code"
                  required
                  minLength={6}
                  maxLength={32}
                  dir="ltr"
                />
              </label>
              {error && (
                <div role="alert" className="notice danger">
                  {t.errors[error]}
                </div>
              )}
              <button className="primary" disabled={busy}>
                {busy ? t.checking : t.verifyAndSignIn}
                <ArrowRight size={17} />
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setError("");
                  setStep(step === "backup" ? "totp" : "backup");
                }}
              >
                {step === "backup" ? t.useAuthenticator : t.useBackup}
              </button>
            </form>
          )}
          <p className="login-note">{t.loginNote}</p>
        </div>
        <small>{t.footer}</small>
      </section>
    </main>
  );
}
