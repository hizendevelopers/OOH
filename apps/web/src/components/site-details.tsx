"use client";
import type { ReactNode } from "react";
import { siteSummary, type SiteSummaryInput } from "@ibvs/domain";

const text = {
  en: {
    address: "Address",
    size: "Size",
    location: "Location",
    code: "Site code",
    na: "Not available",
    notMeasured: "Not measured yet",
    pendingGps: "Pending GPS",
    enteredByYou: "entered by a worker",
  },
  ar: {
    address: "العنوان",
    size: "المقاس",
    location: "الموقع",
    code: "رمز الموقع",
    na: "غير متوفر",
    notMeasured: "لم يُقَس بعد",
    pendingGps: "بانتظار تحديد الموقع",
    enteredByYou: "أدخله موظف ميداني",
  },
};

// One site's details, the same on the field visit list, at the top of an open visit and on the admin
// inventory: name first, then address, size and location, with the code small at the bottom.
// Only saved values are shown; nothing is guessed.
export function SiteDetails({
  site,
  ar,
  heading = "h3",
  chips,
  pendingText,
  addressExtra,
  locationExtra,
  children,
}: {
  site: SiteSummaryInput;
  ar: boolean;
  heading?: "h2" | "h3" | "h4";
  chips?: ReactNode;
  // What to say when the site has no GPS pin yet; the field app explains how it gets one.
  pendingText?: string;
  addressExtra?: ReactNode;
  locationExtra?: ReactNode;
  children?: ReactNode;
}) {
  const t = ar ? text.ar : text.en;
  const s = siteSummary(site, ar);
  const Heading = heading;
  return (
    <div className="site-details">
      <Heading className="site-name">
        <bdi>{s.name}</bdi>
      </Heading>
      {chips && <div className="site-chips">{chips}</div>}
      <dl className="site-facts">
        <div className="site-fact-wide">
          <dt>{t.address}</dt>
          <dd>
            {s.address ? <bdi>{s.address}</bdi> : t.na}
            {s.addressFromWorker && <small className="site-fact-note"> · {t.enteredByYou}</small>}
            {addressExtra}
          </dd>
        </div>
        <div className="site-fact-wide">
          <dt>{t.size}</dt>
          <dd>{s.size ? <bdi dir="ltr">{s.size}</bdi> : t.notMeasured}</dd>
        </div>
        <div className="site-fact-wide">
          <dt>{t.location}</dt>
          <dd>
            {s.location ? (
              <bdi className="mono" dir="ltr">
                {s.location.text}
              </bdi>
            ) : (
              <span className="pending-gps">{pendingText ?? t.pendingGps}</span>
            )}
            {locationExtra}
          </dd>
        </div>
      </dl>
      {/* When a site has no name the code is already its heading, so it is not repeated. */}
      {s.hasName && (
        <p className="site-code">
          {t.code}: <bdi>{s.code}</bdi>
        </p>
      )}
      {children}
    </div>
  );
}
