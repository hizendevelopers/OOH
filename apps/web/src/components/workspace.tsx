"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import {
  Compass,
  LayoutDashboard,
  PanelsTopLeft,
  ClipboardList,
  ScrollText,
  ChevronRight,
  ArrowUpRight,
  Plus,
  Search,
  ArrowDownToLine,
  Sun,
  Moon,
  Languages,
  LogOut,
  Menu,
  X,
  MapPin,
  Check,
  Users,
  ShieldCheck,
  Clock,
  TriangleAlert,
  Upload,
  LoaderCircle,
  Navigation,
  LockKeyhole,
  ArrowLeft,
  Radio,
} from "lucide-react";
import type { Actor, Preview } from "@ibvs/domain";
import { matchesFilter, localeDirection } from "@ibvs/domain";
import type { Face, Assignment } from "@/server/service";
import { LocationEditor } from "./location-editor";
import { LocationMap } from "./location-map";
type Tab = "overview" | "inventory" | "assignments" | "audit";
type Summary = {
  faces: number;
  structures: number;
  workers: number;
  assigned: number;
  pending: number;
  verified: number;
  rejected: number;
  cities: { city: string; faces: number; assigned: number }[];
};
type Event = {
  id: string;
  action: string;
  entity_id: string;
  actor_name: string;
  created_at: string;
  detail: object;
};
const words = {
  en: {
    overview: "Overview",
    inventory: "Inventory",
    assignments: "Assignments",
    audit: "Audit trail",
    workspace: "OPERATIONS WORKSPACE",
    title: "A clearer view of the field.",
    intro: "Your billboard network, from assignment to accountability.",
    import: "Import inventory",
    total: "Billboard faces",
    structures: "Physical structures",
    assigned: "Assigned visits",
    verified: "Verified baselines",
    pending: "Pending review",
    coverage: "Network coverage",
    coverageSub: "Imported faces by city. Coordinates remain unverified.",
    activity: "Recent activity",
    activitySub: "An accountable record of every operation.",
    all: "All cities",
    search: "Search face ID, city or zone…",
    empty: "No records yet",
    emptySub: "Add a location or import your coordinate inventory to begin.",
    newAssignment: "Assign visits",
    worker: "Worker",
    due: "Due date",
    face: "Face ID",
    city: "City / zone",
    coordinates: "Registered coordinates",
    status: "Status",
    orientation: "Face",
    unassigned: "Unassigned",
    my: "My assignments",
    workerIntro:
      "Your fieldwork, organized. Open a visit for its locked location details.",
    signout: "Sign out",
    offline:
      "You are offline. This operations view requires a connection. Use downloaded tasks in the field workspace for offline capture.",
    detail: "Assignment details",
    locked: "Locked face identity",
    uncertainty: "Coordinate uncertainty",
    navigation: "Navigate to location",
    notCapture:
      "Open the field workspace for live capture and offline drafts. Server receipt does not verify billboard identity.",
    close: "Close",
    preview: "Validate & preview",
    commit: "Import valid rows",
    importIntro:
      "Original coordinates and face IDs are immutable after import.",
    selectWorker: "Select a worker",
    assign: "Create assignments",
    cancel: "Cancel",
    loading: "Loading workspace…",
    error: "Could not load records. Check your connection.",
    retry: "Try again",
    scope: "FIELD OPERATIONS",
    baselineNote: "First baselines require human review.",
    noActivity: "Activity appears here after an import or assignment.",
    export: "Export CSV",
    selected: "selected",
    demo: "DEMO WORKSPACE · illustrative coordinates, no verified evidence",
    phase: "Phase 1 · Inventory & assignment",
    noTasks: "No assignments yet",
    noTasksSub: "Your administrator will assign visits here.",
    back: "Back to assignments",
  },
  ar: {
    overview: "نظرة عامة",
    inventory: "المخزون",
    assignments: "المهام",
    audit: "سجل التدقيق",
    workspace: "مساحة العمليات",
    title: "رؤية أوضح للميدان.",
    intro: "شبكة لوحاتك من التكليف إلى التحقق.",
    import: "استيراد المخزون",
    total: "واجهات اللوحات",
    structures: "الهياكل",
    assigned: "زيارات مكلّفة",
    verified: "مراجع موثّقة",
    pending: "بانتظار المراجعة",
    coverage: "تغطية الشبكة",
    coverageSub: "الواجهات المستوردة حسب المدينة. الإحداثيات غير موثّقة.",
    activity: "النشاط الأخير",
    activitySub: "سجل مسؤول لكل عملية.",
    all: "كل المدن",
    search: "ابحث بالرمز أو المدينة أو المنطقة…",
    empty: "لا توجد سجلات بعد",
    emptySub: "أضف موقعاً أو استورد مخزون الإحداثيات للبدء.",
    newAssignment: "تكليف بزيارات",
    worker: "الموظف",
    due: "تاريخ الاستحقاق",
    face: "رمز الواجهة",
    city: "المدينة / المنطقة",
    coordinates: "الإحداثيات المسجلة",
    status: "الحالة",
    orientation: "الاتجاه",
    unassigned: "غير مكلّفة",
    my: "مهامي",
    workerIntro:
      "عملك الميداني منظّم. افتح الزيارة لعرض تفاصيل الموقع الثابتة.",
    signout: "تسجيل الخروج",
    offline:
      "أنت غير متصل. مساحة العمليات تتطلب الاتصال. استخدم المهام المحمّلة في مساحة العمل الميداني للالتقاط دون اتصال.",
    detail: "تفاصيل المهمة",
    locked: "هوية الواجهة الثابتة",
    uncertainty: "عدم دقة الإحداثيات",
    navigation: "الاتجاه إلى الموقع",
    notCapture:
      "افتح مساحة العمل الميداني للالتقاط المباشر والمسودات دون اتصال. إيصال الخادم لا يثبت هوية الواجهة.",
    close: "إغلاق",
    preview: "تحقق ومعاينة",
    commit: "استيراد الصفوف الصالحة",
    importIntro:
      "لا يمكن تغيير رموز الواجهات والإحداثيات الأصلية بعد الاستيراد.",
    selectWorker: "اختر موظفاً",
    assign: "إنشاء المهام",
    cancel: "إلغاء",
    loading: "جارٍ تحميل مساحة العمل…",
    error: "تعذر تحميل السجلات. تحقق من الاتصال.",
    retry: "حاول مجدداً",
    scope: "العمليات الميدانية",
    baselineNote: "المراجع الأولى تتطلب مراجعة بشرية.",
    noActivity: "يظهر النشاط بعد الاستيراد أو التكليف.",
    export: "تصدير CSV",
    selected: "محددة",
    demo: "مساحة تجريبية · إحداثيات توضيحية دون أدلة موثّقة",
    phase: "المرحلة الأولى · المخزون والتكليف",
    noTasks: "لا توجد مهام بعد",
    noTasksSub: "سيقوم المشرف بتكليفك بزيارات هنا.",
    back: "العودة للمهام",
  },
};
async function api<T>(url: string, body?: unknown): Promise<T> {
  const r = await fetch("/api/" + url, {
    cache: "no-store",
    ...(body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  if (r.status === 401) {
    location.assign("/sign-in");
    throw new Error("Session expired");
  }
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Request failed");
  return data as T;
}
function Badge({
  status,
  ar = false,
}: {
  status: string | null;
  ar?: boolean;
}) {
  const labels: Record<string, string> = {
    assigned: "مكلّفة",
    unassigned: "غير مكلّفة",
    pending_review: "بانتظار المراجعة",
    baseline_verified: "موثّقة",
    rejected: "مرفوضة",
    resurvey_requested: "إعادة زيارة",
    approved: "معاينة معتمدة",
    ambiguous: "هوية ملتبسة",
    superseded: "استُبدلت المهمة",
    server_received: "استلمها الخادم",
  };
  return (
    <span className={"badge " + (status || "unassigned")}>
      <span />
      {ar
        ? labels[status || "unassigned"] || status
        : (status || "unassigned").replaceAll("_", " ")}
    </span>
  );
}
export default function Workspace({
  actor,
  signInRequired = true,
}: {
  actor: Actor;
  signInRequired?: boolean;
}) {
  const [tab, setTab] = useState<Tab>(
      actor.role === "admin" ? "overview" : "assignments",
    ),
    [locale, setLocale] = useState<"en" | "ar">("en"),
    [dark, setDark] = useState(false),
    [menu, setMenu] = useState(false),
    [offline, setOffline] = useState(false);
  const [faces, setFaces] = useState<Face[]>([]),
    [tasks, setTasks] = useState<Assignment[]>([]),
    [summary, setSummary] = useState<Summary | null>(null),
    [events, setEvents] = useState<Event[]>([]),
    [workers, setWorkers] = useState<{ id: string; name: string }[]>([]);
  const [locationEditor, setLocationEditor] = useState<"new" | Face | null>(
    null,
  );
  const [locationKind, setLocationKind] = useState("all");
  const [exceptionTask, setExceptionTask] = useState<Assignment | null>(null);
  const [exceptionReason, setExceptionReason] = useState("");
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [search, setSearch] = useState(""),
    [city, setCity] = useState(""),
    [selected, setSelected] = useState<string[]>([]),
    [modal, setModal] = useState<"import" | "assign" | null>(null),
    [detail, setDetail] = useState<Assignment | null>(null);
  const [csv, setCsv] = useState(""),
    [fileName, setFileName] = useState("inventory.csv"),
    [preview, setPreview] = useState<Preview | null>(null),
    [busy, setBusy] = useState(false),
    [formError, setFormError] = useState("");
  const t = words[locale];
  useEffect(() => {
    const saved = localStorage.getItem("ibvs-locale");
    if (saved === "ar") setLocale("ar");
    setDark(localStorage.getItem("ibvs-theme") === "dark");
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = localeDirection(locale);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [locale, dark]);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (actor.role === "admin") {
        const [f, a, s, e, w] = await Promise.all([
          api<Face[]>("inventory"),
          api<Assignment[]>("assignments"),
          api<Summary>("overview"),
          api<Event[]>("audit"),
          api<{ id: string; name: string }[]>("workers"),
        ]);
        setFaces(f);
        setTasks(a);
        setSummary(s);
        setEvents(e);
        setWorkers(w);
      } else setTasks(await api<Assignment[]>("assignments"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [actor.role]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 6000);
    return () => clearTimeout(timer);
  }, [toast]);
  function navigate(next: Tab) {
    setTab(next);
    setSearch("");
    setCity("");
    setMenu(false);
    setDetail(null);
  }
  function openModal(kind: "import" | "assign") {
    setModal(kind);
    setFormError("");
    setPreview(null);
  }
  async function validate() {
    setBusy(true);
    setFormError("");
    try {
      setPreview(
        await api<Preview>("inventory/preview", { csv, sourceName: fileName }),
      );
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function commit() {
    setBusy(true);
    setFormError("");
    try {
      const r = await api<{ imported: number }>("inventory/import", {
        csv,
        sourceName: fileName,
      });
      setModal(null);
      setCsv("");
      setToast(
        `${r.imported} ${locale === "ar" ? "واجهة مستوردة" : "faces imported"}`,
      );
      await load();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function createAssignment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setFormError("");
    const data = new FormData(e.currentTarget);
    try {
      await api("assignments", {
        faceIds: selected,
        workerId: data.get("worker"),
        dueDate: data.get("due"),
      });
      setModal(null);
      setSelected([]);
      setToast(locale === "ar" ? "تم إنشاء المهام" : "Assignments created");
      navigate("assignments");
      await load();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const isAdmin = actor.role === "admin";
  const filteredFaces = faces.filter(
    (f) =>
      (locationKind === "all" ||
        (locationKind === "test" ? f.is_test : !f.is_test)) &&
      (!city || f.city === city) &&
      matchesFilter(`${f.code} ${f.city} ${f.zone}`, search),
  );
  const filteredTasks = tasks.filter(
    (f) =>
      (!city || f.city === city) &&
      matchesFilter(`${f.code} ${f.city} ${f.zone} ${f.worker_name}`, search),
  );
  const nav = [
    { id: "overview" as Tab, icon: LayoutDashboard, label: t.overview },
    { id: "inventory" as Tab, icon: PanelsTopLeft, label: t.inventory },
    {
      id: "assignments" as Tab,
      icon: ClipboardList,
      label: isAdmin ? t.assignments : t.my,
    },
    { id: "audit" as Tab, icon: ScrollText, label: t.audit },
  ].filter((n) => isAdmin || n.id === "assignments");
  const openCount = tasks.filter((a) =>
    ["assigned", "resurvey_requested"].includes(a.status),
  ).length;
  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      {menu && (
        <button
          className="nav-shade"
          aria-label={t.close}
          onClick={() => setMenu(false)}
        />
      )}
      <aside className={"sidebar " + (menu ? "open" : "")}>
        <Link href="/" className="brand">
          <span className="brand-icon">
            <Compass />
          </span>
          <span>
            IBVS<span className="brand-sub">IRAQ BILLBOARD VERIFICATION</span>
          </span>
        </Link>
        <div className="workspace-switch">
          <span className="org-monogram">IQ</span>
          <span>
            Iraq operations<small>{t.workspace}</small>
          </span>
          <span className="online-dot" />
        </div>
        <span className="nav-label">{t.scope}</span>
        <nav>
          {nav.map((n) => (
            <button
              key={n.id}
              className={tab === n.id ? "active" : ""}
              onClick={() => navigate(n.id)}
            >
              <n.icon size={19} />
              {n.label}
              {n.id === "assignments" && openCount > 0 && (
                <span className="nav-count">{openCount}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="trust-card">
            <ShieldCheck size={22} />
            <strong>
              {locale === "ar"
                ? "الثقة تبدأ بالتحقق"
                : "Trust starts with verification"}
            </strong>
            <p>{t.baselineNote}</p>
          </div>
          <div className="user">
            <span className="avatar">{actor.name.slice(0, 1)}</span>
            <span>
              {actor.name}
              <small>{isAdmin ? "Administrator" : "Field worker"}</small>
            </span>
            {signInRequired && (
              <button
                aria-label={t.signout}
                title={t.signout}
                className="icon-button"
                onClick={async () => {
                  const response = await fetch("/api/auth/sign-out", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: "{}",
                  });
                  if (response.ok) {
                    localStorage.removeItem("ibvs-field-owner-v2");
                    localStorage.setItem("ibvs-field-locked", "1");
                    location.assign("/sign-in");
                  } else setToast("Sign out failed. Please retry.");
                }}
              >
                <LogOut size={17} />
              </button>
            )}
          </div>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-button mobile-menu"
              aria-label="Menu"
              onClick={() => setMenu(!menu)}
            >
              <Menu size={21} />
            </button>
            <span>Iraq operations</span>
            <ChevronRight size={13} />
            <strong>{nav.find((n) => n.id === tab)?.label}</strong>
          </div>
          <div className="top-actions">
            {actor.role === "admin" && (
              <Link className="secondary" href="/review">
                {locale === "ar" ? "مركز المراجعة" : "Review center"}
              </Link>
            )}
            <span className="connection">
              <span className={offline ? "offline-dot" : "online-dot"} />
              {offline ? "Offline" : "Connected"}
            </span>
            <button
              className="icon-button locale"
              aria-label="Switch language"
              onClick={() => {
                const l = locale === "en" ? "ar" : "en";
                setLocale(l);
                localStorage.setItem("ibvs-locale", l);
              }}
            >
              <Languages size={17} />
              <span>{locale === "en" ? "العربية" : "English"}</span>
            </button>
            <button
              className="icon-button"
              aria-label="Toggle theme"
              onClick={() => {
                setDark(!dark);
                localStorage.setItem("ibvs-theme", !dark ? "dark" : "light");
              }}
            >
              {dark ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <span className="avatar small">{actor.name.slice(0, 1)}</span>
          </div>
        </header>
        <main id="main" tabIndex={-1}>
          {offline && (
            <div className="notice warning" role="status">
              <TriangleAlert size={18} />
              {t.offline}
            </div>
          )}
          {actor.organizationId === "demo-iraq" && (
            <div className="demo-label">
              <Radio size={13} />
              {t.demo}
            </div>
          )}
          <div className="page-heading">
            <div>
              <span className="eyebrow">{t.workspace}</span>
              <h1>
                {tab === "overview"
                  ? t.title
                  : tab === "assignments" && !isAdmin
                    ? t.my
                    : nav.find((n) => n.id === tab)?.label}
              </h1>
              <p>
                {tab === "overview"
                  ? t.intro
                  : tab === "inventory"
                    ? t.importIntro
                    : tab === "assignments" && !isAdmin
                      ? t.workerIntro
                      : tab === "audit"
                        ? t.activitySub
                        : t.phase}
              </p>
            </div>
            <div className="heading-actions">
              {!isAdmin && (
                <Link href="/field" className="primary">
                  {locale === "ar"
                    ? "فتح مساحة العمل الميداني"
                    : "Open field workspace"}
                </Link>
              )}
              {isAdmin && (tab === "overview" || tab === "inventory") && (
                <>
                  <button
                    className="primary"
                    onClick={() => setLocationEditor("new")}
                  >
                    <MapPin size={17} />
                    {locale === "ar" ? "إضافة موقع" : "Add location"}
                  </button>
                  <button
                    className="secondary"
                    onClick={() => openModal("import")}
                  >
                    <Plus size={17} />
                    {t.import}
                  </button>
                </>
              )}
              {isAdmin && tab === "assignments" && (
                <a className="secondary" href="/api/export" download>
                  <ArrowDownToLine size={16} />
                  {t.export}
                </a>
              )}
            </div>
          </div>
          {loading ? (
            <div className="loading" role="status">
              <LoaderCircle className="spin" />
              {t.loading}
            </div>
          ) : error ? (
            <div className="notice danger" role="alert">
              {t.error}
              <p>{error}</p>
              <button className="secondary" onClick={() => void load()}>
                {t.retry}
              </button>
            </div>
          ) : (
            <>
              {tab === "overview" && summary && (
                <>
                  <p className="muted">
                    {locale === "ar"
                      ? "الإجماليات التشغيلية لا تشمل المواقع التجريبية."
                      : "Operational totals exclude test locations."}
                  </p>
                  <section className="metric-grid">
                    {[
                      {
                        label: t.total,
                        value: summary.faces,
                        icon: PanelsTopLeft,
                        caption: `${summary.structures} ${t.structures.toLowerCase()}`,
                        tone: "blue",
                      },
                      {
                        label: t.assigned,
                        value: summary.assigned,
                        icon: ClipboardList,
                        caption:
                          locale === "ar"
                            ? "بانتظار زيارة ميدانية"
                            : "Awaiting a field visit",
                        tone: "cyan",
                      },
                      {
                        label: t.pending,
                        value: summary.pending,
                        icon: Clock,
                        caption:
                          locale === "ar"
                            ? "المراجعة بعد استلام الدليل"
                            : "Review follows evidence receipt",
                        tone: "amber",
                      },
                      {
                        label: t.verified,
                        value: summary.verified,
                        icon: ShieldCheck,
                        caption: t.baselineNote,
                        tone: "green",
                      },
                    ].map((m) => (
                      <article className="metric" key={m.label}>
                        <div>
                          <span>{m.label}</span>
                          <span className={"metric-icon " + m.tone}>
                            <m.icon size={19} />
                          </span>
                        </div>
                        <strong>
                          {m.value.toLocaleString(
                            locale === "ar" ? "ar-IQ" : "en",
                          )}
                        </strong>
                        <small>{m.caption}</small>
                      </article>
                    ))}
                  </section>
                  <div className="overview-grid">
                    <section className="panel coverage-panel">
                      <div className="panel-heading">
                        <div>
                          <h2>{t.coverage}</h2>
                          <p>{t.coverageSub}</p>
                        </div>
                        <span className="panel-symbol">
                          <MapPin size={20} />
                        </span>
                      </div>
                      {summary.cities.length ? (
                        <div className="city-chart">
                          {summary.cities.map((c, i) => (
                            <div className="city-row" key={c.city}>
                              <span className="city-number">0{i + 1}</span>
                              <div className="city-bar">
                                <div>
                                  <strong>{c.city}</strong>
                                  <span>
                                    {c.faces}{" "}
                                    {locale === "ar" ? "واجهة" : "faces"}
                                  </span>
                                </div>
                                <meter
                                  min={0}
                                  max={Math.max(
                                    ...summary.cities.map((c) => c.faces),
                                    1,
                                  )}
                                  value={c.faces}
                                  aria-label={c.city}
                                />
                              </div>
                              <span className="city-assigned">
                                {c.assigned}{" "}
                                {locale === "ar" ? "مكلّفة" : "assigned"}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <Empty title={t.empty} text={t.emptySub} />
                      )}
                      <div className="panel-footer">
                        <span>
                          <span className="legend-dot" />
                          {locale === "ar"
                            ? "المخزون المستورد"
                            : "Imported inventory"}
                        </span>
                        <button
                          className="text-button"
                          onClick={() => navigate("inventory")}
                        >
                          {t.inventory}
                          <ArrowUpRight size={15} />
                        </button>
                      </div>
                    </section>
                    <section className="panel activity-panel">
                      <div className="panel-heading">
                        <div>
                          <h2>{t.activity}</h2>
                          <p>{t.activitySub}</p>
                        </div>
                        <ScrollText size={19} />
                      </div>
                      {events.length ? (
                        <div className="event-list">
                          {events.slice(0, 5).map((e) => (
                            <article className="event" key={e.id}>
                              <span className="event-icon">
                                {e.action === "inventory.import" ? (
                                  <Upload size={16} />
                                ) : e.action === "assignment.create" ? (
                                  <ClipboardList size={16} />
                                ) : (
                                  <Users size={16} />
                                )}
                              </span>
                              <div>
                                <strong>
                                  {e.action === "inventory.import"
                                    ? locale === "ar"
                                      ? "استيراد المخزون"
                                      : "Inventory imported"
                                    : e.action === "assignment.create"
                                      ? locale === "ar"
                                        ? "إنشاء مهمة"
                                        : "Visit assigned"
                                      : locale === "ar"
                                        ? "إنشاء حساب"
                                        : "Account provisioned"}
                                </strong>
                                <span>{e.actor_name}</span>
                                <small>
                                  {new Date(e.created_at).toLocaleString(
                                    locale === "ar" ? "ar-IQ" : "en-GB",
                                    {
                                      timeZone: "Asia/Baghdad",
                                      month: "short",
                                      day: "numeric",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    },
                                  )}{" "}
                                  · Baghdad
                                </small>
                              </div>
                            </article>
                          ))}
                        </div>
                      ) : (
                        <Empty title={t.noActivity} text="" />
                      )}
                      <div className="panel-footer">
                        <span>
                          {events.length}{" "}
                          {locale === "ar" ? "حدثاً معروضاً" : "events loaded"}
                        </span>
                        <button
                          className="text-button"
                          onClick={() => navigate("audit")}
                        >
                          {t.audit}
                          <ArrowUpRight size={15} />
                        </button>
                      </div>
                    </section>
                  </div>
                  <section className="field-note">
                    <span className="field-note-icon">
                      <ShieldCheck size={25} />
                    </span>
                    <div>
                      <h3>
                        {locale === "ar"
                          ? "الدليل أولاً. الثقة تُكتسب."
                          : "Evidence first. Confidence earned."}
                      </h3>
                      <p>
                        {locale === "ar"
                          ? "الإحداثيات المستوردة هي نقطة البداية. التحقق البشري يثبت هوية الواجهة."
                          : "Imported coordinates are a starting point. Human review establishes a verified face identity."}
                      </p>
                    </div>
                    <span className="phase-chip">{t.phase}</span>
                  </section>
                </>
              )}
              {(tab === "inventory" || tab === "assignments") && !detail && (
                <section className="panel">
                  <div className="table-toolbar">
                    <label className="search-field">
                      <Search size={17} />
                      <input
                        aria-label={t.search}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={t.search}
                      />
                    </label>
                    <select
                      aria-label={t.city}
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                    >
                      <option value="">{t.all}</option>
                      {[
                        ...new Set(
                          (tab === "inventory" ? faces : tasks).map(
                            (f) => f.city,
                          ),
                        ),
                      ]
                        .sort()
                        .map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                    </select>
                    {tab === "inventory" && (
                      <select
                        aria-label={
                          locale === "ar" ? "نوع الموقع" : "Location type"
                        }
                        value={locationKind}
                        onChange={(e) => {
                          setLocationKind(e.target.value);
                          setSelected([]);
                        }}
                      >
                        <option value="all">
                          {locale === "ar" ? "كل المواقع" : "All locations"}
                        </option>
                        <option value="real">
                          {locale === "ar"
                            ? "مواقع تشغيلية"
                            : "Operational locations"}
                        </option>
                        <option value="test">
                          {locale === "ar" ? "مواقع تجريبية" : "Test locations"}
                        </option>
                      </select>
                    )}
                    {tab === "inventory" && (
                      <button
                        disabled={!selected.length}
                        className="primary"
                        onClick={() => openModal("assign")}
                      >
                        <Plus size={16} />
                        {t.newAssignment}
                        {selected.length > 0 && ` (${selected.length})`}
                      </button>
                    )}
                  </div>
                  {tab === "inventory" && selected.length > 0 && (
                    <div className="selection-bar">
                      {selected.length} {t.selected}
                      <button
                        className="text-button"
                        onClick={() => setSelected([])}
                      >
                        {t.cancel}
                      </button>
                    </div>
                  )}
                  {tab === "inventory" ? (
                    filteredFaces.length ? (
                      <div className="table-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>
                                <input
                                  type="checkbox"
                                  aria-label="Select all unassigned faces"
                                  checked={
                                    filteredFaces.some((f) => !f.status) &&
                                    filteredFaces
                                      .filter((f) => !f.status)
                                      .every((f) => selected.includes(f.id))
                                  }
                                  onChange={(e) =>
                                    setSelected(
                                      e.target.checked
                                        ? filteredFaces
                                            .filter((f) => !f.status)
                                            .map((f) => f.id)
                                        : [],
                                    )
                                  }
                                />
                              </th>
                              <th>{t.face}</th>
                              <th>{t.city}</th>
                              <th>{t.coordinates}</th>
                              <th>{t.orientation}</th>
                              <th>{t.status}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredFaces.map((f) => (
                              <tr key={f.id}>
                                <td>
                                  <input
                                    type="checkbox"
                                    aria-label={`Select ${f.code}`}
                                    disabled={!!f.status}
                                    checked={selected.includes(f.id)}
                                    onChange={(e) =>
                                      setSelected(
                                        e.target.checked
                                          ? [...selected, f.id]
                                          : selected.filter(
                                              (id) => id !== f.id,
                                            ),
                                      )
                                    }
                                  />
                                </td>
                                <td>
                                  <bdi className="face-code">{f.code}</bdi>
                                  {f.is_test && (
                                    <span className="status-pill location-test">
                                      {locale === "ar" ? "تجريبي" : "Test"}
                                    </span>
                                  )}
                                  <small>
                                    <bdi>{f.structure_code}</bdi>
                                  </small>
                                </td>
                                <td>
                                  <strong>{f.city}</strong>
                                  <small>{f.zone || "—"}</small>
                                </td>
                                <td>
                                  <bdi className="mono">
                                    {f.latitude.toFixed(5)},{" "}
                                    {f.longitude.toFixed(5)}
                                  </bdi>
                                  <small>
                                    ± {f.uncertainty_m} m ·{" "}
                                    {locale === "ar"
                                      ? "غير موثّقة"
                                      : "unverified"}
                                  </small>
                                  <button
                                    className="text-button"
                                    onClick={() => setLocationEditor(f)}
                                  >
                                    {locale === "ar"
                                      ? "الخريطة / تصحيح"
                                      : "Map / correct"}
                                  </button>
                                  {(f.original_latitude !== f.latitude ||
                                    f.original_longitude !== f.longitude) && (
                                    <small>
                                      {locale === "ar" ? "الأصلي" : "Original"}:{" "}
                                      <bdi>
                                        {f.original_latitude},{" "}
                                        {f.original_longitude}
                                      </bdi>
                                    </small>
                                  )}
                                  {f.description && (
                                    <small>{f.description}</small>
                                  )}
                                </td>
                                <td>
                                  <bdi>{f.orientation}</bdi>
                                </td>
                                <td>
                                  <Badge
                                    status={f.status}
                                    ar={locale === "ar"}
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <Empty title={t.empty} text={t.emptySub} />
                    )
                  ) : filteredTasks.length ? (
                    <div className="task-grid">
                      {filteredTasks.map((a) => (
                        <button
                          className="task-card"
                          key={a.assignment_id}
                          onClick={async () => {
                            try {
                              setDetail(
                                await api<Assignment>(
                                  "assignments/" + a.assignment_id,
                                ),
                              );
                            } catch (e) {
                              setToast((e as Error).message);
                            }
                          }}
                        >
                          <div>
                            <span className="task-pin">
                              <MapPin size={19} />
                            </span>
                            <Badge
                              status={
                                a.review_state === "pending" &&
                                a.status === "approved"
                                  ? "pending_review"
                                  : a.status
                              }
                              ar={locale === "ar"}
                            />
                          </div>
                          <h3>
                            <bdi>{a.code}</bdi>
                          </h3>
                          <p>
                            {a.city} · {a.zone}
                          </p>
                          <div className="task-bottom">
                            <span>
                              <Clock size={14} />
                              <bdi>{a.due_date}</bdi>
                            </span>
                            <ChevronRight size={17} />
                          </div>
                          {isAdmin && <small>{a.worker_name}</small>}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <Empty
                      title={t.noTasks}
                      text={isAdmin ? t.emptySub : t.noTasksSub}
                    />
                  )}
                  <div className="panel-footer">
                    <span>
                      {tab === "inventory"
                        ? filteredFaces.length
                        : filteredTasks.length}{" "}
                      {locale === "ar" ? "سجلاً" : "records"}
                    </span>
                    <span>{t.phase}</span>
                  </div>
                </section>
              )}
              {detail && (
                <section className="panel detail-panel">
                  <button
                    className="text-button"
                    onClick={() => setDetail(null)}
                  >
                    <ArrowLeft size={17} />
                    {t.back}
                  </button>
                  <div className="detail-header">
                    <span className="small-icon">
                      <LockKeyhole />
                    </span>
                    <span className="eyebrow">{t.locked}</span>
                    <h2>
                      <bdi>{detail.code}</bdi>
                    </h2>
                    <Badge status={detail.status} ar={locale === "ar"} />
                  </div>
                  <dl className="detail-grid">
                    <div>
                      <dt>{t.city}</dt>
                      <dd>
                        {detail.city} · {detail.zone}
                      </dd>
                    </div>
                    <div>
                      <dt>{t.coordinates}</dt>
                      <dd>
                        <bdi>
                          {detail.latitude}, {detail.longitude}
                        </bdi>
                      </dd>
                    </div>
                    <div>
                      <dt>{t.uncertainty}</dt>
                      <dd>± {detail.uncertainty_m} m</dd>
                    </div>
                    <div>
                      <dt>{t.orientation}</dt>
                      <dd>{detail.orientation}</dd>
                    </div>
                    <div>
                      <dt>{t.worker}</dt>
                      <dd>{detail.worker_name}</dd>
                    </div>
                    <div>
                      <dt>{t.due}</dt>
                      <dd>
                        <bdi>{detail.due_date}</bdi>
                      </dd>
                    </div>
                  </dl>
                  <LocationMap
                    latitude={detail.latitude}
                    longitude={detail.longitude}
                    uncertainty={detail.uncertainty_m}
                    ar={locale === "ar"}
                  />
                  {detail.location_exception && (
                    <div className="notice warning">
                      {locale === "ar"
                        ? "استثناء موقع نشط حتى"
                        : "Location exception active until"}{" "}
                      {new Date(
                        detail.location_exception.expires_at,
                      ).toLocaleString()}{" "}
                      · {detail.location_exception.reason}
                    </div>
                  )}
                  {isAdmin &&
                    ["assigned", "resurvey_requested"].includes(
                      detail.status,
                    ) && (
                      <button
                        className="secondary"
                        onClick={() => {
                          setExceptionTask(detail);
                          setExceptionReason("");
                          setFormError("");
                        }}
                      >
                        {locale === "ar"
                          ? "السماح باستثناء الموقع"
                          : "Authorize location exception"}
                      </button>
                    )}
                  <div className="notice warning">
                    <TriangleAlert size={18} />
                    {locale === "ar"
                      ? "قد توجد عدة واجهات على هيكل واحد. تحقق من الرمز والاتجاه."
                      : "Several faces may share a structure. Check the face code and orientation; GPS alone does not prove identity."}
                  </div>
                  <a
                    className="primary"
                    href={`https://www.google.com/maps/dir/?api=1&destination=${detail.latitude},${detail.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Navigation size={17} />
                    {t.navigation}
                  </a>
                  <p className="muted">{t.notCapture}</p>
                </section>
              )}
              {tab === "audit" && (
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>{t.audit}</h2>
                      <p>
                        {locale === "ar"
                          ? "آخر ٢٠٠ حدث • وقت بغداد"
                          : "Latest 200 events • Baghdad time"}
                      </p>
                    </div>
                    <ShieldCheck size={20} />
                  </div>
                  {events.length ? (
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>{locale === "ar" ? "العملية" : "Operation"}</th>
                            <th>{locale === "ar" ? "المنفذ" : "Actor"}</th>
                            <th>{locale === "ar" ? "التوقيت" : "Timestamp"}</th>
                            <th>{locale === "ar" ? "التفاصيل" : "Details"}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {events.map((e) => (
                            <tr key={e.id}>
                              <td>
                                <bdi className="face-code">{e.action}</bdi>
                                <small>
                                  <bdi>{e.entity_id}</bdi>
                                </small>
                              </td>
                              <td>{e.actor_name}</td>
                              <td>
                                {new Date(e.created_at).toLocaleString(
                                  locale === "ar" ? "ar-IQ" : "en-GB",
                                  { timeZone: "Asia/Baghdad" },
                                )}
                              </td>
                              <td>
                                <code>{JSON.stringify(e.detail)}</code>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <Empty title={t.noActivity} text="" />
                  )}
                </section>
              )}
            </>
          )}
          <footer className="workspace-footer">
            <span>
              IBVS <span className="footer-dot">·</span> Iraq Billboard
              Verification System
            </span>
            <span>
              <LockKeyhole size={12} /> {t.phase}
            </span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
          <button
            className="icon-button"
            aria-label={t.close}
            onClick={() => setToast("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {locationEditor && (
        <Modal
          title={
            locationEditor === "new"
              ? locale === "ar"
                ? "إضافة موقع"
                : "Add location"
              : locale === "ar"
                ? "خريطة الموقع وتصحيحه"
                : "Location map & correction"
          }
          close={() => {
            if (!busy) setLocationEditor(null);
          }}
          closeLabel={t.close}
        >
          <LocationEditor
            onBusyChange={setBusy}
            face={locationEditor === "new" ? undefined : locationEditor}
            ar={locale === "ar"}
            onCancel={() => setLocationEditor(null)}
            onSaved={() => {
              setLocationEditor(null);
              setToast(
                locale === "ar"
                  ? "تم حفظ الموقع. حدّث المهام الميدانية بعد التصحيح."
                  : "Location saved. Refresh downloaded field tasks after a correction.",
              );
              void load();
            }}
          />
        </Modal>
      )}
      {exceptionTask && (
        <Modal
          title={
            locale === "ar"
              ? "استثناء موقع بإذن المشرف"
              : "Supervisor location exception"
          }
          close={() => {
            if (!busy) setExceptionTask(null);
          }}
          closeLabel={t.close}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setFormError("");
              try {
                await api("locations/exceptions", {
                  assignmentId: exceptionTask.assignment_id,
                  assignmentVersion: exceptionTask.version,
                  reason: exceptionReason,
                });
                setExceptionTask(null);
                setDetail(null);
                setToast(
                  locale === "ar"
                    ? "تم تسجيل استثناء الموقع."
                    : "Location exception recorded.",
                );
                await load();
              } catch (error) {
                setFormError((error as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <p className="muted">
              {locale === "ar"
                ? "يسمح هذا باستثناء فحوص الموقع لهذه النسخة من المهمة لمدة ٢٤ ساعة. تبقى مراجعة الصور والتحقق البشري إلزاميين."
                : "This authorizes a location exception for this assignment version for 24 hours. Photo checks and human review remain required."}
            </p>
            <p>
              <bdi>{exceptionTask.code}</bdi> · {exceptionTask.worker_name}
            </p>
            <label>
              {locale === "ar"
                ? "السبب (١٠ أحرف على الأقل)"
                : "Reason (at least 10 characters)"}
              <textarea
                value={exceptionReason}
                onChange={(e) => setExceptionReason(e.target.value)}
                minLength={10}
                maxLength={1000}
                required
                disabled={busy}
              />
            </label>
            {formError && (
              <div className="notice danger" role="alert">
                {formError}
              </div>
            )}
            <div className="modal-actions">
              <button
                className="secondary"
                type="button"
                disabled={busy}
                onClick={() => setExceptionTask(null)}
              >
                {t.cancel}
              </button>
              <button className="primary" type="submit" disabled={busy}>
                {busy ? <LoaderCircle className="spin" size={16} /> : null}
                {locale === "ar" ? "تسجيل الاستثناء" : "Record exception"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {modal && (
        <Modal
          title={modal === "import" ? t.import : t.newAssignment}
          close={() => {
            if (!busy) setModal(null);
          }}
          closeLabel={t.close}
        >
          {modal === "import" ? (
            <>
              <p className="muted">{t.importIntro}</p>
              <a
                className="text-button"
                href="/inventory-template.csv"
                download
              >
                <ArrowDownToLine size={16} />
                {locale === "ar" ? "تحميل قالب CSV" : "Download CSV template"}
              </a>
              <label className="file-input">
                <Upload size={25} />
                <strong>
                  {locale === "ar" ? "اختر ملف CSV" : "Choose a CSV file"}
                </strong>
                <span>UTF-8 · 1,000 rows maximum · 1 MB</span>
                <input
                  aria-label="CSV file"
                  type="file"
                  accept=".csv,text/csv"
                  disabled={busy}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setFormError("");
                    setPreview(null);
                    if (file.size > 1000000) {
                      setFormError("File exceeds 1 MB");
                      return;
                    }
                    setCsv(await file.text());
                    setFileName(file.name);
                  }}
                />
              </label>
              <label>
                {locale === "ar"
                  ? "أو الصق محتوى CSV"
                  : "Or paste CSV contents"}
                <textarea
                  aria-label="CSV contents"
                  rows={5}
                  value={csv}
                  disabled={busy}
                  onChange={(e) => {
                    setCsv(e.target.value);
                    setPreview(null);
                  }}
                  placeholder="code,structure_code,city,zone,latitude,longitude,uncertainty_m,orientation"
                  dir="ltr"
                />
              </label>
              {preview && (
                <div className="preview-result" role="status">
                  <strong>
                    {preview.rows.length}{" "}
                    {locale === "ar" ? "صف صالح" : "valid rows"} ·{" "}
                    {preview.errors.length} {locale === "ar" ? "خطأ" : "errors"}
                  </strong>
                  {preview.errors.length > 0 && (
                    <ul>
                      {preview.errors.map((e, i) => (
                        <li key={i}>
                          Row {e.row}: {e.message}
                        </li>
                      ))}
                    </ul>
                  )}
                  {preview.rows.slice(0, 5).map((r) => (
                    <div className="preview-row" key={r.code}>
                      <bdi>{r.code}</bdi>
                      <span>{r.city}</span>
                      <bdi>
                        {r.latitude}, {r.longitude}
                      </bdi>
                    </div>
                  ))}
                  {preview.rows.length > 5 && (
                    <small>+ {preview.rows.length - 5} rows</small>
                  )}
                </div>
              )}
              {formError && (
                <div className="notice danger" role="alert">
                  {formError}
                </div>
              )}
              <div className="modal-actions">
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => setModal(null)}
                >
                  {t.cancel}
                </button>
                {preview && !preview.errors.length ? (
                  <button
                    className="primary"
                    disabled={busy || !preview.rows.length}
                    onClick={() => void commit()}
                  >
                    {busy ? (
                      <LoaderCircle className="spin" size={16} />
                    ) : (
                      <Check size={16} />
                    )}{" "}
                    {t.commit}
                  </button>
                ) : (
                  <button
                    className="primary"
                    disabled={busy || !csv}
                    onClick={() => void validate()}
                  >
                    {busy && <LoaderCircle className="spin" size={16} />}{" "}
                    {t.preview}
                  </button>
                )}
              </div>
            </>
          ) : (
            <form onSubmit={createAssignment}>
              <p className="muted">
                {selected.length} {t.selected}
              </p>
              {!workers.length && (
                <div className="notice warning">
                  {locale === "ar"
                    ? "يجب إنشاء حساب موظف نشط أولاً."
                    : "Provision an active worker account before assigning visits."}
                </div>
              )}
              <label>
                {t.worker}
                <select
                  name="worker"
                  aria-label={t.worker}
                  required
                  defaultValue=""
                >
                  <option value="" disabled>
                    {t.selectWorker}
                  </option>
                  {workers.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t.due}
                <input name="due" type="date" required />
              </label>
              {formError && (
                <div className="notice danger" role="alert">
                  {formError}
                </div>
              )}
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => setModal(null)}
                >
                  {t.cancel}
                </button>
                <button className="primary" disabled={busy || !workers.length}>
                  {busy && <LoaderCircle className="spin" size={16} />}{" "}
                  {t.assign}
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </div>
  );
}
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty-state">
      <PanelsTopLeft size={30} />
      <h3>{title}</h3>
      {text && <p>{text}</p>}
    </div>
  );
}
function Modal({
  title,
  close,
  closeLabel,
  children,
}: {
  title: string;
  close: () => void;
  closeLabel: string;
  children: React.ReactNode;
}) {
  const closeRef = useRef(close);
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    closeRef.current = close;
  }, [close]);
  useEffect(() => {
    const active = document.activeElement as HTMLElement;
    dialogRef.current?.querySelector<HTMLElement>("button")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    document.addEventListener("keydown", key);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = "";
      active?.focus();
    };
  }, []);
  return (
    <div className="modal-backdrop">
      <dialog
        open
        aria-modal="true"
        aria-labelledby="modal-title"
        ref={dialogRef}
        onKeyDown={(e) => {
          if (e.key !== "Tab") return;
          const items = Array.from(
            e.currentTarget.querySelectorAll<HTMLElement>(
              "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]",
            ),
          );
          const first = items[0],
            last = items.at(-1);
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }}
      >
        <div className="modal-heading">
          <h2 id="modal-title">{title}</h2>
          <button
            className="icon-button"
            aria-label={closeLabel}
            onClick={close}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </dialog>
    </div>
  );
}
