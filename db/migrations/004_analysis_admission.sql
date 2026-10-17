CREATE TABLE analysis_admissions (id text PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id), actor_id text NOT NULL REFERENCES "user"(id), started_at timestamptz NOT NULL DEFAULT now(), lease_until timestamptz NOT NULL DEFAULT now()+interval '5 minutes');
CREATE INDEX analysis_admissions_org ON analysis_admissions(organization_id,started_at);
