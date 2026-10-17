# Security threat model

Assets: worker identity, assignment scope, evidence, original location data, audit history and credentials. Adversaries include unauthenticated visitors, malicious workers, compromised browsers and privileged operators.

| Threat | Control | Residual limitation |
|---|---|---|
| IDOR / tenant crossover | Session lookup plus organization and worker predicates on each query | Database operators remain privileged |
| CSRF | Same-origin mutations and Better Auth trusted origins; SameSite HttpOnly cookies | XSS can operate as user |
| Brute force | Better Auth database-backed rate limits | Distributed edge rate limiting required before Internet exposure |
| CSV injection | Escape spreadsheet formula prefixes on export | Imported strings remain untrusted |
| SQL injection | Parameter binding, strict schemas and request limits | Migration credentials require isolation |
| Original identity alteration | Database update/delete rejection triggers | Superusers can bypass triggers |
| Camera/GPS spoofing | Show uncertainty and human review | Browser APIs cannot attest physical capture |
| Offline clock manipulation | Distinguish claimed time and server receipt | Offline time cannot be attested |
| Media attacks | M2 bounded JPEG decoding, byte/dimension limits, server SHA-256, authenticated private downloads, nosniff and sandbox CSP | Versioned perceptual matches require human review; malware scanning remains a deployment requirement; originals retained |
| Offline theft | Worker-scoped IndexedDB, real server identity recheck before upload, device-local lock on logout | Local browser data is not cryptographically isolated against OS/XSS compromise; no auto-deletion yet |
| Task / replay tampering | Server-bound worker/task/face/version; immutable operation digest; hash/length checks on every part; stable receipts | A blocked invalid attempt needs administrator recovery; linked audited resurvey tasks preserve the original attempt |
| Partial upload / full disk | Atomic files before part acknowledgment; failed DB/filesystem operations leave local evidence queued | Power loss, filesystem integrity and encrypted backup recovery still need operational drills |
| Cross-account replay | Server session checked before any photo bytes; mismatched/expired sessions pause; per-worker task checks on every upload | Offline identity is a device copy, not fresh authentication |

Production gates: HTTPS, admin MFA, least-privilege runtime database role, reverse-proxy body/rate limits, CSP deployment review, secret rotation, dependency review, encrypted backups and restore drill. Never log passwords, cookies, tokens or raw evidence. Log request IDs and sanitized error categories. No untested production-readiness claim.

Phase 2 stores private evidence on one configured host volume, outside the web app directory. Production requires IBVS_EVIDENCE_DIR; protect it with OS ACLs and encrypted storage/backups. Windows POSIX mode flags alone are not a Windows ACL guarantee. Never expose the volume via a static route/proxy. Locking offline copies is a UI access guard, not encryption; clearing browser data can irreversibly destroy unsynced evidence. Collect GPS only on explicit worker action, never continuously.

Online challenge IDs are worker/task bound, random and expire after five minutes. Offline photos remain explicitly offline even if an older challenge is stored. Receipt flags record expiration and untrusted claims. A photograph can still be spoofed or be aimed at a screen. Neither a server challenge nor proximity establishes identity; no baseline is automatically verified.


Phase 3 review/reference endpoints require current administrator membership and same-organization access on every request. Workers cannot decide or enroll references. Reviewers cannot decide their own submission. Exact face IDs, immutable media hashes, current risk assessment and fresh supervisor approval epochs bind enrollment. Baseline correction requires explicit withdrawal and a new version; database triggers prevent history/media changes. Mandatory reasons, actor identities and operation/version checks prevent silent overwrites and duplicate actions. Active references must be withdrawn before changing the underlying review outcome.

Risk signals never establish guilt. An ambiguous neighbor requires two distinct supervisors; critical integrity failures block approval. Photo requests remain authenticated/no-store and never enter the service-worker cache. Review logs contain safe IDs, rule/assessment versions and outcome metadata; raw photographs/GPS and free-form review reasons remain access-controlled database data and should never be copied to generic operational logs. Administrator free-text reasons are rendered as escaped text, never HTML.

Residual limits: database operators and filesystem administrators remain privileged; no external timestamp authority, hardware attestation, tamper-proof EXIF, anti-collusion system or forensic fraud certification is claimed. Perceptual hashes, quality warnings and speed thresholds are uncalibrated heuristics. Production PostGIS, reverse-proxy rate/body protections, least-privilege roles, malware scanning, MFA, encrypted storage, backup/restore and real-device verification remain pilot gates.

## M4 controls and residual risk

Server-side database admission occurs after organization/worker authorization and before image reads. Limits are two active leases per organization, 60 actor starts/minute and 180 organization starts/minute; five-minute expiry permits recovery but cannot kill a stuck decoder. Receipt replay never repeats automatic analysis. A missing/deferred assessment requires explicit authorized supervisor reanalysis before approval. Edge limits, hard processing isolation/timeouts and real PostgreSQL concurrency checks remain deployment work.

Production CSP removes unsafe-eval (development retains it); inline framework scripts/styles remain permitted. Production evidence paths must be absolute and outside public/application assets. Paginated cursors carry organization/filter context but grant no authority; every query scopes inspections and review cases independently. UI synchronous locks prevent duplicate shortcut/requestSubmit dispatch, while server operation/version controls remain authoritative.
