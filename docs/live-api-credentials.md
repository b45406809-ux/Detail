# Live API credentials

The current clients and backend use Supabase for authentication, database, private media, and Edge Functions. Provider credentials are never stored in the repository. Configure public client values in the app build environment and private keys in Supabase's secret store.

| Service | Values | Where to get/configure them |
| --- | --- | --- |
| Supabase client | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Create a project in the [Supabase dashboard](https://supabase.com/dashboard/projects); copy the project URL and publishable/anon key from **Project Settings → API**. Client keys are public; RLS protects data. |
| Supabase deployment | `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD` | Create a [Supabase personal access token](https://supabase.com/dashboard/account/tokens); find the ref and database password in project settings. Store them in the GitHub `production` environment. |
| Supabase server access | `SUPABASE_SERVICE_ROLE_KEY` | Project **Settings → API**. Configure only with `supabase secrets set` or a protected local operator shell. Never put it in a Vite/Expo variable. |
| Paynow BuySafe and wallet top-ups | `PAYNOW_INTEGRATION_ID`, `PAYNOW_INTEGRATION_KEY`, optional `PAYNOW_RETURN_URL` | Create/view a merchant integration in the [Paynow Customer Portal](https://www.paynow.co.zw/). Set the result URL to `https://<project-ref>.supabase.co/functions/v1/paynow-webhook`, keep BuySafe enabled, and add credentials to Supabase Edge Function secrets. Paynow settles to Detail; cleaner payouts remain manual. |
| Didit cleaner identity checks | `DIDIT_API_KEY`, `DIDIT_WORKFLOW_ID` | Create API credentials and a Zimbabwe identity workflow in the [Didit dashboard](https://business.didit.me/); check [Zimbabwe coverage](https://didit.me/solutions/countries/zimbabwe/) and the [API docs](https://docs.didit.me/). Store values in Supabase Edge Function secrets. |
| Waitlist protection | Browser `VITE_TURNSTILE_SITE_KEY`, server `TURNSTILE_SECRET` | Create a widget in [Cloudflare Turnstile](https://dash.cloudflare.com/?to=/:account/turnstile). Put the site key in the site build environment and the secret in Supabase Edge Function secrets. Both are required for the production waitlist. |
| Transactional email | `RESEND_API_KEY` | Create a key in [Resend](https://resend.com/api-keys) and verify `detailapp.co.zw` under [Domains](https://resend.com/domains). Store the key in Supabase Edge Function secrets. |
| Google sign-in | Supabase Google provider credentials; `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` | Configure Google in Supabase **Authentication → Sign In / Providers** and create OAuth clients in [Google Cloud Credentials](https://console.cloud.google.com/apis/credentials). Use the app's production package/bundle IDs and registered redirect URLs. |
| Apple sign-in | Supabase Apple provider credentials and iOS capability | Configure the Apple provider in Supabase and create the service ID/key in the [Apple Developer portal](https://developer.apple.com/account/resources/identifiers/list). Set the app's Sign in with Apple capability. |
| SMS sign-in | Twilio Account SID, Auth Token, and Messaging Service SID | Create a [Twilio account](https://www.twilio.com/try-twilio), configure a Messaging Service and Zimbabwe-capable sender in the [Twilio Console](https://console.twilio.com/), then enter credentials in Supabase **Authentication → Sign In / Providers → Phone → Twilio**. Test delivery to local `+263` numbers, sender registration, and pricing before production. |
| Transactional SMS and push outbox | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID` (or `TWILIO_FROM_NUMBER`), `CRON_SECRET` | Use the same Twilio Console account and Messaging Service as phone auth. Add the credentials as Supabase Edge Function secrets. The API dispatches queued alerts immediately when `CRON_SECRET` is configured; configure GitHub repository secrets `SUPABASE_URL` and `CRON_SECRET` so the checked-in worker also retries failures every five minutes and records Expo push receipts. |
| Cleaner payout encryption | `PAYOUT_ENCRYPTION_KEY` | Generate a dedicated 32-byte key with `openssl rand -base64 32`; store it only as a Supabase Edge Function secret and keep a protected backup in your secret manager. Payout requests fail closed until this key exists. Rotate only with a planned re-encryption of stored destinations. |
| Mobile maps | `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN`, `MAPBOX_DOWNLOADS_TOKEN` | Create a public token with minimum map style/font read scopes and a secret token with `DOWNLOADS:READ` in the [Mapbox account dashboard](https://account.mapbox.com/access-tokens/). Set the public token in the mobile EAS build environment and the download token as an EAS secret. Both tokens are required for EAS development, preview, and production builds. The app requires a custom development/production build; Expo Go does not include Mapbox's native SDK. |
| Site deployment | `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Keep existing Webzim FTPS values in the GitHub `production` environment. Add Supabase URL as an environment variable and anon/publishable key as a secret for the site build. |

Supabase supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions. Set provider secrets through the CLI or dashboard, for example:

```sh
supabase secrets set PAYNOW_INTEGRATION_ID=... PAYNOW_INTEGRATION_KEY=... DIDIT_API_KEY=... DIDIT_WORKFLOW_ID=... TURNSTILE_SECRET=... RESEND_API_KEY=... TWILIO_ACCOUNT_SID=... TWILIO_AUTH_TOKEN=... TWILIO_MESSAGING_SERVICE_SID=... PAYOUT_ENCRYPTION_KEY=... CRON_SECRET=...
```

For the initial dashboard administrator, first create and verify the account through Supabase Auth, then run from a protected local shell:

```sh
cd functions
SUPABASE_URL=https://<project-ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
ADMIN_EMAIL=owner@example.com \
BOOTSTRAP_ADMIN_CONFIRM=YES \
npm run bootstrap-admin
```

Start from the checked-in [root environment example](../.env.example), [mobile example](../mobile/.env.example), and [site example](../site/.env.example). Only public keys belong in client variables. Do not commit `.env` files or paste service-role/provider secrets into chat or source files. For migration access and cutover details, see [Supabase cutover](supabase-cutover.md).
