"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  Camera,
  MapPin,
  Check,
  AlertTriangle,
  RefreshCw,
  VideoOff,
} from "lucide-react";
import { FieldStore, digestBlob, type Draft, type LocalPhoto } from "./store";
import { getLocation, photograph } from "./device";
import {
  PHOTO_LIMIT,
  photoKinds,
  allPhotoKinds,
  angleKinds,
  storageError,
  type GpsObservation,
  type PhotoKind,
} from "../../../../packages/domain/src/inspection";
import type { FieldText } from "./strings";
import type { BrandEntry } from "../../../../packages/domain/src/brand";
import {
  assessPhotoLocation,
  locationMessages,
  locationMessagesAr,
} from "./location-policy";
import { LocationMap } from "./location-map";
import { verificationReason } from "./verification-messages";
import {
  advisoryGalleryCheck,
  platformOf,
  withGalleryType,
  type GalleryWarning,
} from "./gallery-file";

function Photo({ photo, label }: { photo: LocalPhoto; label: string }) {
  const [url, setUrl] = useState("");
  const heic = /heic|heif/i.test(photo.blob.type);
  useEffect(() => {
    if (heic) return;
    const value = URL.createObjectURL(photo.blob);
    setUrl(value);
    return () => URL.revokeObjectURL(value);
  }, [photo.blob, heic]);
  // Most desktop and Android browsers cannot display HEIC; the original is kept and the server reads it.
  return url && !heic ? (
    <Image
      src={url}
      alt={label}
      width={640}
      height={480}
      unoptimized
      className="field-photo"
    />
  ) : null;
}
export default function Capture({
  store,
  draft,
  t,
  online,
  arabic = false,
  step = "photos",
  onBrandChosen,
}: {
  store: FieldStore;
  draft: Draft;
  t: FieldText;
  online: boolean;
  arabic?: boolean;
  step?: "photos" | "brand";
  onBrandChosen?: () => void;
}) {
  const messages = arabic ? locationMessagesAr : locationMessages;
  const video = useRef<HTMLVideoElement>(null),
    stream = useRef<MediaStream | null>(null),
    mounted = useRef(true),
    allowed = useRef(draft.state === "local_draft"),
    requestVersion = useRef(0),
    fileInput = useRef<HTMLInputElement>(null);
  const [camera, setCamera] = useState(false),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [kind, setKind] = useState<PhotoKind>("front"),
    [gps, setGps] = useState<GpsObservation | null>(null),
    [locating, setLocating] = useState(false),
    [error, setError] = useState<keyof FieldText | null>(null),
    [now, setNow] = useState(0),
    [pending, setPending] = useState<LocalPhoto | null>(null),
    [galleryNotice, setGalleryNotice] = useState<{ kind: PhotoKind; warnings: GalleryWarning[] } | null>(null);
  const stop = () => {
    requestVersion.current++;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    setCamera(false);
    setReady(false);
  };
  useEffect(() => {
    mounted.current = true;
    const hidden = () => {
      if (document.hidden) {
        requestVersion.current++;
        stream.current?.getTracks().forEach((track) => track.stop());
        stream.current = null;
        setCamera(false);
        setReady(false);
      }
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      mounted.current = false;
      stream.current?.getTracks().forEach((track) => track.stop());
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    allowed.current = draft.state === "local_draft";
    if (draft.state !== "local_draft") {
      requestVersion.current++;
      stream.current?.getTracks().forEach((track) => track.stop());
      stream.current = null;
      setCamera(false);
      setReady(false);
    }
  }, [draft.state]);
  // The camera runs only on the Photos step.
  useEffect(() => {
    if (step === "photos") return;
    requestVersion.current++;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    setCamera(false);
    setReady(false);
  }, [step]);
  async function start() {
    setError(null);
    setBusy(true);
    const version = ++requestVersion.current;
    setLocating(true);
    void getLocation().then((fix) => {
      if (mounted.current) {
        setGps(fix);
        setLocating(false);
      }
    });
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
        throw new Error("unsupported");
      const next = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      if (
        !mounted.current ||
        !allowed.current ||
        document.hidden ||
        version !== requestVersion.current
      ) {
        next.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current?.getTracks().forEach((track) => track.stop());
      stream.current = next;
      video.current!.srcObject = next;
      setCamera(true);
      await video.current!.play();
    } catch (e) {
      stop();
      setError(
        (e as { name?: string }).name === "NotAllowedError"
          ? "cameraDenied"
          : "cameraMissing",
      );
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function save(photo: LocalPhoto) {
    try {
      await store.savePhoto(draft.id, photo);
      setPending(null);
      setError(null);
      if (photo.kind === "front") setKind("wide");
    } catch (e) {
      setPending(photo);
      setError(storageError(e));
    }
  }
  async function capture() {
    if (!video.current) return;
    setBusy(true);
    setError(null);
    try {
      setLocating(true);
      const freshGps = await getLocation();
      setGps(freshGps);
      setLocating(false);
      if (
        !mounted.current ||
        !allowed.current ||
        document.hidden ||
        !stream.current
      )
        return;
      const capturedAt = new Date().toISOString();
      const blob = await photograph(video.current);
      if (blob.size > PHOTO_LIMIT) throw new Error("large");
      const activeChallenge =
        draft.challenge && Date.parse(draft.challenge.expiresAt) > Date.now();
      const photo: LocalPhoto = {
        kind,
        blob,
        bytes: blob.size,
        sha256: await digestBlob(blob),
        capturedAt,
        captureMode: !online
          ? "offline"
          : activeChallenge
            ? "online_challenged"
            : "online_unchallenged",
        gps: freshGps,
      };
      await save(photo);
    } catch (e) {
      setError(
        (e as Error).message === "large" ? "photoTooLarge" : "cameraReady",
      );
    } finally {
      setBusy(false);
      setLocating(false);
    }
  }
  const locked = draft.state !== "local_draft";
  const kindLabel = (k: PhotoKind) =>
    k === "front" ? t.front : k === "wide" ? t.wide : `${t.angle} ${k.slice(-1)}`;
  const kindGuide = (k: PhotoKind) =>
    k === "front" ? t.frontGuide : k === "wide" ? t.wideGuide : t.angleGuide;
  // Front and wide always show; an angle card shows once it has a photo or is selected.
  const shownKinds = allPhotoKinds.filter(
    (k) => (photoKinds as readonly string[]).includes(k) || draft.photos[k] || kind === k,
  );
  // Gallery originals carry no device GPS claim; only camera readings drive the live location panel.
  const cameraGps = (p?: LocalPhoto) => (p && p.source !== "gallery" ? p.gps : null);
  const shownGps =
    gps ?? cameraGps(draft.photos[kind]) ?? cameraGps(draft.photos.front) ?? null;
  async function pickGallery(file: File) {
    setError(null);
    if (file.size > PHOTO_LIMIT) {
      setError("photoTooLarge");
      return;
    }
    setBusy(true);
    try {
      const blob = withGalleryType(file);
      const now = new Date().toISOString();
      const photo: LocalPhoto = {
        kind,
        blob,
        bytes: blob.size,
        sha256: await digestBlob(blob),
        capturedAt: now,
        captureMode: "gallery_original",
        gps: { status: "unavailable", observedAt: now },
        source: "gallery",
      };
      // Advisory check only: the worker can re-pick now, while still at the site. The server still decides.
      const warnings = await advisoryGalleryCheck(blob);
      setGalleryNotice({ kind, warnings });
      await save(photo);
    } catch {
      setError("storage_unavailable");
    } finally {
      setBusy(false);
    }
  }
  if (step === "brand")
    return (
      <section className="field-capture">
        <BrandPanel store={store} draft={draft} t={t} locked={locked} onChosen={onBrandChosen} />
      </section>
    );
  return (
    <section className="field-capture">
      <p className="field-caption">
        <AlertTriangle size={16} aria-hidden="true" /> {t.safe}
      </p>
      {!locked && (
        <section className="panel field-live">
          <div className="panel-heading">
            <div>
              <h2>{kindLabel(kind)}</h2>
              <p>{kindGuide(kind)}</p>
            </div>
            <Camera size={23} />
          </div>
          <div className={"field-viewfinder " + (!camera ? "camera-off" : "")}>
            <video
              ref={video}
              muted
              playsInline
              autoPlay
              onLoadedData={() => setReady(true)}
              aria-label={t.camera}
            />
            {!camera && (
              <span>
                <VideoOff size={35} />
                {t.camera}
              </span>
            )}
          </div>
          <div className="field-camera-actions">
            {camera ? (
              <>
                <button
                  className="primary"
                  disabled={busy || !ready || !!pending}
                  onClick={() => void capture()}
                >
                  <Camera size={18} />
                  {busy ? "…" : t.capture}
                </button>
                <button className="secondary" onClick={stop}>
                  {t.stop}
                </button>
              </>
            ) : (
              <button
                className="primary"
                disabled={busy}
                onClick={() => void start()}
              >
                <Camera size={18} />
                {t.camera}
              </button>
            )}
          </div>
          <div className="field-camera-actions">
            <button
              className="secondary"
              disabled={busy}
              onClick={() => fileInput.current?.click()}
            >
              {t.chooseGallery}
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="image/*,.heic,.heif,.jpg,.jpeg"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void pickGallery(file);
              }}
            />
          </div>
          <p className="field-caption">{t.galleryNote}</p>
          {galleryNotice && galleryNotice.kind === kind && (
            <div
              className={"notice " + (galleryNotice.warnings.length ? "warning" : "")}
              role="status"
            >
              {galleryNotice.warnings.length === 0 ? (
                <p>{t.galleryWarnOk}</p>
              ) : (
                <>
                  {galleryNotice.warnings.includes("no_location") && (
                    <p>
                      {platformOf(navigator.userAgent) === "ios"
                        ? t.galleryWarnNoLocationIos
                        : platformOf(navigator.userAgent) === "android"
                          ? t.galleryWarnNoLocationAndroid
                          : t.galleryWarnNoLocation}
                    </p>
                  )}
                  {galleryNotice.warnings.includes("no_date") && <p>{t.galleryWarnNoDate}</p>}
                  {galleryNotice.warnings.includes("unreadable") && (
                    <p>{t.galleryWarnUnreadable}</p>
                  )}
                </>
              )}
            </div>
          )}
        </section>
      )}
      {error && (
        <div className="notice danger" role="alert">
          {t[error]}
        </div>
      )}
      <section className="panel field-gps">
        <div className="panel-heading">
          <h2>
            <MapPin size={18} />
            {t.gpsOk}
          </h2>
          <button
            className="secondary"
            disabled={locating || locked}
            onClick={async () => {
              setLocating(true);
              try {
                setGps(await getLocation());
              } finally {
                setLocating(false);
              }
            }}
          >
            {locating ? t.gpsBusy : t.gps}
          </button>
        </div>
        <p role="status">
          {shownGps?.status === "ok" ? (
            <>
              <bdi>
                {shownGps.latitude.toFixed(6)}, {shownGps.longitude.toFixed(6)}
              </bdi>{" "}
              · ± {Math.round(shownGps.accuracy)} m<br />
              <time>{shownGps.observedAt}</time>
            </>
          ) : shownGps?.status === "denied" ? (
            t.gpsDenied
          ) : shownGps ? (
            t.gpsFailed
          ) : (
            t.gpsNone
          )}
        </p>
        {shownGps?.status === "ok" && (
          <>
            <p>
              {
                messages[
                  assessPhotoLocation(
                    {
                      gps: shownGps,
                      capturedAt: new Date(now).toISOString(),
                    },
                    draft.task,
                  ).status
                ]
              }
              {draft.task.latitude !== null &&
                draft.task.longitude !== null && (
                  <>
                    {" "}
                    ·{" "}
                    {Math.round(
                      assessPhotoLocation(
                        { gps: shownGps, capturedAt: shownGps.observedAt },
                        draft.task,
                      ).distanceM || 0,
                    )}{" "}
                    {arabic
                      ? "م من موقع اللوحة المسجل"
                      : "m from registered billboard"}
                  </>
                )}
            </p>
            {draft.task.latitude !== null && draft.task.longitude !== null && (
              <LocationMap
                gps={shownGps}
                locations={[{ ...draft.task, latitude: draft.task.latitude, longitude: draft.task.longitude, uncertainty_m: draft.task.uncertainty_m ?? 0 }]}
                arabic={arabic}
              />
            )}
          </>
        )}
      </section>
      <div className="field-photo-grid">
        {shownKinds.map((k) => (
          <section
            className={
              "panel field-photo-card " + (kind === k ? "selected-photo" : "")
            }
            key={k}
          >
            <div className="panel-heading">
              <h3>
                {kindLabel(k)}
                {photoKinds.includes(k as (typeof photoKinds)[number]) ? " *" : ""}
              </h3>
              {draft.photos[k] && <Check size={19} />}
            </div>
            {draft.photos[k] ? (
              <>
                <Photo
                  photo={draft.photos[k]!}
                  label={kindLabel(k)}
                />
                <div className="field-photo-meta">
                  <strong>{t.saved}</strong>
                  {draft.photos[k]!.source === "gallery" ? (
                    <p>{t.galleryChecked}</p>
                  ) : (
                    <>
                      <p>
                        {draft.photos[k]!.captureMode === "offline"
                          ? t.offlinePhoto
                          : draft.photos[k]!.captureMode === "online_challenged"
                            ? t.challengedPhoto
                            : t.onlinePhoto}
                      </p>
                      <small>
                        {t.deviceTime}: <bdi>{draft.photos[k]!.capturedAt}</bdi>
                      </small>
                      <p>
                        {
                          messages[
                            assessPhotoLocation(draft.photos[k]!, draft.task).status
                          ]
                        }
                      </p>
                    </>
                  )}
                  {(() => {
                    const check = draft.verification?.find((v) => v.kind === k);
                    if (!check) return null;
                    return (
                      <div
                        className={"notice " + (check.status === "approved" ? "" : "danger")}
                        role="status"
                      >
                        <strong>
                          {t.verificationTitle}:{" "}
                          {check.status === "approved"
                            ? t.verificationApproved
                            : check.status === "rejected"
                              ? t.verificationRejected
                              : t.verificationReview}
                        </strong>
                        {check.reasons.map((r) => (
                          <p key={r.code}>{verificationReason(r.code, arabic)}</p>
                        ))}
                      </div>
                    );
                  })()}
                  {draft.photos[k]!.source !== "gallery" && draft.photos[k]!.gps.status === "ok" && (
                    <small>
                      {arabic
                        ? "الموقع عند الالتقاط: ±"
                        : "Location at capture: ±"}
                      {Math.round(
                        (
                          draft.photos[k]!.gps as Extract<
                            GpsObservation,
                            { status: "ok" }
                          >
                        ).accuracy,
                      )}{" "}
                      {arabic ? "م · وقت الرصد " : "m · observed "}
                      {draft.photos[k]!.gps.observedAt}
                    </small>
                  )}
                </div>
              </>
            ) : (
              <p>{kindGuide(k)}</p>
            )}
            {!locked && (
              <button
                className="secondary"
                onClick={() => setKind(k)}
                aria-pressed={kind === k}
              >
                {kind === k ? t.ready : kindLabel(k)}
              </button>
            )}
          </section>
        ))}
      </div>
      {!locked && (
        <button
          className="secondary"
          disabled={!angleKinds.some((k) => !draft.photos[k])}
          onClick={() => {
            const free = angleKinds.find((k) => !draft.photos[k]);
            if (free) setKind(free);
          }}
        >
          {t.addAngle}
        </button>
      )}
      {pending && (
        <div className="notice danger" role="alert">
          <strong>{t.notSaved}</strong>
          <Photo photo={pending} label={t.notSaved} />
          <button
            className="secondary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await save(pending);
              setBusy(false);
            }}
          >
            <RefreshCw size={17} />
            {t.saveAgain}
          </button>
        </div>
      )}
    </section>
  );
}

// Worker records what the advertising face shows. Brand text is an occupancy
// claim for supervisor confirmation, not part of identity evidence.
function BrandPanel({
  store,
  draft,
  t,
  locked,
  onChosen,
}: {
  store: FieldStore;
  draft: Draft;
  t: FieldText;
  locked: boolean;
  onChosen?: () => void;
}) {
  const saved = draft.brand ?? null;
  const [text, setText] = useState(saved?.kind === "advertiser" ? saved.text : ""),
    [error, setError] = useState("");
  async function choose(brand: BrandEntry, advance = false) {
    setError("");
    try {
      await store.setBrand(draft.id, brand);
      // A blank or unreadable face needs nothing more, so go straight to sending.
      if (advance) onChosen?.();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const label = (brand: BrandEntry) =>
    brand.kind === "advertiser"
      ? brand.text
      : brand.kind === "blank"
        ? t.brandBlank
        : t.brandUnreadable;
  if (locked)
    return (
      <section className="panel">
        <h3>{t.brandTitle}</h3>
        <p>
          {t.brandLocked}
          {saved && <>: <bdi>{label(saved)}</bdi></>}
        </p>
      </section>
    );
  return (
    <section className="panel">
      <h3>{t.brandTitle}</h3>
      <p className="muted">{t.brandHelp}</p>
      <div className="brand-choices">
        <button
          type="button"
          aria-pressed={saved?.kind === "advertiser"}
          onClick={() => document.getElementById("brand-name")?.focus()}
        >
          {t.brandAdvertiser}
        </button>
        <button
          type="button"
          aria-pressed={saved?.kind === "blank"}
          onClick={() => void choose({ kind: "blank", text: "" }, true)}
        >
          {t.brandBlank}
        </button>
        <button
          type="button"
          aria-pressed={saved?.kind === "unreadable"}
          onClick={() => void choose({ kind: "unreadable", text: "" }, true)}
        >
          {t.brandUnreadable}
        </button>
      </div>
      <label>
        {t.brandName}
        <input
          id="brand-name"
          value={text}
          maxLength={120}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            if (text.trim().length >= 2)
              void choose({ kind: "advertiser", text: text.trim() });
          }}
        />
      </label>
      {saved && <p className="muted">{t.brandSaved}: <bdi>{label(saved)}</bdi></p>}
      {error && (
        <div className="notice danger" role="alert">
          {error}
        </div>
      )}
    </section>
  );
}
