"use client";
import { useState } from "react";
import { Copy, Check, Clock, Navigation, WifiOff, Plus } from "lucide-react";
import { coordinatePair, mapLinks, statusLabel } from "../../../../packages/domain/src/worker-visit";
import { SiteDetails } from "../components/site-details";
import type { Assignment } from "../server/service";
import { fieldRequest, SyncError } from "./sync";

// Every visible word on the card, in the two worker languages.
const copy = {
  en: {
    address: "Address",
    addAddress: "Add street address",
    addressPlaceholder: "Street, landmark or nearby place",
    saveAddress: "Save address",
    addressNeedsOnline: "Connect to the internet to save the address.",
    addressSaved: "Address saved.",
    notPinned: "Pending GPS — your first photo sets it",
    copy: "Copy",
    copied: "Copied",
    googleMaps: "Google Maps",
    appleMaps: "Apple Maps",
    deviceMaps: "Other map app",
    due: "Due",
    offlineHint: "No connection. Showing saved details.",
  },
  ar: {
    address: "العنوان",
    addAddress: "أضف عنوان الشارع",
    addressPlaceholder: "شارع أو معلم أو مكان قريب",
    saveAddress: "حفظ العنوان",
    addressNeedsOnline: "اتصل بالإنترنت لحفظ العنوان.",
    addressSaved: "تم حفظ العنوان.",
    notPinned: "بانتظار الموقع GPS — أول صورة لك تحدّده",
    copy: "نسخ",
    copied: "تم النسخ",
    googleMaps: "خرائط جوجل",
    appleMaps: "خرائط آبل",
    deviceMaps: "تطبيق خرائط آخر",
    due: "الاستحقاق",
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
}: {
  task: Assignment;
  ar: boolean;
  cached: boolean;
  online: boolean;
  platform: "ios" | "android" | "other";
  onAddressSaved: (assignmentId: string, address: string) => void;
  downloaded: string;
}) {
  const t = ar ? copy.ar : copy.en;
  const lang = ar ? "ar" : "en";
  const hasAddress = Boolean((task.worker_address ?? "").trim());
  const [addingAddress, setAddingAddress] = useState(false);
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
      setAddingAddress(false);
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

  // Only a worker-entered street address counts as an address here; until there is one, a small link opens the form.
  const addressExtra = hasAddress ? null : addingAddress ? (
    <>
      <div className="visit-address-form">
        <input
          value={draft}
          maxLength={300}
          placeholder={t.addressPlaceholder}
          aria-label={t.address}
          disabled={!online || saving}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
        />
        <button className="secondary" onClick={() => void saveAddress()} disabled={!online || saving}>
          {t.saveAddress}
        </button>
      </div>
      {!online && <p className="visit-caption">{t.addressNeedsOnline}</p>}
    </>
  ) : (
    <button className="text-button visit-add-address" onClick={() => setAddingAddress(true)}>
      <Plus size={14} /> {t.addAddress}
    </button>
  );
  const locationExtra = hasPin ? (
    <div className="visit-actions">
      <button className="text-button" onClick={() => void copyPin()}>
        {copied ? <Check size={14} /> : <Copy size={14} />}
        {copied ? t.copied : t.copy}
      </button>
      {links.map((link) => (
        <a key={link.id} className="text-button" href={link.href} target="_blank" rel="noopener noreferrer">
          <Navigation size={14} /> {labelFor(link.id)}
        </a>
      ))}
    </div>
  ) : null;

  return (
    <div className="visit-card">
      <SiteDetails
        site={task}
        ar={ar}
        pendingText={t.notPinned}
        addressExtra={addressExtra}
        locationExtra={locationExtra}
        chips={
          <>
            <span className="badge">
              {task.review_state === "pending" && task.status === "approved"
                ? ar ? "أُعيد فتح المراجعة" : "Review reopened"
                : statusLabel(task.status, lang)}
            </span>
            <span className="visit-due">
              <Clock size={13} /> {t.due} <bdi>{task.due_date}</bdi>
            </span>
          </>
        }
      />
      {cached && <p className="visit-caption">{downloaded}</p>}
      {!online && !cached && (
        <p className="visit-caption">
          <WifiOff size={14} /> {t.offlineHint}
        </p>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
