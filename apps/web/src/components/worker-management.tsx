"use client";
import { useState } from "react";

type Worker = { id: string; name: string; email: string };
export function WorkerManagement({
  workers,
  locale,
  enabled,
  onCreated,
}: {
  workers: Worker[];
  locale: "en" | "ar";
  enabled: boolean;
  onCreated: (worker: Worker) => void;
}) {
  const ar = locale === "ar";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/workers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.get("name"),
          email: data.get("email"),
          password: data.get("password"),
        }),
      });
      if (response.status === 401) {
        location.assign("/sign-in");
        return;
      }
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Unable to create worker");
      onCreated(result);
      form.reset();
      setSuccess(
        ar
          ? "تم إنشاء حساب الموظف. يمكنك تكليفه بالزيارات الآن."
          : "Worker account created. You can assign visits to this worker now.",
      );
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="workers-layout">
      <section className="panel worker-create">
        <h2>{ar ? "إضافة موظف" : "Add worker"}</h2>
        <p className="muted">
          {ar
            ? "أنشئ حساباً ثم أرسل بيانات الدخول للموظف."
            : "Create an account, then share the email and password with your worker."}
        </p>
        {!enabled && (
          <p role="alert">
            {ar
              ? "فعّل تسجيل الدخول لإنشاء حسابات الموظفين."
              : "Enable sign-in before creating worker accounts."}
          </p>
        )}
        <form onSubmit={submit}>
          <fieldset disabled={!enabled || busy}>
            <label>
              {ar ? "اسم الموظف" : "Worker name"}
              <input name="name" autoComplete="off" required maxLength={120} />
            </label>
            <label>
              {ar ? "بريد الموظف الإلكتروني" : "Worker email"}
              <input
                name="email"
                type="email"
                autoComplete="off"
                required
                maxLength={254}
              />
            </label>
            <label>
              {ar ? "كلمة مرور الموظف" : "Worker password"}
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
                aria-describedby="worker-password-help"
              />
            </label>
            <p id="worker-password-help" className="muted">
              {ar
                ? "استخدم ١٢ حرفاً على الأقل. لا يتم إرسال البريد تلقائياً."
                : "Use at least 12 characters. No email is sent automatically."}
            </p>
            <button className="primary" type="submit">
              {busy
                ? ar
                  ? "جارٍ الإنشاء…"
                  : "Creating…"
                : ar
                  ? "إنشاء حساب الموظف"
                  : "Create worker"}
            </button>
          </fieldset>
        </form>
        {error && (
          <p className="notice danger" role="alert">
            {error}
          </p>
        )}
        {success && (
          <p className="notice" role="status">
            {success}
          </p>
        )}
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>
            {ar ? "الموظفون" : "Worker profiles"} ({workers.length})
          </h2>
        </div>
        {workers.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{ar ? "الاسم" : "Name"}</th>
                  <th>{ar ? "البريد الإلكتروني" : "Email"}</th>
                </tr>
              </thead>
              <tbody>
                {workers.map((worker) => (
                  <tr key={worker.id}>
                    <td>{worker.name}</td>
                    <td>
                      <bdi>{worker.email}</bdi>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted worker-empty">
            {ar
              ? "لا يوجد موظفون بعد. أضف أول موظف للبدء."
              : "No workers yet. Add your first worker to begin assigning visits."}
          </p>
        )}
      </section>
    </div>
  );
}
