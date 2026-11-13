"use client";
import { cityName } from "@ibvs/domain";

// Shared by the administrator and field dashboards. A location with no verified GPS, no measured size,
// or an unverified city is shown with a visible label, never as if it were complete.

export type CityCount = { city: string; count: number; attention: number };

export function cityCounts<T extends { city: string }>(
  items: T[],
  needsAttention: (item: T) => boolean = () => false,
): CityCount[] {
  const counts = new Map<string, CityCount>();
  for (const item of items) {
    const entry = counts.get(item.city) ?? { city: item.city, count: 0, attention: 0 };
    entry.count++;
    if (needsAttention(item)) entry.attention++;
    counts.set(item.city, entry);
  }
  return [...counts.values()].sort((a, b) => a.city.localeCompare(b.city));
}

export type LocationFlagsInput = {
  gps_status?: string | null;
  city_status?: string | null;
  needs_review?: boolean | null;
  dimension_status?: string | null;
};

export const needsLocationAttention = (item: LocationFlagsInput) =>
  item.gps_status === "pending_gps" ||
  item.gps_status === "to_correct" ||
  item.gps_status === "approximate" ||
  item.dimension_status === "pending_measurement" ||
  !!item.needs_review ||
  (!!item.city_status && item.city_status !== "confirmed");

export function CityTabs({
  label,
  allLabel,
  total,
  cities,
  value,
  onChange,
  ar,
}: {
  label: string;
  allLabel: string;
  total: number;
  cities: CityCount[];
  value: string;
  onChange: (city: string) => void;
  ar: boolean;
}) {
  return (
    <nav aria-label={label} className="city-tabs">
      <button
        type="button"
        className="city-tab"
        aria-pressed={value === ""}
        onClick={() => onChange("")}
      >
        <span>{allLabel}</span>
        <strong>{total}</strong>
      </button>
      {cities.map((c) => (
        <button
          type="button"
          key={c.city}
          className="city-tab"
          aria-pressed={value === c.city}
          onClick={() => onChange(c.city)}
        >
          <span>
            <bdi>{cityName(c.city, ar)}</bdi>
          </span>
          <strong>{c.count}</strong>
          {c.attention > 0 && (
            <em title={ar ? "تحتاج متابعة" : "Needs follow-up"}>
              {c.attention} {ar ? "للمتابعة" : "to check"}
            </em>
          )}
        </button>
      ))}
    </nav>
  );
}

export function LocationFlags({ item, ar }: { item: LocationFlagsInput; ar: boolean }) {
  const chips: { key: string; text: string; tone: "warn" | "info" | "ok" }[] = [];
  if (item.gps_status === "pending_gps")
    chips.push({ key: "gps", text: ar ? "بانتظار تحديد الموقع" : "Pending GPS", tone: "warn" });
  if (item.gps_status === "approximate")
    chips.push({ key: "gps", text: ar ? "موقع تقريبي غير موثّق" : "Approximate, unverified", tone: "warn" });
  if (item.gps_status === "to_correct")
    chips.push({ key: "gps", text: ar ? "الموقع يحتاج تصحيحاً" : "GPS needs correction", tone: "warn" });
  if (item.gps_status === "verified")
    chips.push({ key: "gps", text: ar ? "موقع موثّق" : "GPS verified", tone: "ok" });
  if (item.dimension_status === "pending_measurement")
    chips.push({ key: "dim", text: ar ? "القياس معلّق" : "Pending measurement", tone: "info" });
  if (item.needs_review)
    chips.push({ key: "review", text: ar ? "للمراجعة" : "Needs review", tone: "warn" });
  if (item.city_status === "unspecified")
    chips.push({ key: "city", text: ar ? "مدينة غير محددة" : "Unspecified city", tone: "warn" });
  if (item.city_status === "pending_verification")
    chips.push({ key: "city", text: ar ? "المدينة بانتظار التحقق" : "City pending verification", tone: "warn" });
  if (!chips.length) return null;
  return (
    <span className="location-flags">
      {chips.map((chip) => (
        <span key={chip.key + chip.text} className={`location-flag ${chip.tone}`}>
          {chip.text}
        </span>
      ))}
    </span>
  );
}
