# Offline sync design (M2, not yet implemented)

Explicitly download authorized tasks into a user-scoped Dexie database. Persist original media as Blobs, GPS observations, claimed device timestamps and operation UUIDs atomically. Request persistent storage and expose quota estimates; browser eviction/private browsing/storage clearing remain risks. Never cache auth endpoints or private media in a service-worker public cache. Cache only shell and licensed permitted resources; no bulk map-tile prefetch.

Foreground queue: draft → queued → uploading → receipt_confirmed → submitted. Each operation has retries, next_attempt_at, stable idempotency key and server receipt. Reopen/reconnect resumes work; Background Sync is optional. Revalidate session before replay; never attach one worker's queue to another account. Retain recoverable local media until receipt and server checks succeed.

S3 multipart upload sessions persist part ETags and object version. Server validates object ownership, byte limits, type, dimensions and hashes before issuing a receipt. Replay binds actor, key and canonical request digest; changed payload with the same key returns conflict. Expired challenges are flagged, not time attestation. Required tests include reload, interrupted part, logout/login, quota failure, server restart and duplicate completion.
