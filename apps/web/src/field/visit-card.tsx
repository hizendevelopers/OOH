"use client";
import { useState } from "react";
import { MapPin, Copy, Check, Clock, Navigation, WifiOff } from "lucide-react";
import {
  addressFor,
  cityLine,
  coordinatePair,
  formatCoordinate,
  mapLinks,
  statusLabel,
} from "../../../../packages/domain/src/worker-visit";
import type { Assignment } from "../server/service";
import { fieldRequest, SyncError } from "./sync";

// Every visible word on the card, in the two worker languages.
const copy = {
  en: {
    address: "Address",
    addressMissing: "No address on the list. Enter the street or landmark from this visit.",
    addressPlaceholder: "Street, landmark or nearby place",
    saveAddress: "Save address",
    addressFromList: "From the site list",
    addressFromYou: "Entered by you",
    addressNeedsOnline: "Connect to the internet to save the address.",
    addressSaved: "Address saved.",
    city: "City",
    coordinates: "Coordinates",
    notPinned: "Not pinned yet. Your GPS reading on this visit becomes the pin.",
    copy: "Copy",
    copied: "Copied",
    maps: "Open in",
    googleMaps: "Google Maps",
    appleMaps: "Apple Maps",
    deviceMaps: "Other map app",
    due: "Due",
    visit: "Visit",
    pendingGps: "Pending GPS",
    offlineHint: "No connection. Showing saved details.",
  },
  ar: {
    address: "العنوان",
    addressMissing: "لا يوجد عنوان في القائمة. أدخل الشارع أو المعلم الذي تراه في هذه الزيارة.",
    addressPlaceholder: "شارع أو معلم أو مكان قريب",
    saveAddress: "حفظ العنوان",
    addressFromList: "من قائمة المواقع",
    addressFromYou: "أدخلته أنت",
    addressNeedsOnline: "اتصل بالإنترنت لحفظ العنوان.",
    addressSaved: "تم حفظ العنوان.",
    city: "المدينة",
    coordinates: "الإحداثيات",
    notPinned: "لم يُحدَّد الموقع بعد. قراءة GPS في هذه الزيارة ستصبح موقع اللوحة.",
    copy: "نسخ",
    copied: "تم النسخ",
    maps: "افتح في",
    googleMaps: "خرائط جوجل",
    appleMaps: "خرائط آبل",
    deviceMaps: "تطبيق خرائط آخر",
    due: "الاستحقاق",
    visit: "الزيارة",
    pendingGps: "GPS معلّق",
    offlineHint: "لا يوجد اتصال. تُعرض التفاصيل المحفوظة.",
  },
} as const;

export default function VisitCard({
  task,
  ar,
  cached,
  online,
  platform,
  onAddressSaved,
  downloaded,
  downloadFirst,
}: {
  task: Assignment;
  ar: boolean;
  cached: boolean;
  online: boolean;
  platform: "ios" | "android" | "other";
  onAddressSaved: (assignmentId: string, address: string) => void;
  downloaded: string;
  downloadFirst: string;
}) {
  const t = ar ? copy.ar : copy.en;
  const lang = ar ? "ar" : "en";
  const address = addressFor(task.worker_address, task.description);
  const hasPin = task.latitude !== null && task.longitude !== null;
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function saveAddress() {
    setMessage(null);
    const text = draft.trim();
    if (text.length < 5) return setMessage(ar ? "أدخل 5 أحرف على الأقل." : "Enter at least 5 characters.");
    setSaving(true);
    try {
      const saved = await fieldRequest<{ assignmentId: string; address: string }>("addresses", {
        assignmentId: task.assignment_id,
        address: text,
      });
      onAddressSaved(saved.assignmentId, saved.address);
      setDraft("");
      setMessage(t.addressSaved);
    } catch (e) {
      setMessage(e instanceof SyncError ? e.message : ar ? "تعذّر الحفظ." : "Address not saved.");
    } finally {
      setSaving(false);
    }
  }

  async function copyPin() {
    if (!hasPin) return;
    try {
      await navigator.clipboard.writeText(coordinatePair(task.latitude!, task.longitude!));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setMessage(coordinatePair(task.latitude!, task.longitude!));
    }
  }

  const links = hasPin ? mapLinks(task.latitude!, task.longitude!, platform) : [];
  const labelFor = (id: string) =>
    id === "google" ? t.googleMaps : id === "apple" ? t.appleMaps : t.deviceMaps;

  return (
    <div className="visit-card">
      <div className="field-visit-title">
        <span className="task-pin">
          <MapPin size={21} />
        </span>
        <span className="badge">
          {task.review_state === "pending" && task.status === "approved"
            ? ar ? "أُعيد فتح المراجعة" : "Review reopened"
            : statusLabel(task.status, lang)}
        </span>
      </div>
      <h3>
        <bdi>{task.code}</bdi>
      </h3>
      <p className="visit-card-city">{cityLine(task.city, task.zone)}</p>

      <dl className="visit-details">
        <div>
          <dt>{t.city}</dt>
          <dd>{task.city || "—"}</dd>
        </div>

        <div className="visit-details-wide">
          <dt>
            {t.address}
            {address.text && (
              <small className="visit-source">
                {" · "}
                {address.source === "worker" ? t.addressFromYou : t.addressFromList}
              </small>
            )}
          </dt>
          <dd>
            {address.text ? (
              <bdi>{address.text}</bdi>
            ) : (
              <>
                <p className="visit-missing">{t.addressMissing}</p>
                <div className="visit-address-form">
                  <input
                    value={draft}
                    maxLength={300}
                    placeholder={t.addressPlaceholder}
                    aria-label={t.address}
                    disabled={!online || saving}
                    onChange={(e) => setDraft(e.target.value)}
                  />
                  <button
                    className="secondary"
                    onClick={() => void saveAddress()}
                    disabled={!online || saving}
                  >
                    {t.saveAddress}
                  </button>
                </div>
                {!online && <p className="visit-caption">{t.addressNeedsOnline}</p>}
              </>
            )}
          </dd>
        </div>

        <div className="visit-details-wide">
          <dt>{t.coordinates}</dt>
          <dd>
            {hasPin ? (
              <>
                <bdi className="visit-coords">
                  {formatCoordinate(task.latitude, "N", "S")} · {formatCoordinate(task.longitude, "E", "W")}
                </bdi>
                <div className="visit-actions">
                  <button className="secondary" onClick={() => void copyPin()}>
                    {copied ? <Check size={15} /> : <Copy size={15} />}
                    {copied ? t.copied : t.copy}
                  </button>
                </div>
                <div className="visit-actions">
                  <span className="visit-caption">{t.maps}:</span>
                  {links.map((link) => (
                    <a key={link.id} className="text-button" href={link.href} target="_blank" rel="noopener noreferrer">
                      <Navigation size={14} /> {labelFor(link.id)}
                    </a>
                  ))}
                </div>
              </>
            ) : (
              <>
                <span className="badge">{t.pendingGps}</span>
                <p className="visit-caption">{t.notPinned}</p>
              </>
            )}
          </dd>
        </div>

        <div>
          <dt>
            <Clock size={14} /> {t.due}
          </dt>
          <dd>
            <bdi>{task.due_date}</bdi>
          </dd>
        </div>
      </dl>

      <div className="visit-footer">
        <span>
          {t.visit}: {statusLabel(task.status, lang)}
        </span>
        <span>{cached ? downloaded : downloadFirst}</span>
        {!online && !cached && (
          <span>
            <WifiOff size={14} /> {t.offlineHint}
          </span>
        )}
      </div>
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
