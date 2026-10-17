# M4 physical Android and iOS acceptance

This is an unexecuted checklist for actual devices and an authorized isolated HTTPS staging environment. Desktop Chromium fake camera/GPS, simulated quota/network faults, screenshots and generated fixtures do not satisfy these cases. Record each case as **passed / failed / blocked / not run**, with phone model, OS, browser/version, browser vs installed PWA, build commit, staging hostname, test time and tester. Do not claim a real-device pass from the existence of this document.

Use distinct test worker/supervisor accounts and approved non-sensitive fixture subjects before the 50–100-face pilot. Protect any real photos/GPS under the organization's consent, access and retention policy. Record identifiers only in the authorized private test record; do not publish GPS, faces, passwords, cookies, full API bodies or unsanitized traces. Browser camera/GPS/time/connectivity remain untrusted observations even when these tests pass.

## Device matrix and preparation

| Required actual surface | Record separately |
|---|---|
| Android Chrome browser | Actual supported phone/OS/Chrome version, rear camera and permission behavior |
| Android installed PWA | Install method, standalone launch, suspend/reopen and update lifecycle |
| iPhone Safari browser | Actual supported iPhone/iOS/Safari version, permission and orientation behavior |
| iPhone home-screen app | Add-to-home-screen launch, storage isolation, suspend/reopen and update lifecycle |
| Tablet / secondary browser if pilot uses it | Actual device/browser rather than inferred compatibility |

Treat browser and installed app storage as potentially separate: download tasks and verify drafts on each intended surface. Use HTTPS with a trusted certificate and matching auth origin. Before each fault test, record task/face ID, observe the actual local-saved acknowledgement and preserve unsynced drafts. Do not clear site data, uninstall, reset the phone or exhaust the operator's main device to create a fault. Destructive device-eviction tests require a disposable test profile/device and generated evidence only.

## Capture, permission and identity

- [ ] Sign in, open `/field`, explicitly download assignments, and wait for offline-shell readiness. Confirm only the signed-in worker's tasks appear; sign in as another worker on a separate surface and verify isolation.
- [ ] Open the exact face/task, compare immutable face code and assignment details with the physically identified fixture. Capture distinct **front** and **wide-context** photos, including support/mounting, neighboring structures and landmarks. Neither image may silently substitute for the other.
- [ ] Start the rear camera; check portrait/landscape preview, image orientation, readability and actual saved dimensions. Test both device rotation and camera permission denial/recovery through the OS/browser settings. Unsupported/blocked camera shows a recovery state rather than an apparent capture.
- [ ] Hide the app, lock the screen or switch apps during preview. Confirm camera use stops when hidden/left, and recovery starts only through an explicit user action. Test phone-call interruption on a dedicated test phone if feasible.
- [ ] Request GPS explicitly. Record actual accuracy and fix time outdoors; test denied permission, disabled location services, poor indoor signal and timeout when physically feasible. Do not manufacture a passing accurate fix or assume OS approximate-location behavior equals a particular radius.
- [ ] Verify GPS failure remains visible and reviewable; manual location spoofing or browser coordinates are never called tamper-proof. There must be no continuous/background tracking.
- [ ] Inspect front and wide originals in authorized supervisor review at full resolution. Compare capture claims with server receipt time, structure/face identity and the metric coordinate diagram; it is not a street-tile map.

## Offline persistence and receipt boundaries

- [ ] While online, download tasks and establish offline shell. Enable airplane mode, confirm the app is actually offline, capture both photos and wait for each **saved locally** acknowledgement.
- [ ] Queue the complete inspection and wait for the explicit queued state before reloading. Reload the browser/PWA while offline, reopen the same task and verify both original photos, GPS observations, operation identity and queued status persist.
- [ ] Background/lock for representative pilot durations (record actual durations), reopen offline, and verify drafts. Repeat with ordinary OS process suspension; record actual behavior rather than assuming a closed browser runs background sync.
- [ ] Reconnect under a stable network and wait for **server received**, receipt ID and server time. Independently open supervisor review to confirm both authorized server originals and hashes. **Saved locally / queued / uploading are not server receipts, approval or reference enrollment.**
- [ ] Try Wi-Fi-to-mobile switching and brief network loss mid-upload. Confirm foreground retry/backoff, completed-part recovery and eventual stable receipt. Record which parts/bytes actually retried; do not claim all transport failures were exercised by one network flap.
- [ ] Interrupt connectivity immediately after submission; reopen and retry. Confirm a single inspection/receipt and immutable original media rather than duplicated submissions. If response-loss timing cannot be established on the physical phone, mark that specific case blocked and retain separate automated coverage.
- [ ] Sign out/re-sign in to the same account and confirm local view protection/recovery. Check account switching does not expose or upload another worker's drafts. Logout/local lock is a UI guard, not encryption or deletion.
- [ ] Test expired authentication before retry using a controlled isolated account/session. Queued bytes must wait for successful authentication to the original worker account; do not expose privileged session material while arranging expiry.

## Storage pressure and failure recovery

- [ ] Record browser-reported storage estimate/persistence availability; label it advisory. Test low-space/quota failure only using a dedicated test surface and approved fixture material. If safe controlled pressure is unavailable, mark physical quota case blocked; automated quota simulation is a separate result.
- [ ] Confirm failed local photo persistence shows an explicit unsaved/retry warning and does not label an in-memory photo durably saved. Recover space through approved test-device procedures without clearing existing unsynced evidence; retry and verify actual durable storage.
- [ ] Exercise OS eviction only on disposable fixture storage if authorized. Confirm the recorded limitation: clearing site data, private mode, eviction, uninstall or device loss may erase local originals. The system does not promise recovery from destroyed browser data.
- [ ] During a controlled staging server unavailability/disk fault, confirm no false server receipt, originals remain retained locally and retry recovers after restoration. Record exactly what fault was performed; never fill a production/shared volume or corrupt source media.

## Resurvey, human review and references

- [ ] Supervisor rejects with a mandatory reason; the worker downloads assignments and can identify the rejected task and reason.
- [ ] Supervisor requests a resurvey with specific instructions and due date. Worker sees a new task linked to the original inspection and captures required new front/wide/context evidence offline. Confirm old receipt/photos/decision history remain unchanged after new receipt.
- [ ] Use adjacent/opposite-face fixtures and low-accuracy observations. Review is explicitly ambiguous when identity cannot be resolved; two distinct supervisors are required where policy signals demand it. A suspicious signal alone does not establish fraud.
- [ ] Approval does not silently enroll a first-visit reference. Explicitly enroll structural details against the exact face, inspect versioned original images, withdraw with a reason and correct via a new version. Verify independent physical identification rather than only advertising creative.
- [ ] Use an authorized generated duplicate/expired-challenge/offline case to confirm explainable signal labels, rule version and supporting evidence. An online challenge is not camera authenticity, GPS accuracy or trusted clock attestation.

## Accessibility, language and install/update

- [ ] Verify English and Arabic RTL throughout login, task list, camera/GPS controls, save/retry errors, local/receipt states and resurvey instructions. Face codes, timestamps and IDs remain readable without reversing their identity.
- [ ] Verify light/dark modes, outdoor readability, visible focus, touch target reach, portrait/landscape, text enlargement and reduced motion. Use actual VoiceOver/TalkBack to verify task names, camera actions, photo descriptions, errors and status announcements. Record any inaccessible interaction rather than inferring accessibility from desktop automation.
- [ ] Install/launch using the device-supported flow. Declined/unavailable install capability must not prevent normal browser use.
- [ ] With fixture drafts safely saved, test the documented service-worker update: a waiting release activates after existing field clients close; it must not force a reload during camera capture. Reopen, confirm release identity and retained drafts, then repeat offline launch. Do not clear storage or force an update to make the test pass.
- [ ] Inspect authorized browser tooling if available: cached assets/public `/field` shell may exist; authenticated API responses, private evidence and task data must not appear in Cache Storage. Worker-specific IndexedDB is intentional and remains sensitive local data. Record unavailable mobile tooling as a limitation.

## Evidence record and stop criteria

For every case record observed/expected result, actual network/device condition, sanitized screenshot if useful, recovery steps, private task/inspection/receipt correlation, tester and unresolved defect. Capture measured elapsed times and sample counts; do not report synthetic timings as phone or network measurements. No weighted severity is a calibrated fraud probability.

Stop pilot release for cross-worker/organization access, false receipt, changed original/audit history, unintended reference enrollment, missing unsynced evidence without an explicit warning, unresolved physical identity, unrecoverable repeated upload, or unsafe resource failures. Preserve originals and audit history; do not delete/reset to recover. The accountable pilot lead and independent supervisors review failures and sign the actual device matrix plus [pilot protocol](M4_PILOT_RUNBOOK.md). Outstanding physical, staging, security and restore cases remain release gates.
