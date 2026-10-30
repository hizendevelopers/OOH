# Administrator and worker accounts

Hosted production always requires sign-in, including when an older deployment setting still has `IBVS_REQUIRE_SIGN_IN=false`. For local development, set `IBVS_REQUIRE_SIGN_IN=true` in `apps/web/.env.local` and restart.

## First administrator

Create the organization and apply the database schema before provisioning accounts. The internal Operations workspace actor is only for ownership and audit history; it has no login password.

At the repository root in PowerShell:

```powershell
$credential = Get-Credential -UserName 'admin@example.com' -Message 'Enter an administrator password (12–128 characters)'
$env:IBVS_USER_PASSWORD = $credential.GetNetworkCredential().Password
try {
  npm run user:create -- 'admin@example.com' 'Administrator' admin billboard-operations
} finally {
  Remove-Item Env:IBVS_USER_PASSWORD
}
```

The command reads the configured database from `apps/web/.env.local`. It refuses duplicate email addresses rather than replacing an existing account. Passwords are hashed by Better Auth; they are never stored in the worker profile or audit log.

## Create workers on the website

1. Sign in as an administrator at `/sign-in`.
2. Open **Workers** in the sidebar.
3. Enter the worker's name, unique email address, and a password of 12–128 characters.
4. Select **Create worker**. Share those credentials with the worker through your normal private channel; the app does not send email.
5. Open **Inventory**, select billboard faces, choose **Assign visits**, select the worker and due date, then create the assignments.

New accounts are always workers in the signed-in administrator's organization. The API rejects role or organization overrides, worker access, requests without a session, and cross-origin writes. Creating a worker does not sign the administrator out or start a worker session.

## Worker dashboard

The worker signs in with their own account, sees **My assignments**, and opens **Open field workspace** (`/field`) for location-aware photo capture. Use separate browser profiles or an incognito window to test administrator and worker accounts simultaneously.

The Workers screen currently creates and lists accounts. Password reset, invitations, and account deactivation are separate features.
