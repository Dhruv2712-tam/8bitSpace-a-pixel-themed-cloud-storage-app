# Account deletion with Google or GitHub

Linked Google/GitHub accounts verify through their provider and return to a new
confirmation dialog. They must type `DELETE ACCOUNT` and press Delete account;
the callback never deletes anything automatically. Email-only accounts keep the
existing password verification flow.

The edge function checks the active user with `getUser`, validates the JWT with
`getClaims`, and requires an OAuth authentication event no older than five minutes.
JWT issuance/refresh time and editable user metadata are not accepted as evidence.
The expected account ID is compared with the authenticated user; storage paths and
the deletion target are always derived from the authenticated user.

The browser's short-lived, single-use sessionStorage intent only restores the
confirmation UI. It is not server authorization. Cancelled/failed callbacks,
expired intents and another account being selected do not restore the dialog.
Server failures stay visible and allow another verification attempt.

Reference: https://supabase.com/docs/guides/auth/jwt-fields

## Validation and rollout

Added handler regression cases for both providers, stale/refreshed tokens,
unverified claims, missing OAuth evidence, account mismatch, confirmation and
rate limiting. Added browser scenarios for password-free dialogs, explicit final
confirmation, error recovery, cancellation, mismatched accounts and mobile layout.
Browser tests mock Supabase; they do not prove a real OAuth exchange or deletion.
The existing CI workflow discovers these tests without configuration changes.

Validation completed on Windows with the owner's explicit authorization to run
outside the audit sandbox:

- ESLint passed.
- All 47 Vitest tests passed, including local Postgres RLS tests for anonymous
  access and two distinct users.
- All 16 Chromium browser tests passed with mocked Supabase responses. Mobile
  deletion and desktop password-dialog screenshots were inspected.
- Production build passed using a placeholder publishable key. Vite reports a
  non-blocking bundle-size warning (the main chunk exceeds 500 kB).
- Deno 2.9.6 checked the Edge Function entrypoint with
  `deno check --no-lock --node-modules-dir=none supabase/functions/delete-account/index.ts`.
- Source and Git-history secret scanning passed; npm audit reported zero known
  vulnerabilities; `git diff --check` passed.

The focused security-audit review covered the changed browser intent/callback,
server verification and deletion path, including identity binding, signed OAuth
freshness, explicit confirmation, origin checks, request limits, ownership-derived
storage paths and session revocation. No confirmed issue was found in that scope.
This is not an exhaustive project audit or proof of hosted configuration.
No secrets, schema, production accounts or hosted settings changed.

Before production activation, require the existing CI checks to pass.
Deploy the updated `delete-account` edge function and frontend together. The new
function requires a confirmation field, so old open browser tabs need a reload.
No database migration is required. Preserve the existing allowed origins and
rate-limit migration. Check the actual provider round trip using disposable test
accounts before production activation. After deployment, verify the live flow and
perform the required Sentry check for that release/time window.

Pushing this code alone does not deploy the Supabase Edge Function. Live provider
verification, function deployment and the post-deployment Sentry check remain
separate release steps.
