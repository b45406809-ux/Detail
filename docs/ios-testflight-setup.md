# Detail iPhone setup and TestFlight

This guide takes Detail from an Apple Developer account to a signed iPhone build in TestFlight. Apple and Google console labels can change. Finish the steps in order and record the identifiers; never paste private keys or tokens into chat, a Git commit, a build log, or a public variable.

## Current project facts

- Expo project: [detail-test / detail](https://expo.dev/accounts/detail-test/projects/detail), project ID `560c0183-2f37-4d7a-8e4f-59b9b0bf9e85`.
- iOS bundle identifier in `mobile/app.json`: `com.detail.app`. Android uses `zw.co.detailapp.mobile`; they do not need to match.
- Display name on the phone: `Detail`. App Store listing name is configured in App Store Connect and can differ.
- Native Apple sign-in code and the Sign in with Apple entitlement are present. Native iOS Google sign-in requires both a Web client ID and iOS client ID.
- Prior simulator checks used an older commit. They are not evidence of a signed build or current-device behavior. Status of external credentials is not established by their names appearing in GitHub.
- The commission backend/migration has not been verified or deployed; do not assume a newly uploaded mobile app makes it live. Keep Paynow sandbox/live status clear to testers.

## 1. Apple membership and account

1. Sign in to [Apple Developer Account](https://developer.apple.com/account/) with the Apple ID for the business. Confirm that the [Apple Developer Program](https://developer.apple.com/programs/) membership is active and its agreements are accepted. An Apple ID alone is not sufficient. Apple requires two-factor authentication.
2. If enrolling as an organization, follow Apple's enrollment instructions and provide the business information and D-U-N-S number Apple requires. The Account Holder may have to accept agreements and invite other users.
3. Record the **Team ID** shown in the membership/account area. Do not confuse it with the App Store Connect API **Issuer ID** or an API **Key ID**.
4. Open [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list). Under **Identifiers**, create an **App ID → App**. Use the explicit bundle ID `com.detail.app` only if Apple allows your team to register it. Enable **Sign in with Apple**, and enable Push Notifications as needed for APNs. Save.
5. If `com.detail.app` is unavailable, choose a globally unique ID you control before proceeding. It must be changed consistently in `mobile/app.json`, Apple App ID, App Store Connect, Google iOS OAuth client, Apple provider audiences and backend `APPLE_CLIENT_ID`; rebuild and reconfigure sign-in. Do not change the Android package. Existing iOS installations using the old bundle ID are a separate app.

## 2. Create the app in App Store Connect

1. Open [App Store Connect](https://appstoreconnect.apple.com/) → **Apps** → **+** → **New App**.
2. Select iOS, enter the store name and primary language, choose the exact App ID created above, and enter an internal SKU such as `detail-ios-001`. SKU is your own unique identifier. Create the record.
3. Find and record its numeric **Apple ID** in **App Information**. This is the App Store Connect app ID, not your personal Apple ID.
4. On the **TestFlight** tab, create an internal testing group and add team members. Apple may require compliance information or agreements before testing. External testers and builds can require TestFlight App Review. See [TestFlight documentation](https://developer.apple.com/testflight/) and [App Store Connect help](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/).

## 3. iOS signing and App Store Connect API access

An iPhone TestFlight build needs an Apple Distribution certificate and an App Store provisioning profile. An iOS **simulator** build cannot be uploaded as a TestFlight build. Expo can manage the certificate/profile after an authorized team member completes interactive setup.

1. On a computer, install Node.js and run `npm ci --prefix mobile` in the repository. Log in with `npx eas-cli@16.28.0 login` and verify `npx eas-cli@16.28.0 whoami`. The account must have access to `detail-test/detail`.
2. In `mobile`, run `npx eas-cli@16.28.0 credentials -p ios`. Select the **production** build profile, the correct Apple team and `com.detail.app`. Let EAS create or attach a distribution certificate and App Store provisioning profile. Follow interactive Apple prompts. Keep the same signing credentials for subsequent releases; don't delete an existing working certificate merely to start over.
3. For automated submission, create an App Store Connect API key in [Users and Access → Integrations](https://appstoreconnect.apple.com/access/integrations/api) if your Apple role permits it. Follow [Apple's API key instructions](https://developer.apple.com/documentation/appstoreconnectapi/creating-api-keys-for-app-store-connect-api). Choose only the permissions necessary for TestFlight submission. Download the `.p8` once and securely record the Key ID and Issuer ID.
4. Configure EAS Submit credentials for the iOS app using the interactive EAS credentials/submit prompts. The API key for submission is separate from the Sign in with Apple key and APNs key. Configure the numeric App Store Connect app ID if EAS asks; the `submit.production.ios` profile is currently empty. See [EAS Submit for iOS](https://docs.expo.dev/submit/ios/) and [iOS credentials](https://docs.expo.dev/app-signing/app-credentials/).
5. A GitHub workflow can trigger EAS using an Expo access token. The Apple distribution and submit credentials must already be accessible to EAS; adding only an Expo token to GitHub does not create them. EAS remote builds consume the account's build quota and may incur charges. A GitHub runner triggering EAS does not avoid EAS build limits.

## 4. Sign in with Apple

The native app sends Apple's identity token to Supabase. Configure the Apple provider using the [Supabase Apple sign-in guide](https://supabase.com/docs/guides/auth/social-login/auth-apple) and Apple's [Sign in with Apple configuration](https://developer.apple.com/sign-in-with-apple/get-started/).

1. Confirm the App ID's **Sign in with Apple** capability is enabled. Configure Apple's private email relay for your sending domain if you email Apple relay addresses: [Apple private email relay](https://developer.apple.com/help/account/capabilities/configure-private-email-relay-service/).
2. Open your [Supabase project](https://supabase.com/dashboard/projects) → **Authentication → Sign In / Providers → Apple**. Enable Apple and follow Supabase's current native iOS instructions. Make sure `com.detail.app` is accepted as the native client/audience. Where the Supabase UI asks for multiple client IDs, include the App ID and any separate Services ID required by your chosen web flow.
3. A Services ID, Sign in with Apple `.p8` key and an Apple client-secret JWT may be required for Supabase's OAuth/web flow. Create them through Apple's Identifiers and Keys pages following Supabase's guide, using the exact Supabase callback URL shown in that dashboard. A Services ID is distinct from the native bundle ID. Do not substitute the App Store Connect submission API key.
4. **Account deletion is separate:** Detail's `marketplace-api` uses `APPLE_CLIENT_ID` (normally `com.detail.app` for this native app) and `APPLE_CLIENT_SECRET` to exchange and revoke an Apple authorization code. `APPLE_CLIENT_SECRET` is a signed Apple client-secret JWT for the matching native client ID, team and Sign in with Apple key—not the `.p8` contents or the App Store Connect API key. JWTs expire (Apple permits at most six months); rotate before expiry. Store it as a GitHub production secret and Supabase Edge Function secret. The Supabase Apple provider's secret may use a Services ID as its client ID; do not blindly reuse a JWT whose `sub` targets a different identifier. See [Apple token revocation](https://developer.apple.com/documentation/signinwithapplerestapi/revoke-tokens).
5. Deploy the backend with the secrets configured. Test a fresh Apple ID, a returning account, Hide My Email, cancellation and account deletion on a real iPhone. Check that the correct existing user is used, and verify the revocation result. If revocation fails the app currently gives the user Apple Settings instructions; investigate rather than marking automatic revocation verified.

## 5. Google sign-in on iPhone

1. Open [Google Cloud Credentials](https://console.cloud.google.com/apis/credentials) in the same Google project used for Detail sign-in. Configure the OAuth consent screen and add test users if the app remains in testing mode.
2. Create an **OAuth client ID → iOS** with bundle ID `com.detail.app`. Copy the resulting client ID ending in `.apps.googleusercontent.com`.
3. Keep the existing **Web application OAuth client** used by Supabase. In [Supabase Auth providers](https://supabase.com/dashboard/projects), confirm Google remains enabled with its Web client ID and client secret. Its callback is the exact URL displayed by Supabase under that provider; register that URL with the Web OAuth client if the flow uses it.
4. Set `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` to the iOS client ID and `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` to the Web client ID in the **EAS production environment**. Set the same values as GitHub production environment variables if you want the readiness check to report them. These client IDs are public identifiers, not OAuth client secrets. The iOS URL scheme is derived automatically from the iOS client ID by `mobile/app.config.js` at build time.
5. Supabase must accept the audiences used by the Google ID tokens; follow its provider instructions for multiple client IDs. Rebuild after changing an iOS client ID or bundle ID. On an iPhone, test a new and returning account and verify which Supabase user was created.

## 6. Push notifications and calls

1. In Apple Developer, create an **APNs authentication key** with Push Notifications enabled; download `.p8` once and record its Key ID and Team ID. See [Expo's iOS push setup](https://docs.expo.dev/push-notifications/push-notifications-setup/).
2. In Expo project credentials, or with `eas credentials -p ios`, attach the APNs key for `com.detail.app` as instructed by EAS. Verify the correct Apple team. Expo push and Twilio incoming-call push are separate configurations even if the same Apple team/key is permitted.
3. For iOS Twilio Voice incoming calls, create/configure the relevant Twilio iOS push credential using Twilio's current instructions: [Twilio Voice iOS push credentials](https://www.twilio.com/docs/voice/sdks/ios/get-started). Configure `TWILIO_VOICE_PUSH_CREDENTIAL_SID_IOS` in the backend via protected secrets. Test incoming calls, microphone and background handling on a physical iPhone; a simulator cannot establish APNs/CallKit readiness.
4. Confirm notification permission is granted and the app obtains a push token. Send only an authorized test notification to your own device, then check delivery while foregrounded, backgrounded and after relaunch.

## 7. Expo and GitHub environment configuration

Open [Expo environment variables](https://expo.dev/accounts/detail-test/projects/detail/environment-variables) and select **production**. The EAS production build executes remotely and uses the EAS environment—not a GitHub runner's environment. Set these values for the correct production project:

| EAS variable | Purpose |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase HTTPS project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase publishable or legacy anon key; never service-role/JWT signing secret |
| `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN` | Public Mapbox token |
| `MAPBOX_DOWNLOADS_TOKEN` | Private Mapbox downloads token; mark secret |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | Existing Web OAuth client ID |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | New iOS OAuth client ID |

Review all other product-specific production values and feature switches before building. Public-prefixed variables are embedded in the app and must not contain secrets. Use EAS secret visibility for private tokens. Do not reuse Android `GOOGLE_SERVICES_JSON` as an iOS Firebase configuration; this app's iOS auth uses Supabase.

In [GitHub production environment](https://github.com/b45406809-ux/Detail/settings/environments), set an Expo access token as `EXPO_TOKEN` (or an existing alias supported by the workflow). The workflow checks for Google client IDs and `APPLE_CLIENT_SECRET` in GitHub but **does not copy them into EAS or Supabase**. Configure each destination explicitly. `APPLE_CLIENT_SECRET` must also be set in Supabase function secrets for account deletion.

## 8. Build and upload through GitHub Actions

Open [iOS TestFlight operations](https://github.com/b45406809-ux/Detail/actions/workflows/ios-testflight.yml) → **Run workflow** and select the branch containing the workflow. New workflow files generally need to exist on the repository's default branch before GitHub shows them for manual dispatch.

1. Run `readiness`. It checks the presence of GitHub inputs and runs the mobile TypeScript check. It does **not** prove that EAS variables, Apple signing, App Store Connect access, Supabase provider configuration, or push credentials work.
2. Run `build`. It requests an EAS production iOS build and returns without waiting. Track the build, build ID, logs and quota in the [Expo project build list](https://expo.dev/accounts/detail-test/projects/detail/builds). The EAS production profile uses remote versioning and auto-increment. Check that the completed build is iOS, production, from the intended commit and points to the intended backend. EAS credentials must already be ready for noninteractive builds.
3. When the build completes successfully, run `submit`, enter its EAS **build UUID**, and select `confirm_testflight_submission`. EAS Submit submits that build to App Store Connect; the GitHub run starts the submission and does not wait for Apple processing. Follow status in Expo and App Store Connect → **TestFlight**.
4. Add the processed build to the internal testing group. Complete required encryption/compliance questions. Wait for Apple processing, invite testers and install it from Apple's TestFlight app. External testing may require beta review.
5. Test the listed sign-in, push, camera, voice, booking and deletion journeys on a real device. Do not use actual funds or real identity documents unless intentionally conducting an authorized provider test.

Manual alternative from `mobile`: `npx eas-cli@16.28.0 build -p ios --profile production`, then `npx eas-cli@16.28.0 submit -p ios --profile production --id <EAS_BUILD_UUID>`. Interactive prompts can help complete credentials. EAS cloud build quota applies.

## 9. Troubleshooting

- **App ID unavailable:** use a unique iOS bundle ID and update all matching provider configurations before the first signed build.
- **Signing/profile mismatch:** compare Apple Team ID, App ID, EAS provisioning profile and target bundle ID; use the existing distribution credential where appropriate.
- **Apple sign-in fails:** check the capability, Supabase Apple provider and native audience, device Apple ID and the exact error. For deletion, check the native `APPLE_CLIENT_ID`, JWT issuer/key/sub/expiry and backend deployment.
- **Google sign-in unavailable:** both Web and iOS IDs must be present in the EAS production build; the reversed URL scheme is built from the iOS ID. Rebuild after changes.
- **No push:** check APNs key, bundle ID, entitlements, EAS credentials, permission and physical device. Voice uses Twilio's push configuration too.
- **Upload rejected:** check API key permissions, numeric App Store Connect app ID, accepted agreements, unique build number and Apple processing. View EAS Submit logs; a successful GitHub dispatch is not proof of Apple acceptance.
- **Missing GitHub secrets:** use environment `production` and verify secret names, without printing values. `readiness` only checks presence; Expo token permissions, Apple team membership and provider configuration need separate checks.

## 10. Store listing and review

For distribution beyond internal testing, complete [App Store privacy details](https://developer.apple.com/app-store/app-privacy-details/), privacy policy/support URLs, age rating, accurate descriptions/screenshots, encryption declarations, review notes and a reviewer test account. Review Apple's current [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/). Keep claims aligned with actually deployed booking and payment features.
