# GitHub Actions setup

GitHub Actions is the build and deployment environment. Local `.env` files are only for local development; production credentials belong in the repository's protected **`production` environment**. The workflows never print secret values.

## Validation

`.github/workflows/ci.yml` runs on pull requests, pushes to `main` and the routed-dashboard branch, and manual dispatch. It installs from lockfiles, builds the site, type-checks and lints the mobile app, builds the migration utilities, starts a local Supabase stack, applies and lints migrations, and type-checks every Edge Function. CI uses placeholder public client values and does not require production credentials.

## Production environment values

Create a GitHub environment named `production`, enable required reviewers if desired, and configure these environment variables and secrets there.

| GitHub environment variable | Purpose |
| --- | --- |
| `SUPABASE_PROJECT_REF` | Project reference used by Supabase CLI deployments. |
| `SUPABASE_URL` | Public project URL used by the site build and scheduled delivery workflow. |
| `VITE_POSTHOG_HOST` | Optional analytics host, usually `https://us.i.posthog.com`. |
| `PAYNOW_RETURN_URL` | Optional customer return URL used by payment checkout. |
| `APP_RETURN_URL` | Optional app deep-link return URL for payments. |
| `CLOUDFLARE_ACCOUNT_ID` | Account used by marketing-asset publishing and the one-time legacy D1 migration. |
| `CLOUDFLARE_D1_DATABASE_ID` | Legacy D1 database UUID used only for the one-time data migration. |

| GitHub environment secret | Purpose |
| --- | --- |
| `SUPABASE_ACCESS_TOKEN` | Supabase CLI authentication. |
| `SUPABASE_DB_PASSWORD` | Database password used to link the project and apply migrations. |
| `SUPABASE_ANON_KEY` | Public/publishable key embedded in the site build. |
| `VITE_TURNSTILE_SITE_KEY` | Public Turnstile widget key embedded in the waitlist form. |
| `VITE_POSTHOG_KEY` | Optional public analytics project key. |
| `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD` | FTPS account used to publish the marketing site and dashboard. |
| `PAYNOW_INTEGRATION_ID`, `PAYNOW_INTEGRATION_KEY` | Paynow merchant API credentials. |
| `DIDIT_API_KEY` or `DIDIT_KYC_SECRET_KEY`, `DIDIT_WORKFLOW_ID` | Cleaner identity verification provider settings. Either API-key secret name is accepted; the workflow maps both to `DIDIT_API_KEY`. |
| `TURNSTILE_SECRET` | Server-side Turnstile verification secret. |
| `RESEND_API_KEY` or `EXPO_RESEND_API_KEY` | Transactional and marketing email delivery. Either secret name is accepted; the workflow maps both to `RESEND_API_KEY`. |
| `PAYOUT_ENCRYPTION_KEY` | Dedicated 32-byte key for encrypting payout destinations. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID` | SMS delivery from the Supabase delivery worker. |
| `TWILIO_FROM_NUMBER` | Optional fallback sender when no Messaging Service SID is used. |
| `CRON_SECRET` | Authenticates the scheduled notification delivery workflow and server worker. |
| `CLOUDFLARE_API_TOKEN` | Optional token for publishing marketing assets to Cloudflare KV. |
| `CLOUDFLARE_D1_READ_TOKEN` | Cloudflare API token scoped as narrowly as possible to query the legacy D1 database. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side key used by the manual legacy data migration workflow; never expose it to frontend builds. |
| `MAPBOX_PUBLIC_TOKEN` | Public Mapbox token used by the manual live style-access check. |
| `EXPO_TOKEN` or `EAS_BOT_ACCESS_TOKEN` | Expo EAS bot token used by the manual Android production build workflow. |
| `MAPBOX_DOWNLOADS_TOKEN` | Mapbox secret token with `DOWNLOADS:READ` scope, required to fetch the native Android Mapbox SDK. The build workflow verifies access before starting EAS. |
| `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN` or `MAPBOX_PUBLIC_TOKEN` | Public Mapbox styles token embedded in the app; keep it separate from the downloads token. |
| `LIVE_E2E_EMAIL_TO` | Dedicated test mailbox for the manual Resend delivery test. |
| `LIVE_E2E_SMS_TO` | Dedicated E.164 test phone for the manual Twilio delivery test. |

The Supabase deployment workflow sends configured provider values to Supabase Edge Function secrets and deploys the database migrations and functions. Supabase supplies its project URL and platform keys to deployed functions. Keep `SUPABASE_SERVICE_ROLE_KEY` out of Vite and Expo variables; it is a Supabase server-side secret, not a GitHub Actions build argument.

EAS CLI authentication uses `EXPO_TOKEN` in the shell or protected CI environment. It is separate from `MAPBOX_DOWNLOADS_TOKEN`, which is only a native SDK build credential. No client bundle should contain either secret.

## Deployment boundaries

- `deploy.yml` builds the site and dashboard, then publishes them to the configured FTPS host after a push to `main` or manual dispatch from `main`.
- `deploy-supabase.yml` applies Supabase migrations, configures Edge Function provider secrets, and deploys the Edge Functions after relevant changes reach `main` or by manual dispatch from `main`.
- `notification-delivery.yml` calls the deployed Supabase delivery worker every five minutes when `SUPABASE_URL` and `CRON_SECRET` are available.
- `publish-marketing-assets.yml` publishes generated promotional assets to Cloudflare KV. It does not create, migrate, or write to the Cloudflare waitlist D1 database.
- `migrate-cloudflare-waitlist.yml` is a manual, dry-run-first migration. It reads the legacy D1 database and imports missing waitlist emails, blog posts, campaign history, and dashboard settings into Supabase; it never deletes or modifies Cloudflare data. Set the workflow input to true only after reviewing a successful dry run. Configure the narrowest D1 token scope that permits SELECT queries. The ordinary site, dashboard, and backend deployments use Supabase.

For local development and provider sign-up links, see [live API credentials](live-api-credentials.md).

## One-time Cloudflare D1 migration

Set `CLOUDFLARE_D1_DATABASE_ID`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_D1_READ_TOKEN`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` in the protected `production` environment. The migration runs SELECT queries against D1 and only writes to Supabase. Run **Migrate legacy Cloudflare D1 data to Supabase** with `execute_migration=false` first to review table counts, then dispatch again with `true` to import supported records. Re-running is safe: destination emails, blog slugs, campaign IDs, and setting keys already present are skipped. Cloudflare D1 remains intact as a rollback source. The script never logs waitlist personal data. Legacy admin passwords, invites, and sessions are not copied; recreate access with Supabase admin invitations. If any old mobile marketplace tables contain rows, execution stops until their user identities can be mapped safely.

For manual, allowlisted operational checks, see [GitHub Actions operations](github-actions-ops.md). `cmd.txt` triggers build checks only; read-only production diagnostics require manual dispatch from `main` and an explicit confirmation.
