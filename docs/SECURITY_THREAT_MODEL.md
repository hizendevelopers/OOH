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
| Media attacks | M2 bounded JPEG decoding, byte/dimension limits, server SHA-256, authenticated private downloads, nosniff and sandbox CSP | Malware scanning/perceptual matching are Phase 3; original files retained |
| Offline theft | Worker-scoped IndexedDB, real server identity recheck before upload, device-local lock on logout | Local browser data is not cryptographically isolated against OS/XSS compromise; no auto-deletion yet |
| Task / replay tampering | Server-bound worker/task/face/version; immutable operation digest; hash/length checks on every part; stable receipts | A blocked invalid attempt needs administrator recovery; resurvey management is Phase 3 |
| Partial upload / full disk | Atomic files before part acknowledgment; failed DB/filesystem operations leave local evidence queued | Power loss, filesystem integrity and encrypted backup recovery still need operational drills |
| Cross-account replay | Server session checked before any photo bytes; mismatched/expired sessions pause; per-worker task checks on every upload | Offline identity is a device copy, not fresh authentication |

Production gates: HTTPS, admin MFA, least-privilege runtime database role, reverse-proxy body/rate limits, CSP deployment review, secret rotation, dependency review, encrypted backups and restore drill. Never log passwords, cookies, tokens or raw evidence. Log request IDs and sanitized error categories. No untested production-readiness claim.

Phase 2 stores private evidence on one configured host volume, outside the web app directory. Production requires IBVS_EVIDENCE_DIR; protect it with OS ACLs and encrypted storage/backups. Windows POSIX mode flags alone are not a Windows ACL guarantee. Never expose the volume via a static route/proxy. Locking offline copies is a UI access guard, not encryption; clearing browser data can irreversibly destroy unsynced evidence. Collect GPS only on explicit worker action, never continuously.

Online challenge IDs are worker/task bound, random and expire after five minutes. Offline photos remain explicitly offline even if an older challenge is stored. Receipt flags record expiration and untrusted claims. A photograph can still be spoofed or be aimed at a screen. Neither a server challenge nor proximity establishes identity; no baseline is automatically verified.
