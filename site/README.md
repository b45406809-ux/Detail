# Detail marketing site

Vite/React web package for the public site at `https://detail.co.zw` and the protected admin dashboard at `https://dashboard.detail.co.zw`. The customer and cleaner application lives in `mobile/`; the retired root web prototype has been removed.

## Architecture

- Browser code reads Firebase Remote Config, but **never writes Firestore**. `joinWaitlist` is an HTTPS callable Cloud Function using the Admin SDK.
- `/admin/*` renders the dashboard from `site/src/admin`. Firebase Authentication establishes the session, a refreshed ID token must contain `admin: true`, and elevated controls additionally require `elevated: true`. Administrative writes remain callable-only.
- Waitlist records use a deterministic SHA-256 document ID from role + normalized email, preventing duplicate entries without a query race. The function validates/normalizes fields, limits an IP hash to eight attempts per UTC hour, checks a honeypot, optionally verifies Cloudflare Turnstile, and records consent time, source and policy version.
- Confirmation mail is sent through Resend. A mail-provider failure is logged without losing an accepted waitlist record.
- PostHog is disabled until explicit consent. Autocapture, session recording and person profiles are disabled. Only allow-listed interaction metadata, section names, role and UTM parameters are sent—never form values.

## Environment variables

Copy `.env.example` to `.env.local`. All `VITE_*` values are embedded in the public bundle; do not place secrets there.

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_FIREBASE_API_KEY` | yes | Firebase Web API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | yes | Firebase auth domain |
| `VITE_FIREBASE_PROJECT_ID` | yes | Must match the apps' Firebase project |
| `VITE_FIREBASE_APP_ID` | yes | Firebase web app ID |
| `VITE_FIREBASE_FUNCTIONS_REGION` | no | Defaults to `us-central1` |
| `VITE_POSTHOG_KEY` / `VITE_POSTHOG_HOST` | no | Enables consent-gated analytics |
| `VITE_TURNSTILE_SITE_KEY` | recommended | Turnstile public widget key |

Configure server secrets (never `VITE_*` variables):

```bash
firebase functions:secrets:set TURNSTILE_SECRET
firebase functions:secrets:set RESEND_API_KEY
```

If `TURNSTILE_SECRET` is absent, rate limiting and the honeypot remain active but challenge verification is skipped. If `RESEND_API_KEY` is absent, submission works but no email is sent. Verify `detailapp.co.zw` with Resend and authorize `hello@detailapp.co.zw` before launch. Enable Firestore TTL on `_waitlist_rate_limits.expiresAt` to remove expired counters automatically.

## Shared beta configuration

The site uses Firebase Remote Config in project `new1-4bb94`, the same backend used by the apps. Publish these parameters:

| Key | Type | Default | Meaning |
| --- | --- | --- | --- |
| `booking_enabled` | Boolean | `false` | Shows whether beta booking is open |
| `waitlist_enabled` | Boolean | `true` | Independently enables submissions |
| `maintenance_message` | String | built-in honest beta message | Customer-facing availability detail |
| `whatsapp_number` | String | `263714885936` | International number without `+` |

When Remote Config cannot load, safe local defaults keep bookings described as closed and the waitlist open. Changing `booking_enabled` does not disable waitlist collection.

## Local development and checks

```bash
cd site
npm install
npm run dev                 # http://localhost:5173
npm run typecheck
npm run build
npm run preview             # production bundle preview
```

For an end-to-end submission, build Functions and run Firebase emulators from the repository root. Point the client at emulators temporarily in local-only code or use a non-production Firebase project; never test fake submissions against production.

## Firebase Hosting targets and DNS

`firebase.json` defines two Hosting targets:

- `marketing` -> `site/dist` -> `detailapp.co.zw`
- `dashboard` -> `site/dist` (`/admin`) -> `dashboard.detail.co.zw`

The checked-in `.firebaserc` maps them to the expected Firebase Hosting site IDs `detail-marketing` and `detail-dashboard`. If the console uses different site IDs, run once:

```bash
firebase target:apply hosting marketing <actual-marketing-site-id>
firebase target:apply hosting dashboard <actual-dashboard-site-id>
```

In Firebase Console, add each custom domain to its matching Hosting site. Add the exact A/AAAA or CNAME verification records Firebase displays at the DNS provider; do not copy addresses from another Firebase project. Remove conflicting proxy/parking records, keep both records during certificate provisioning, and redirect `www.detail.co.zw` to the apex if desired. DNS and managed TLS propagation may take up to 24 hours.

## Deploy

```bash
# from repository root
npm --prefix site install && npm --prefix site run build
npm --prefix functions ci && npm --prefix functions run build
firebase deploy --only functions:joinWaitlist
firebase deploy --only hosting:marketing,hosting:dashboard
```

Deploy Functions first so the public form has a backend. Before production, submit each role, confirm Firestore records and emails, test duplicate behavior, keyboard navigation, narrow/wide layouts, both Remote Config flags, analytics opt-in/out, `/privacy`, `/terms`, `robots.txt`, `sitemap.xml`, and social-preview metadata.

## Rollback

1. If submissions are unsafe, publish `waitlist_enabled=false` in Remote Config immediately. This leaves support contact paths visible.
2. In Firebase Console > Hosting > the affected site > release history, select the prior known-good release and **Rollback**. Targets have independent histories, so rolling back marketing does not change the dashboard.
3. For Functions, identify the previous source revision from version control, check it out, rebuild, and run `firebase deploy --only functions:joinWaitlist`. Secrets remain managed by Firebase.
4. Re-test production, then restore the waitlist flag only after the issue is resolved.

## Operational privacy and accessibility

Restrict `beta_waitlist` access to authorized staff through IAM/Admin tooling; Firestore rules' catch-all deny prevents browser reads and writes. Establish a retention window and deletion workflow before launch. The UI uses semantic landmarks and headings, native labelled fields, visible focus, reduced-motion support, live status/error announcements, contrast-conscious colors, and responsive layouts. Run Lighthouse and manual keyboard/screen-reader checks against the deployed build because network and production headers affect final results.

## cPanel / Webzim deployment

Production Apache routing, FTPS GitHub Actions setup, dashboard subdomain architecture, required secrets, and the launch checklist are documented in [`docs/cpanel-deployment.md`](../docs/cpanel-deployment.md). The waitlist stores explicit marketing permission separately from privacy acceptance; bulk campaigns in the dashboard require both `marketing.read` / `marketing.send` custom-claim permissions and server-side consent enforcement.
