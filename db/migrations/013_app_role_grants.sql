-- Table access for the restricted application role (ibvs_app) on tables created after the initial grants.
-- Without these grants the running app fails with "permission denied" on the new tables.
-- Runs only where the role exists, so local test databases are unaffected.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ibvs_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON ibvs."twoFactor" TO ibvs_app;
    GRANT SELECT, INSERT, UPDATE ON ibvs.location_import_records TO ibvs_app;
    GRANT SELECT, INSERT ON ibvs.location_city_history TO ibvs_app;
    GRANT SELECT, INSERT ON ibvs.location_field_captures TO ibvs_app;
    GRANT SELECT, INSERT ON ibvs.location_gps_promotions TO ibvs_app;
  END IF;
END $$;
