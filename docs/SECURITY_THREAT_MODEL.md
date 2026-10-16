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
| Media attacks | M3 byte validation, size/dimension limits, scanning, private downloads | M3 is not shipped with M1 |
| Offline theft | M2 local evidence minimization and deletion after confirmed receipt | Browser-controlled encryption keys cannot protect compromised devices |

Production gates: HTTPS, admin MFA, least-privilege runtime database role, reverse-proxy body/rate limits, CSP deployment review, secret rotation, dependency review, encrypted backups and restore drill. Never log passwords, cookies, tokens or raw evidence. Log request IDs and sanitized error categories. No untested production-readiness claim.
