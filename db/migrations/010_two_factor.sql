-- Two-factor authentication (TOTP with recovery codes) for administrator accounts.
-- Existing accounts keep twoFactorEnabled = false and sign in exactly as before until
-- they enroll or the administrator enforcement setting is turned on.
CREATE TABLE "twoFactor" (
  id text PRIMARY KEY,
  secret text NOT NULL,
  "backupCodes" text NOT NULL,
  "userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  verified boolean NOT NULL DEFAULT true,
  "failedVerificationCount" integer NOT NULL DEFAULT 0,
  "lockedUntil" timestamptz
);
CREATE INDEX "twoFactor_userId_idx" ON "twoFactor"("userId");
ALTER TABLE "user" ADD COLUMN "twoFactorEnabled" boolean NOT NULL DEFAULT false;
