"use client";
import { useState } from "react";
import { MapPin, Ruler, RefreshCw, Check } from "lucide-react";
import {
  aspectRatio,
  billboardFormats,
  siteCities,
  siteCityNames,
  SITE_MAX_ACCURACY_M,
  type SiteCity,
} from "../../../../packages/domain/src/sites";
import type { GpsObservation } from "../../../../packages/domain/src/inspection";
import { getLocation } from "./device";
import { fieldRequest, SyncError } from "./sync";

export type RegisteredSite = { assignmentId: string; code: string; aspectRatio: string };

const formatLabels: Record<(typeof billboardFormats)[number], { en: string; ar: string }> = {
  unipole: { en: "Unipole", ar: "عمود واحد" },
  wall: { en: "Wall", ar: "جداري" },
  bridge: { en: "Bridge", ar: "جسر" },
  gantry: { en: "Gantry", ar: "هيكلي" },
  rooftop: { en: "Rooftop", ar: "سطح مبنى" },
  other: { en: "Other", ar: "أخرى" },
};

// A worker finds a billboard that is not in the inventory. The server assigns the ID and the pin.
// Registration needs a connection, because the ID is issued by the server.
export default function NewSite({
  arabic,
  onRegistered,
  onCancel,
}: {
  arabic: boolean;
  onRegistered: (site: RegisteredSite) => void;
  onCancel: () => void;
}) {
  const [city, setCity] = useState<SiteCity | "">("");
  const [area, setArea] = useState("");
  const [region, setRegion] = useState("");
  const [format, setFormat] = useState<(typeof billboardFormats)[number]>("unipole");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [description, setDescription] = useState("");
  const [fix, setFix] = useState<GpsObservation | null>(null);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const w = Number(width), h = Number(height);
  const sizeOk = w >= 0.1 && w <= 100 && h >= 0.1 && h <= 100;
  const gpsOk = fix?.status === "ok" && fix.accuracy <= SITE_MAX_ACCURACY_M;

  async function readLocation() {
    setReading(true);
    setError(null);
    try {
      setFix(await getLocation());
    } finally {
      setReading(false);
    }
  }

  async function submit() {
    setError(null);
    if (!city) return setError(arabic ? "اختر المدينة." : "Choose the city.");
    if (area.trim().length < 2 || region.trim().length < 2)
      return setError(arabic ? "أدخل المنطقة والمحافظة." : "Enter the area and the region.");
    if (!sizeOk) return setError(arabic ? "أدخل العرض والارتفاع بين 0.1 و 100 م." : "Enter width and height between 0.1 and 100 m.");
    if (!gpsOk || fix?.status !== "ok")
      return setError(
        arabic
          ? `اقرأ الموقع بدقة ${SITE_MAX_ACCURACY_M} م أو أفضل قبل التسجيل.`
          : `Read the location with ${SITE_MAX_ACCURACY_M} m accuracy or better before registering.`,
      );
    setSaving(true);
    try {
      const body = {
        operationId: crypto.randomUUID(),
        city,
        area: area.trim(),
        region: region.trim(),
        latitude: fix.latitude,
        longitude: fix.longitude,
        accuracyM: fix.accuracy,
        observedAt: fix.observedAt,
        widthM: w,
        heightM: h,
        format,
        description: description.trim(),
      };
      const site = await fieldRequest<RegisteredSite>("sites", body);
      onRegistered(site);
    } catch (e) {
      setError(e instanceof SyncError ? e.message : arabic ? "تعذّر التسجيل. تحقق من الاتصال وأعد المحاولة." : "Registration failed. Check the connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  const input = { className: "field-input" };
  return (
    <section className="panel field-new-site" aria-labelledby="new-site-title">
      <div className="panel-heading">
        <h2 id="new-site-title">
          <MapPin size={18} />
          {arabic ? "تسجيل موقع جديد" : "Register a new site"}
        </h2>
        <button className="secondary" onClick={onCancel} disabled={saving}>
          {arabic ? "إلغاء" : "Cancel"}
        </button>
      </div>
      <p className="field-caption">
        {arabic
          ? "استخدم هذا النموذج فقط للوحة غير موجودة في النظام. سيُنشئ الخادم رقم الموقع ويحفظ الإحداثيات والمقاسات."
          : "Use this only for a billboard that is not in the inventory. The server issues the site ID and saves the pin and size."}
      </p>
      <label>
        {arabic ? "المدينة" : "City"}
        <select {...input} value={city} onChange={(e) => setCity(e.target.value as SiteCity | "")}>
          <option value="">{arabic ? "اختر" : "Choose"}</option>
          {siteCityNames.map((name) => (
            <option key={name} value={name}>
              {arabic ? siteCities[name].ar : siteCities[name].en}
            </option>
          ))}
        </select>
      </label>
      <label>
        {arabic ? "المنطقة" : "Area"}
        <input {...input} value={area} maxLength={120} onChange={(e) => setArea(e.target.value)} />
      </label>
      <label>
        {arabic ? "المحافظة / الإقليم" : "Region"}
        <input {...input} value={region} maxLength={120} onChange={(e) => setRegion(e.target.value)} />
      </label>
      <label>
        {arabic ? "نوع اللوحة" : "Format"}
        <select {...input} value={format} onChange={(e) => setFormat(e.target.value as (typeof billboardFormats)[number])}>
          {billboardFormats.map((f) => (
            <option key={f} value={f}>
              {arabic ? formatLabels[f].ar : formatLabels[f].en}
            </option>
          ))}
        </select>
      </label>
      <div className="field-size-row">
        <label>
          {arabic ? "العرض (م)" : "Width (m)"}
          <input {...input} inputMode="decimal" value={width} onChange={(e) => setWidth(e.target.value)} />
        </label>
        <label>
          {arabic ? "الارتفاع (م)" : "Height (m)"}
          <input {...input} inputMode="decimal" value={height} onChange={(e) => setHeight(e.target.value)} />
        </label>
      </div>
      {sizeOk && (
        <p className="field-caption">
          <Ruler size={15} /> {arabic ? "النسبة" : "Ratio"}: {aspectRatio(w, h)}
        </p>
      )}
      <label>
        {arabic ? "ملاحظات" : "Notes"}
        <textarea {...input} value={description} maxLength={1000} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <div className="field-gps-row">
        <button className="secondary" onClick={() => void readLocation()} disabled={reading || saving}>
          {reading ? <RefreshCw size={17} /> : <MapPin size={17} />}
          {arabic ? "قراءة الموقع" : "Read location"}
        </button>
        <p role="status">
          {fix?.status === "ok" ? (
            <>
              <bdi>
                {fix.latitude.toFixed(6)}, {fix.longitude.toFixed(6)}
              </bdi>{" "}
              · ± {Math.round(fix.accuracy)} m{" "}
              {gpsOk ? <Check size={15} /> : arabic ? "· دقة ضعيفة، أعد القراءة" : "· accuracy too weak, read again"}
            </>
          ) : fix ? (
            arabic ? "لم يُقرأ الموقع. فعّل الموقع للمتصفح." : "Location not read. Turn on location for the browser."
          ) : (
            arabic ? "لم يُقرأ الموقع بعد." : "Location not read yet."
          )}
        </p>
      </div>
      {error && (
        <div className="notice danger" role="alert">
          {error}
        </div>
      )}
      <button className="primary" onClick={() => void submit()} disabled={saving || reading}>
        {saving ? "…" : arabic ? "تسجيل الموقع" : "Register site"}
      </button>
    </section>
  );
}
