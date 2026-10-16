# Phase 2 API and invariants

All endpoints require the existing HttpOnly session. Mutations require exact configured Origin. Evidence uploads are worker-only and recheck task ownership. Administrator or original worker may read completed evidence within their organization. JSON is limited to 32KB; binary parts to 256KiB; each of two JPEGs to 6MiB / 24 megapixels, minimum short edge 320px.

| Method / route | Behavior |
|---|---|
| POST `/api/inspections/challenge` | `{assignmentId}` → task-bound random nonce, ID and five-minute expiry; bounded issuance |
| POST `/api/inspections` | Stable `operationId`, assignment ID/version, locked face ID/code, optional challenge ID and front/wide metadata → resumable session |
| GET `/api/inspections/:id` | Original worker's part manifests, photo receipts and optional final inspection receipt |
| PUT `/api/inspections/:id/parts/:front-or-wide/:part` | Raw fixed-size piece; length and hash checked. Exact replay acknowledges without duplicate row; changed bytes conflict |
| POST `/api/inspections/:id/complete/:front-or-wide` | `{}` → verifies every stored part, full SHA-256, JPEG decode and dimensions; returns stable photo receipt |
| POST `/api/inspections/:id/submit` | `{}` → requires two validated, different photo hashes; atomic final receipt, flags, assignment state and audit event |
| GET `/api/inspections` | Actor-scoped latest 200 server inspection statuses |
| GET `/api/inspections/:id/media/:front-or-wide` | Authenticated JPEG proxy with no-store/nosniff/sandbox; no public storage path |

Photo metadata: `kind, bytes, sha256, capturedAt, captureMode, gps`. `captureMode` is offline / online_challenged / online_unchallenged, all device claims. GPS contains status (ok / denied / timeout / unavailable), observedAt, and latitude/longitude/accuracy for ok. Claimed times and GPS must never be substituted for server receipt time.

Initial session validates task worker, organization, original face code/ID and expected assignment version. Worker + operation UUID is unique. Replaying a changed metadata payload returns 409. Parts, media completion and final submission are independently replayable, including when a response is lost after commit. Server-received receipt is terminal/immutable. There is one inspection attempt per assignment in this phase; blocked corrupt media/task conflicts require administrator investigation, with versioned resurvey/new attempts planned for Phase 3.

HTTP 401 pauses for login, 403 denies access, 404 conceals foreign objects, 409 preserves local evidence on conflict, 413 rejects oversized bodies, 422 rejects invalid data/media, 429 backs off, and 5xx retries. No 2xx part or photo acknowledgment is treated as a final inspection receipt. First baselines are never auto-approved.
