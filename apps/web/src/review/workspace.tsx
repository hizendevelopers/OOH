"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft,
  ShieldCheck,
  Languages,
  Moon,
  Sun,
  RefreshCw,
  Search,
  Check,
  AlertTriangle,
  X,
  Maximize2,
} from "lucide-react";
import type { Actor } from "@ibvs/domain";
import type { QueueItem, ReviewDetail } from "@/server/review";
import {
  ruleLabels,
  type RiskReport,
} from "../../../../packages/domain/src/risk";
import EvidenceMap from "./map";

async function api<T>(path: string, data?: unknown): Promise<T> {
  const r = await fetch("/api/reviews" + path, {
    method: data ? "POST" : "GET",
    headers: data ? { "Content-Type": "application/json" } : undefined,
    body: data ? JSON.stringify(data) : undefined,
    cache: "no-store",
  });
  const value = await r.json();
  if (!r.ok) throw new Error(value.error || "Review service unavailable");
  return value;
}
const states: Record<string, [string, string]> = {
  pending: ["Pending review", "بانتظار المراجعة"],
  ambiguous: ["Ambiguous · further review", "ملتبس · يحتاج مراجعة إضافية"],
  approved: ["Approved inspection", "معاينة معتمدة"],
  rejected: ["Rejected", "مرفوض"],
  resurvey_requested: ["Resurvey requested", "إعادة معاينة مطلوبة"],
  unknown: ["Unassessed", "غير محلل"],
  info: ["Information", "معلومات"],
  low: ["Low", "منخفض"],
  medium: ["Medium", "متوسط"],
  high: ["High", "مرتفع"],
  critical: ["Critical", "حرج"],
};
export default function ReviewWorkspace({ actor }: { actor: Actor }) {
  const [locale, setLocale] = useState<"en" | "ar">("en"),
    [dark, setDark] = useState(false),
    [queue, setQueue] = useState<QueueItem[]>([]),
    [nextCursor, setNextCursor] = useState<string | null>(null),
    [selected, setSelected] = useState<string | null>(null),
    [detail, setDetail] = useState<ReviewDetail | null>(null),
    [filters, setFilters] = useState({
      state: "pending",
      worker: "",
      city: "",
      date: "",
      billboard: "",
      risk: "",
      evidence: "",
    }),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [tab, setTab] = useState("evidence"),
    [zoom, setZoom] = useState<"front" | "wide">("front"),
    [action, setAction] = useState("approve"),
    [reason, setReason] = useState(""),
    [identity, setIdentity] = useState(false),
    [ack, setAck] = useState(false),
    [instructions, setInstructions] = useState(""),
    [dueDate, setDueDate] = useState(""),
    [baselineOpen, setBaselineOpen] = useState(false),
    [photoErrors, setPhotoErrors] = useState<string[]>([]),
    [photoRetry, setPhotoRetry] = useState(0);
  const [historicReport, setHistoricReport] = useState<RiskReport | null>(null);
  const dialog = useRef<HTMLDialogElement>(null),
    decisionForm = useRef<HTMLFormElement>(null),
    request = useRef(0),
    queueRequest = useRef(0),
    mutationLocked = useRef(false),
    operation = useRef<{ key: string; id: string } | null>(null);
  const ar = locale === "ar",
    t = (en: string, arabic: string) => (ar ? arabic : en),
    label = (state: string) => states[state]?.[ar ? 1 : 0] || state;
  useEffect(() => {
    setLocale(localStorage.getItem("ibvs-locale") === "ar" ? "ar" : "en");
    setDark(localStorage.getItem("ibvs-theme") === "dark");
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = ar ? "rtl" : "ltr";
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [locale, dark, ar]);
  const loadQueue = useCallback(
    async (cursor?: string) => {
      const token = ++queueRequest.current;
      setLoading(true);
      try {
        const query = new URLSearchParams({
          ...filters,
          paged: "true",
          pageSize: "50",
        });
        if (cursor) query.set("cursor", cursor);
        const page = await api<{
          items: QueueItem[];
          nextCursor: string | null;
        }>("?" + query);
        if (token === queueRequest.current) {
          setQueue((previous) =>
            cursor
              ? [
                  ...previous,
                  ...page.items.filter(
                    (row) => !previous.some((old) => old.id === row.id),
                  ),
                ]
              : page.items,
          );
          setNextCursor(page.nextCursor);
        }
      } catch (e) {
        if (token === queueRequest.current) setError((e as Error).message);
      } finally {
        if (token === queueRequest.current) setLoading(false);
      }
    },
    [filters],
  );
  useEffect(() => {
    // Invalidate an in-flight page immediately, before the filter debounce.
    queueRequest.current++;
    setNextCursor(null);
    setLoading(true);
    const timer = setTimeout(() => void loadQueue(), 200);
    return () => {
      clearTimeout(timer);
    };
  }, [loadQueue]);
  const open = useCallback(async (id: string) => {
    if (mutationLocked.current) return;
    const token = ++request.current;
    setSelected(id);
    setDetail(null);
    setError("");
    setNotice("");
    setIdentity(false);
    setAck(false);
    setReason("");
    setInstructions("");
    setDueDate("");
    setAction("approve");
    setBaselineOpen(false);
    setPhotoErrors([]);
    setHistoricReport(null);
    try {
      const d = await api<ReviewDetail>("/" + id);
      if (token === request.current) setDetail(d);
    } catch (e) {
      if (token === request.current) setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (mutationLocked.current) return;
      if (
        e.target instanceof HTMLElement &&
        (e.target.closest("input,textarea,select,button,[contenteditable]") ||
          dialog.current?.open)
      )
        return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const actions: Record<string, string> = {
        a: "approve",
        r: "reject",
        s: "resurvey",
        m: "ambiguous",
      };
      if (actions[e.key.toLowerCase()]) {
        e.preventDefault();
        setAction(actions[e.key.toLowerCase()]);
        decisionForm.current?.scrollIntoView({
          block: "center",
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "instant"
            : "smooth",
        });
      }
      if (["j", "k"].includes(e.key) && queue.length) {
        e.preventDefault();
        const n = queue.findIndex((q) => q.id === selected);
        void open(
          queue[
            Math.max(
              0,
              Math.min(queue.length - 1, n + (e.key === "j" ? 1 : -1)),
            )
          ].id,
        );
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [queue, selected, open]);
  async function mutate(path: string, payload: Record<string, unknown>) {
    // React state updates are asynchronous: guard duplicate keyboard events now.
    if (mutationLocked.current) return false;
    mutationLocked.current = true;
    const selectedRequest = request.current;
    const key = JSON.stringify({ path, payload });
    if (operation.current?.key !== key)
      operation.current = { key, id: crypto.randomUUID() };
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(path, { ...payload, operationId: operation.current.id });
      operation.current = null;
      if (selected) {
        const d = await api<ReviewDetail>("/" + selected);
        if (selectedRequest === request.current) setDetail(d);
      }
      await loadQueue();
      if (selectedRequest !== request.current) return false;
      setNotice(
        t(
          "Saved on server. Audit history preserved.",
          "تم الحفظ على الخادم مع حفظ سجل التدقيق.",
        ),
      );
      return true;
    } catch (e) {
      if (selectedRequest === request.current) setError((e as Error).message);
      return false;
    } finally {
      mutationLocked.current = false;
      setBusy(false);
    }
  }
  const time = (date: string | Date) =>
    new Date(date).toLocaleString(ar ? "ar-IQ" : "en-GB");
  const filterLabels: Record<string, string> = {
    state: t("Status", "الحالة"),
    worker: t("Worker ID", "معرّف العامل"),
    city: t("City", "المدينة"),
    date: t("Received date", "تاريخ الاستلام"),
    billboard: t("Billboard", "اللوحة"),
    risk: t("Risk", "المخاطر"),
    evidence: t("Capture class", "نوع الالتقاط"),
  };
  return (
    <div className="review-app">
      <a className="skip-link" href="#review-main">
        {t("Skip to review", "انتقل إلى المراجعة")}
      </a>
      <header className="review-header">
        <Link href="/" className="brand">
          <span className="brand-icon">
            <ShieldCheck size={24} />
          </span>
          <span>
            IBVS
            <small className="brand-sub">
              {t("VERIFICATION CENTER", "مركز التحقق")}
            </small>
          </span>
        </Link>
        <div className="top-actions">
          <Link href="/" className="secondary">
            <ArrowLeft size={16} />
            {t("Workspace", "مساحة العمل")}
          </Link>
          <button
            className="icon-button"
            aria-label="Switch language"
            onClick={() => {
              const l = ar ? "en" : "ar";
              setLocale(l);
              localStorage.setItem("ibvs-locale", l);
            }}
          >
            <Languages size={19} />
            <span>{ar ? "English" : "العربية"}</span>
          </button>
          <button
            className="icon-button"
            aria-label="Toggle theme"
            onClick={() => {
              setDark(!dark);
              localStorage.setItem("ibvs-theme", dark ? "light" : "dark");
            }}
          >
            {dark ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          <span className="avatar small" title={actor.name}>
            {actor.name[0]}
          </span>
        </div>
      </header>
      <main id="review-main" className="review-main">
        <div className="review-title">
          <div>
            <p className="eyebrow">
              {t("HUMAN VERIFICATION", "التحقق البشري")}
            </p>
            <h1>
              {t("Evidence, in perspective.", "الأدلة، في سياقها الصحيح.")}
            </h1>
            <p>
              {t(
                "Confirm the exact billboard face. Investigate signals with context.",
                "تحقق من وجه اللوحة المحدد. راجع المؤشرات في سياقها.",
              )}
            </p>
          </div>
          <button
            className="secondary"
            disabled={busy || loading}
            onClick={() => void loadQueue()}
          >
            <RefreshCw size={16} />
            {t("Refresh queue", "تحديث القائمة")}
          </button>
        </div>
        <form
          className="review-filters panel"
          onSubmit={(e) => {
            e.preventDefault();
            void loadQueue();
          }}
        >
          {Object.entries(filters).map(([key, value]) => (
            <label key={key}>
              {
                (
                  {
                    state: t("Status", "الحالة"),
                    worker: t("Worker ID", "معرّف العامل"),
                    city: t("City", "المدينة"),
                    date: t("Received date", "تاريخ الاستلام"),
                    billboard: t("Billboard", "اللوحة"),
                    risk: t("Risk", "المخاطر"),
                    evidence: t("Capture class", "نوع الالتقاط"),
                  } as Record<string, string>
                )[key]
              }
              {["state", "risk", "evidence"].includes(key) ? (
                <select
                  disabled={busy}
                  aria-label={filterLabels[key]}
                  value={value}
                  onChange={(e) =>
                    setFilters({ ...filters, [key]: e.target.value })
                  }
                >
                  <option value="">{t("All", "الكل")}</option>
                  {(key === "state"
                    ? [
                        "pending",
                        "ambiguous",
                        "approved",
                        "rejected",
                        "resurvey_requested",
                      ]
                    : key === "risk"
                      ? ["unknown", "info", "low", "medium", "high", "critical"]
                      : ["online", "offline"]
                  ).map((v) => (
                    <option key={v} value={v}>
                      {key === "evidence"
                        ? v === "offline"
                          ? t("Includes offline", "يتضمن التقاطاً دون اتصال")
                          : t("Online claimed", "التقاط متصل مُدّعى")
                        : label(v)}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  disabled={busy}
                  type={key === "date" ? "date" : "search"}
                  value={value}
                  onChange={(e) =>
                    setFilters({ ...filters, [key]: e.target.value })
                  }
                />
              )}
            </label>
          ))}
          <button
            className="icon-button"
            disabled={busy || loading}
            aria-label={t("Apply filters", "تطبيق المرشحات")}
          >
            <Search size={20} />
          </button>
        </form>
        {error && (
          <div className="review-alert error" role="alert">
            {ar
              ? (
                  {
                    "Another supervisor must provide the next approval":
                      "يجب أن يقدم مشرف آخر الموافقة التالية.",
                    "Evidence assessment changed. Refresh review.":
                      "تغير تقييم الأدلة. حدّث المراجعة قبل القرار.",
                    "Review changed. Refresh before deciding.":
                      "تغيرت المراجعة. حدّثها قبل اتخاذ القرار.",
                    "Integrity failure requires resurvey":
                      "فشل التحقق من السلامة. يلزم طلب إعادة معاينة.",
                    "Withdraw the active reference before changing its review outcome":
                      "اسحب المرجع الفعال قبل تغيير قرار المراجعة.",
                    "Fresh supervisor approvals required for this assessment":
                      "يتطلب هذا التقييم موافقات جديدة من المشرفين.",
                    "Inspection already approved": "المعاينة معتمدة بالفعل.",
                    "Review the linked resurvey task":
                      "راجع مهمة إعادة المعاينة المرتبطة.",
                    "Invalid review request":
                      "طلب المراجعة غير صالح. تحقق من الحقول المطلوبة.",
                  } as Record<string, string>
                )[error] ||
                "تعذر إكمال العملية. تحقق من سجل القرارات، ثم حدّث المراجعة وأعد المحاولة."
              : error}{" "}
            {ar && (
              <details>
                <summary>تفاصيل الخدمة</summary>
                <bdi>{error}</bdi>
              </details>
            )}
            <button
              className="secondary"
              onClick={() => {
                setError("");
                if (selected) void open(selected);
                else void loadQueue();
              }}
            >
              {t("Refresh and recover", "تحديث واستعادة")}
            </button>
          </div>
        )}
        {notice && (
          <div className="review-alert" role="status">
            <Check size={18} />
            {t(
              "Saved on server. Audit history preserved.",
              "تم الحفظ على الخادم مع حفظ سجل التدقيق.",
            )}
          </div>
        )}
        <fieldset
          className="review-layout"
          disabled={busy}
          style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
        >
          <aside
            className="review-queue panel"
            aria-label={t("Inspection queue", "قائمة المعاينات")}
          >
            <div className="review-section-head">
              <h2>{t("Inspection queue", "قائمة المعاينات")}</h2>
              <span className="badge">
                {queue.length}
                {nextCursor ? "+" : ""}
              </span>
            </div>
            {loading && (
              <p role="status">{t("Loading queue…", "جارٍ تحميل القائمة…")}</p>
            )}
            {!loading && !queue.length && (
              <div className="review-empty">
                <ShieldCheck size={30} />
                <p>
                  {t(
                    "No inspections match these filters.",
                    "لا توجد معاينات تطابق المرشحات.",
                  )}
                </p>
              </div>
            )}
            {queue.map((q) => (
              <button
                className={`review-queue-item ${selected === q.id ? "selected" : ""}`}
                key={q.id}
                disabled={loading}
                onClick={() => void open(q.id)}
                aria-pressed={selected === q.id}
              >
                <span className="review-row">
                  <strong>
                    <bdi>{q.code}</bdi>
                  </strong>
                  <span className={`risk-pill risk-${q.risk_level}`}>
                    {label(q.risk_level)}
                  </span>
                </span>
                <span>
                  {q.worker_name} · {q.city}
                </span>
                <span className="review-row">
                  <small>{time(q.received_at)}</small>
                  <small>{label(q.state)}</small>
                </span>
              </button>
            ))}
            {nextCursor && (
              <button
                className="secondary"
                disabled={busy || loading}
                onClick={() => void loadQueue(nextCursor)}
              >
                {loading
                  ? t("Loading…", "جارٍ التحميل…")
                  : t("Load more inspections", "تحميل المزيد من المعاينات")}
              </button>
            )}
            <p className="review-footnote">
              {t(
                "J / K navigate · A / R / S / M select action",
                "J / K للتنقل · A / R / S / M لاختيار القرار",
              )}
            </p>
          </aside>
          <section
            className="review-content"
            aria-label={t("Inspection review", "مراجعة المعاينة")}
          >
            {!detail ? (
              <div className="panel review-empty">
                <ShieldCheck size={44} />
                <h2>
                  {selected
                    ? t("Loading evidence…", "جارٍ تحميل الأدلة…")
                    : t("Select an inspection", "اختر معاينة")}
                </h2>
                <p>
                  {t(
                    "Evidence remains provisional until reviewed. References require explicit enrollment.",
                    "تبقى الأدلة مؤقتة حتى المراجعة. اعتماد المراجع إجراء منفصل وصريح.",
                  )}
                </p>
              </div>
            ) : (
              <>
                <div className="panel review-summary">
                  <div>
                    <span className="eyebrow">
                      {detail.inspection.city} /{" "}
                      <bdi>{detail.inspection.structure_code}</bdi>
                    </span>
                    <h2>
                      <bdi>{detail.inspection.code}</bdi>{" "}
                      {detail.inspection.is_test && (
                        <span className="badge">
                          {t("Test location", "موقع تجريبي")}
                        </span>
                      )}
                      <span className="badge">
                        {label(detail.review.state)}
                      </span>
                    </h2>
                    <p>
                      {detail.inspection.worker_name} ·{" "}
                      {t("Received", "استُلمت")}{" "}
                      {time(detail.inspection.received_at)}
                    </p>
                  </div>
                  <div
                    className={`risk-pill risk-${detail.report?.level || "unknown"}`}
                  >
                    {label(detail.report?.level || "unknown")}
                  </div>
                </div>
                {detail.inspection.parent_inspection_id && (
                  <p className="review-alert">
                    {t("Linked resurvey of", "إعادة معاينة مرتبطة بـ")}{" "}
                    <button
                      className="secondary"
                      onClick={() =>
                        void open(detail.inspection.parent_inspection_id!)
                      }
                    >
                      {detail.inspection.parent_inspection_id}
                    </button>
                  </p>
                )}
                <div
                  className="review-tabs"
                  role="tablist"
                  aria-label={t("Review sections", "أقسام المراجعة")}
                  onKeyDown={(e) => {
                    if (
                      !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                        e.key,
                      )
                    )
                      return;
                    const items = Array.from(
                      e.currentTarget.querySelectorAll<HTMLButtonElement>(
                        "[role=tab]",
                      ),
                    );
                    const n = items.indexOf(
                      document.activeElement as HTMLButtonElement,
                    );
                    const next =
                      e.key === "Home"
                        ? 0
                        : e.key === "End"
                          ? items.length - 1
                          : (n +
                              ((e.key === "ArrowRight") !== ar ? 1 : -1) +
                              items.length) %
                            items.length;
                    e.preventDefault();
                    items[next].focus();
                    items[next].click();
                  }}
                >
                  {[
                    ["evidence", "Evidence", "الأدلة"],
                    ["risk", "Risk analysis", "تحليل المخاطر"],
                    ["history", "Audit & sync", "التدقيق والمزامنة"],
                    ["references", "References", "المراجع"],
                  ].map(([id, en, arabic]) => (
                    <button
                      id={"tab-" + id}
                      role="tab"
                      tabIndex={tab === id ? 0 : -1}
                      aria-selected={tab === id}
                      aria-controls={"panel-" + id}
                      key={id}
                      onClick={() => setTab(id)}
                    >
                      {t(en, arabic)}
                    </button>
                  ))}
                </div>
                <div
                  role="tabpanel"
                  id={"panel-" + tab}
                  aria-labelledby={"tab-" + tab}
                >
                  {tab === "evidence" && (
                    <>
                      <div className="review-photos">
                        {(["front", "wide"] as const).map((kind) => {
                          const photo = detail.inspection.metadata.photos.find(
                            (p) => p.kind === kind,
                          );
                          return (
                            <figure className="panel" key={kind}>
                              <button
                                className="review-photo"
                                aria-label={
                                  kind === "front"
                                    ? t(
                                        "Enlarge front photograph",
                                        "تكبير الصورة الأمامية",
                                      )
                                    : t(
                                        "Enlarge wide photograph",
                                        "تكبير صورة السياق",
                                      )
                                }
                                onClick={() => {
                                  setZoom(kind);
                                  dialog.current?.showModal();
                                }}
                              >
                                <Image
                                  src={`/api/inspections/${detail.inspection.id}/media/${kind}?retry=${photoRetry}`}
                                  onError={() =>
                                    setPhotoErrors((previous) =>
                                      previous.includes(kind)
                                        ? previous
                                        : [...previous, kind],
                                    )
                                  }
                                  alt={
                                    kind === "front"
                                      ? t(
                                          "Front evidence photograph",
                                          "صورة الدليل الأمامية",
                                        )
                                      : t(
                                          "Wide context evidence photograph",
                                          "صورة دليل السياق الواسع",
                                        )
                                  }
                                  width={1200}
                                  height={900}
                                  unoptimized
                                />
                                <span>
                                  <Maximize2 size={16} />
                                </span>
                              </button>
                              <figcaption>
                                {photoErrors.includes(kind) && (
                                  <div role="alert">
                                    <p>
                                      {t(
                                        "Photo could not be loaded. Refresh your session if access expired.",
                                        "تعذر تحميل الصورة. حدّث جلسة الدخول إذا انتهت صلاحيتها.",
                                      )}
                                    </p>
                                    <button
                                      className="secondary"
                                      onClick={() => {
                                        setPhotoErrors((previous) =>
                                          previous.filter((p) => p !== kind),
                                        );
                                        setPhotoRetry((n) => n + 1);
                                      }}
                                    >
                                      {t("Retry photo", "إعادة تحميل الصورة")}
                                    </button>
                                  </div>
                                )}
                                <strong>
                                  {kind === "front"
                                    ? t("Front photograph", "الصورة الأمامية")
                                    : t("Wide context", "السياق الواسع")}
                                </strong>
                                <p>
                                  {t(
                                    "Device capture claim",
                                    "وقت الالتقاط المُدّعى",
                                  )}
                                  : {photo ? time(photo.capturedAt) : "—"}
                                </p>
                                <p>
                                  <bdi>{photo?.captureMode}</bdi> · GPS:{" "}
                                  <bdi>{photo?.gps.status}</bdi>
                                </p>
                                {photo?.gps.status === "ok" && (
                                  <p>
                                    <bdi>
                                      {photo.gps.latitude.toFixed(6)},{" "}
                                      {photo.gps.longitude.toFixed(6)} · ±{" "}
                                      {Math.round(photo.gps.accuracy)} m
                                    </bdi>
                                    <br />
                                    {t(
                                      "Location observed",
                                      "وقت رصد الموقع",
                                    )}: {time(photo.gps.observedAt)}
                                  </p>
                                )}
                                <p>
                                  {t("Server received", "استلم الخادم")}:{" "}
                                  {time(String(detail.inspection.received_at))}
                                </p>
                              </figcaption>
                            </figure>
                          );
                        })}
                      </div>
                      <div className="review-geography panel">
                        <EvidenceMap detail={detail} arabic={ar} />
                        <div>
                          <h3>
                            {t("Location observations", "ملاحظات الموقع")}
                          </h3>
                          <p>
                            {t("Registered coordinates", "الإحداثيات المسجلة")}:{" "}
                            <bdi>
                              {detail.inspection.latitude},{" "}
                              {detail.inspection.longitude} ±{" "}
                              {detail.inspection.uncertainty_m} m
                            </bdi>
                          </p>
                          {(detail.inspection.original_latitude !==
                            detail.inspection.latitude ||
                            detail.inspection.original_longitude !==
                              detail.inspection.longitude) && (
                            <p>
                              {t(
                                "Original coordinates preserved",
                                "الإحداثيات الأصلية محفوظة",
                              )}
                              :{" "}
                              <bdi>
                                {detail.inspection.original_latitude},{" "}
                                {detail.inspection.original_longitude}
                              </bdi>
                            </p>
                          )}
                          {detail.locationExceptions?.map((exception) => (
                            <div key={exception.id} role="note">
                              <strong>
                                {t(
                                  "Supervisor location exception",
                                  "استثناء الموقع من المشرف",
                                )}
                              </strong>
                              <p>{exception.reason}</p>
                              <p>
                                {t("Authorized", "تم التصريح")}:{" "}
                                {time(exception.created_at)} ·{" "}
                                {t("Expires", "تنتهي الصلاحية")}:{" "}
                                {time(exception.expires_at)}
                              </p>
                            </div>
                          ))}
                          <p>
                            {t(
                              "Browser GPS and device timestamps are untrusted. Circles show reported uncertainty, not proof of presence.",
                              "إحداثيات المتصفح وأوقات الجهاز غير موثوقة. الدوائر تمثل الدقة المُبلّغ عنها ولا تثبت التواجد.",
                            )}
                          </p>
                          {detail.report?.observations.map((o) => (
                            <p key={o.kind}>
                              <bdi>
                                {o.kind}: {o.distanceM} m · ± {o.accuracy} m
                              </bdi>
                              <br />
                              {time(o.observedAt)}
                            </p>
                          ))}
                          <p>
                            {t("Spatial engine", "محرك الحساب المكاني")}:{" "}
                            <bdi>{detail.report?.spatialEngine || "—"}</bdi>
                          </p>
                          {detail.report?.candidates.map((c) => (
                            <p key={c.id}>
                              <bdi>
                                {c.code} · {c.orientation} ·{" "}
                                {Math.round(c.distanceM)} m
                              </bdi>
                            </p>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                  {tab === "risk" && (
                    <div className="panel review-section">
                      <div className="review-section-head">
                        <h3>
                          {t("Explainable signals", "مؤشرات قابلة للتفسير")}
                        </h3>
                        <button
                          className="secondary"
                          disabled={busy}
                          onClick={() =>
                            void mutate("/" + selected + "/analyze", {})
                          }
                        >
                          <RefreshCw size={16} />
                          {t("Reanalyze", "إعادة التحليل")}
                        </button>
                      </div>
                      <p>
                        {t(
                          "Severity is a review aid, never a calibrated fraud probability or an accusation.",
                          "الشدة أداة للمراجعة وليست احتمال احتيال مُعايراً أو اتهاماً.",
                        )}
                      </p>
                      <p>
                        <bdi>
                          {detail.report?.ruleVersion || "Analysis pending"}
                        </bdi>
                      </p>
                      {!detail.report && (
                        <p role="alert">
                          {t(
                            "Analysis required before approval. Retry analysis.",
                            "يلزم التحليل قبل الموافقة. أعد المحاولة.",
                          )}
                        </p>
                      )}
                      {detail.report?.signals.map((s, n) => (
                        <article className="review-signal" key={s.code + n}>
                          <div className="review-row">
                            <strong>
                              {ruleLabels[s.code]?.[locale] || s.code}
                            </strong>
                            <span className={`risk-pill risk-${s.severity}`}>
                              {label(s.severity)}
                            </span>
                          </div>
                          <p>
                            {s.blocksApproval
                              ? t(
                                  "Approval blocked · resurvey required",
                                  "الموافقة محظورة · إعادة المعاينة مطلوبة",
                                )
                              : s.recommendedAction === "independent_review"
                                ? t(
                                    "Independent supervisor review required",
                                    "تلزم مراجعة مشرف مستقل",
                                  )
                                : t(
                                    "Human review required",
                                    "تلزم مراجعة بشرية",
                                  )}
                          </p>
                          <pre dir="ltr">
                            {JSON.stringify(s.evidence, null, 2)}
                          </pre>
                        </article>
                      ))}
                    </div>
                  )}
                  {tab === "history" && (
                    <div className="panel review-section">
                      <h3>
                        {t(
                          "Immutable decision history",
                          "سجل القرارات غير القابل للتعديل",
                        )}
                      </h3>
                      {!detail.decisions.length && (
                        <p>
                          {t("No decisions recorded.", "لم تُسجل قرارات بعد.")}
                        </p>
                      )}
                      {detail.decisions.map((d) => (
                        <article className="review-signal" key={d.id}>
                          <strong>
                            {label(
                              d.action === "approve"
                                ? "approved"
                                : d.action === "reject"
                                  ? "rejected"
                                  : d.action === "resurvey"
                                    ? "resurvey_requested"
                                    : "ambiguous",
                            )}{" "}
                            · v{d.version}
                          </strong>
                          <p>{d.reason}</p>
                          <small>
                            {d.actor_name} · {time(d.created_at)}
                          </small>
                          <pre dir="ltr">{d.assessment_hash}</pre>
                        </article>
                      ))}
                      <h3>
                        {t(
                          "Server sync & integrity history",
                          "سجل المزامنة والسلامة على الخادم",
                        )}
                      </h3>
                      <p>
                        <bdi>{detail.inspection.receipt_id}</bdi>
                      </p>
                      {detail.media.map((m) => (
                        <article className="review-signal" key={m.kind}>
                          <strong>
                            <bdi>
                              {m.kind} · {m.width} × {m.height} · {m.parts}
                            </bdi>{" "}
                            {t("received parts", "أجزاء مستلمة")}
                          </strong>
                          <p>
                            {t("Photo received", "استُلمت الصورة")}:{" "}
                            {time(m.received_at)}
                          </p>
                          <p>{t("Server SHA-256", "بصمة الخادم SHA-256")}</p>
                          <pre dir="ltr">{m.server_hash}</pre>
                          <p>
                            {t("Photo receipt", "إيصال الصورة")}:{" "}
                            <bdi>{m.receipt_id}</bdi>
                          </p>
                        </article>
                      ))}
                      <h3>
                        {t(
                          "Versioned risk assessments",
                          "تقييمات المخاطر بإصداراتها",
                        )}
                      </h3>
                      {detail.assessments.map((run) => (
                        <div className="review-signal" key={run.id}>
                          <p>
                            <bdi>{run.rule_version}</bdi> ·{" "}
                            {time(run.created_at)}
                          </p>
                          <pre dir="ltr">{run.assessment_hash}</pre>
                          <button
                            className="secondary"
                            onClick={async () => {
                              const token = request.current;
                              try {
                                const report = await api<RiskReport>(
                                  "/" + selected + "/assessments/" + run.id,
                                );
                                if (token === request.current)
                                  setHistoricReport(report);
                              } catch (e) {
                                setError((e as Error).message);
                              }
                            }}
                          >
                            {t(
                              "View recorded assessment",
                              "عرض التقييم المسجل",
                            )}
                          </button>
                        </div>
                      ))}
                      {historicReport && (
                        <div>
                          <h4>
                            {t(
                              "Recorded supporting evidence",
                              "الأدلة الداعمة المسجلة",
                            )}
                          </h4>
                          <pre dir="ltr">
                            {JSON.stringify(historicReport, null, 2)}
                          </pre>
                        </div>
                      )}
                      {detail.history.map((h, n) => (
                        <article key={n} className="review-signal">
                          <bdi>{h.action}</bdi>
                          <small> · {time(h.created_at)}</small>
                          <pre dir="ltr">
                            {JSON.stringify(h.detail, null, 2)}
                          </pre>
                        </article>
                      ))}
                    </div>
                  )}
                  {tab === "references" && (
                    <div className="panel review-section">
                      <h3>
                        {t(
                          "Supervisor-controlled baseline",
                          "مرجع بإشراف المشرف",
                        )}
                      </h3>
                      <p>
                        {t(
                          "Worker photographs are provisional. Enrollment binds these original images to this exact face and versions the structural description.",
                          "صور العامل مؤقتة. اعتماد المرجع يربط الصور الأصلية بهذا الوجه تحديداً ويحفظ نسخة من وصف البنية.",
                        )}
                      </p>
                      {detail.baselines.map((b) => (
                        <article className="review-signal" key={b.id}>
                          <div className="review-row">
                            <strong>
                              {t("Reference version", "نسخة المرجع")}{" "}
                              {b.version}
                            </strong>
                            <span className="badge">
                              {b.withdrawn_at
                                ? t("Withdrawn", "مسحوب")
                                : b.on_hold
                                  ? t("Review hold", "معلق للمراجعة")
                                  : t("Active reference", "مرجع فعال")}
                            </span>
                          </div>
                          <pre>
                            {JSON.stringify(b.structure_details, null, 2)}
                          </pre>
                          {b.on_hold && !b.withdrawn_at && (
                            <p role="status">
                              {t(
                                "The assessment changed. Fresh review and explicit reference correction are required before this reference counts as verified.",
                                "تغير التقييم. يلزم تجديد المراجعة وتصحيح المرجع صراحةً قبل احتسابه كمرجع موثق.",
                              )}
                            </p>
                          )}
                          <button
                            className="secondary"
                            onClick={() => {
                              void open(b.inspection_id);
                              setTab("evidence");
                            }}
                          >
                            {t("View reference photographs", "عرض صور المرجع")}
                          </button>
                          {b.withdrawn_at ? (
                            <p>
                              {b.withdrawal_reason} · {time(b.withdrawn_at)}
                            </p>
                          ) : (
                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                const f = new FormData(e.currentTarget);
                                void mutate("/" + b.id + "/withdraw", {
                                  reason: f.get("reason"),
                                });
                              }}
                            >
                              <label>
                                {t("Withdrawal reason", "سبب السحب")}
                                <input
                                  name="reason"
                                  minLength={5}
                                  maxLength={2000}
                                  required
                                />
                              </label>
                              <button className="secondary" disabled={busy}>
                                {t("Withdraw reference", "سحب المرجع")}
                              </button>
                            </form>
                          )}
                        </article>
                      ))}
                      {detail.review.state === "approved" &&
                        !detail.baselines.some((b) => !b.withdrawn_at) && (
                          <>
                            <button
                              className="secondary"
                              onClick={() => setBaselineOpen(!baselineOpen)}
                            >
                              {t(
                                "Enroll exact-face reference",
                                "اعتماد مرجع للوجه المحدد",
                              )}
                            </button>
                            {baselineOpen && (
                              <form
                                className="review-baseline"
                                onSubmit={async (e) => {
                                  e.preventDefault();
                                  const f = new FormData(e.currentTarget);
                                  await mutate("/" + selected + "/baseline", {
                                    expectedVersion: detail.review.version,
                                    assessmentHash:
                                      detail.report?.assessmentHash,
                                    faceId: detail.inspection.face_id,
                                    identityConfirmed: true,
                                    shape: f.get("shape"),
                                    mounting: f.get("mounting"),
                                    numberOfFaces: Number(
                                      f.get("numberOfFaces"),
                                    ),
                                    facing: f.get("facing"),
                                    landmarks: f.get("landmarks"),
                                    reason: f.get("reason"),
                                  });
                                }}
                              >
                                {[
                                  ["shape", t("Shape", "الشكل"), 3],
                                  ["mounting", t("Mounting", "التثبيت"), 3],
                                  [
                                    "landmarks",
                                    t("Distinctive landmarks", "معالم مميزة"),
                                    5,
                                  ],
                                  [
                                    "reason",
                                    t("Enrollment reason", "سبب الاعتماد"),
                                    5,
                                  ],
                                ].map(([name, text, min]) => (
                                  <label key={name}>
                                    {text}
                                    <input
                                      name={String(name)}
                                      minLength={Number(min)}
                                      maxLength={
                                        name === "landmarks"
                                          ? 1000
                                          : name === "reason"
                                            ? 2000
                                            : name === "mounting"
                                              ? 300
                                              : 200
                                      }
                                      required
                                    />
                                  </label>
                                ))}
                                <label>
                                  {t("Number of faces", "عدد الوجوه")}
                                  <input
                                    name="numberOfFaces"
                                    type="number"
                                    min={1}
                                    max={16}
                                    defaultValue={1}
                                    required
                                  />
                                </label>
                                <label>
                                  {t("Facing direction", "اتجاه الوجه")}
                                  <select
                                    name="facing"
                                    aria-label={t(
                                      "Facing direction",
                                      "اتجاه الوجه",
                                    )}
                                  >
                                    {[
                                      "N",
                                      "NE",
                                      "E",
                                      "SE",
                                      "S",
                                      "SW",
                                      "W",
                                      "NW",
                                    ].map((v) => (
                                      <option key={v}>{v}</option>
                                    ))}
                                  </select>
                                </label>
                                <label className="review-check">
                                  <input type="checkbox" required />
                                  {t(
                                    "I confirm these references belong to this exact billboard face.",
                                    "أؤكد أن هذه المراجع تخص وجه اللوحة المحدد.",
                                  )}
                                </label>
                                <button
                                  className="primary"
                                  disabled={busy || !detail.report}
                                >
                                  {t(
                                    "Approve reference enrollment",
                                    "الموافقة على اعتماد المرجع",
                                  )}
                                </button>
                              </form>
                            )}
                          </>
                        )}
                    </div>
                  )}
                </div>
                <form
                  ref={decisionForm}
                  className="panel review-decision"
                  onKeyDown={(e) => {
                    if (e.ctrlKey && e.key === "Enter") {
                      e.preventDefault();
                      if (
                        !mutationLocked.current &&
                        detail.report &&
                        detail.review.state !== "resurvey_requested"
                      )
                        e.currentTarget.requestSubmit();
                    }
                  }}
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (
                      mutationLocked.current ||
                      !detail.report ||
                      detail.review.state === "resurvey_requested"
                    )
                      return;
                    if (
                      await mutate("/" + selected + "/decision", {
                        expectedVersion: detail.review.version,
                        assessmentHash: detail.report?.assessmentHash,
                        action,
                        reason,
                        identityConfirmed: identity,
                        riskAcknowledged: ack,
                        ...(action === "resurvey"
                          ? { instructions, dueDate }
                          : {}),
                      })
                    ) {
                      setReason("");
                      setIdentity(false);
                      setAck(false);
                    }
                  }}
                >
                  <div className="review-section-head">
                    <div>
                      <h3>{t("Supervisor decision", "قرار المشرف")}</h3>
                      <small>
                        {t("Version", "النسخة")} {detail.review.version} · Ctrl
                        + Enter
                      </small>
                    </div>
                    <ShieldCheck size={23} />
                  </div>
                  {detail.review.independent_required &&
                    ["pending", "ambiguous"].includes(detail.review.state) && (
                      <p className="review-alert">
                        <AlertTriangle size={18} />
                        {t(
                          "Two distinct supervisors must confirm this assessment and exact face.",
                          "يجب أن يؤكد مشرفان مختلفان هذا التقييم والوجه المحدد.",
                        )}
                      </p>
                    )}
                  <div className="review-actions">
                    {[
                      ["approve", t("Approve", "موافقة")],
                      ["reject", t("Reject", "رفض")],
                      ["resurvey", t("Request resurvey", "طلب إعادة معاينة")],
                      ["ambiguous", t("Mark ambiguous", "تحديد كملتبس")],
                    ].map(([v, text]) => (
                      <button
                        type="button"
                        aria-pressed={action === v}
                        className={action === v ? "primary" : "secondary"}
                        key={v}
                        onClick={() => setAction(v)}
                      >
                        {text}
                      </button>
                    ))}
                  </div>
                  <label>
                    {t("Decision reason (required)", "سبب القرار (مطلوب)")}
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      minLength={5}
                      maxLength={2000}
                      required
                      rows={3}
                    />
                  </label>
                  {action === "resurvey" && (
                    <>
                      <label>
                        {t(
                          "Specific worker instructions",
                          "تعليمات محددة للعامل",
                        )}
                        <textarea
                          value={instructions}
                          onChange={(e) => setInstructions(e.target.value)}
                          minLength={10}
                          maxLength={2000}
                          required
                        />
                      </label>
                      <label>
                        {t("Resurvey due date", "موعد إعادة المعاينة")}
                        <input
                          type="date"
                          value={dueDate}
                          onChange={(e) => setDueDate(e.target.value)}
                          required
                        />
                      </label>
                    </>
                  )}
                  {action === "approve" && (
                    <>
                      <label className="review-check">
                        <input
                          type="checkbox"
                          checked={identity}
                          onChange={(e) => setIdentity(e.target.checked)}
                          required
                        />
                        {t(
                          "I confirmed the exact billboard face, its structure and surroundings.",
                          "تحققت من وجه اللوحة المحدد وبنيتها ومحيطها.",
                        )}
                      </label>
                      <label className="review-check">
                        <input
                          type="checkbox"
                          checked={ack}
                          onChange={(e) => setAck(e.target.checked)}
                          required={["high", "critical"].includes(
                            detail.report?.level || "",
                          )}
                        />
                        {t(
                          "I reviewed the anomalies and supporting evidence.",
                          "راجعت المؤشرات والأدلة الداعمة.",
                        )}
                      </label>
                    </>
                  )}
                  <button
                    className="primary"
                    disabled={
                      busy ||
                      !detail.report ||
                      detail.review.state === "resurvey_requested"
                    }
                  >
                    {busy
                      ? t("Saving…", "جارٍ الحفظ…")
                      : t("Record decision", "تسجيل القرار")}
                  </button>
                  <p className="review-footnote">
                    {t(
                      "Decisions are permanent audit events. Approval does not automatically enroll a reference.",
                      "القرارات أحداث تدقيق دائمة. الموافقة لا تعتمد مرجعاً تلقائياً.",
                    )}
                  </p>
                </form>
              </>
            )}
          </section>
        </fieldset>
      </main>
      <dialog ref={dialog} className="review-zoom" aria-labelledby="zoom-title">
        <div>
          <strong id="zoom-title">
            {zoom === "front"
              ? t("Front photograph", "الصورة الأمامية")
              : t("Wide context photograph", "صورة السياق الواسع")}
          </strong>
          <button
            className="icon-button"
            aria-label={t("Close photo viewer", "إغلاق عارض الصور")}
            onClick={() => dialog.current?.close()}
          >
            <X size={23} />
          </button>
        </div>
        {selected && (
          <Image
            unoptimized
            src={`/api/inspections/${selected}/media/${zoom}?retry=${photoRetry}`}
            onError={() =>
              setPhotoErrors((previous) =>
                previous.includes(zoom) ? previous : [...previous, zoom],
              )
            }
            alt={t("Full resolution evidence", "الدليل بالدقة الكاملة")}
            width={4096}
            height={3072}
          />
        )}
      </dialog>
    </div>
  );
}
