# Human verification API

All `/api/reviews` routes require a real session and current `admin` organization membership. Supervisors cannot decide on their own worker submission. Responses are private/no-store. Mutations require the configured exact Origin, JSON, a bounded 32 KiB body, and server schema validation. GPS and photographs remain sensitive organization data; none of these endpoints are public.

| Method and path | Behavior |
|---|---|
| GET `/api/reviews` | Received inspection queue; `state`, `worker` (ID), `city`, `date` (server receipt date), `billboard`, `risk`, `evidence=online/offline`. At most 500 results, newest first. Offline means at least one offline photograph; online is a device claim, not attestation. |
| GET `/api/reviews/:inspectionId` | Authorized inspection, latest versioned risk report, media hashes/receipts/part counts, decision history, face reference versions and audit events. |
| GET `/api/reviews/:inspectionId/assessments/:runId` | Organization-authorized immutable historical risk report and supporting evidence. Detail lists the available run IDs/hashes; decisions retain the assessment hash they used. |
| POST `/api/reviews/:inspectionId/analyze` | Re-read bounded private originals, verify hashes and recompute current versioned rules. Unchanged reports do not create duplicate audit events. |
| POST `/api/reviews/:inspectionId/decision` | Append a decision and update the case projection atomically. |
| POST `/api/reviews/:inspectionId/baseline` | Explicitly enroll exact-face reference images and structural description. Inspection approval alone creates no references. |
| POST `/api/reviews/:baselineId/withdraw` | Append an irreversible withdrawal event, retaining originals and all reference versions. |

Original images remain under authenticated `/api/inspections/:inspectionId/media/front` and `/wide`. Only an organization administrator or the original submitting worker can read them. No filesystem paths are exposed by the review API. Original private storage keys are internal implementation data and should not be logged or exported.

Decision JSON:

```json
{
  "operationId": "client-generated UUID retained for retries",
  "expectedVersion": 1,
  "assessmentHash": "current 64-character SHA-256 from the report",
  "action": "approve",
  "reason": "Specific supervisor reasoning, at least five characters",
  "identityConfirmed": true,
  "riskAcknowledged": true
}
```

Actions: `approve`, `reject`, `ambiguous`, `resurvey`. All require a reason. Resurvey additionally requires `instructions` (10–2000 characters), `dueDate` (ISO date) and optional active same-organization `workerId`; otherwise the original worker is assigned. A new assignment ID links `parent_inspection_id` to the original inspection. The old task becomes `superseded`. Its inspection receipt, original metadata, media and decision history remain unchanged. Each inspection has at most one direct follow-up; subsequent resurvey inspections may have their own follow-up.

Approvals require exact-face confirmation. High/critical risks require acknowledgement. Blocking integrity/task-binding/missing-evidence failures require resurvey. Ambiguous locations and independent-review signals require two distinct supervisors agreeing on the same assessment hash within the same decision epoch. The first approval leaves the case ambiguous. Reject/resurvey/manual ambiguity starts a new epoch. No single signal automatically accuses a worker or rejects a submission.

Enrollment JSON includes `operationId`, `expectedVersion`, `assessmentHash`, exact `faceId`, `identityConfirmed: true`, `shape`, `mounting`, `numberOfFaces` (1–16), compass `facing`, `landmarks` and `reason`. Approval must be current for this assessment; withdrawal of an active face reference is required before replacement. New enrollment increments the face reference version and retains both media hashes. Before changing a referenced inspection's outcome, explicitly withdraw its active baseline. Withdrawal JSON contains `operationId` and mandatory `reason`.

Operation IDs bind actor, organization and canonical payload digest. Exact retries return the original result; reuse with different content returns 409. Concurrent different decisions use optimistic case versions and return 409 when stale. Refresh after 409 and deliberately reassess; do not silently retry a changed decision. 403 denotes authorization/Origin failure; 404 hides out-of-scope objects; 422 denotes invalid input or blocking evidence; 503 denotes unavailable infrastructure. A failed risk analysis never erases an already-issued evidence receipt. Reanalysis is required before approval.

Production requires PostGIS and `db/spatial.sql`. Embedded local PostgreSQL uses explicitly labeled great-circle development calculations. Local verification does not certify the production spatial runtime.

Changed risk assessments reopen previously approved cases as pending, increment their version/approval epoch and place mismatched active references on review hold. These references do not count as verified. The administrator sees the hold and must explicitly withdraw/correct the reference; original enrollment and decision events remain unchanged. This is a safety projection, not an automatic accusation or reference approval.
