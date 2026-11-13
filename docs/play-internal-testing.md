# Android Play internal testing

The Android application ID is `zw.co.detailapp.mobile`. The iOS bundle ID stays `com.detail.app`. Changing the Android ID makes Android builds a separate install from older `com.detail.app` builds. Play Console package IDs are permanent once an app is created.

## One-time provider setup

1. In [Firebase Console](https://console.firebase.google.com/), open Detail’s existing Firebase project, then **Project settings → Your apps → Add app → Android**. Enter `zw.co.detailapp.mobile`, register the app, and download its `google-services.json`. Keep it in the same Firebase project so existing Auth and FCM services remain available.
2. In [Play Console](https://play.google.com/console/), open Detail → **Test and release → Setup → App integrity**. Copy the **App signing key certificate SHA-1**. In Firebase **Project settings → Your apps → Android app**, add that SHA-1. If testing a directly installed APK signed with the upload key, add that key’s SHA-1 too. The Play-installed app uses Google Play’s app-signing certificate.
3. In [Google Cloud Credentials](https://console.cloud.google.com/apis/credentials), configure the Web OAuth client used by the app. Add `https://<SUPABASE_PROJECT_REF>.supabase.co/auth/v1/callback` as an authorized redirect URI. Set the Web client ID in Supabase **Authentication → Sign In / Providers → Google** and as `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` in EAS and GitHub. The app exchanges Google ID tokens through Supabase; the Android client ID variable is not currently used by the mobile sign-in component.
4. In [Expo project credentials](https://expo.dev/accounts/detail-test/projects/detail/credentials), select Android credentials for `zw.co.detailapp.mobile`. Create or attach an Android keystore and add the Firebase Cloud Messaging V1 service-account key for push. The keystore is the Play **upload key** used by the GitHub build; Google Play App Signing uses a separate app-signing key for delivered installs.
5. For automatic Play uploads, enable the [Google Play Android Developer API](https://console.cloud.google.com/apis/library/androidpublisher.googleapis.com), create a service account in [Google Cloud Service Accounts](https://console.cloud.google.com/iam-admin/serviceaccounts), and grant it access to Detail in Play Console **Users and permissions** with permission to manage internal releases. Download its JSON key.
6. Upload the Firebase `google-services.json` as a **file environment variable** named `GOOGLE_SERVICES_JSON` in EAS’s **production** environment. Set `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` there as a text variable. The EAS app configuration validates that the Firebase file contains the new Android package.

## GitHub production environment

At [Detail GitHub environment settings](https://github.com/b45406809-ux/Detail/settings/environments), update the `production` environment:

- Replace `GOOGLE_SERVICES_JSON` with the new JSON file contents, or set `GOOGLE_SERVICES_JSON_BASE64` to its base64 contents. Do not keep the old package’s file under the name the workflow reads.
- Set `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` to the Web OAuth client ID (a public client ID, not a secret key).
- Add `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` with the Play service-account JSON as a protected secret.
- Keep the existing Expo token secret (`EXPO_TOKEN`, `EAS_BOT_ACCESS_TOKEN`, or `EAS_BOT_TOKEN_2`); the workflow reads those aliases. Also keep the existing Supabase and Mapbox build configuration.

Never paste private keys, service-account JSON, OAuth client secrets, or signing passwords into chat, source control, or workflow inputs.

## Build and distribute

The allowlisted **Detail allowlisted GitHub operations** workflow builds the signed AAB on GitHub Actions; this does not start an EAS cloud build.

1. Run **push-config-readiness** from `codex/separate-dashboard-into-routed-modules-fl7jlh` with `confirm_live_access=true`. It reports whether EAS has the new app’s signing key and FCM V1 credential, and whether GitHub has Firebase configuration. It does not print credential values.
2. Choose an unused Play version code greater than any bundle already uploaded. Run **play-internal-bundle** with that `android_version_code` and `confirm_live_access=true` to build and download the signed AAB artifact without uploading it.
3. Once the bundle is ready and the Play internal track/testers are configured, run **play-internal-release** with the same unused version code and `confirm_live_access=true`. The workflow uploads to the `internal` track using `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`.
4. Share the internal-testing opt-in link from Play Console with testers. Verify Google sign-in and push delivery on a Play-installed physical Android device.

The workflow reads the Android signing key from Expo credentials for `zw.co.detailapp.mobile`, writes it only to the runner’s temporary directory, and removes it after the job. If the Expo credential readiness check reports no key, create/attach it in the Expo credentials page before building. The Play submission service account is separate from the FCM V1 service account and from the upload key.
