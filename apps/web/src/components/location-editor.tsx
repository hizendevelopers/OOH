"use client";
import { useEffect, useState } from "react";
import { Navigation, LoaderCircle } from "lucide-react";
import type { Face } from "@/server/service";
import { LocationMap } from "./location-map";

type History = {
  id: string;
  latitude: number;
  longitude: number;
  uncertainty_m: number;
  reason: string;
  created_at: string;
  actor_name: string;
};
export function LocationEditor({
  face,
  ar,
  onSaved,
  onCancel,
  onBusyChange,
}: {
  face?: Face;
  ar: boolean;
  onSaved: () => void;
  onCancel: () => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [busy, setBusy] = useState(false),
    [locating, setLocating] = useState(false),
    [error, setError] = useState("");
  const [history, setHistory] = useState<History[]>([]),
    [historyError, setHistoryError] = useState("");
  const [form, setForm] = useState({
    code: "",
    structure_code: "",
    city: "",
    zone: "",
    orientation: "unknown",
    description: "",
    is_test: true,
    latitude: face ? String(face.latitude) : "",
    longitude: face ? String(face.longitude) : "",
    uncertainty_m: face ? String(face.uncertainty_m) : "50",
    reason: "",
  });
  useEffect(() => {
    if (!face) return;
    let active = true;
    fetch(`/api/locations?faceId=${encodeURIComponent(face.id)}`, {
      cache: "no-store",
    })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        if (active) setHistory(data);
      })
      .catch((e) => {
        if (active) setHistoryError(e.message);
      });
    return () => {
      active = false;
    };
  }, [face]);
  const text = (en: string, arabic: string) => (ar ? arabic : en);
  function update(key: keyof typeof form, value: string | boolean) {
    setForm((f) => ({ ...f, [key]: value }));
  }
  const latitude = Number(form.latitude),
    longitude = Number(form.longitude);
  const validCoordinates =
    form.latitude.trim() !== "" &&
    form.longitude.trim() !== "" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180;
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!validCoordinates || form.uncertainty_m.trim() === "") {
      setError(
        text(
          "Enter valid latitude, longitude and uncertainty.",
          "أدخل خط العرض وخط الطول وعدم الدقة بشكل صحيح.",
        ),
      );
      return;
    }
    setBusy(true);
    onBusyChange?.(true);
    try {
      const coordinates = {
        latitude,
        longitude,
        uncertainty_m: Number(form.uncertainty_m),
      };
      const payload = face
        ? { faceId: face.id, reason: form.reason, ...coordinates }
        : {
            code: form.code,
            structure_code: form.structure_code,
            city: form.city,
            zone: form.zone,
            orientation: form.orientation,
            description: form.description,
            is_test: form.is_test,
            ...coordinates,
          };
      const r = await fetch("/api/locations", {
        method: face ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }
  function locate() {
    setError("");
    if (!navigator.geolocation) {
      setError(
        text(
          "Location is unavailable in this browser.",
          "الموقع غير متاح في هذا المتصفح.",
        ),
      );
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setForm((f) => ({
          ...f,
          latitude: p.coords.latitude.toFixed(7),
          longitude: p.coords.longitude.toFixed(7),
          uncertainty_m: String(Math.ceil(p.coords.accuracy)),
        }));
        setLocating(false);
      },
      (e) => {
        setLocating(false);
        setError(
          e.code === 1
            ? text(
                "Location permission denied. Allow location in browser settings, or enter coordinates manually.",
                "تم رفض إذن الموقع. فعّله في إعدادات المتصفح أو أدخل الإحداثيات يدوياً.",
              )
            : text(
                "Could not obtain your location. Try again outdoors or enter coordinates manually.",
                "تعذر تحديد موقعك. حاول في الخارج أو أدخل الإحداثيات يدوياً.",
              ),
        );
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
  }
  const field = (
    key:
      | "code"
      | "structure_code"
      | "city"
      | "zone"
      | "latitude"
      | "longitude"
      | "uncertainty_m",
    label: string,
    required = true,
  ) => (
    <label key={key}>
      {label}
      <input
        name={key}
        required={required}
        value={form[key]}
        disabled={busy}
        maxLength={key === "code" || key === "structure_code" ? 48 : 80}
        pattern={
          key === "code" || key === "structure_code"
            ? "[A-Z0-9][A-Z0-9_-]{2,47}"
            : undefined
        }
        title={
          key === "code" || key === "structure_code"
            ? text(
                "3–48 uppercase letters, digits, _ or -",
                "٣–٤٨ حرفاً لاتينياً كبيراً أو رقماً أو _ أو -",
              )
            : undefined
        }
        type={
          ["latitude", "longitude", "uncertainty_m"].includes(key)
            ? "number"
            : "text"
        }
        step="any"
        min={
          key === "latitude"
            ? -90
            : key === "longitude"
              ? -180
              : key === "uncertainty_m"
                ? 0
                : undefined
        }
        max={
          key === "latitude"
            ? 90
            : key === "longitude"
              ? 180
              : key === "uncertainty_m"
                ? 10000
                : undefined
        }
        dir={key === "city" || key === "zone" ? undefined : "ltr"}
        onChange={(e) => update(key, e.target.value)}
      />
    </label>
  );
  return (
    <form className="location-editor" onSubmit={save}>
      <p className="muted">
        {face
          ? text(
              `Correct coordinates for ${face.code}. Original coordinates remain unchanged; every correction is recorded.`,
              `تصحيح إحداثيات ${face.code}. تبقى الإحداثيات الأصلية محفوظة ويُسجّل كل تصحيح.`,
            )
          : text(
              "Register a billboard face. Confirm the pin before saving. You can import your complete CSV inventory later.",
              "سجّل واجهة لوحة وأكّد موضع الدبوس قبل الحفظ. يمكنك استيراد المخزون الكامل بصيغة CSV لاحقاً.",
            )}
      </p>
      {!face && (
        <div className="location-fields">
          {field("code", text("Billboard face code", "رمز واجهة اللوحة"))}
          {field("structure_code", text("Structure code", "رمز الهيكل"))}
          {field("city", text("City", "المدينة"))}
          {field("zone", text("Zone (optional)", "المنطقة (اختياري)"), false)}
          <label>
            {text("Orientation", "الاتجاه")}
            <select
              value={form.orientation}
              disabled={busy}
              onChange={(e) => update("orientation", e.target.value)}
            >
              {["unknown", "N", "NE", "E", "SE", "S", "SW", "W", "NW"].map(
                (v) => (
                  <option key={v} value={v}>
                    {v === "unknown" ? text("Unknown", "غير معروف") : v}
                  </option>
                ),
              )}
            </select>
          </label>
        </div>
      )}
      <button
        className="secondary"
        type="button"
        disabled={busy || locating}
        onClick={locate}
      >
        {locating ? (
          <LoaderCircle className="spin" size={16} />
        ) : (
          <Navigation size={16} />
        )}{" "}
        {locating
          ? text("Finding your location…", "جارٍ تحديد موقعك…")
          : text("Use my current location", "استخدم موقعي الحالي")}
      </button>
      <LocationMap
        latitude={validCoordinates ? latitude : 33.3152}
        longitude={validCoordinates ? longitude : 44.3661}
        uncertainty={validCoordinates ? Number(form.uncertainty_m) || 0 : 0}
        ar={ar}
        onSelect={
          busy
            ? undefined
            : (lat, lon) =>
                setForm((f) => ({
                  ...f,
                  latitude: String(lat),
                  longitude: String(lon),
                }))
        }
      />
      {!validCoordinates && (
        <small className="muted">
          {text(
            "The initial map is centered on Baghdad. Select the actual billboard position or enter its coordinates.",
            "الخريطة الأولية متمركزة على بغداد. حدد موضع اللوحة الفعلي أو أدخل إحداثياتها.",
          )}
        </small>
      )}
      <div className="location-fields">
        {field("latitude", text("Latitude", "خط العرض"))}
        {field("longitude", text("Longitude", "خط الطول"))}
        {field(
          "uncertainty_m",
          text("Coordinate uncertainty (metres)", "عدم دقة الإحداثيات (متر)"),
        )}
      </div>
      {face ? (
        <>
          <label>
            {text(
              "Reason for correction (at least 10 characters)",
              "سبب التصحيح (١٠ أحرف على الأقل)",
            )}
            <textarea
              required
              minLength={10}
              maxLength={1000}
              value={form.reason}
              disabled={busy}
              onChange={(e) => update("reason", e.target.value)}
            />
          </label>
          <details>
            <summary>
              {text("Coordinate correction history", "سجل تصحيحات الإحداثيات")}
            </summary>
            <p className="muted">
              {text("Original", "الأصلي")}:{" "}
              <bdi>
                {face.original_latitude ?? face.latitude},{" "}
                {face.original_longitude ?? face.longitude}
              </bdi>
            </p>
            {historyError ? (
              <p role="alert">{historyError}</p>
            ) : history.length ? (
              history.map((h) => (
                <div className="location-history" key={h.id}>
                  <bdi>
                    {h.latitude}, {h.longitude} · ±{h.uncertainty_m} m
                  </bdi>
                  <p>{h.reason}</p>
                  <small>
                    {h.actor_name} · {new Date(h.created_at).toLocaleString()}
                  </small>
                </div>
              ))
            ) : (
              <p className="muted">
                {text("No previous corrections.", "لا توجد تصحيحات سابقة.")}
              </p>
            )}
          </details>
        </>
      ) : (
        <>
          <label>
            {text("Description (optional)", "الوصف (اختياري)")}
            <textarea
              maxLength={1000}
              value={form.description}
              disabled={busy}
              onChange={(e) => update("description", e.target.value)}
            />
          </label>
          <label className="location-check">
            <input
              type="checkbox"
              checked={form.is_test}
              disabled={busy}
              onChange={(e) => update("is_test", e.target.checked)}
            />
            <span>
              {text(
                "Test location — clearly marked in inventory",
                "موقع تجريبي — يُميّز بوضوح في المخزون",
              )}
            </span>
          </label>
        </>
      )}
      {error && (
        <div className="notice danger" role="alert">
          {error}
        </div>
      )}
      <div className="modal-actions">
        <button
          className="secondary"
          type="button"
          disabled={busy}
          onClick={onCancel}
        >
          {text("Cancel", "إلغاء")}
        </button>
        <button className="primary" type="submit" disabled={busy || locating}>
          {busy && <LoaderCircle className="spin" size={16} />}{" "}
          {face
            ? text("Record correction", "تسجيل التصحيح")
            : text("Confirm & save location", "تأكيد الموقع وحفظه")}
        </button>
      </div>
    </form>
  );
}
