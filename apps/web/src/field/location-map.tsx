import type { GpsObservation } from "../../../../packages/domain/src/inspection";
export function LocationMap({
  gps,
  locations,
  arabic = false,
}: {
  gps: GpsObservation;
  arabic?: boolean;
  locations: {
    id: string;
    code: string;
    latitude: number;
    longitude: number;
    uncertainty_m: number;
  }[];
}) {
  if (gps.status !== "ok") return null;
  const lonScale = Math.max(
    1,
    111320 * Math.cos((gps.latitude * Math.PI) / 180),
  );
  const extent = Math.max(
    100,
    gps.accuracy,
    ...locations.map(
      (p) =>
        Math.hypot(
          (p.longitude - gps.longitude) * lonScale,
          (p.latitude - gps.latitude) * 111320,
        ) + Math.min(p.uncertainty_m, 1000),
    ),
  );
  const scale = 135 / extent;
  return (
    <figure className="review-map">
      <svg
        viewBox="0 0 360 320"
        role="img"
        aria-label={
          arabic
            ? "خريطة إحداثيات توضح دقة موقعك واللوحات المسجلة"
            : "Coordinate map showing your GPS accuracy and registered billboards"
        }
        style={{ width: "100%", maxHeight: 320 }}
      >
        <rect
          x="0"
          y="0"
          width="360"
          height="320"
          fill="none"
          stroke="currentColor"
          opacity=".15"
        />
        <path d="M180 0v320M0 160h360" stroke="currentColor" opacity=".15" />
        <circle
          cx="180"
          cy="160"
          r={Math.min(135, gps.accuracy * scale)}
          fill="#0c927c"
          opacity=".15"
        />
        <circle cx="180" cy="160" r="6" fill="#0c927c" />
        <text x="190" y="180" fill="currentColor" fontSize="11">
          {arabic ? "أنت" : "You"}
        </text>
        {locations.map((p) => {
          const x = 180 + (p.longitude - gps.longitude) * lonScale * scale,
            y = 160 - (p.latitude - gps.latitude) * 111320 * scale;
          return (
            <g key={p.id}>
              <rect x={x - 5} y={y - 5} width="10" height="10" fill="#2f69bb" />
              <text x={x + 8} y={y - 8} fontSize="11" fill="currentColor">
                {p.code}
              </text>
              <title>
                {p.code}: {p.latitude}, {p.longitude}
              </title>
            </g>
          );
        })}
        <text x="320" y="22" fill="currentColor">
          N ↑
        </text>
        <text x="12" y="305" fill="currentColor" fontSize="11">
          {arabic ? "نصف قطر العرض" : "View radius"} {Math.round(extent)} m
        </text>
      </svg>
      <figcaption>
        {arabic
          ? "خريطة إحداثيات · أخضر: موقعك ودقته · أزرق: اللوحات · بدون خريطة شوارع"
          : "Coordinate map · green: your position and accuracy · blue: billboards · no street tiles"}
      </figcaption>
    </figure>
  );
}
