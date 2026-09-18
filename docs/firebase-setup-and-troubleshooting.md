# Firebase setup and troubleshooting

## One project, multiple app registrations

A Firebase **Web app registration** and the Expo mobile registration may safely live in the same Firebase project. Their browser/native API keys and app IDs identify each client; they do not create separate Auth user pools or separate Firestore data by themselves.

When both clients use project `new1-4bb94`:

- Firebase Authentication users are project-wide, so the site and mobile app see the same Auth user directory.
- Cloud Functions are project-wide and the site/mobile clients must call the deployed region (`us-central1`).
- Cloud Storage uses the configured project bucket, although access still depends on Storage Rules.
- Firestore is shared only when both use the same database ID. Cloud Functions currently use the default Firestore database. Leave `EXPO_PUBLIC_FIRESTORE_DATABASE_ID` unset (or set it to `(default)`) unless the backend is deliberately changed to a named database.
- Waitlist entries are documents in `beta_waitlist`; they are not automatically mobile user profiles. This separation is intentional. A later onboarding/import workflow can turn a waitlist lead into an Auth/profile record without exposing the waitlist to the mobile client.

The Web Firebase configuration (`VITE_FIREBASE_*`) is public client configuration. A correct Web app registration is necessary, but it cannot create an administrator or deploy Functions.

## Why `auth/invalid-credential` occurs

`auth/invalid-credential` means Firebase Authentication could not authenticate that email/password pair. Adding an Admin SDK key to GitHub does **not** create an Auth user. Run the manual **Deploy Firebase backend** workflow with `bootstrap_admin=true` after configuring `INITIAL_ADMIN_PASSWORD`, or create the user in Firebase Authentication and apply custom claims with the bootstrap helper.

Required GitHub production configuration for backend deployment:

- Variable `FIREBASE_PROJECT_ID` (`new1-4bb94`)
- Variable `FIREBASE_PRIVATE_KEY_ID`
- Secret `FIREBASE_PRIVATE_KEY` (complete PEM including BEGIN/END lines)
- Optional variables `FIREBASE_CLIENT_EMAIL` and `FIREBASE_CLIENT_ID` (the workflow has this project's current non-secret defaults)
- Variable `INITIAL_ADMIN_EMAIL` (defaults to the initial owner email in the workflow)
- Secret `INITIAL_ADMIN_PASSWORD` (temporary; rotate immediately in the dashboard)

Also enable **Email/Password** under Firebase Console → Authentication → Sign-in method, and add `detail.co.zw` plus `dashboard.detail.co.zw` to Authentication → Authorized domains.

## Why the waitlist showed `internal[0]`

The cPanel workflow deploys only static browser files. If the updated `joinWaitlist` Function is not deployed, the new form calls the old backend schema and can fail. The backend workflow now deploys Functions, Firestore rules/indexes and Storage Rules whenever those paths change.

The updated Function also:

1. permits the `detail.co.zw` production origins;
2. validates the customer/cleaner waitlist schema;
3. commits the Firestore record before attempting confirmation email; and
4. logs a Resend/network failure without returning an opaque failure for a signup that was already stored.

After deployment, inspect Firebase Functions logs for `joinWaitlist` if an error remains. Confirm the site build has non-empty `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_PROJECT_ID`, and `VITE_FIREBASE_AUTH_DOMAIN`, and that the Functions region is `us-central1`.

## Service-account key safety

Never expose `FIREBASE_PRIVATE_KEY` as a `VITE_*` or `EXPO_PUBLIC_*` value; those values are bundled into client applications. Store it only as an encrypted GitHub Environment secret. The workflow writes it to an ephemeral runner file, restricts file permissions, and deletes it in an `always()` cleanup step.

If the JSON key or full private key was ever pasted into source code, a public issue, client bundle, or build output, revoke it in Google Cloud IAM immediately and create a replacement key. Merely naming the secret or sharing the service-account email/client ID is not equivalent to exposing the private key.

## GitHub workflow sequence

1. Add the variables/secrets above to the protected `production` Environment.
2. Run **Deploy Firebase backend** with `bootstrap_admin=false` once to deploy the corrected waitlist and invitation Functions.
3. Add `INITIAL_ADMIN_PASSWORD` as a temporary secret.
4. Run **Deploy Firebase backend** manually with `bootstrap_admin=true` once.
5. Sign in at `https://dashboard.detail.co.zw` with `INITIAL_ADMIN_EMAIL`, change the password, then remove or rotate `INITIAL_ADMIN_PASSWORD` in GitHub.

The static cPanel workflow and Firebase backend workflow are intentionally separate. Rebuilding the site does not create Auth users, set custom claims, or deploy callable Functions.
