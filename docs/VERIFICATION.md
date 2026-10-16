# Evidence verification policy

No AI classifier in Phase 1. Browser camera can be virtual or aimed at a screen. GPS can be spoofed; retain accuracy and freshness. Device time is a claim. Server receipt proves receipt time only.

M3 processing will compute SHA-256 on server bytes, validate image signatures/dimensions, derive thumbnails and perceptual duplicate candidates, compare GPS uncertainty and nearby faces, and flag anomalies. Flags guide reviewers; uncertain GPS alone does not reject a visit. A human explicitly approves a first baseline after contextual identification. Ambiguous adjacent faces require another angle or independent visit. Store actor, reason, decision version and timestamp; never silently revise a decision.

M5 retrieval requires verified references, representative blind test data, measured false accepts, calibrated thresholds, top-K/coverage and explicit abstention. No fixed accuracy or AI cost promise.
