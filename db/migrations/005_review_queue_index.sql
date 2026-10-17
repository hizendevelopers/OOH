CREATE INDEX inspections_received_queue ON inspections(organization_id,received_at DESC,id DESC) WHERE status='server_received';
