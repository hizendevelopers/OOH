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
  storageError,
  type GpsObservation,
  type PhotoKind,
} from "../../../../packages/domain/src/inspection";
import type { FieldText } from "./strings";
import {
  assessPhotoLocation,
  locationMessages,
  locationMessagesAr,
} from "./location-policy";
import { LocationMap } from "./location-map";

function Photo({ photo, label }: { photo: LocalPhoto; label: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const value = URL.createObjectURL(photo.blob);
    setUrl(value);
    return () => URL.revokeObjectURL(value);
  }, [photo.blob]);
  return url ? (
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
}: {
  store: FieldStore;
  draft: Draft;
  t: FieldText;
  online: boolean;
  arabic?: boolean;
}) {
  const messages = arabic ? locationMessagesAr : locationMessages;
  const video = useRef<HTMLVideoElement>(null),
    stream = useRef<MediaStream | null>(null),
    mounted = useRef(true),
    allowed = useRef(draft.state === "local_draft"),
    requestVersion = useRef(0);
  const [camera, setCamera] = useState(false),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [kind, setKind] = useState<PhotoKind>("front"),
    [gps, setGps] = useState<GpsObservation | null>(null),
    [locating, setLocating] = useState(false),
    [error, setError] = useState<keyof FieldText | null>(null),
    [now, setNow] = useState(0),
    [pending, setPending] = useState<LocalPhoto | null>(null);
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
  const shownGps =
    gps ?? draft.photos[kind]?.gps ?? draft.photos.front?.gps ?? null;
  return (
    <section className="field-capture">
      <div className="notice warning">
        <AlertTriangle size={18} />
        {t.safe}
      </div>
      {draft.challenge ? (
        <div className="field-challenge">
          <strong>
            {t.challenge}: <bdi>{draft.challenge.nonce}</bdi>
          </strong>
          <p>{t.challengeInfo}</p>
          <small>
            {new Date(draft.challenge.expiresAt).toLocaleTimeString()} ·{" "}
            {Date.parse(draft.challenge.expiresAt) < now
              ? t.challengeExpired
              : t.challenge}
          </small>
        </div>
      ) : (
        <p className="field-caption">{t.noChallenge}</p>
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
        <small>
          {t.gpsAge} {t.privacy}
        </small>
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
              }{" "}
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
            </p>
            <LocationMap
              gps={shownGps}
              locations={[draft.task]}
              arabic={arabic}
            />
          </>
        )}
      </section>
      <div className="field-photo-grid">
        {photoKinds.map((k) => (
          <section
            className={
              "panel field-photo-card " + (kind === k ? "selected-photo" : "")
            }
            key={k}
          >
            <div className="panel-heading">
              <h3>{k === "front" ? t.front : t.wide} *</h3>
              {draft.photos[k] && <Check size={19} />}
            </div>
            {draft.photos[k] ? (
              <>
                <Photo
                  photo={draft.photos[k]!}
                  label={k === "front" ? t.front : t.wide}
                />
                <div className="field-photo-meta">
                  <strong>{t.saved}</strong>
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
                  {draft.photos[k]!.gps.status === "ok" && (
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
              <p>{k === "front" ? t.frontGuide : t.wideGuide}</p>
            )}
            {!locked && (
              <button
                className="secondary"
                onClick={() => setKind(k)}
                aria-pressed={kind === k}
              >
                {kind === k ? t.ready : k === "front" ? t.front : t.wide}
              </button>
            )}
          </section>
        ))}
      </div>
      {!locked && (
        <section className="panel field-live">
          <div className="panel-heading">
            <div>
              <h2>{kind === "front" ? t.front : t.wide}</h2>
              <p>{kind === "front" ? t.frontGuide : t.wideGuide}</p>
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
          <p className="field-caption">{t.gpsWarning}</p>
        </section>
      )}
      {error && (
        <div className="notice danger" role="alert">
          {t[error]}
        </div>
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
