"use client";
import type { ReactNode } from "react";
import { MapPin } from "lucide-react";
import {
  UNASSIGNED_CITY,
  dimensionRatio,
  formatCoordinateValue,
  formatDimensions,
  groupSitesByCity,
  siteAddress,
} from "@ibvs/domain";

// Fields every site already has in the inventory and assignment queries. Nothing here is computed from guesses.
export type InventorySite = {
  code: string;
  city: string | null;
  zone?: string | null;
  description?: string | null;
  worker_address?: string | null;
  width_m?: number | null;
  height_m?: number | null;
  latitude: number | null;
  longitude: number | null;
  is_test?: boolean;
};

const text = {
  en: {
    unassigned: "Unassigned City",
    sites: (n: number) => (n === 1 ? "1 site" : `${n} sites`),
    na: "Not available",
    address: "Address",
    dimensions: "Dimensions",
    ratio: "Ratio (W:H)",
    latitude: "Latitude",
    longitude: "Longitude",
    landmark: "Nearest landmark",
    code: "Site code",
    pendingGps: "Pending GPS",
    test: "Test",
  },
  ar: {
    unassigned: "مدينة غير محددة",
    sites: (n: number) => `${n} موقع`,
    na: "غير متوفر",
    address: "العنوان",
    dimensions: "الأبعاد",
    ratio: "النسبة (عرض:ارتفاع)",
    latitude: "خط العرض",
    longitude: "خط الطول",
    landmark: "أقرب معلم",
    code: "رمز الموقع",
    pendingGps: "بانتظار الموقع GPS",
    test: "تجريبي",
  },
};

// City-wise list of sites: one collapsible card per city, each holding the sites' complete saved details.
// Shared by the admin Inventory page and the worker's assignments page; callers pass sites already scoped
// to what the viewer may see, so this component never widens access.
export function CityInventory<T extends InventorySite>({
  sites,
  ar,
  keyOf,
  emptyText,
  renderActions,
}: {
  sites: T[];
  ar: boolean;
  keyOf: (site: T) => string;
  emptyText: string;
  renderActions?: (site: T) => ReactNode;
}) {
  const t = ar ? text.ar : text.en;
  const groups = groupSitesByCity(sites);
  if (!groups.length) return <p className="muted city-inventory-empty">{emptyText}</p>;
  return (
    <div className="city-inventory">
      {groups.map((group) => (
        <details className="city-card" key={group.city} open={groups.length === 1}>
          <summary>
            <span className="city-card-name">
              <MapPin size={16} aria-hidden="true" />
              {group.city === UNASSIGNED_CITY ? t.unassigned : group.city}
            </span>
            <span className="city-card-count">{t.sites(group.sites.length)}</span>
          </summary>
          <div className="site-grid">
            {group.sites.map((site) => {
              const value = (v: string | null | undefined) => (v && v.trim() ? v : t.na);
              return (
                <article className="site-card" key={keyOf(site)}>
                  <h4 className="site-name">{value(site.description)}</h4>
                  {(site.latitude === null || site.longitude === null || site.is_test) && (
                    <div className="site-chips">
                      {(site.latitude === null || site.longitude === null) && (
                        <span className="pending-gps">{t.pendingGps}</span>
                      )}
                      {site.is_test && <span className="status-pill location-test">{t.test}</span>}
                    </div>
                  )}
                  <dl className="site-facts">
                    <div className="site-fact-wide">
                      <dt>{t.address}</dt>
                      <dd>{value(siteAddress(site))}</dd>
                    </div>
                    <div>
                      <dt>{t.dimensions}</dt>
                      <dd>{value(formatDimensions(site.width_m, site.height_m))}</dd>
                    </div>
                    <div>
                      <dt>{t.ratio}</dt>
                      <dd>{value(dimensionRatio(site.width_m, site.height_m))}</dd>
                    </div>
                    <div>
                      <dt>{t.latitude}</dt>
                      <dd className="mono" dir="ltr">{value(formatCoordinateValue(site.latitude))}</dd>
                    </div>
                    <div>
                      <dt>{t.longitude}</dt>
                      <dd className="mono" dir="ltr">{value(formatCoordinateValue(site.longitude))}</dd>
                    </div>
                    <div className="site-fact-wide">
                      <dt>{t.landmark}</dt>
                      <dd>{t.na}</dd>
                    </div>
                  </dl>
                  <p className="site-code">
                    {t.code}: <bdi>{site.code}</bdi>
                  </p>
                  {renderActions?.(site)}
                </article>
              );
            })}
          </div>
        </details>
      ))}
    </div>
  );
}
