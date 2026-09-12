# Security implementation and deployment

## Verified locally

- 29 automated tests: application validation, OAuth callback handling, upload failures, account-deletion controls, and actual PostgreSQL RLS using PGlite.
- 8 Chromium tests: anonymous access, signup password validation, inert untrusted profile text, deletion confirmation, HTTP security headers, OAuth PKCE redirects, cancellation, disabled providers, and mobile layout.
- ESLint, production build, dependency audit and current/fetched-history secret-pattern scan.
- Database tests load the repository SQL into PostgreSQL with a minimal Supabase auth/storage schema. They do NOT exercise the hosted Storage HTTP service or TUS implementation. Browser tests mock Supabase and never delete a real account.

## The 20 checks

| Check | Implementation / remaining boundary |
|---|---|
| Hide API keys | Privileged keys stay in Edge Function environment. Frontend publishable/anon keys are intentionally public. Frontend/build validation rejects service-role and secret keys. |
| Environment variables | Production build fails for missing/unsafe configuration and non-HTTPS API URLs. Only the two public VITE variables are needed. |
| Keys in Git | Environment/private-key files ignored. CI scans current files and fetched Git history for known secret formats. No matching secrets found; pattern scanning cannot prove absence of every possible credential. |
| Protect admin routes | There is no admin dashboard. The privileged deletion endpoint verifies the caller with Supabase, requires their password, and derives storage paths from their own namespace. |
| Authentication | Existing Supabase Auth retained. Password confirmation added for account deletion. Signup/recovery UI requires 12 characters. Hosted Auth minimum must also be set to 12. |
| User permissions | Existing own-user RLS retained and tested with two users. Cross-account folder references remain forbidden by composite foreign keys. |
| Sanitize inputs | Names are normalized and length/control-character checked. IDs validated before uploads. SQL checks cover direct API writes. |
| XSS | React escapes names. CSP restricts scripts to this site; framing and plugin content blocked. Arbitrary shared files use download links. Avatar URLs restricted; avatar byte signatures checked in browser. |
| SQL injection | Supabase structured queries retained; no user input concatenated into SQL. Server functions use typed arguments. |
| Database rules | New records must match an owned storage object and its actual byte size. Stored file identity and folder parent/owner are immutable. Remote avatar URLs are rejected. |
| Rate limiting | After migration: 30 distinct uploads/minute/account, 300 metadata inserts/updates/minute/account, 5 deletion attempts/minute/account. Counters are database-backed. Supabase Auth's separate service limits remain managed by Supabase. These are not global/IP or bandwidth limits. |
| Spend cap | Live organization verified on Free plan on 2026-09-11. No paid overage cap to enable. If upgrading, enable the Pro spend cap and monitor usage; it does not cover every charge. No plan or billing change made. |
| File uploads | Existing private buckets, 100 MB files / 5 MB image avatars retained. New storage objects require an owned non-trashed folder. Browser overwrites disabled. Failed metadata insertion attempts cleanup and reports cleanup failure. Resumable fingerprints include account/destination. No antivirus/content-disarm service is included. |
| CSRF | Sensitive endpoint requires a bearer token, JSON body and an explicitly allowed Origin. It does not accept cookie authentication. |
| CORS | Deletion function denies unlisted/missing origins. ALLOWED_ORIGINS is required at deployment. Managed Supabase API CORS remains provider-controlled; RLS is its authorization boundary. |
| HTTPS | Production API URL validation, HSTS and upgrade-insecure-requests headers. Vercel provides HTTPS when deployed. |
| Security headers | vercel.json includes CSP, HSTS, nosniff, DENY framing, no-referrer, and restricted browser permissions. Vite preview sends the same headers for browser tests. |
| Secure cookies | The existing SPA uses bearer tokens stored by Supabase JS, not authentication cookies. HttpOnly cookie settings do not apply to this architecture. An XSS can still expose browser-held tokens; CSP and escaping reduce this risk. |
| Debug mode | Production source maps disabled. Deletion errors do not expose server details or passwords. |
| Production settings | Dependencies pinned, npm lockfile committed, CI permissions read-only, action revisions pinned, Dependabot configured. Hosted activation and post-deployment tests still required below. |

## Deployment order (not yet performed)

The work is local on `security/automated-safety-net`. No production database, function, billing setting, GitHub branch or deployment has been changed.

1. Apply `supabase/migrations/20260911094338_security_hardening.sql` to the existing project after reviewing/backing up the schema. For a new project, run `supabase/8bitspace-setup.sql` first. Do not rerun the original setup script after hardening: it recreates the older Storage policies.
2. Set Edge Function secret `ALLOWED_ORIGINS` to the exact production origin: the confirmed Vercel production URL. Verify the actual Vercel domain before setting this; do not use wildcards. Add other exact owned origins only if needed. Supabase supplies the function's SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY.
3. Deploy the updated `delete-account` function together with the frontend release. Older frontends do not send a password and will be denied by the new endpoint.
4. Configure hosted Auth minimum password length = 12, email confirmation, exact production site/redirect URLs, and review authentication rate limits. Do not enable settings that require an unsupported new recovery flow. Leaked-password protection is Pro-only and currently unavailable on the verified Free plan.
5. Publish this branch and deploy the frontend with the real public environment values. vercel.json is tied to the confirmed project `sajbwbtqlassnipnbdkk`; update CSP if that project changes. CI uses placeholder public configuration and no production secrets.
6. Verify small and resumable uploads against hosted Storage with disposable users; confirm cross-user download denial, cleanup, password reset, and complete account deletion. Re-run Supabase security advisors. Make the Security checks job a required branch-protection check in GitHub if supported by the repository plan.

The database tests preserve production data: they run in an isolated, in-memory PostgreSQL instance. The migration uses NOT VALID for additional constraints to avoid changing/deleting historical records; PostgreSQL still enforces those constraints on new or updated rows. Existing metadata should be audited before separately validating old rows.

## Commands

- `npm ci`
- `npm run lint`
- `npm test`
- `npm run security:scan`
- `npm audit --audit-level=high`
- `npm run build` (requires real or test public environment values)
- `npx playwright install chromium`
- `npm run test:browser` (uses the built site; never use production credentials in fixtures)

References: [Supabase storage authorization](https://supabase.com/docs/guides/storage/security/access-control), [password security and Pro-only leaked-password protection](https://supabase.com/docs/guides/auth/password-security), [cost control](https://supabase.com/docs/guides/platform/cost-control).
