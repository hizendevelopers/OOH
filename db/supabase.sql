-- Apply after the portable migrations in the private ibvs schema, as postgres.
-- App tables stay outside the Supabase Data API; the Next.js API owns access.
REVOKE ALL ON SCHEMA ibvs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA ibvs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA ibvs FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA ibvs REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

ALTER FUNCTION ibvs.deny_change() SET search_path = pg_catalog;
ALTER FUNCTION ibvs.protect_face_identity() SET search_path = pg_catalog;
ALTER FUNCTION ibvs.protect_received_inspection() SET search_path = pg_catalog;
ALTER FUNCTION ibvs.protect_complete_media() SET search_path = pg_catalog;

GRANT USAGE ON SCHEMA ibvs, extensions TO ibvs_app;
GRANT SELECT ON ALL TABLES IN SCHEMA ibvs TO ibvs_app;
GRANT INSERT ON ibvs."user", ibvs.session, ibvs.account, ibvs.verification,
  ibvs."rateLimit", ibvs.organization_members, ibvs.worker_profiles,
  ibvs.billboard_structures, ibvs.billboard_faces, ibvs.source_coordinates,
  ibvs.assignments, ibvs.audit_events, ibvs.activity_logs, ibvs.challenges,
  ibvs.inspections, ibvs.media_evidence, ibvs.evidence_parts, ibvs.review_cases,
  ibvs.media_analysis, ibvs.verification_runs, ibvs.review_decisions,
  ibvs.reference_baselines, ibvs.reference_photos, ibvs.baseline_events,
  ibvs.analysis_admissions, ibvs.location_coordinate_corrections, ibvs.location_exceptions TO ibvs_app;
GRANT UPDATE ON ibvs."user", ibvs.session, ibvs.account, ibvs.verification,
  ibvs."rateLimit", ibvs.worker_profiles, ibvs.assignments, ibvs.challenges,
  ibvs.inspections, ibvs.media_evidence, ibvs.review_cases,
  ibvs.analysis_admissions TO ibvs_app;
-- Organization row locks serialize imports and review operations.
GRANT UPDATE (name) ON ibvs.organizations TO ibvs_app;
-- Assignments lock face rows; PostgreSQL requires an UPDATE privilege for this.
GRANT UPDATE (orientation) ON ibvs.billboard_faces TO ibvs_app;
GRANT DELETE ON ibvs."user", ibvs.session, ibvs.account, ibvs.verification,
  ibvs."rateLimit", ibvs.analysis_admissions TO ibvs_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ibvs TO ibvs_app;
ALTER ROLE ibvs_app SET search_path = ibvs, extensions, public;

-- Supabase's automatic RLS event trigger runs as its owner, not through the API.
DO $$ BEGIN
  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
  END IF;
END $$;
