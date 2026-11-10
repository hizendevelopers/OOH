-- Apply migration 013 (application role grants) to the hosted IBVS database. Run in the Supabase SQL Editor as the project owner.
BEGIN;
SET LOCAL search_path TO ibvs;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ibvs_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON ibvs."twoFactor" TO ibvs_app;
    GRANT SELECT, INSERT, UPDATE ON ibvs.location_import_records TO ibvs_app;
    GRANT SELECT, INSERT ON ibvs.location_city_history TO ibvs_app;
    GRANT SELECT, INSERT ON ibvs.location_field_captures TO ibvs_app;
    GRANT SELECT, INSERT ON ibvs.location_gps_promotions TO ibvs_app;
  END IF;
END $$;
INSERT INTO schema_migrations(name) VALUES ('013_app_role_grants.sql');
COMMIT;
