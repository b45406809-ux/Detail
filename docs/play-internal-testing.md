# Android Play internal testing

Use the `play-internal-bundle` task in the allowlisted GitHub operations workflow on `codex/separate-dashboard-into-routed-modules-fl7jlh`. It builds a signed `.aab` on a GitHub runner, using the existing Expo Android upload key. It does not start an EAS build or submit the app to Google Play.

Before running it:

- Create or identify the `com.detail.app` app in Play Console and determine an unused version code. The workflow requires this as `android_version_code`; choose a value above every bundle already uploaded to Play.
- Add the Firebase Android app's `google-services.json` to the protected GitHub production environment as `GOOGLE_SERVICES_JSON` (JSON text) or `GOOGLE_SERVICES_JSON_BASE64`. Its package must be `com.detail.app`.
- Upload the matching Firebase Cloud Messaging V1 service-account credential to the Expo project's Android push credentials. This is required for push delivery; it is separate from the Play submission service account.
- For automated Play submissions, configure a Google Play service account with appropriate access and add it to Expo's Android submission credentials. Otherwise, an authorized Play Console user can upload the generated bundle manually.
- Configure the internal testing track and its tester list in Play Console. Google distributes the internal test through the track's opt-in link.

Dispatch `play-internal-bundle` with `confirm_live_access=true` and the chosen version code. The workflow checks its inputs before signing, fetches the existing signing key into the runner's temporary directory, deletes temporary credentials at the end, and uploads only the signed bundle as an artifact. Do not put signing keys, passwords, Firebase service-account keys or tokens in the repository or logs.

After distribution, verify Google sign-in and phone/email authentication on the installed Play build, then grant notifications and verify an actual push on a physical Android device. A build or token registration alone does not prove delivery.
