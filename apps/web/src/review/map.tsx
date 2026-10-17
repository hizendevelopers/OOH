import type { ReviewDetail } from "@/server/review";
export default function EvidenceMap({
  detail,
  arabic,
}: {
  detail: ReviewDetail;
  arabic: boolean;
}) {
  const { inspection: i, report } = detail;
  const points = [
    ...(report?.observations || []).map((o) => ({ ...o, radius: o.accuracy })),
    ...(report?.candidates || []).map((c) => ({
      ...c,
      radius: c.uncertainty_m,
    })),
  ];
  const scaleLon = 111320 * Math.cos((i.latitude * Math.PI) / 180),
    scaleLat = 111320;
  const extent = Math.max(
    150,
    i.uncertainty_m,
    ...points.map(
      (p) =>
        Math.hypot(
          (p.longitude - i.longitude) * scaleLon,
          (p.latitude - i.latitude) * scaleLat,
        ) + p.radius,
    ),
  );
  const k = 140 / extent,
    x = (lon: number) => 180 + (lon - i.longitude) * scaleLon * k,
    y = (lat: number) => 170 - (lat - i.latitude) * scaleLat * k;
  return (
    <figure className="review-map">
      <svg
        viewBox="0 0 360 340"
        role="img"
        aria-label={
          arabic
            ? "مخطط إحداثيات موقع اللوحة وملاحظات العامل ودقة الموقع"
            : "Coordinate map of assigned billboard, worker observations and accuracy"
        }
      >
        <defs>
          <pattern
            id="grid"
            width="30"
            height="30"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 30 0 L 0 0 0 30"
              fill="none"
              stroke="currentColor"
              opacity=".12"
            />
          </pattern>
        </defs>
        <rect width="360" height="340" fill="url(#grid)" />
        <circle
          cx="180"
          cy="170"
          r={i.uncertainty_m * k}
          fill="var(--blue)"
          opacity=".12"
        />
        {report?.candidates.map((c) => (
          <g key={c.id}>
            <rect
              x={x(c.longitude) - 5}
              y={y(c.latitude) - 5}
              width="10"
              height="10"
              fill="var(--amber)"
            />
            <title>
              {c.code} · {Math.round(c.distanceM)} m
            </title>
          </g>
        ))}
        {report?.observations.map((o, n) => (
          <g key={o.kind}>
            <circle
              cx={x(o.longitude)}
              cy={y(o.latitude)}
              r={o.accuracy * k}
              fill={n ? "#b47818" : "#0c927c"}
              opacity=".15"
              stroke={n ? "#b47818" : "#0c927c"}
            />
            <circle
              cx={x(o.longitude)}
              cy={y(o.latitude)}
              r="5"
              fill={n ? "#b47818" : "#0c927c"}
            />
            <title>
              {o.kind}: {Math.round(o.distanceM)} m ± {o.accuracy} m
            </title>
          </g>
        ))}
        <path d="M180 158 L192 170 L180 182 L168 170 Z" fill="var(--blue)" />
        <text x="322" y="24" fill="currentColor">
          N ↑
        </text>
        <path d="M20 310h70m-70-4v8m70-8v8" stroke="currentColor" />
        <text x="20" y="299" fill="currentColor" fontSize="11">
          {Math.round(70 / k)} m
        </text>
      </svg>
      <figcaption>
        {arabic
          ? "خريطة إحداثيات محلية • بدون خرائط شوارع"
          : "Local coordinate map • no street tiles"}
        <br />
        {arabic
          ? "◆ الموقع المعيّن · ● أمامية خضراء / واسعة ذهبية · ■ مواقع مجاورة"
          : "◆ Assigned · ● Front green / wide gold · ■ Neighbors"}
        <br />
        <bdi>
          {i.latitude}, {i.longitude} ± {i.uncertainty_m} m
        </bdi>
      </figcaption>
    </figure>
  );
}
