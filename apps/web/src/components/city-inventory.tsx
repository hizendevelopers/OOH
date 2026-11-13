"use client";
import type { ReactNode } from "react";
import { MapPin } from "lucide-react";
import { UNASSIGNED_CITY, cityName, groupSitesByCity } from "@ibvs/domain";
import { SiteDetails } from "./site-details";

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
    test: "Test",
  },
  ar: {
    unassigned: "مدينة غير محددة",
    sites: (n: number) => `${n} موقع`,
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
  renderCityActions,
}: {
  sites: T[];
  ar: boolean;
  keyOf: (site: T) => string;
  emptyText: string;
  renderActions?: (site: T) => ReactNode;
  // Optional action in a city's header row, such as assigning the whole city. Not shown for sites without a city.
  renderCityActions?: (city: string) => ReactNode;
}) {
  const t = ar ? text.ar : text.en;
  const groups = groupSitesByCity(sites);
  if (!groups.length) return <p className="muted city-inventory-empty">{emptyText}</p>;
  return (
    <div className="city-inventory">
      {groups.map((group) => (
        // Small lists (a worker's own sites) open fully; the large admin inventory starts collapsed.
        <details className="city-card" key={group.city} open={groups.length === 1 || sites.length <= 20}>
          <summary>
            <span className="city-card-name">
              <MapPin size={16} aria-hidden="true" />
              {group.city === UNASSIGNED_CITY ? t.unassigned : cityName(group.city, ar)}
            </span>
            <span className="city-card-count">{t.sites(group.sites.length)}</span>
            {renderCityActions && group.city !== UNASSIGNED_CITY && (
              // A click here runs the action without opening or closing the city.
              <span
                className="city-card-actions"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
              >
                {renderCityActions(group.city)}
              </span>
            )}
          </summary>
          <div className="site-grid">
            {group.sites.map((site) => {
              return (
                <article className="site-card" key={keyOf(site)}>
                  <SiteDetails
                    site={site}
                    ar={ar}
                    heading="h4"
                    chips={site.is_test ? <span className="status-pill location-test">{t.test}</span> : undefined}
                  >
                    {renderActions?.(site)}
                  </SiteDetails>
                </article>
              );
            })}
          </div>
        </details>
      ))}
    </div>
  );
}
