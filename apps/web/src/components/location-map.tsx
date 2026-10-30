"use client";
import { useState } from "react";

function world(latitude: number, longitude: number, zoom: number) {
  const size = 256 * 2 ** zoom;
  const lat = (Math.max(-85.0511, Math.min(85.0511, latitude)) * Math.PI) / 180;
  return {
    x: ((longitude + 180) / 360) * size,
    y: ((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2) * size,
  };
}
function coordinate(x: number, y: number, zoom: number) {
  const size = 256 * 2 ** zoom;
  return {
    latitude: Math.max(
      -85.0511,
      Math.min(
        85.0511,
        (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / size))) * 180) / Math.PI,
      ),
    ),
    longitude: (((((x / size) * 360) % 360) + 360) % 360) - 180,
  };
}

/** Small, dependency-free map. The coordinate inputs remain available without map tiles. */
export function LocationMap({
  latitude,
  longitude,
  onSelect,
  ar = false,
  uncertainty = 0,
}: {
  latitude: number;
  longitude: number;
  onSelect?: (lat: number, lon: number) => void;
  ar?: boolean;
  uncertainty?: number;
}) {
  const [zoom, setZoom] = useState(15);
  const center = world(latitude, longitude, zoom);
  const left = center.x - 256,
    top = center.y - 150,
    count = 2 ** zoom;
  const tiles = [];
  for (let dx = 0; dx < 3; dx++)
    for (let dy = 0; dy < 3; dy++) {
      const x = Math.floor(left / 256) + dx,
        y = Math.floor(top / 256) + dy;
      if (y < 0 || y >= count) continue;
      tiles.push(
        <image
          key={`${zoom}-${x}-${y}`}
          href={`https://tile.openstreetmap.org/${zoom}/${((x % count) + count) % count}/${y}.png`}
          x={x * 256 - left}
          y={y * 256 - top}
          width="256"
          height="256"
        />,
      );
    }
  const radius = Math.min(
    140,
    uncertainty /
      ((156543.03392 * Math.cos((latitude * Math.PI) / 180)) / 2 ** zoom),
  );
  return (
    <div className="location-map">
      <svg
        viewBox="0 0 512 300"
        role="img"
        aria-label={ar ? "معاينة الموقع على الخريطة" : "Location map preview"}
        onClick={
          onSelect
            ? (e) => {
                const box = e.currentTarget.getBoundingClientRect();
                const p = coordinate(
                  left + ((e.clientX - box.left) / box.width) * 512,
                  top + ((e.clientY - box.top) / box.height) * 300,
                  zoom,
                );
                onSelect(
                  Number(p.latitude.toFixed(7)),
                  Number(p.longitude.toFixed(7)),
                );
              }
            : undefined
        }
        style={{ cursor: onSelect ? "crosshair" : "default" }}
      >
        <rect width="512" height="300" fill="#dde7e2" />
        {tiles}
        {radius > 0 && (
          <circle
            cx="256"
            cy="150"
            r={radius}
            fill="#317b6840"
            stroke="#226753"
          />
        )}
        <circle
          cx="256"
          cy="150"
          r="10"
          fill="#17624d"
          stroke="white"
          strokeWidth="4"
        />
        <path
          d="M256 135v-8m0 46v-8m-15-15h-8m46 0h-8"
          stroke="#17624d"
          strokeWidth="2"
        />
      </svg>
      <div className="location-map-controls">
        <button
          type="button"
          className="secondary"
          aria-label={ar ? "تكبير" : "Zoom in"}
          disabled={zoom >= 19}
          onClick={() => setZoom((z) => z + 1)}
        >
          +
        </button>
        <button
          type="button"
          className="secondary"
          aria-label={ar ? "تصغير" : "Zoom out"}
          disabled={zoom <= 2}
          onClick={() => setZoom((z) => z - 1)}
        >
          −
        </button>
      </div>
      <a
        className="location-attribution"
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noreferrer"
      >
        © OpenStreetMap contributors
      </a>
      {onSelect && (
        <small>
          {ar
            ? "اضغط على الخريطة لتحديد الموقع، أو أدخل الإحداثيات أدناه."
            : "Click the map to place the pin, or enter coordinates below."}
        </small>
      )}
    </div>
  );
}
