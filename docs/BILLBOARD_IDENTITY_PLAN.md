# Billboard identity, dimensions and advertiser history — implementation plan

Status: Phases A and B implemented locally, pending browser acceptance and the full suite run recorded in the handover. Phases C–E not started. Companion to [FRAUD_RULES.md](FRAUD_RULES.md), [PHASE3_API.md](PHASE3_API.md) and [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md).

## 1. Goal

Separate three things the system currently conflates:

1. **Registered size** — width and height of a face, with an explicit verification status and source.
2. **Identity confidence** — whether a submitted photo shows the assigned face, judged from permanent structure and GPS, never from the advertisement alone.
3. **Current occupancy** — which advertiser is on a face, recorded per visit with history.

Non-goals for this phase: automatic rejection of workers, image-based metric measurement, depth sensing, and any claim of a validated classifier. Thresholds stay conservative until the pilot measures them.

## 2. Current state (verified in the repository)

| Area | Today | Source |
|---|---|---|
| Structure / face split, immutable face identity | Present | `db/migrations/001_core.sql` |
| Source coordinates with uncertainty, immutable | Present | `source_coordinates` table |
| Width/height for a billboard face | **Absent** | No such column in any migration |
| Advertiser / brand | **Absent** | No such column or table |
| Photo width/height | Present, per uploaded media only | `media_evidence` in `002_inspections.sql` |
| Compass heading captured by the device | **Absent** | `apps/web/src/field/device.ts` requests position only |
| Whole-frame perceptual hash | Present (`jpeg-dct64-v1`) | `apps/web/src/server/image-analysis.ts` |
| Explicit structural reference enrollment | Present (shape, mounting, face count, facing, landmarks; human entered) | `apps/web/src/server/review.ts`, `docs/PHASE3_API.md` |
| Permanent-feature comparison against a reference | **Absent** | — |
| Alerts, overdue reminders, reports | **Absent** (no scheduled jobs) | — |

Migrations are applied in filename order by `scripts/migrate.ts`, which records each in `schema_migrations`. The next migration is `007`.

## 3. Design decisions

- **Dimensions are a fact about the face, not the visit.** Store them on `billboard_faces` through a new append-only history table, so corrections keep the earlier values.
- **Dimension status is explicit and never upgraded silently.** Allowed values: `unverified` (imported or typed, no source), `owner_supplied`, `surveyed` (professional or physical measurement with a source document), `remeasure_required`.
- **Advertiser history is per face, with time ranges.** A visit records the observed brand; a supervisor confirms it. A change is a new history row, not an update.
- **Identity stays separate from brand.** The brand a worker reads is never used as evidence that the face is the right one.
- **Human decisions remain authoritative.** Any automatic suggestion (OCR, brand, comparison score) is stored as a suggestion with its source and confidence, and must be confirmed by a worker or supervisor before it becomes a fact.
- **Back-compatible.** Existing receipts, decisions, references and audit rows are not rewritten. New columns are nullable or defaulted.

## 4. Phases

Each phase ends with migrations applied to an isolated database, tests passing, and the existing acceptance suite still green.

### Phase A — Dimensions and status (data only, low risk)

**Migration `db/migrations/007_face_dimensions.sql`**

- `face_dimensions` (append-only): `id`, `organization_id`, `face_id`, `width_m numeric(6,2)`, `height_m numeric(6,2)`, `status` (enum above), `source_note text`, `source_document_ref text`, `recorded_by`, `recorded_at`. Checks: both sizes > 0 and ≤ 100 m; status in allowed set.
- A view or query helper returns the latest row per face.
- Trigger rejects UPDATE and DELETE on `face_dimensions` (same pattern as existing append-only tables).

**Code**

- `packages/domain/src/` — add `dimensions.ts` with the status enum, unit conversion and validation (no unit ambiguity: metres only, stored as numeric).
- `apps/web/src/server/` — new `face-dimensions.ts` for record/list functions with organization checks.
- `apps/web/src/app/api/locations/...` or a new `api/faces/[faceId]/dimensions/route.ts` — admin-only POST and GET. Follow the same Origin/JSON/body-size rules as `docs/PHASE3_API.md`.
- `apps/web/src/components/location-editor.tsx` — optional dimension fields, showing the status badge.
- CSV import (`apps/web/src/server/location-management.ts`) — optional `width_m`, `height_m`, `dimension_status` columns; a missing value stays unknown, never zero.

**Acceptance**

- Dimension rows cannot be updated or deleted.
- A face with no dimension row shows "Not recorded", never a default.
- Dimension correction creates a new row; the previous one stays visible.
- Workers cannot read or write dimensions (403 on worker-scoped sessions).

### Phase B — Advertiser history (data and review UI)

**Migration `db/migrations/008_advertiser_history.sql`**

- `advertisers`: `id`, `organization_id`, `name_en`, `name_ar`, `normalized_key` (unique per organization).
- `face_advertiser_periods` (append-only): `id`, `organization_id`, `face_id`, `advertiser_id` (nullable for blank or unknown), `status` (`observed_unconfirmed`, `confirmed`, `blank`, `unreadable`), `start_at`, `end_at` (nullable), `source_inspection_id`, `confirmed_by`, `confirmed_at`.
- Overlapping confirmed periods on one face are rejected by an exclusion constraint.

**Code**

- Worker capture: one required field, "Advertised brand", with options `Blank`, `Unreadable`, and free text. The worker's entry is stored as `observed_unconfirmed`.
- Review center (`apps/web/src/review/workspace.tsx`): the supervisor confirms, corrects or merges brand names, and can set the confirmed period.
- Brand names are normalized (trim, case-fold, Arabic/English variant table) before matching; the table is editable by an admin only.

**Acceptance**

- A worker's brand entry never changes the face record or any risk decision.
- Advertiser change between two confirmed visits creates a change event for the alert queue (Phase D).
- Arabic and English names both render in RTL and LTR layouts.

### Phase C — Capture guidance and device metadata

**Code**

- `apps/web/src/field/device.ts` — request compass heading where `DeviceOrientationEvent` is available, with the iOS permission prompt handled explicitly. Record `heading_deg` and `heading_source` (`device`, `unavailable`, `denied`). Never fabricate a heading.
- `apps/web/src/field/capture.tsx` — on-device checks before a photo is saved: blur (Laplacian variance on a downscaled frame), darkness, and an on-screen frame guide asking the worker to include all four corners. Failed checks show a retake prompt; the photo can still be saved as flagged, so offline work is not blocked.
- Add a third optional **face-code close-up** capture. The code is typed by the worker and stored as a claim; the photo is kept for supervisor comparison.
- `apps/web/src/field/store.ts` — new metadata fields are added in a Dexie version bump; existing drafts are migrated with `null` values.
- Bump the service-worker cache version per `docs/OFFLINE_SYNC.md` and tell testers to close clients before update.

**Acceptance**

- Heading absence is recorded as unavailable, not zero.
- On-device check results are stored with the capture, and the server does not treat them as proof.
- Existing offline drafts from the previous version still upload.

### Phase D — Identity comparison and alerts

**Comparison (research track, not a decision input yet)**

- New module `apps/web/src/server/structure-compare.ts` (not wired to decisions in this phase). Given the current photo and the active approved reference photo for the same face, it computes a candidate score using permanent-feature regions. Advertising-face regions are masked out using the registered dimensions and the structure's framing rules.
- Feature extractor is pluggable. The first candidate is a pretrained vision embedding run locally; choosing and licensing the model is a separate approval step.
- Output is stored as a `structure_compare` risk signal with `severity: info`, until the pilot calibrates it. It is never a blocking rule in this phase.

**Alerts**

- `alerts` table: `id`, `organization_id`, `kind` (`advertiser_changed`, `visit_overdue`, `dimension_remeasure_required`, `damage_suspected`, `duplicate_photo`), `face_id`, `payload`, `created_at`, `acknowledged_by`, `acknowledged_at`.
- A scheduled job (the repository has none yet) runs overdue checks daily. Use the existing database admission-lease pattern from `apps/web/src/server/analysis-admission.ts` to prevent overlapping runs.

**Acceptance**

- Comparison scores never change a case's status or approval state.
- Alerts are created once per condition and acknowledged explicitly.

### Phase E — Reports and pilot

- Reports (admin-only): occupancy by advertiser and city, faces without a visit in N days, dimension status breakdown, open alerts. Use the existing CSV export pattern in `apps/web/src/server/` with formula-injection neutralisation.
- Pilot per `docs/M4_PILOT_RUNBOOK.md`: 50–100 faces, including neighbouring identical boards, changed creatives, different angles and poor lighting. Label every result independently before comparing with automated outputs.
- Only after the pilot: decide which rules, if any, may block. This decision is recorded in `docs/FRAUD_RULES.md` with its measured precision and recall.

## 5. Test plan

- **Unit (`tests/`)**: dimension validation and unit rules, brand normalisation, on-device check thresholds, comparison masking geometry.
- **Integration (`tests/*.test.ts`, embedded PostgreSQL)**: append-only triggers on new tables, overlapping advertiser periods rejected, organization isolation for every new endpoint, migration repeat idempotence.
- **Browser (`tests/e2e/`)**: capture with heading unavailable, retake prompt on a blurred fake-camera frame, brand entry, review confirmation, dimension display in English and Arabic.
- **Existing suites**: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test:browser` must stay green at each phase.

## 6. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Phone GPS and compass are unreliable | Store as claims with availability flags; never gate on them alone |
| Advertising changes break naive comparison | Mask the advertising face; compare permanent features only; keep comparison advisory |
| Identical neighbouring billboards | Existing `neighboring_faces` rule plus two-supervisor approval; comparison cannot clear a neighbour conflict on its own |
| Worker brand entry is wrong | Stored as unconfirmed; supervisor confirms |
| Dimension data is wrong or unsourced | Status field; "Not recorded" by default; no computed size from photos |
| Model licensing and offline size | Separate approval before adding any model file; keep it out of the offline shell |
| Storage growth from extra photos | Plan for the face-code close-up in capacity estimates (`docs/COSTS.md`) |

## 7. Open decisions for the owner

1. Who supplies the first dimensions: owner records, construction drawings, or a one-time professional survey? This sets the first status values.
2. Is a face-code close-up acceptable to field workers, given the extra time per visit?
3. Which vision model may be used for structure comparison, and where it may run (server only, or on device)?
4. Who may confirm brand history: any supervisor, or only administrators?

## 8. Effort estimate

Rough and unvalidated: Phase A about one week; Phase B about one to two weeks; Phase C about two weeks, including device testing; Phase D research track of several weeks, not scheduled as delivery; Phase E after the pilot.

## 9. Implementation record

### Phase A — as built

- `007_face_dimensions.sql`: append-only `face_dimensions`, `effective_face_dimensions` view.
- Optional `width_m`, `height_m`, `dimension_status`, `dimension_source` columns in CSV import and in location creation. Both sizes must be given together, a status is required, and owner-supplied or surveyed sizes need a source of at least 5 characters.
- Location editor: size fields when creating a face; a "Registered size" section with history when correcting one (`GET`/`POST /api/locations/dimensions`, administrator only).
- Tests: `tests/face-dimensions.test.ts`.

### Phase B — as built, with one deviation

- `008_advertiser_history.sql`: `advertisers`, append-only `brand_observations` (worker entries, one per inspection) and `advertiser_confirmations` (supervisor decisions), plus a `current_face_advertiser` view.
- **Deviation:** the plan proposed time ranges with an exclusion constraint. Instead, each confirmation is an event and the current advertiser is the latest one. This avoids overlap rules and keeps every change as history. Period lengths are derived when needed for reports.
- Worker: `brand` is optional in the inspection payload, so queued drafts from before this change still parse. Capture requires a brand choice before a draft can be queued.
- Supervisor: an **Advertiser** tab in the review workspace shows the worker entry and the confirmed occupancy, and lets a supervisor confirm, reusing an existing advertiser or creating one. `POST /api/reviews/:inspectionId/brand`.
- Brand matching uses `normalizeBrandKey` in `packages/domain/src/brand.ts`: Arabic letter variants, diacritics and tatweel are folded, and case and punctuation are ignored.
- Brand never affects risk rules, identity checks or approval.
- Tests: `tests/advertisers.test.ts`.
