"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Camera } from "lucide-react";
import type { Submission } from "@/server/inspections";
import { cityName } from "@ibvs/domain";
import { localizeError } from "@/lib/server-messages";

const kindLabel: Record<string, [string, string]> = {
  front: ["Front", "أمامية"],
  wide: ["Wide", "واسعة"],
  angle_1: ["Angle 1", "زاوية ١"],
  angle_2: ["Angle 2", "زاوية ٢"],
  angle_3: ["Angle 3", "زاوية ٣"],
  angle_4: ["Angle 4", "زاوية ٤"],
};
const stateLabel: Record<string, [string, string]> = {
  pending: ["Awaiting review", "بانتظار المراجعة"],
  approved: ["Approved", "معتمدة"],
  rejected: ["Rejected", "مرفوضة"],
  resurvey_requested: ["Resurvey requested", "إعادة زيارة"],
  ambiguous: ["Ambiguous", "ملتبسة"],
};
// Badge colour classes already used on the dashboard.
const stateClass: Record<string, string> = {
  pending: "pending_review",
  approved: "baseline_verified",
  rejected: "rejected",
  resurvey_requested: "resurvey_requested",
  ambiguous: "pending_review",
};

// Completed visits sent by workers, newest first, with the photos the server holds.
// Admins only: the endpoint refuses everyone else.
export function Submissions({ ar }: { ar: boolean }) {
  const [rows, setRows] = useState<Submission[] | null>(null),
    [error, setError] = useState(""),
    [worker, setWorker] = useState("");
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  useEffect(() => {
    let active = true;
    fetch("/api/inspections/submissions", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Request failed");
        if (active) setRows(data as Submission[]);
      })
      .catch((e: Error) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, []);
  if (error) return <p className="notice danger" role="alert">{localizeError(error, ar)}</p>;
  if (!rows) return <p className="muted" role="status">{t("Loading submissions…", "جارٍ تحميل الزيارات…")}</p>;
  const workers = [...new Map(rows.map((r) => [r.worker_id, r.worker_name])).entries()].sort((a, b) =>
    a[1].localeCompare(b[1]),
  );
  const shown = worker ? rows.filter((r) => r.worker_id === worker) : rows;
  const when = (iso: string) =>
    new Date(iso).toLocaleString(ar ? "ar-IQ" : "en-GB", {
      timeZone: "Asia/Baghdad",
      dateStyle: "medium",
      timeStyle: "short",
    });
  return (
    <section className="submissions">
      <div className="submissions-bar">
        <label>
          {t("Worker", "الموظف")}
          <select value={worker} onChange={(e) => setWorker(e.target.value)}>
            <option value="">{t("All workers", "كل الموظفين")}</option>
            {workers.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <span className="muted">
          {shown.length === 1 ? t("1 visit", "زيارة واحدة") : t(`${shown.length} visits`, `${shown.length} زيارة`)}
        </span>
      </div>
      {!shown.length ? (
        <p className="muted submissions-empty">{t("No completed visits yet.", "لا توجد زيارات مكتملة بعد.")}</p>
      ) : (
        <div className="submission-list">
          {shown.map((row) => (
            <article className="submission-card" key={row.id}>
              <header>
                <div>
                  <h4>{row.description?.trim() || row.code}</h4>
                  <p className="muted">
                    <bdi>{row.code}</bdi>
                    {row.city ? " · " + cityName(row.city, ar) : ""}
                  </p>
                </div>
                <span className={"badge " + (stateClass[row.review_state] || "pending_review")}>
                  <span />
                  {(stateLabel[row.review_state] || [row.review_state, row.review_state])[ar ? 1 : 0]}
                </span>
              </header>
              <p className="submission-meta">
                {row.worker_name} · <time dateTime={row.received_at}>{when(row.received_at)}</time>
              </p>
              <div className="submission-photos">
                {row.kinds.map((kind) => (
                  <a
                    key={kind}
                    href={`/api/inspections/${row.id}/media/${kind}`}
                    target="_blank"
                    rel="noopener"
                    title={(kindLabel[kind] || [kind, kind])[ar ? 1 : 0]}
                  >
                    {/* Private, same-origin photo bytes; next/image would try to optimise them. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/inspections/${row.id}/media/${kind}`}
                      alt={t(`${(kindLabel[kind] || [kind])[0]} photo of ${row.code}`, `صورة ${(kindLabel[kind] || [kind, kind])[1]} للموقع ${row.code}`)}
                      loading="lazy"
                    />
                  </a>
                ))}
                {!row.kinds.length && (
                  <span className="muted">
                    <Camera size={14} /> {t("No photos received", "لم تُستلم صور")}
                  </span>
                )}
              </div>
              <Link className="secondary" href={`/review?inspection=${row.id}`}>
                {t("Open in review", "فتح في المراجعة")}
                <ArrowUpRight size={15} />
              </Link>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
