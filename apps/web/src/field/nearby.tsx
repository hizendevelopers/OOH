"use client";
import { useState } from "react";
import type { Assignment } from "../server/service";
import type { NearbyLocation } from "../server/nearby-locations";
import type { GpsObservation } from "../../../../packages/domain/src/inspection";
import { getLocation } from "./device";
import { fieldRequest } from "./sync";
import { LocationMap } from "./location-map";
import { metresBetween } from "./location-policy";

export function Nearby({
  tasks,
  online,
  busy,
  onOpen,
  arabic = false,
}: {
  tasks: Assignment[];
  online: boolean;
  busy: boolean;
  arabic?: boolean;
  onOpen: (task: Assignment) => Promise<void>;
}) {
  const [gps, setGps] = useState<GpsObservation | null>(null),
    [locating, setLocating] = useState(false),
    [locations, setLocations] = useState<NearbyLocation[]>([]),
    [searched, setSearched] = useState(false),
    [includeTest, setIncludeTest] = useState(false),
    [error, setError] = useState("");
  async function find() {
    setLocating(true);
    setError("");
    setSearched(false);
    setLocations([]);
    try {
      const fix = await getLocation();
      setGps(fix);
      if (fix.status !== "ok") {
        setError(
          fix.status === "denied"
            ? arabic
              ? "اسمح بالوصول للموقع في إعدادات المتصفح وأعد المحاولة."
              : "Allow location access in your browser settings and retry."
            : arabic
              ? "الموقع غير متاح. أعد المحاولة من مكان مفتوح وآمن."
              : "Location is unavailable. Retry from a safe open area.",
        );
        return;
      }
      if (online) {
        const result = await fieldRequest<{ locations: NearbyLocation[] }>(
          `locations/nearby?latitude=${fix.latitude}&longitude=${fix.longitude}&includeTest=${includeTest}`,
        );
        setLocations(result.locations);
      } else {
        setLocations(
          tasks
            .filter(
              (task) =>
                ["assigned", "resurvey_requested"].includes(task.status) &&
                (includeTest || !task.is_test),
            )
            .map((task) => ({
              ...task,
              is_test: !!task.is_test,
              distance_m: metresBetween(fix, task),
            }))
            .filter((task) => task.distance_m <= 5000)
            .sort((a, b) => a.distance_m - b.distance_m)
            .slice(0, 50),
        );
      }
      setSearched(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nearby search unavailable");
    } finally {
      setLocating(false);
    }
  }
  return (
    <section className="panel field-nearby">
      <div className="panel-heading">
        <div>
          <h2>{arabic ? "اللوحات القريبة" : "Nearby billboards"}</h2>
          <p>
            {arabic
              ? "اعثر على زياراتك المخصصة ضمن ٥ كم. تحقق من رمز اللوحة وواجهتها قبل التصوير."
              : "Find your assigned visits within 5 km. Confirm the code and face before capture."}
          </p>
        </div>
        <button
          className="secondary"
          disabled={busy || locating}
          onClick={() => void find()}
        >
          {locating
            ? arabic
              ? "جارٍ تحديد الموقع…"
              : "Getting location…"
            : arabic
              ? "البحث عن لوحات قريبة"
              : "Find nearby billboards"}
        </button>
      </div>
      <label>
        <input
          type="checkbox"
          disabled={locating}
          checked={includeTest}
          onChange={(e) => {
            setIncludeTest(e.target.checked);
            setSearched(false);
            setLocations([]);
          }}
        />{" "}
        {arabic ? "تضمين المواقع التجريبية" : "Include test locations"}
      </label>
      {!online && (
        <p className="notice warning">
          {arabic
            ? "دون اتصال: النتائج من المهام المحملة وقد تكون قديمة."
            : "Offline: results use downloaded assignments and may be out of date."}
        </p>
      )}
      {error && (
        <p className="notice danger" role="alert">
          {error}
        </p>
      )}
      {gps?.status === "ok" && (
        <>
          <p role="status">
            {arabic ? "موقعك:" : "Your position:"}{" "}
            <bdi>
              {gps.latitude.toFixed(6)}, {gps.longitude.toFixed(6)}
            </bdi>{" "}
            · {arabic ? "الدقة" : "accuracy"} ±{Math.round(gps.accuracy)} m
          </p>
          <LocationMap gps={gps} locations={locations} arabic={arabic} />
        </>
      )}
      {searched && locations.length === 0 && (
        <p role="status">
          {arabic
            ? "لا توجد لوحات مخصصة لك ضمن ٥ كم. تحقق من المهام أو ضمّن المواقع التجريبية."
            : "No permitted assigned billboards found within 5 km. Check your assignments or include test locations."}
        </p>
      )}
      {locations.map((task) => (
        <article key={task.assignment_id} className="field-visit">
          <h3>
            {task.code}
            {task.is_test ? (arabic ? " · تجريبي" : " · Test") : ""}
          </h3>
          <p>
            {task.structure_code} / {task.orientation} · {task.city} ·{" "}
            {Math.round(task.distance_m)} {arabic ? "م بعيداً" : "m away"}
          </p>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => void onOpen(task)}
          >
            {arabic ? "فتح الزيارة المخصصة" : "Open assigned visit"}
          </button>
        </article>
      ))}
    </section>
  );
}
