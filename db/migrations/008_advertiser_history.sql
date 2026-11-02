-- Advertiser history. Brand observations come from workers and confirmations come from
-- supervisors. Both are append-only. The current advertiser is the latest confirmation.
CREATE TABLE advertisers (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id),
  name_en text NOT NULL DEFAULT '' CHECK (length(name_en) <= 120),
  name_ar text NOT NULL DEFAULT '' CHECK (length(name_ar) <= 120),
  normalized_key text NOT NULL CHECK (length(normalized_key) BETWEEN 2 AND 120),
  created_by text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, normalized_key),
  UNIQUE (organization_id, id)
);

CREATE TABLE brand_observations (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id),
  face_id text NOT NULL,
  inspection_id text NOT NULL UNIQUE REFERENCES inspections(id),
  kind text NOT NULL CHECK (kind IN ('advertiser','blank','unreadable')),
  observed_text text NOT NULL DEFAULT '' CHECK (length(observed_text) <= 120),
  normalized_key text NOT NULL DEFAULT '' CHECK (length(normalized_key) <= 120),
  recorded_by text NOT NULL REFERENCES "user"(id),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'advertiser') = (length(observed_text) > 0)),
  FOREIGN KEY (organization_id, face_id) REFERENCES billboard_faces(organization_id, id)
);
CREATE INDEX brand_observations_face ON brand_observations(face_id, recorded_at DESC, id DESC);
CREATE TRIGGER brand_observations_immutable BEFORE UPDATE OR DELETE ON brand_observations FOR EACH ROW EXECUTE FUNCTION deny_change();

CREATE TABLE advertiser_confirmations (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id),
  face_id text NOT NULL,
  observation_id text REFERENCES brand_observations(id),
  outcome text NOT NULL CHECK (outcome IN ('advertiser','blank','unreadable')),
  advertiser_id text,
  reason text NOT NULL DEFAULT '' CHECK (length(reason) <= 1000),
  confirmed_by text NOT NULL REFERENCES "user"(id),
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((outcome = 'advertiser') = (advertiser_id IS NOT NULL)),
  FOREIGN KEY (organization_id, face_id) REFERENCES billboard_faces(organization_id, id),
  FOREIGN KEY (organization_id, advertiser_id) REFERENCES advertisers(organization_id, id)
);
CREATE INDEX advertiser_confirmations_face ON advertiser_confirmations(face_id, confirmed_at DESC, id DESC);
CREATE TRIGGER advertiser_confirmations_immutable BEFORE UPDATE OR DELETE ON advertiser_confirmations FOR EACH ROW EXECUTE FUNCTION deny_change();

CREATE VIEW current_face_advertiser WITH (security_invoker = true) AS
SELECT DISTINCT ON (c.face_id) c.id, c.organization_id, c.face_id, c.outcome, c.advertiser_id, c.observation_id, c.confirmed_by, c.confirmed_at
FROM advertiser_confirmations c
ORDER BY c.face_id, c.confirmed_at DESC, c.id DESC;
