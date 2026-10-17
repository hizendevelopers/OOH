# Phase 3 implementation and acceptance

Preserve migrations 001/002, receipts, original coordinates and existing offline databases. Phase 1/2 baseline checks precede changes. Implement in tested commits:

1. Add review/risk/reference append-only schema, explainable versioned rules, JPEG DCT perceptual hashes, quality/integrity checks and tenant-scoped PostGIS queries (explicit development great-circle fallback only without DATABASE_URL).
2. Add supervisor-only queue/detail/decisions/reference APIs. Strict reason/version/idempotency checks; approvals do not enroll references. Nearby/ambiguous identities require independent confirmations. Critical integrity/binding failures prevent approval. Resurveys create a new assignment linked to the original immutable inspection.
3. Add bilingual responsive review center: authorized front/wide viewer, metric GPS uncertainty map, risk evidence, sync/decision history, structural baseline enrollment and withdrawal. Extend worker task feedback and offline linked resurvey capture without replacing drafts.
4. Run unit/integration/browser regressions, migrations, lint/typecheck/build; update handover and operational documentation.

Risk severity is an explainable prioritization category, never calibrated fraud probability or automatic accusation. Camera/GPS/EXIF/device clocks remain untrusted. Human identity assurance requires structural details and explicit enrollment against exact original face code. Correction withdraws an invalid baseline and enrolls an approved same-face replacement; wrong-face evidence must be revisited rather than relabeled.

External gate: Docker Linux engine was unavailable on initial inspection. Production PostGIS SQL must be exercised against a configured PostGIS server before spatial production sign-off; embedded tests are not PostGIS certification. Real phones, staging, production, backup/restore and physical power-loss checks are separately reported.


## Local acceptance complete
Implementation delivered in tested commits 05966e5, 6179575 and 3312e1f. Migration/repeat, 52 automated tests, six production Chromium flows, lint, typecheck and production build passed. See PROJECT_HANDOVER.md for measured results, the development-only dependency advisory and unrun PostGIS/device/staging/recovery gates. The optional spatial runtime script is delivered without claiming it was executed.
