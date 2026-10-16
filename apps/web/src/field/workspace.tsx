"use client";
import { useEffect, useState, useCallback } from "react";
import { liveQuery } from "dexie";
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
  MapPin,
  ArrowLeft,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  HardDrive,
  CheckCircle,
} from "lucide-react";
import type { Actor } from "@ibvs/domain";
import type { Assignment } from "../server/service";
import { FieldStore, type Draft } from "./store";
import { fieldRequest, replayQueue, SyncError } from "./sync";
import { fieldStrings, type FieldText } from "./strings";
import Capture from "./capture";
import { storageError } from "../../../../packages/domain/src/inspection";

type InstallEvent = Event & { prompt: () => Promise<void> };
const ownerKey = "ibvs-field-owner-v2";
export default function FieldWorkspace() {
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
    [error, setError] = useState<keyof FieldText | null>(null),
    [busy, setBusy] = useState(false),
    [shell, setShell] = useState(false),
    [install, setInstall] = useState<InstallEvent | null>(null),
    [storage, setStorage] = useState<{
      usage: number;
      quota: number;
      persistent: boolean;
    } | null>(null);
  const t = fieldStrings[locale];
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
    const subscription = liveQuery(() => store.drafts.toArray()).subscribe({
      next: setDrafts,
      error: () => setError("storage_unavailable"),
    });
    return () => subscription.unsubscribe();
  }, [store]);
  const diagnostics = useCallback(async () => {
    try {
      const [estimate, persistent] = await Promise.all([
        navigator.storage?.estimate(),
        navigator.storage?.persisted(),
      ]);
      if (estimate)
        setStorage({
          usage: estimate.usage || 0,
          quota: estimate.quota || 0,
          persistent: !!persistent,
        });
    } catch {
      setError("storageError");
    }
  }, []);
  useEffect(() => {
    void diagnostics();
  }, [diagnostics, drafts.length]);
  useEffect(() => {
    if (!store || !online) return;
    const sync = () => {
      void replayQueue(store).catch(() => setError("storage_unavailable"));
    };
    sync();
    const timer = setInterval(sync, 10000);
    return () => clearInterval(timer);
  }, [store, online]);
  async function download() {
    if (!store) return;
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
      await diagnostics();
    } catch (e) {
      setError(e instanceof SyncError ? "downloadError" : storageError(e));
    } finally {
      setBusy(false);
    }
  }
  async function openTask(task: Assignment) {
    if (!store) return;
    setBusy(true);
    setError(null);
    try {
      let challenge: Draft["challenge"] = null;
      const existing = await store.drafts.get(task.assignment_id);
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
    } catch (e) {
      setError(storageError(e));
    } finally {
      setBusy(false);
    }
  }
  const draft = drafts.find((d) => d.id === opened);
  const stateText = (d: Draft) =>
    d.state === "local_draft"
      ? t.local
      : d.state === "queued"
        ? t.queued
        : d.state === "uploading"
          ? t.uploading
          : d.state === "blocked"
            ? t.blocked
            : t.received;
  const status = (d: Draft) => (
    <div
      className={"field-sync-state " + (d.receipt ? "receipt-confirmed" : "")}
      role="status"
    >
      <strong>
        {d.receipt ? <CheckCircle size={18} /> : <HardDrive size={18} />}{" "}
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
        </div>
      </header>
      <main id="field-main">
        <div className="field-heading">
          <div>
            <span className="eyebrow">{actor?.name || "IBVS"}</span>
            <h1>{t.title}</h1>
            <p>{t.subtitle}</p>
          </div>
          {actor && (
            <button
              className="icon-button"
              aria-label={t.signout}
              onClick={async () => {
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
              }}
            >
              <LogOut size={20} />
            </button>
          )}
        </div>
        <div className="field-readiness">
          <span className={shell ? "ready" : "not-ready"}>
            {shell ? <ShieldCheck size={16} /> : <RefreshCw size={16} />}{" "}
            {shell ? t.shellReady : t.shellPending}
          </span>
          {install && (
            <button
              className="text-button"
              onClick={async () => {
                await install.prompt();
                setInstall(null);
              }}
            >
              {t.install}
              <Download size={16} />
            </button>
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
                <section className="field-list-heading">
                  <div>
                    <h2>{t.tasks}</h2>
                    <p>{t.downloadFirst}</p>
                  </div>
                  <button
                    className="primary"
                    disabled={!online || busy || !store}
                    onClick={() => void download()}
                  >
                    <Download size={17} />
                    {t.download}
                  </button>
                </section>
                <div className="field-visits">
                  {tasks.length ? (
                    tasks.map((task) => {
                      const saved = drafts.find(
                        (d) => d.id === task.assignment_id,
                      );
                      return (
                        <article
                          className="panel field-visit"
                          key={task.assignment_id}
                        >
                          <div className="field-visit-title">
                            <span className="task-pin">
                              <MapPin size={21} />
                            </span>
                            <span className="badge">
                              {task.status.replaceAll("_", " ")}
                            </span>
                          </div>
                          <h3>
                            <bdi>{task.code}</bdi>
                          </h3>
                          <p>
                            {task.city} · {task.zone}
                          </p>
                          <div className="field-task-meta">
                            <span>
                              {t.due}: <bdi>{task.due_date}</bdi>
                            </span>
                            <span>
                              {cachedIds.includes(task.assignment_id)
                                ? t.downloaded
                                : t.downloadFirst}
                            </span>
                          </div>
                          {saved && status(saved)}
                          <button
                            className="secondary"
                            disabled={
                              busy ||
                              (!saved &&
                                !["assigned", "resurvey_requested"].includes(
                                  task.status,
                                )) ||
                              (!cachedIds.includes(task.assignment_id) &&
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
                  ) : (
                    <div className="empty-state">{t.empty}</div>
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
                          {draft.task.latitude}, {draft.task.longitude}
                        </bdi>
                      </dd>
                    </div>
                    <div>
                      <dt>{t.unverified}</dt>
                      <dd>
                        ± {draft.task.uncertainty_m} m {t.uncertainty}
                      </dd>
                    </div>
                  </dl>
                </section>
                {status(draft)}
                <Capture
                  key={draft.id}
                  store={store}
                  draft={draft}
                  t={t}
                  online={online}
                />
                <section className="panel field-submit">
                  <p>{t.queueNote}</p>
                  {draft.state === "local_draft" ? (
                    <button
                      className="primary"
                      disabled={
                        busy || !draft.photos.front || !draft.photos.wide
                      }
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await store.queue(draft.id);
                          setError(null);
                          if (online) await replayQueue(store);
                        } catch (e) {
                          setError(
                            e instanceof Error && e.message.includes("Front")
                              ? "missing"
                              : storageError(e),
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
                  <p className="field-caption">{t.retained}</p>
                </section>
              </>
            ) : (
              <p role="status">{t.loading}</p>
            )}
            <section className="panel field-storage">
              <div>
                <h2>
                  <HardDrive size={19} />
                  {t.storage}
                </h2>
                <p>
                  {storage ? (
                    <>
                      <bdi>
                        {(storage.usage / 1048576).toFixed(1)} MB /{" "}
                        {(storage.quota / 1048576).toFixed(0)} MB
                      </bdi>{" "}
                      · {t.quota}
                    </>
                  ) : (
                    t.storageError
                  )}
                </p>
                <strong>
                  {storage?.persistent ? t.persistent : t.evictable}
                </strong>
              </div>
              <button
                className="secondary"
                onClick={async () => {
                  try {
                    await navigator.storage?.persist();
                    await diagnostics();
                  } catch {
                    setError("storageError");
                  }
                }}
              >
                {t.persist}
              </button>
              {storage &&
                storage.quota > 0 &&
                storage.usage / storage.quota > 0.8 && (
                  <p className="notice warning">{t.storage_full}</p>
                )}
              <p>{t.storageNote}</p>
            </section>
            <p className="field-caption">{t.installGuide}</p>
            <Link className="text-button" href="/">
              {t.home}
              <ArrowRight size={16} />
            </Link>
          </>
        )}
      </main>
    </div>
  );
}
