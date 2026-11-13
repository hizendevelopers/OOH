"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { liveQuery } from "dexie";
import { cityCounts, needsLocationAttention } from "../components/city-tabs";
import Link from "next/link";
import {
  Compass,
  Download,
  Wifi,
  WifiOff,
  Languages,
  Moon,
  Sun,
  LogOut,
  ArrowLeft,
  ArrowRight,
  RefreshCw,
  Clock,
  CheckCircle,
  Search,
  MapPin,
  Plus,
} from "lucide-react";
import type { Actor } from "@ibvs/domain";
import { matchesFilter } from "@ibvs/domain";
import { FieldMenu } from "./menu";
import VisitSteps, { type VisitStep } from "./visit-steps";
import type { Assignment } from "../server/service";
import { FieldStore, hasRequiredPhotos, type Draft } from "./store";
import { fieldRequest, replayQueue, SyncError } from "./sync";
import { fieldStrings, type FieldText } from "./strings";
import Capture from "./capture";
import { storageError } from "../../../../packages/domain/src/inspection";
import { Nearby } from "./nearby";
import VisitCard from "./visit-card";
import { platformOf } from "./gallery-file";
import { getLocation } from "./device";
import { sortVisits } from "../../../../packages/domain/src/worker-visit";
import NewSite, { type RegisteredSite } from "./new-site";
import {
  assessPhotoLocation,
  locationMessages,
  locationMessagesAr,
} from "./location-policy";

type InstallEvent = Event & { prompt: () => Promise<void> };
const ownerKey = "ibvs-field-owner-v2";
export default function FieldWorkspace() {
  const requestedVisitHandled = useRef(false);
  const [cityFilter, setCityFilter] = useState("");
  const [locale, setLocale] = useState<"en" | "ar">("en"),
    [dark, setDark] = useState(false),
    [online, setOnline] = useState(true),
    [actor, setActor] = useState<Actor | null>(null),
    [store, setStore] = useState<FieldStore | null>(null),
    [tasks, setTasks] = useState<Assignment[]>([]),
    [cachedIds, setCachedIds] = useState<string[]>([]),
    [drafts, setDrafts] = useState<Draft[]>([]),
    [opened, setOpened] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [locationError, setLocationError] = useState<string | null>(null),
    [clock, setClock] = useState(0),
    [error, setError] = useState<keyof FieldText | null>(null),
    [busy, setBusy] = useState(false),
    [shell, setShell] = useState(false),
    [install, setInstall] = useState<InstallEvent | null>(null),
    [newSite, setNewSite] = useState(false),
    [visitSort, setVisitSort] = useState<"due" | "nearest">("due"),
    [origin, setOrigin] = useState<{ latitude: number; longitude: number } | null>(null),
    [locatingVisits, setLocatingVisits] = useState(false),
    [sortNotice, setSortNotice] = useState<string | null>(null),
    [search, setSearch] = useState(""),
    [nearbyOpen, setNearbyOpen] = useState(false),
    [step, setStep] = useState<VisitStep>("photos");
  const t = fieldStrings[locale];
  const messages = locale === "ar" ? locationMessagesAr : locationMessages;
  useEffect(() => {
    setClock(Date.now());
    const timer = setInterval(() => setClock(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const language = localStorage.getItem("ibvs-locale");
    if (language === "ar") setLocale("ar");
    setDark(localStorage.getItem("ibvs-theme") === "dark");
    const connection = () => setOnline(navigator.onLine);
    connection();
    window.addEventListener("online", connection);
    window.addEventListener("offline", connection);
    const prompt = (event: Event) => {
      event.preventDefault();
      setInstall(event as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", prompt);
    if ("serviceWorker" in navigator && window.isSecureContext) {
      navigator.serviceWorker
        .register("/field-sw.js", { scope: "/", updateViaCache: "none" })
        .then(() => navigator.serviceWorker.ready)
        .then(() => setShell(true))
        .catch(() => setShell(false));
    }
    return () => {
      window.removeEventListener("online", connection);
      window.removeEventListener("offline", connection);
      window.removeEventListener("beforeinstallprompt", prompt);
    };
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [locale, dark]);
  useEffect(() => {
    let active = true;
    let database: FieldStore | undefined;
    const open = async () => {
      let user: Actor;
      try {
        if (localStorage.getItem("ibvs-field-locked") === "1")
          throw new SyncError(401, "Device locked");
        user = await fieldRequest<Actor>("me");
        if (user.role !== "worker") throw new SyncError(403, "Worker only");
        try {
          localStorage.setItem(ownerKey, JSON.stringify(user));
        } catch {
          if (active) setError("storage_unavailable");
        }
      } catch (e) {
        if (e instanceof SyncError && [401, 403].includes(e.status)) {
          if (active) {
            setError(e.status === 403 ? "workerOnly" : "signin");
            setLoading(false);
          }
          return;
        }
        const cached = localStorage.getItem(ownerKey);
        try {
          user = JSON.parse(cached || "null");
          if (!user?.id || !user.organizationId || user.role !== "worker")
            throw new Error("No cached worker");
        } catch {
          if (active) {
            setError("signin");
            setLoading(false);
          }
          return;
        }
      }
      if (!active) return;
      setActor(user);
      database = new FieldStore(user);
      try {
        await database.open();
        const saved = await database.tasks.toArray();
        if (!active) {
          database.close();
          return;
        }
        setStore(database);
        setTasks(saved);
        setCachedIds(saved.map((task) => task.assignment_id));
        try {
          const current = await fieldRequest<Assignment[]>("assignments");
          if (active) setTasks(current);
        } catch {
          /* Only explicitly downloaded records are available offline. */
        }
      } catch (e) {
        if (active) setError(storageError(e));
      } finally {
        if (active) setLoading(false);
      }
    };
    void open();
    return () => {
      active = false;
      database?.close();
    };
  }, []);
  useEffect(() => {
    if (!store) return;
    void store.reopenIncomplete().catch(() => setError("storage_unavailable"));
    // Visits the server already holds keep only their receipt on this phone.
    void store.releaseReceived().catch(() => setError("storage_unavailable"));
    const subscription = liveQuery(() => store.drafts.toArray()).subscribe({
      next: setDrafts,
      error: () => setError("storage_unavailable"),
    });
    return () => subscription.unsubscribe();
  }, [store]);
  useEffect(() => {
    if (!store || !online) return;
    const sync = () => {
      void replayQueue(store).catch(() => setError("storage_unavailable"));
    };
    sync();
    const timer = setInterval(sync, 10000);
    return () => clearInterval(timer);
  }, [store, online]);
  async function download(): Promise<Assignment[] | undefined> {
    if (!store) return undefined;
    setBusy(true);
    setError(null);
    try {
      const me = await fieldRequest<Actor>("me");
      if (
        me.id !== store.owner.id ||
        me.organizationId !== store.owner.organizationId
      )
        throw new SyncError(403, "Changed account");
      const current = await fieldRequest<Assignment[]>("assignments");
      await store.download(current);
      setTasks(current);
      setCachedIds(current.map((task) => task.assignment_id));
      return current;
    } catch (e) {
      setError(e instanceof SyncError ? "downloadError" : storageError(e));
      return undefined;
    } finally {
      setBusy(false);
    }
  }
  const openTask = useCallback(
    async (task: Assignment) => {
      if (!store) return;
      setBusy(true);
      setError(null);
      try {
        let challenge: Draft["challenge"] = null;
        const existing = await store.drafts.get(task.assignment_id);
        if (online) {
          const current = await fieldRequest<Assignment>(
            `assignments/${task.assignment_id}`,
          );
          task = current;
          await store.tasks.put({
            ...current,
            downloadedAt: new Date().toISOString(),
          });
          setCachedIds((ids) =>
            ids.includes(current.assignment_id)
              ? ids
              : [...ids, current.assignment_id],
          );
        }
        if (
          !existing &&
          !["assigned", "resurvey_requested"].includes(task.status)
        )
          throw new SyncError(409, "Assignment no longer accepts capture");
        if (!existing && online)
          try {
            challenge = await fieldRequest("inspections/challenge", {
              assignmentId: task.assignment_id,
            });
          } catch {
            /* Unchallenged evidence is explicitly labeled. */
          }
        await store.start(task, challenge);
        setOpened(task.assignment_id);
        setLocationError(null);
      } catch (e) {
        setError(
          e instanceof SyncError
            ? e.status === 401
              ? "session_expired"
              : e.status === 403
                ? "account_mismatch"
                : "task_conflict"
            : storageError(e),
        );
      } finally {
        setBusy(false);
      }
    },
    [store, online],
  );
  useEffect(() => {
    if (loading || !store || requestedVisitHandled.current) return;
    requestedVisitHandled.current = true;
    const assignmentId = new URLSearchParams(window.location.search).get(
      "assignment",
    );
    if (!assignmentId) return;
    const task = tasks.find((task) => task.assignment_id === assignmentId);
    if (!task) {
      setError("task_conflict");
      return;
    }
    void openTask(task);
  }, [loading, store, tasks, openTask]);
  const draft = drafts.find((d) => d.id === opened);
  // A visit opens on Photos while it is still being taken, and on Send once it has been submitted.
  const stepChosenFor = useRef<string | null>(null);
  useEffect(() => {
    if (!opened) {
      stepChosenFor.current = null;
      return;
    }
    if (!draft || stepChosenFor.current === opened) return;
    stepChosenFor.current = opened;
    setStep(draft.state === "local_draft" ? "photos" : "send");
  }, [opened, draft]);
  async function signOut() {
    localStorage.setItem("ibvs-field-locked", "1");
    localStorage.removeItem(ownerKey);
    try {
      await fetch("/api/auth/sign-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      /* Device remains locked even if server logout is interrupted. */
    }
    location.assign("/sign-in");
  }
  async function sortBy(mode: "due" | "nearest") {
    setSortNotice(null);
    if (mode === "due") {
      setVisitSort("due");
      return;
    }
    setLocatingVisits(true);
    const fix = await getLocation();
    setLocatingVisits(false);
    if (fix.status === "ok") {
      setOrigin({ latitude: fix.latitude, longitude: fix.longitude });
      setVisitSort("nearest");
    } else {
      setVisitSort("due");
      setSortNotice(t.sortUnavailable);
    }
  }
  const visibleTasks = sortVisits(
    tasks.filter(
      (task) =>
        (!cityFilter || task.city === cityFilter) &&
        matchesFilter(
          `${task.code} ${task.structure_code} ${task.city} ${task.zone} ${task.description ?? ""} ${task.worker_address ?? ""}`,
          search,
        ),
    ),
    visitSort,
    visitSort === "nearest" ? origin : null,
  );
  // Opening a visit that still needs photos brings the camera into view.
  useEffect(() => {
    if (!opened || !draft?.id || draft.state !== "local_draft") return;
    document.querySelector(".field-live")?.scrollIntoView({ block: "start" });
  }, [opened, draft?.id, draft?.state]);
  const reviewLabel = (d: Draft) => {
    const state = tasks.find(
      (task) => task.assignment_id === d.id,
    )?.review_state;
    if (!state || state === "pending") return t.received;
    return locale === "ar"
      ? (
          {
            approved: "المعاينة معتمدة — لا يعني اعتماد مرجع",
            rejected: "المعاينة مرفوضة",
            resurvey_requested: "إعادة معاينة مطلوبة — افتح المهمة الجديدة",
            ambiguous: "الهوية ملتبسة — قيد المراجعة",
          } as Record<string, string>
        )[state]
      : (
          {
            approved: "Inspection approved — reference enrollment is separate",
            rejected: "Inspection rejected",
            resurvey_requested: "Resurvey requested — open the new task",
            ambiguous: "Ambiguous identity — under review",
          } as Record<string, string>
        )[state];
  };
  const stateText = (d: Draft) =>
    d.state === "local_draft"
      ? t.local
      : d.state === "queued"
        ? t.queued
        : d.state === "uploading"
          ? t.uploading
          : d.state === "blocked"
            ? t.blocked
            : reviewLabel(d);
  const status = (d: Draft) => (
    <div
      className={"field-sync-state " + (d.receipt ? "receipt-confirmed" : "")}
      role="status"
    >
      <strong>
        {d.receipt ? <CheckCircle size={18} /> : <Clock size={18} />}{" "}
        {stateText(d)}
      </strong>
      {d.state === "uploading" && (
        <progress max={100} value={d.progress} aria-label={t.uploading} />
      )}
      <p>
        {d.lastError
          ? t[d.lastError as keyof FieldText] || t.task_conflict
          : d.receipt
            ? t.receivedTime + ": " + d.receipt.receivedAt
            : t.localReceiptWarning}
      </p>
      {d.receipt && (
        <p>
          {t.receipt}: <bdi>{d.receipt.receiptId}</bdi>
        </p>
      )}
      {tasks.find((task) => task.assignment_id === d.id)?.review_state &&
        tasks.find((task) => task.assignment_id === d.id)?.review_state !==
          "pending" && (
          <p>
            {locale === "ar"
              ? "آخر مراجعة محفوظة على الجهاز"
              : "Latest review downloaded to this device"}
            : {tasks.find((task) => task.assignment_id === d.id)?.review_reason}
          </p>
        )}
      {["session_expired", "account_mismatch"].includes(d.lastError || "") && (
        <Link href="/sign-in" className="text-button">
          {t.signin}
        </Link>
      )}
    </div>
  );
  return (
    <div className="field-app">
      <a href="#field-main" className="skip-link">
        {t.title}
      </a>
      <header className="field-topbar">
        <Link className="brand" href="/field">
          <span className="brand-icon">
            <Compass />
          </span>
          <span>
            IBVS<small className="brand-sub">FIELD OPERATIONS</small>
          </span>
        </Link>
        <div>
          <span className="field-connection">
            {online ? <Wifi size={17} /> : <WifiOff size={17} />}
            <span>{online ? t.online : t.offline}</span>
          </span>
          <button
            className="icon-button"
            aria-label="Switch language"
            onClick={() => {
              const next = locale === "en" ? "ar" : "en";
              setLocale(next);
              localStorage.setItem("ibvs-locale", next);
            }}
          >
            <Languages size={19} />
          </button>
          <button
            className="icon-button"
            aria-label={t.theme}
            onClick={() => {
              setDark(!dark);
              localStorage.setItem("ibvs-theme", dark ? "light" : "dark");
            }}
          >
            {dark ? <Sun size={19} /> : <Moon size={19} />}
          </button>
          {actor && (
            <FieldMenu
              label={t.menu}
              items={[
                {
                  label: t.registerSite,
                  icon: <Plus size={17} />,
                  disabled: !online || busy || !store,
                  onSelect: () => {
                    setOpened(null);
                    setNewSite(true);
                  },
                },
                {
                  label: t.findNearby,
                  icon: <MapPin size={17} />,
                  onSelect: () => {
                    setOpened(null);
                    setNearbyOpen(true);
                  },
                },
                ...(install
                  ? [
                      {
                        label: t.install,
                        icon: <Download size={17} />,
                        onSelect: () => {
                          void install.prompt().finally(() => setInstall(null));
                        },
                      },
                    ]
                  : []),
                { label: t.signout, icon: <LogOut size={17} />, onSelect: () => void signOut() },
              ]}
            />
          )}
        </div>
      </header>
      <main id="field-main">
        <div className="field-heading">
          <div>
            <span className="eyebrow">{actor?.name || "IBVS"}</span>
            <h1>{t.title}</h1>
          </div>
        </div>
        {/* Offline readiness is shown only while it is not ready; the marker lets tests wait for it. */}
        <div className="field-readiness" data-offline-ready={shell ? "true" : "false"}>
          {!shell && (
            <span className="not-ready">
              <RefreshCw size={16} /> {t.shellPending}
            </span>
          )}
        </div>
        {!online && (
          <div className="notice warning">
            {t.offline}. {t.localReceiptWarning}
          </div>
        )}
        {error && (
          <div className="notice danger" role="alert">
            {t[error]}
            {["signin", "session_expired", "account_mismatch"].includes(
              error,
            ) && (
              <Link className="text-button" href="/sign-in">
                {t.signin}
              </Link>
            )}
          </div>
        )}
        {loading ? (
          <p role="status" className="loading">
            {t.loading}
          </p>
        ) : !actor ? (
          <Link href="/sign-in" className="primary">
            {t.signin}
          </Link>
        ) : (
          <>
            {!opened ? (
              <>
                {newSite && (
                  <NewSite
                    arabic={locale === "ar"}
                    onCancel={() => setNewSite(false)}
                    onRegistered={async (site: RegisteredSite) => {
                      setNewSite(false);
                      const list = await download();
                      const task = list?.find((a) => a.assignment_id === site.assignmentId);
                      if (task) await openTask(task);
                      else setError("storage_unavailable");
                    }}
                  />
                )}
                {nearbyOpen && (
                  <>
                    <button className="text-button" onClick={() => setNearbyOpen(false)}>
                      <ArrowLeft size={17} />
                      {t.back}
                    </button>
                    <Nearby
                      arabic={locale === "ar"}
                      tasks={tasks.filter(
                        (task) => online || cachedIds.includes(task.assignment_id),
                      )}
                      online={online}
                      busy={busy}
                      onOpen={openTask}
                    />
                  </>
                )}
                <h2 className="field-list-title">{t.tasks}</h2>
                <div className="field-toolbar">
                  <label className="field-search">
                    <Search size={17} aria-hidden="true" />
                    <input
                      type="search"
                      aria-label={t.searchVisits}
                      placeholder={t.searchPlaceholder}
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                  <select
                    aria-label={t.cityFilter}
                    value={cityFilter}
                    onChange={(e) => setCityFilter(e.target.value)}
                  >
                    <option value="">
                      {t.allCities} ({tasks.length})
                    </option>
                    {cityCounts(tasks, needsLocationAttention).map((c) => (
                      <option key={c.city} value={c.city}>
                        {c.city} ({c.count})
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label={t.sortBy}
                    value={visitSort}
                    disabled={locatingVisits}
                    onChange={(e) => void sortBy(e.target.value as "due" | "nearest")}
                  >
                    <option value="due">{t.sortDue}</option>
                    <option value="nearest">{locatingVisits ? "…" : t.sortNearest}</option>
                  </select>
                  <button
                    className="icon-button"
                    aria-label={t.download}
                    title={t.download}
                    disabled={!online || busy || !store}
                    onClick={() => void download()}
                  >
                    <Download size={18} />
                  </button>
                </div>
                {sortNotice && <p className="notice" role="status">{sortNotice}</p>}
                <div className="field-visits">
                  {!tasks.length ? (
                    <div className="empty-state">{t.empty}</div>
                  ) : !visibleTasks.length ? (
                    <div className="empty-state">{t.noMatches}</div>
                  ) : (
                    visibleTasks.map((task) => {
                      const saved = drafts.find(
                        (d) => d.id === task.assignment_id,
                      );
                      return (
                        <article
                          className="panel field-visit"
                          key={task.assignment_id}
                        >
                          <VisitCard
                            task={task}
                            ar={locale === "ar"}
                            cached={cachedIds.includes(task.assignment_id)}
                            online={online}
                            platform={platformOf(navigator.userAgent)}
                            downloaded={t.downloaded}
                            downloadFirst={t.downloadFirst}
                            onAddressSaved={(assignmentId, address) =>
                              setTasks((list) =>
                                list.map((item) =>
                                  item.assignment_id === assignmentId ? { ...item, worker_address: address } : item,
                                ),
                              )
                            }
                          />
                          {task.instructions && (
                            <div className="review-alert">
                              <strong>
                                {locale === "ar"
                                  ? "تعليمات إعادة المعاينة"
                                  : "Resurvey instructions"}
                              </strong>
                              <p>{task.instructions}</p>
                              <small>
                                {locale === "ar"
                                  ? "مرتبطة بالمعاينة"
                                  : "Linked inspection"}
                                : <bdi>{task.parent_inspection_id}</bdi>
                              </small>
                            </div>
                          )}
                          {task.review_reason && (
                            <p className="notice">
                              {locale === "ar"
                                ? "سبب قرار المشرف"
                                : "Supervisor decision reason"}
                              : {task.review_reason}
                            </p>
                          )}
                          {saved && status(saved)}
                          <button
                            className="secondary"
                            disabled={
                              busy ||
                              (!saved &&
                                !["assigned", "resurvey_requested"].includes(
                                  task.status,
                                )) ||
                              (!online &&
                                !cachedIds.includes(task.assignment_id) &&
                                !saved)
                            }
                            onClick={() => void openTask(task)}
                          >
                            {saved ? t.continue : t.open}
                            <ArrowRight size={17} />
                          </button>
                        </article>
                      );
                    })
                  )}
                </div>
                {drafts.some(
                  (d) => !tasks.some((task) => task.assignment_id === d.id),
                ) && (
                  <section className="panel field-orphans">
                    <h2>{t.history}</h2>
                    {drafts
                      .filter(
                        (d) =>
                          !tasks.some((task) => task.assignment_id === d.id),
                      )
                      .map((d) => (
                        <article key={d.id}>
                          <h3>
                            <bdi>{d.task.code}</bdi>
                          </h3>
                          {status(d)}
                          <button
                            className="secondary"
                            onClick={() => setOpened(d.id)}
                          >
                            {t.continue}
                          </button>
                        </article>
                      ))}
                  </section>
                )}
              </>
            ) : draft && store ? (
              <>
                <button className="text-button" onClick={() => setOpened(null)}>
                  <ArrowLeft size={17} />
                  {t.back}
                </button>
                <section className="panel field-identity">
                  <span className="eyebrow">{t.locked}</span>
                  <h2>
                    <bdi>{draft.task.code}</bdi>
                  </h2>
                  <p>
                    {draft.task.city} · {draft.task.zone}
                  </p>
                  {draft.task.instructions && (
                    <div className="notice warning">
                      <strong>
                        {locale === "ar"
                          ? "تعليمات إعادة المعاينة"
                          : "Resurvey instructions"}
                      </strong>
                      <p>{draft.task.instructions}</p>
                      <bdi>{draft.task.parent_inspection_id}</bdi>
                    </div>
                  )}
                  <dl>
                    <div>
                      <dt>{t.structure}</dt>
                      <dd>
                        <bdi>
                          {draft.task.structure_code} / {draft.task.orientation}
                        </bdi>
                      </dd>
                    </div>
                    <div>
                      <dt>{t.original}</dt>
                      <dd>
                        <bdi>
                          {draft.task.latitude === null || draft.task.longitude === null
                            ? (locale === "ar" ? "بانتظار الموقع GPS" : "Pending GPS")
                            : `${draft.task.latitude}, ${draft.task.longitude}`}
                        </bdi>
                      </dd>
                    </div>
                    <div>
                      <dt>{t.unverified}</dt>
                      <dd>± {draft.task.uncertainty_m} m</dd>
                    </div>
                  </dl>
                </section>
                <VisitSteps
                  step={step}
                  onStep={setStep}
                  t={t}
                  done={{
                    photos: hasRequiredPhotos(draft),
                    brand: !!draft.brand,
                    send: draft.state !== "local_draft",
                  }}
                />
                {step !== "send" && (
                  <>
                    <Capture
                      arabic={locale === "ar"}
                      key={draft.id}
                      store={store}
                      draft={draft}
                      t={t}
                      online={online}
                      step={step}
                      onBrandChosen={() => setStep("send")}
                    />
                    <button
                      className="primary field-next"
                      onClick={() => {
                        setStep(step === "photos" ? "brand" : "send");
                        window.scrollTo({ top: 0 });
                      }}
                    >
                      {t.next}
                      <ArrowRight size={17} />
                    </button>
                  </>
                )}
                {step === "send" && (
                <section className="panel field-submit">
                  {status(draft)}
                  <h2>{t.checklist}</h2>
                  <ul className="field-checklist">
                    {(["front", "wide"] as const).map((k) => (
                      <li key={k} className={draft.photos[k] ? "done" : ""}>
                        {draft.photos[k] ? <CheckCircle size={17} /> : <Clock size={17} />}
                        <span>
                          {k === "front" ? t.front : t.wide}
                          {!draft.photos[k] && <small>{t.missingPhoto}</small>}
                        </span>
                      </li>
                    ))}
                    <li className={hasRequiredPhotos(draft) ? "done" : ""}>
                      {hasRequiredPhotos(draft) ? <CheckCircle size={17} /> : <Clock size={17} />}
                      <span>
                        {t.angle}
                        {!hasRequiredPhotos(draft) && <small>{t.missingPhoto}</small>}
                      </span>
                    </li>
                    <li className={draft.brand ? "done" : ""}>
                      {draft.brand ? <CheckCircle size={17} /> : <Clock size={17} />}
                      <span>
                        {t.brandTitle}
                        <small>
                          {draft.brand
                            ? draft.brand.kind === "advertiser"
                              ? draft.brand.text
                              : draft.brand.kind === "blank"
                                ? t.brandBlank
                                : t.brandUnreadable
                            : t.missingBrand}
                        </small>
                      </span>
                    </li>
                  </ul>
                  {draft.task.location_exception &&
                    Date.parse(draft.task.location_exception.expires_at) >
                      clock && (
                      <p className="notice warning">
                        {locale === "ar"
                          ? "استثناء الموقع من المشرف:"
                          : "Supervisor location exception:"}{" "}
                        {draft.task.location_exception.reason}.{" "}
                        {locale === "ar" ? "ينتهي" : "Expires"}{" "}
                        {new Date(
                          draft.task.location_exception.expires_at,
                        ).toLocaleString()}
                        .{" "}
                        {locale === "ar"
                          ? "لا تزال المراجعة البشرية مطلوبة."
                          : "Human review is still required."}
                      </p>
                    )}
                  {Object.values(draft.photos).map((photo) => {
                    const result = assessPhotoLocation(photo, draft.task);
                    return result.status !== "within_area" && result.status !== "first_capture" ? (
                      <p key={photo.kind} className="notice warning">
                        {photo.kind}: {messages[result.status]}{" "}
                        {locale === "ar"
                          ? "الصورة محفوظة كمسودة."
                          : "Photo remains saved as a draft."}
                      </p>
                    ) : null;
                  })}
                  {locationError && (
                    <p className="notice danger" role="alert">
                      {locationError}
                    </p>
                  )}
                  {draft.state === "local_draft" ? (
                    <button
                      className="primary"
                      disabled={
                        busy || !hasRequiredPhotos(draft)
                      }
                      onClick={async () => {
                        setBusy(true);
                        setLocationError(null);
                        try {
                          if (online) {
                            const current = await fieldRequest<Assignment>(
                              `assignments/${draft.id}`,
                            );
                            if (
                              current.version !== draft.task.version ||
                              current.id !== draft.task.id ||
                              current.code !== draft.task.code
                            )
                              throw new Error(
                                locale === "ar"
                                  ? "تغيرت المهمة. احتفظ بالصور واتصل بالمشرف."
                                  : "Assignment changed. Keep the saved photos and contact your supervisor.",
                              );
                            await store.drafts.update(draft.id, {
                              task: current,
                            });
                          }
                          await store.queue(draft.id);
                          setError(null);
                          if (online) await replayQueue(store);
                        } catch (e) {
                          const message =
                            e instanceof Error
                              ? e.message
                              : "Unable to send the photos. Try again.";
                          const known = Object.entries(locationMessages).find(
                            ([, text]) => text === message,
                          )?.[0] as keyof typeof locationMessages | undefined;
                          setLocationError(
                            known
                              ? messages[known]
                              : message === "brand-required"
                                ? t.brandNeeded
                                : message,
                          );
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      {t.queue}
                    </button>
                  ) : (
                    draft.state !== "server_received" && (
                      <button
                        className="primary"
                        disabled={busy || !online}
                        onClick={async () => {
                          setBusy(true);
                          try {
                            await store.drafts.update(draft.id, {
                              state: "queued",
                              nextAttemptAt: 0,
                            });
                            await replayQueue(store);
                          } catch {
                            setError("storage_unavailable");
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        <RefreshCw size={17} />
                        {t.retry}
                      </button>
                    )
                  )}
                </section>
                )}
              </>
            ) : (
              <p role="status">{t.loading}</p>
            )}
          </>
        )}
      </main>
    </div>
  );
}
