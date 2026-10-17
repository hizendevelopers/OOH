# Administrator and worker manual

## Administrator
Sign in using your provisioned account. Overview shows persisted faces, structures, assignments and status counts. Zero verified baselines is expected in Phase 1.

Inventory → Import inventory → download template or paste CSV → Validate & preview. Required columns: `code,structure_code,city,latitude,longitude`. Optional: `zone,uncertainty_m,orientation`. Defaults: 50m uncertainty and unknown orientation; these are assumptions, not measurements. Choose meaningful uncertainty. IDs use 3–48 uppercase letters/digits/underscore/hyphen. Accepted coordinate range is global to allow corrections from external sources; Iraq boundary checks may later become warnings. Maximum 1000 rows / 1MB. A single error blocks the entire import. Duplicate codes never overwrite records. Shared structures must have consistent city/zone metadata.

Select unassigned inventory faces → Assign visits → choose a provisioned active worker and due date → Create assignments. One active task per face prevents accidental duplicates. Assignments → Export CSV downloads actual task statuses. Audit shows the latest 200 immutable events; database history is retained beyond that view.

Accounts are provisioned by CLI; there is no user-management UI in M1. A second organization is not automatically accessible. Roles are administrator and worker; admin MFA and finer role separation are pilot gates.

## Worker
Sign in, then My assignments. Open a visit to see locked ID, orientation, original coordinates, uncertainty and due date. Navigate to location opens Google Maps and shares the destination with that service. Avoid unsafe roadside stopping. Several faces can share a structure: identify the face, not only the location.

Open **Open field workspace** (or `/field`). While connected, **Download assignments** and wait for **Offline shell ready**. Installation is available through the browser menu; on iPhone use Share → Add to Home Screen. Actual iPhone/Android behavior has not yet been field-certified.

Open a downloaded visit. The face code, structure, orientation and original coordinates are locked. **Record location fix** requests GPS only when tapped. Accuracy and observed time are recorded per photo. A denied/unavailable fix remains an explicit review flag; you may still document the board safely. Do not drive while capturing or assume GPS distinguishes adjacent faces.

Start live camera and capture the front photograph, then the wide contextual photograph with structure/supports/roadside clues. There is no gallery picker. Successful saving is labeled **Photo saved locally**. A storage error shows **not saved**: keep the page open and retry saving the in-memory photo. Quota estimates and persistent-storage grants do not guarantee survival of browser clearing or device loss.

An online five-minute challenge may be issued when starting a visit. Its nonce and expiry are shown, but it does not prove that a camera image is genuine. Offline captures remain labeled offline even when an earlier challenge exists. Device capture time is a claim; receipt time comes from the server.

**Queue for upload** is enabled only after both photos are saved. Queuing freezes this evidence version. Reopen/reconnect to resume; foreground retry uses backoff, and **Retry synchronization** retries immediately. An interrupted part or lost final response does not create duplicate inspections. **Server received — awaiting human review** requires the final receipt ID/timestamp; local saved/queued/uploading labels are never approval. Keep local originals and browser data until receipt is confirmed. No background sync while the browser is closed is promised.

If blocked by expired session/account change, sign in as the original worker and retry. If blocked by changed task/invalid media, preserve originals and contact the administrator; controlled resurvey/recovery administration is Phase 3. Sign out/lock removes the offline identity pointer but is not encryption or physical data deletion. Photo originals currently remain on this device after receipt; retention/deletion tooling is future work.

## Preferences and accessibility
Use the language button to switch English/Arabic and page direction; immutable IDs remain LTR. Theme button switches light/dark. Preferences remain on the browser. Technical CSV/API errors and some operational text currently remain English. Keyboard users can skip to main content; forms have labels, dialogs support Escape and trap focus. Tables scroll within their panel on phones.


## Human review and reference enrollment
1. Sign in as an administrator and open Review center. Filter pending/ambiguous/approved/rejected/resurvey cases by worker ID, city, receipt date, billboard, risk and capture class. Queue safety limit is 500; narrow filters for older work.
2. Compare front/wide photos; open either in the authorized full-resolution viewer. Inspect capture claims, server receipt times, GPS uncertainty, exact face orientation, structural details and neighboring candidates. The coordinate map has no street tiles and is not an identity proof.
3. Read Risk analysis and Audit & sync. A severity is a review aid, never an accusation. Historical Phase 2 cases may need Reanalyze before deciding. Integrity failures require resurvey.
4. Select approve/reject/resurvey/ambiguous and give a specific reason. Approving requires exact-face confirmation; high-risk signals also require acknowledgement. Ambiguous locations need two distinct supervisors approving the same current assessment. An initial approval can therefore remain ambiguous until a second supervisor acts.
5. Approval does not create a reference. In References, explicitly enroll the exact face with shape, mounting, face count, facing, distinctive landmarks and a reason. Withdraw an invalid active reference with a reason before correction; new enrollment creates the next version. Review audit history is permanent.
6. To request more evidence, give specific instructions and a due date. The original inspection remains unchanged. Workers download assignments to see supervisor decisions and the new linked task; new drafts support offline saving and existing retries. A rejected inspection can receive a subsequent resurvey decision without deleting the rejection.

Shortcuts: J/K queue navigation; A/R/S/M action selection; Ctrl+Enter records a valid form; Escape closes the photo dialog. Shortcuts do not fire while editing fields. A 409 means a version/assessment changed: refresh and review deliberately. If a response is lost, retry the same unchanged form; operation IDs make duplicate submission safe. Verify the audit history after uncertain connectivity.
