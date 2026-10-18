# API credentials for live tests

This guide lists the external services the current code calls, where to get their credentials, and where each value belongs. **No provider secret values are stored in this repository.** In this workspace, no local Firebase, Didit, Resend, Turnstile, Cloudflare, or PesePay credentials are currently available, so authenticated live API tests cannot run until they are restored. Do not paste secret values into chat, source files, screenshots, or commits.

## Credentials used by the current code

| Service and use | Variables / credentials | Get them |
| --- | --- | --- |
| Firebase mobile and web Auth, Firestore, Storage, Functions | Mobile: `EXPO_PUBLIC_FIREBASE_API_KEY`, `EXPO_PUBLIC_FIREBASE_APP_ID`, `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`, `EXPO_PUBLIC_FIREBASE_PROJECT_ID`, `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET`, optional `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `EXPO_PUBLIC_FIREBASE_DATABASE_URL`, `EXPO_PUBLIC_FIRESTORE_DATABASE_ID`. Website: `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_FUNCTIONS_REGION`. | [Firebase project settings](https://console.firebase.google.com/project/new1-4bb94/settings/general) → **General → Your apps**. These are public client configuration values, not server credentials. |
| Firebase Functions deploy and live KYC, custom-token login, organization, and search callables | `FIREBASE_PROJECT_ID`, `FIREBASE_PRIVATE_KEY_ID`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_CLIENT_ID`; locally, Firebase CLI login or `GOOGLE_APPLICATION_CREDENTIALS`. | [Google Cloud service accounts](https://console.cloud.google.com/iam-admin/serviceaccounts?project=new1-4bb94). Prefer GitHub OIDC/Workload Identity Federation over long-lived JSON keys. If using the current workflow, add the key ID as the `FIREBASE_PRIVATE_KEY_ID` variable, the private key as the `FIREBASE_PRIVATE_KEY` secret, and the service-account email/client ID as variables in the [GitHub production environment](https://github.com/b45406809-ux/Detail/settings/environments). The Functions runtime service account also needs `iam.serviceAccounts.signBlob` (Service Account Token Creator) for email-code custom tokens. |
| Didit cleaner identity verification | Firebase secret `DIDIT_API_KEY`; Functions parameter `DIDIT_WORKFLOW_ID`. | [Didit dashboard](https://business.didit.me/) → API/developer credentials and create a workflow for Zimbabwe. Check [Zimbabwe coverage](https://didit.me/solutions/countries/zimbabwe/) and [Didit API docs](https://docs.didit.me/). Add the API key with `firebase functions:secrets:set DIDIT_API_KEY`; provide the workflow ID through the Firebase Functions deployment prompt or the project's Functions parameter configuration. |
| Resend email-code login, waitlist email, and marketing email | Firebase secret `RESEND_API_KEY`; the sender is `hello@detailapp.co.zw`. | Create a key in [Resend API Keys](https://resend.com/api-keys) and verify `detailapp.co.zw` in [Resend Domains](https://resend.com/domains). Add it with `firebase functions:secrets:set RESEND_API_KEY`; add the same secret to the GitHub `production` environment for the Cloudflare waitlist deployment. |
| Cloudflare Turnstile on the public waitlist | Browser key `VITE_TURNSTILE_SITE_KEY`; server secret `TURNSTILE_SECRET`. | Create a widget in [Cloudflare Turnstile](https://dash.cloudflare.com/?to=/:account/turnstile). Put the site key in the site build environment and the secret in Firebase Functions Secret Manager and GitHub `production` secrets. Use separate test keys for local testing when possible. |
| Cloudflare D1 waitlist Worker deployment | `CLOUDFLARE_ACCOUNT_ID`; secret `CLOUDFLARE_API_TOKEN`. | Find the account ID in the [Cloudflare dashboard](https://dash.cloudflare.com/). Create a scoped token at [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens) with **D1: Edit** and **Workers Scripts: Edit** for this account. Store both in GitHub `production` variables/secrets. |
| PesePay wallet top-ups and payment verification | Firebase secrets `PESEPAY_INTEGRATION_KEY`, `PESEPAY_ENCRYPTION_KEY`. | Obtain the integration and encryption keys from the [PesePay merchant portal](https://pesepay.com/) or PesePay support. Store with `firebase functions:secrets:set PESEPAY_INTEGRATION_KEY` and `firebase functions:secrets:set PESEPAY_ENCRYPTION_KEY`. Use provider sandbox credentials and callback URLs for tests. **The current backend still calls PesePay. Paynow is not integrated yet, and there are no Paynow variables used by the code.** |
| PostHog consent-gated website analytics (optional) | `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST` (defaults to `https://us.i.posthog.com`). | Create a project in [PostHog](https://us.posthog.com/) and find the project API key in project settings. The key is a public project identifier; analytics remains disabled until consent. |
| Google OAuth for mobile sign-in (optional) | `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`. | Enable Google in [Firebase Authentication providers](https://console.firebase.google.com/project/new1-4bb94/authentication/providers). Get the web client ID there. Create a separate Android OAuth client in [Google Cloud Credentials](https://console.cloud.google.com/apis/credentials?project=new1-4bb94), using package `com.detail.app` and the signing SHA-1 from `eas credentials`. Set the values using [EAS environment variables](https://expo.dev/accounts/detail-test/projects/detail/environment-variables) or local `mobile/.env.local`. |
| Apple OAuth for iOS sign-in (optional) | No `EXPO_PUBLIC_*` API key; Apple/Firebase provider configuration is required. | Configure the iOS app and Sign in with Apple in the [Apple Developer account](https://developer.apple.com/account/resources/identifiers/list), then configure the provider in [Firebase Authentication](https://console.firebase.google.com/project/new1-4bb94/authentication/providers). |

## Local development variables

Keep mobile client configuration in `mobile/.env.local` (or EAS environment variables) and website configuration in `site/.env.local`. Start from the checked-in examples: [`.env.example`](../.env.example) and [`site/.env.example`](../site/.env.example). `EXPO_PUBLIC_*` and `VITE_*` values are embedded in client apps/sites; only put public client configuration there. Never place service-account private keys, payment keys, Didit keys, Resend keys, or Turnstile secrets in either file.

For local Functions tests, configure Firebase CLI access and use the emulators where practical. Set `EXPO_PUBLIC_SIMULATE_FUNCTIONS=false` for true callable tests, `EXPO_PUBLIC_DEMO_MODE=false`, and leave the emulator flags off only when deliberately targeting a test Firebase project. The code has separate controls for `EXPO_PUBLIC_USE_FIREBASE_EMULATOR`, `EXPO_PUBLIC_USE_FUNCTIONS_EMULATOR`, `EXPO_PUBLIC_USE_STORAGE_EMULATOR`, and `EXPO_PUBLIC_EMULATOR_HOST`.

Set backend-only secrets through the Firebase prompt instead of a file:

```bash
firebase use new1-4bb94
firebase functions:secrets:set DIDIT_API_KEY
firebase functions:secrets:set RESEND_API_KEY
firebase functions:secrets:set TURNSTILE_SECRET
firebase functions:secrets:set PESEPAY_INTEGRATION_KEY
firebase functions:secrets:set PESEPAY_ENCRYPTION_KEY
```

Only configure the providers being tested. Configure `DIDIT_WORKFLOW_ID` separately as a Firebase Functions parameter; it is an identifier, not a secret. Deploy the backend after setting secrets and parameters:

```bash
firebase deploy --only functions,firestore:rules,firestore:indexes
```

## Site and deployment variables

The cPanel workflow also needs `FTP_SERVER`, `FTP_USERNAME`, and `FTP_PASSWORD` as GitHub `production` secrets. Its website build uses `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_FUNCTIONS_REGION`, `VITE_TURNSTILE_SITE_KEY`, and optional `VITE_POSTHOG_KEY` / `VITE_POSTHOG_HOST`. The Firebase deployment workflow uses the service-account settings above. Initial administrator bootstrap additionally needs `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD`; no administrator email is prefilled.

## Placeholders that are not current integrations

`STRIPE_SECRET_KEY`, `VITE_GOOGLE_MAPS_API_KEY`, and `VITE_MAPBOX_ACCESS_TOKEN` appear in the root example file but are not referenced by the current source. Do not spend time generating them for these tests. Native map rendering uses `react-native-maps`; a separately configured Google Maps SDK key is not wired through `app.json` today. Paynow is also not wired yet. Those integrations require code/config work before their keys would be used.
