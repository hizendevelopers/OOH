# Evidence verification policy

No AI classifier in Phase 1. Browser camera can be virtual or aimed at a screen. GPS can be spoofed; retain accuracy and freshness. Device time is a claim. Server receipt proves receipt time only.

Phase 2 computes SHA-256 on server bytes and validates JPEG decoding/dimensions/limits before receipts. GPS accuracy, claimed freshness, uncertainty overlap/mismatch, denial, delayed/device-clock claims, challenge expiry and exact duplicate candidates are flagged. Two identical front/wide hashes are rejected as a missing independent angle; replaying the same upload operation returns the existing receipt. No first baseline is approved automatically. Server receipt means validated transfer, not verified board identity.

Phase 3 will derive thumbnails/perceptual duplicate candidates, calculate nearby spatial face candidates and provide audited reviewer actions. Flags guide reviewers; uncertain GPS alone does not reject a visit. A human explicitly approves a first baseline after contextual identification. Ambiguous adjacent faces require another angle or independent visit. Store actor, reason, decision version and timestamp; never silently revise a decision.

M5 retrieval requires verified references, representative blind test data, measured false accepts, calibrated thresholds, top-K/coverage and explicit abstention. No fixed accuracy or AI cost promise.
