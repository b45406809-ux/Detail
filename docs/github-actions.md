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
| `CLOUDFLARE_ACCOUNT_ID` | Account used only by the separate marketing-asset publishing workflow. |

| GitHub environment secret | Purpose |
| --- | --- |
| `SUPABASE_ACCESS_TOKEN` | Supabase CLI authentication. |
| `SUPABASE_DB_PASSWORD` | Database password used to link the project and apply migrations. |
| `SUPABASE_ANON_KEY` | Public/publishable key embedded in the site build. |
| `VITE_TURNSTILE_SITE_KEY` | Public Turnstile widget key embedded in the waitlist form. |
| `VITE_POSTHOG_KEY` | Optional public analytics project key. |
| `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD` | FTPS account used to publish the marketing site and dashboard. |
| `PAYNOW_INTEGRATION_ID`, `PAYNOW_INTEGRATION_KEY` | Paynow merchant API credentials. |
| `DIDIT_API_KEY`, `DIDIT_WORKFLOW_ID` | Cleaner identity verification provider settings. |
| `TURNSTILE_SECRET` | Server-side Turnstile verification secret. |
| `RESEND_API_KEY` | Transactional and marketing email delivery. |
| `PAYOUT_ENCRYPTION_KEY` | Dedicated 32-byte key for encrypting payout destinations. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID` | SMS delivery from the Supabase delivery worker. |
| `TWILIO_FROM_NUMBER` | Optional fallback sender when no Messaging Service SID is used. |
| `CRON_SECRET` | Authenticates the scheduled notification delivery workflow and server worker. |
| `CLOUDFLARE_API_TOKEN` | Optional token for publishing marketing assets to Cloudflare KV; not used for D1 migrations. |

The Supabase deployment workflow sends configured provider values to Supabase Edge Function secrets and deploys the database migrations and functions. Supabase supplies its project URL and platform keys to deployed functions. Keep `SUPABASE_SERVICE_ROLE_KEY` out of Vite and Expo variables; it is a Supabase server-side secret, not a GitHub Actions build argument.

## Deployment boundaries

- `deploy.yml` builds the site and dashboard, then publishes them to the configured FTPS host after a push to `main` or manual dispatch from `main`.
- `deploy-supabase.yml` applies Supabase migrations, configures Edge Function provider secrets, and deploys the Edge Functions after relevant changes reach `main` or by manual dispatch from `main`.
- `notification-delivery.yml` calls the deployed Supabase delivery worker every five minutes when `SUPABASE_URL` and `CRON_SECRET` are available.
- `publish-marketing-assets.yml` publishes generated promotional assets to Cloudflare KV. It does not create, migrate, or write to the Cloudflare waitlist D1 database.
- No workflow deploys to, migrates, or writes to the Cloudflare waitlist D1 database.

For local development and provider sign-up links, see [live API credentials](live-api-credentials.md).
