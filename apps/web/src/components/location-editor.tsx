"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Navigation, LoaderCircle } from "lucide-react";
import type { Face } from "@/server/service";
import { LocationMap } from "./location-map";
import { localizeError } from "@/lib/server-messages";

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
    width_m: "",
    height_m: "",
    dimension_status: "",
    dimension_source: "",
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
            width_m: form.width_m,
            height_m: form.height_m,
            dimension_status: form.dimension_status,
            dimension_source: form.dimension_source,
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
      setError(localizeError((e as Error).message, ar));
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
    <>
    {face && <DimensionRecord faceId={face.id} ar={ar} />}
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
              <p role="alert">{localizeError(historyError, ar)}</p>
            ) : history.length ? (
              history.map((h) => (
                <div className="location-history" key={h.id}>
                  <bdi>
                    {h.latitude}, {h.longitude} · ±{h.uncertainty_m} {text("m", "م")}
                  </bdi>
                  <p>{h.reason}</p>
                  <small>
                    {h.actor_name} · {new Date(h.created_at).toLocaleString(ar ? "ar-IQ" : undefined)}
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
          <fieldset className="location-fields">
            <legend>
              {text("Registered size (optional)", "المقاس المسجل (اختياري)")}
            </legend>
            <label>
              {text("Width (m)", "العرض (م)")}
              <input
                name="width_m"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                max="100"
                dir="ltr"
                value={form.width_m}
                disabled={busy}
                onChange={(e) => update("width_m", e.target.value)}
              />
            </label>
            <label>
              {text("Height (m)", "الارتفاع (م)")}
              <input
                name="height_m"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                max="100"
                dir="ltr"
                value={form.height_m}
                disabled={busy}
                onChange={(e) => update("height_m", e.target.value)}
              />
            </label>
            <DimensionStatusSelect
              ar={ar}
              value={form.dimension_status}
              disabled={busy}
              onChange={(value) => update("dimension_status", value)}
            />
            <label>
              {text("Source of size", "مصدر المقاس")}
              <input
                name="dimension_source"
                maxLength={1000}
                value={form.dimension_source}
                disabled={busy}
                onChange={(e) => update("dimension_source", e.target.value)}
              />
            </label>
          </fieldset>
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
    </>
  );
}

const dimensionStatuses = [
  ["unverified", "Unverified", "غير مُتحقَّق منه"],
  ["owner_supplied", "Owner-supplied", "مقدَّم من المالك"],
  ["surveyed", "Surveyed", "مُقاس ميدانياً"],
  ["remeasure_required", "Remeasure required", "يتطلب إعادة قياس"],
] as const;

function DimensionStatusSelect({
  ar,
  value,
  disabled,
  onChange,
}: {
  ar: boolean;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      {ar ? "حالة المقاس" : "Size status"}
      <select
        name="dimension_status"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{ar ? "غير مسجّل" : "Not recorded"}</option>
        {dimensionStatuses.map(([key, en, arabic]) => (
          <option key={key} value={key}>
            {ar ? arabic : en}
          </option>
        ))}
      </select>
    </label>
  );
}

type Dimension = {
  id: string;
  width_m: number;
  height_m: number;
  status: string;
  source_note: string;
  recorded_at: string;
};

// Administrator-only history of registered sizes. Newest entry is the current size.
function DimensionRecord({ faceId, ar }: { faceId: string; ar: boolean }) {
  const text = (en: string, arabic: string) => (ar ? arabic : en);
  const [history, setHistory] = useState<Dimension[]>([]),
    [loadError, setLoadError] = useState(""),
    [saveError, setSaveError] = useState(""),
    [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({
    width_m: "",
    height_m: "",
    status: "",
    source: "",
  });
  // One loading path for the history. Only the newest request may update state, so an
  // older response that arrives late cannot overwrite a newer result.
  const latestRequest = useRef(0);
  const load = useCallback(async () => {
    const request = ++latestRequest.current;
    try {
      const r = await fetch(`/api/locations/dimensions?faceId=${encodeURIComponent(faceId)}`, {
        cache: "no-store",
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      if (request === latestRequest.current) {
        setHistory(data);
        setLoadError("");
      }
    } catch (e) {
      if (request === latestRequest.current) setLoadError((e as Error).message);
    }
  }, [faceId]);
  useEffect(() => {
    setHistory([]);
    void load();
  }, [load]);
  const current = history[0];
  async function record(e: React.FormEvent) {
    e.preventDefault();
    setSaveError("");
    setBusy(true);
    try {
      const r = await fetch("/api/locations/dimensions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          faceId,
          widthM: Number(draft.width_m),
          heightM: Number(draft.height_m),
          status: draft.status,
          sourceNote: draft.source,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setDraft({ width_m: "", height_m: "", status: "", source: "" });
      await load();
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="location-dimensions" aria-live="polite">
      <h3>{text("Registered size", "المقاس المسجل")}</h3>
      {loadError ? (
        <p role="alert">{localizeError(loadError, ar)}</p>
      ) : current ? (
        <p>
          <bdi>
            {current.width_m} × {current.height_m} {text("m", "م")}
          </bdi>{" "}
          · {text(
            dimensionStatuses.find(([k]) => k === current.status)?.[1] ?? current.status,
            dimensionStatuses.find(([k]) => k === current.status)?.[2] ?? current.status,
          )}
          {current.source_note && <small> · {current.source_note}</small>}
        </p>
      ) : (
        <p className="muted">
          {text("Not recorded", "غير مسجّل")}
        </p>
      )}
      <details>
        <summary>{text("Record a size", "تسجيل مقاس")}</summary>
        <form className="location-fields" onSubmit={record}>
          <label>
            {text("Width (m)", "العرض (م)")}
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              max="100"
              dir="ltr"
              required
              value={draft.width_m}
              disabled={busy}
              onChange={(e) => setDraft((d) => ({ ...d, width_m: e.target.value }))}
            />
          </label>
          <label>
            {text("Height (m)", "الارتفاع (م)")}
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              max="100"
              dir="ltr"
              required
              value={draft.height_m}
              disabled={busy}
              onChange={(e) => setDraft((d) => ({ ...d, height_m: e.target.value }))}
            />
          </label>
          <DimensionStatusSelect
            ar={ar}
            value={draft.status}
            disabled={busy}
            onChange={(status) => setDraft((d) => ({ ...d, status }))}
          />
          <label>
            {text("Source of size", "مصدر المقاس")}
            <input
              maxLength={1000}
              value={draft.source}
              disabled={busy}
              onChange={(e) => setDraft((d) => ({ ...d, source: e.target.value }))}
            />
          </label>
          {saveError && (
            <div className="notice danger" role="alert">
              {localizeError(saveError, ar)}
            </div>
          )}
          <button className="secondary" type="submit" disabled={busy}>
            {text("Save size", "حفظ المقاس")}
          </button>
        </form>
      </details>
    </section>
  );
}
