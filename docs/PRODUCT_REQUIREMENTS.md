# Product requirements

IBVS supports Iraqi billboard operations in English and Arabic. A face is a unique immutable business identity; a structure may host several faces. The organization is the access boundary. Imported coordinates are original observations, never verified truth.

## Phase 1 acceptance
1. An invited/provisioned administrator signs in using a database-backed HttpOnly session. Public registration is disabled.
2. Administrator previews a UTF-8 CSV, sees row-level errors and duplicates, then imports all-or-nothing. Import rechecks database duplicates in a transaction. Existing records cannot be overwritten.
3. Administrator selects faces, a same-organization worker and a due date, and creates assignments in one transaction. Active duplicate tasks are rejected.
4. Workers can list and open only their own tasks. An attempted other-worker or other-organization request returns no object.
5. Dashboard and exports derive counts from persisted data, including truthful zero states. Demonstration data is explicitly marked.
6. English/Arabic layout, keyboard focus, 44px touch targets, light/dark mode and mobile layouts are exercised.

## Later acceptance
M2: live camera, GPS metadata, original Blob storage in IndexedDB, explicit task download, storage diagnostics and recoverable foreground replay, tested on real phones. M3: private multipart storage, server hashes/media validation, receipts, replay idempotency and audited concurrent human review. M4: 50–100 face independent pilot, restore drill, security and operational acceptance. M5: optional calibrated retrieval only after verified references and held-out testing.

No first visit is automatically approved. Dense structures require contextual angles or independent revisits. Worker location is collected only during a survey. No continuous tracking.
