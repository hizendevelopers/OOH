# Billboard locations and photo GPS

## Register a test location

Open **Inventory → Add location**. Enter a unique face code, structure code, city, zone and orientation. Enter latitude/longitude, choose the map position, or use **Use my current location** while beside the billboard. Confirm the pin and coordinate uncertainty before saving. Test locations are explicitly labeled and are excluded from operational dashboard totals.

Each face remains a distinct inventory item even when several faces share one structure and coordinates. An image's location cannot determine which side of a structure was photographed.

Coordinate corrections require an administrator and a reason. The original `source_coordinates` record remains immutable; an append-only correction determines the current registered position through `effective_source_coordinates`. Refresh downloaded assignments after a correction.

## CSV import

The existing preview/import accepts the same inventory fields. Required columns are `code,structure_code,city,latitude,longitude`. Optional columns are `zone,uncertainty_m,orientation,description,is_test`. `is_test` accepts `true` or `false` and defaults to `false`; uncertainty defaults to 50 metres. Code values use 3–48 uppercase letters, digits, underscores or hyphens. Orientation accepts `N,NE,E,SE,S,SW,W,NW,unknown`.

```csv
code,structure_code,city,zone,latitude,longitude,uncertainty_m,orientation,description,is_test
TEST-001,STRUCT-001,Baghdad,Central,33.3152,44.3661,20,N,Temporary test location,true
```

Review the preview errors before committing. Existing face codes are rejected; CSV imports never overwrite existing locations or their correction history.

## Worker capture

Field capture uses a signed-in worker account and that worker's assigned tasks. The temporary no-login administrator workspace supports inventory management; it is not a worker identity. Nearby discovery is organization scoped and opens permitted assignments. Test locations require explicit inclusion in nearby discovery.

Camera and location require a secure browser context. Desktop localhost is suitable for development; a phone opening a plain HTTP LAN address is not an equivalent secure context. Use HTTPS for phone testing and deployment.

A fresh device location is requested for each photo. Latitude, longitude, reported accuracy, observation time and capture time stay attached to that photo. Offline synchronization retains the capture readings, even when the upload happens elsewhere. The original JPEG is stored separately from these metadata records.

Normal submissions must satisfy the location policy on the server. Denied/unavailable GPS, stale readings, poor accuracy or a distant position retain a local draft and require retry or an explicit supervisor exception. A supervisor exception requires a reason, expires after 24 hours, and is bound to the assignment version. It bypasses location rejection only; photo integrity, assignment access and human review still apply. The authorization and its use are recorded.

The initial policy uses a 100-metre base radius, maximum 100-metre GPS accuracy, maximum 100-metre registered-coordinate uncertainty and a location observation within 30 seconds of each photo. The distance allowance includes the capped GPS and registered uncertainty; an inaccurate reading cannot enlarge the allowance indefinitely. `NEXT_PUBLIC_IBVS_LOCATION_*` settings in `.env.example` configure these limits at build time; rebuild after changing them. Nearby discovery initially searches within 5 km and shows at most 50 permitted assignments.

Browser location is a device claim and can be manipulated. Distance matching helps detect mistakes; it does not prove physical presence, image authenticity or exact billboard-face identity. The live camera workflow does not classify an old gallery image using the uploader's current position.

## Database deployment

`006_location_management.sql` adds face descriptions/test markers, immutable coordinate correction history, an effective-coordinate view and time-limited location authorizations. The repeatable `db/schema.sql` includes this migration and the restricted runtime grants. `db/schema-fresh.sql` remains an empty-schema snapshot only. Health checks require migration 006.

Application access stays through the Next.js server and the private `ibvs` schema. No database password or administrator connection belongs in browser code.
