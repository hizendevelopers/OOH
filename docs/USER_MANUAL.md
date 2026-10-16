# Administrator and worker manual

## Administrator
Sign in using your provisioned account. Overview shows persisted faces, structures, assignments and status counts. Zero verified baselines is expected in Phase 1.

Inventory → Import inventory → download template or paste CSV → Validate & preview. Required columns: `code,structure_code,city,latitude,longitude`. Optional: `zone,uncertainty_m,orientation`. Defaults: 50m uncertainty and unknown orientation; these are assumptions, not measurements. Choose meaningful uncertainty. IDs use 3–48 uppercase letters/digits/underscore/hyphen. Accepted coordinate range is global to allow corrections from external sources; Iraq boundary checks may later become warnings. Maximum 1000 rows / 1MB. A single error blocks the entire import. Duplicate codes never overwrite records. Shared structures must have consistent city/zone metadata.

Select unassigned inventory faces → Assign visits → choose a provisioned active worker and due date → Create assignments. One active task per face prevents accidental duplicates. Assignments → Export CSV downloads actual task statuses. Audit shows the latest 200 immutable events; database history is retained beyond that view.

Accounts are provisioned by CLI; there is no user-management UI in M1. A second organization is not automatically accessible. Roles are administrator and worker; admin MFA and finer role separation are pilot gates.

## Worker
Sign in, then My assignments. Open a visit to see locked ID, orientation, original coordinates, uncertainty and due date. Navigate to location opens Google Maps and shares the destination with that service. Avoid unsafe roadside stopping. Several faces can share a structure: identify the face, not only the location.

Phase 1 does not collect camera, photos or GPS and does not cache tasks for offline use. The offline banner explicitly states that a connection is required. Capture, diagnostics, durable Blob drafts, resumable uploads and submission feedback belong to M2/M3.

## Preferences and accessibility
Use the language button to switch English/Arabic and page direction; immutable IDs remain LTR. Theme button switches light/dark. Preferences remain on the browser. Technical CSV/API errors and some operational text currently remain English. Keyboard users can skip to main content; forms have labels, dialogs support Escape and trap focus. Tables scroll within their panel on phones.
