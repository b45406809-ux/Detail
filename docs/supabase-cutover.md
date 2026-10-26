# Firebase to Supabase cutover

The current dashboard and marketing waitlist use Supabase. Legacy Cloudflare D1 waitlist and blog records were copied to Supabase on 2026-10-26, with D1 preserved unchanged. Cloudflare administrator accounts still need fresh Supabase Auth accounts and roles. Firebase remains a separate legacy source for marketplace users and records; do not disable it before those records are reconciled.

## Create and configure Supabase

Create a project in [Supabase](https://supabase.com/dashboard/projects), then set the project URL and publishable/anon key in `mobile/.env` and `site/.env`. Never expose the `service_role` key in either client. Apply database changes with the Supabase CLI (`supabase link --project-ref …`, then `supabase db push`) and deploy the `marketplace-api`, `paynow-webhook`, `paynow-reconcile`, `paynow-return`, and `marketing-unsubscribe` Edge Functions. The local project configuration lives in `supabase/config.toml`.

For GitHub Actions, configure the `SUPABASE_PROJECT_REF` and `SUPABASE_URL` environment variables plus `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, and `SUPABASE_ANON_KEY` secrets in the `production` environment. The dashboard deploy workflow also needs the existing FTPS deployment credentials. The Supabase backend workflow stays skipped until a project ref is configured.

Set server secrets with `supabase secrets set`: `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `PAYNOW_INTEGRATION_ID`, `PAYNOW_INTEGRATION_KEY`, `PAYNOW_RETURN_URL`, `CRON_SECRET`, `DIDIT_API_KEY`, `DIDIT_WORKFLOW_ID`, `TURNSTILE_SECRET`, `RESEND_API_KEY`, and optionally `APP_RETURN_URL`. Add `SUPABASE_URL`, `CRON_SECRET`, and the Paynow integration credentials to the GitHub `production` environment. The five-minute scheduled worker polls at most 20 stale active Paynow payments per run, records results in the provider inbox, and retries unresolved states; it remains idle when Paynow credentials are absent. Use production secrets only in Supabase's secret store or CI secret settings.

Configure Supabase Auth email templates/SMTP and redirect URLs, then configure Google and Apple provider credentials in Auth. Allow `detail://auth/callback`, `detail://reset-password`, and `detail://account/email` for native redirects. The versioned templates in `supabase/config.toml` and `supabase/templates/` cover signup confirmation, email-code login, password recovery, and email changes. The mobile app exchanges PKCE recovery/email-confirmation links on cold start and while open. The reset screen requires matching passwords of at least eight characters; phone-first users can link a verified email from Profile without creating a second UID. Existing users must accept the current customer agreement again; verified cleaners must also accept the current cleaner agreement before taking new jobs. Production SMTP and redirects are configured in Supabase Auth and must match the app scheme. Test signup, code login, recovery, and email linking with real email on iOS and Android before release. For phone login, configure Twilio under **Authentication → Sign In / Providers / Phone** with Account SID, Auth Token, and Messaging Service SID. Test delivery and sender requirements on local Zimbabwe `+263` numbers before enabling it for all users. The Detail-branded OTP text is set in `supabase/config.toml`; Twilio credentials belong only in Supabase Auth settings, never in app variables or source control.

## Migrate legacy accounts, data, and media

Take a Firestore export and Storage inventory first. Give the migration operator Firebase Admin read access and Supabase service-role access. Set `FIREBASE_PROJECT_ID`, `FIREBASE_STORAGE_BUCKET`, `GOOGLE_APPLICATION_CREDENTIALS`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` in a protected local shell, then run:

```sh
cd functions
npm run migrate:supabase:dry-run
npm run migrate:supabase
```

The importer is restartable and never deletes from Firebase. It creates replacement Supabase auth accounts with random passwords and records the old-to-new UID mapping in `legacyAuthMappings`; current Firebase password hashes cannot be reused by Supabase Auth. Every migrated account therefore needs a secure password reset or a fresh OAuth/SMS sign-in before launch. Accounts without a verified email or reachable phone need a support recovery path. Existing auth sessions will end at cutover.

The import remaps user and booking references to new IDs, imports supported top-level collections, and copies Firebase Storage objects to the private `detail-media` bucket. Review importer output and compare per-table counts, wallet balances, payout holds, booking statuses, review counts, KYC status, and representative media URLs. Resolve invalid or rejected records before proceeding. Do not import raw KYC document images or reusable identity-provider sessions; cleaners must complete Didit verification again if the provider session cannot be safely resumed.

Cloudflare D1 waitlist/blog/campaign/settings records use the separate dry-run-first workflow documented in [GitHub Actions setup](github-actions.md#one-time-cloudflare-d1-migration). Cloudflare administrator passwords, invites, and sessions are not portable to Supabase Auth. Create/verify a Supabase Auth user, grant the initial owner role through the protected bootstrap procedure, then invite each administrator again from the Supabase dashboard. Cloudflare KV promotional assets remain on Cloudflare because they are a separate static download library, not dashboard records.

## Cutover sequence

1. Configure and deploy Supabase in a staging environment. Exercise email/password, email code, Google/Apple, SMS, cleaner verification, bookings, chat, cancellation, ratings, wallet top-up, Paynow BuySafe status polling/callbacks, and manual cleaner payouts.
2. Schedule a short write freeze. Run the final import, reconcile ledger totals and record counts, and test account recovery with a migrated user. Keep Firebase data intact and available for rollback investigation.
3. Release mobile and dashboard builds with the Supabase URL/anon key. Watch Auth, database, storage, and Edge Function logs. Re-enable writes only after smoke tests pass.
4. Paynow pays the Detail merchant account; cleaner payouts remain manual via the existing payout request and admin settlement flow. BuySafe escrow release does not create a Paynow split or automatically transfer funds to a cleaner.
5. Keep the Firebase project and its backups until the rollback window closes and privacy retention obligations are met. Then remove unused Firebase runtime resources deliberately.

The Supabase free plan is suitable for a low-volume pilot, but includes quotas and operational limits that can change. Monitor database/storage/egress/Auth usage and establish backups and a paid-plan trigger before relying on it for production financial records. No production project credentials are present in this repository, so migration, provider delivery, and live callback verification require the project owner to configure secrets and run the documented deployment.
