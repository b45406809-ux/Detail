# Android Play internal testing

Use the allowlisted GitHub operations workflow on `codex/separate-dashboard-into-routed-modules-fl7jlh`. `play-internal-bundle` builds a signed `.aab` on a GitHub runner using the existing Expo Android upload key. `play-internal-release` also uploads that bundle to the Play internal testing track. Neither task starts an EAS build.

Before running it:

- Create or identify the `com.detail.app` app in Play Console and determine an unused version code. The workflow requires this as `android_version_code`; choose a value above every bundle already uploaded to Play.
- Add the Firebase Android app's `google-services.json` to the protected GitHub production environment as `GOOGLE_SERVICES_JSON` (JSON text) or `GOOGLE_SERVICES_JSON_BASE64`. Its package must be `com.detail.app`.
- Upload the matching Firebase Cloud Messaging V1 service-account credential to the Expo project's Android push credentials. This is required for push delivery; it is separate from the Play submission service account.
- For `play-internal-release`, grant a Google Play service account access to the app and internal releases, and add its JSON key as the protected GitHub production environment secret `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`.
- Configure the internal testing track and its tester list in Play Console. Google distributes the internal test through the track's opt-in link.

Dispatch the chosen task with `confirm_live_access=true` and the chosen version code. The release task requires an existing accessible Play app with package `com.detail.app`, a matching upload key and an eligible internal track. Google Play may require initial app setup or the first upload in Play Console. The workflow checks inputs before signing, fetches the signing key into the runner's temporary directory, deletes temporary credentials at the end, and saves the signed bundle as an artifact. Do not put keys, passwords or tokens in the repository or logs.

After distribution, verify Google sign-in and phone/email authentication on the installed Play build, then grant notifications and verify an actual push on a physical Android device. A build or token registration alone does not prove delivery.
