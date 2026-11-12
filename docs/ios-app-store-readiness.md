# iOS App Store readiness

## Readiness snapshot — revision 3 (12 November 2026)

The source review fixes are on `codex/separate-dashboard-into-routed-modules-fl7jlh`. The iOS app uses bundle ID `com.detail.app`, Sign in with Apple capability, Expo SDK 53, and a GitHub Actions simulator build pinned to macOS 26 / Xcode 26 or later. The production profile does not enable the client-side simulator. The simulator artifact built from `0282d535d5546c647ee9db003c6eb4f1728bb82d` was installed on a GitHub-hosted iPhone simulator and passed the welcome, sign-in, and create-account UI flow. The Appetize upload succeeded, but Appetize streaming was blocked by the account usage cap; screenshots and report are available in the [Maestro run artifacts](https://github.com/b45406809-ux/Detail/actions/runs/43133295332).

| Review area | Status | Result / remaining dependency |
| --- | --- | --- |
| iOS permission disclosures | Pass | Camera, foreground/background location, and call microphone purpose strings are in the resolved Expo config. The microphone is requested only for a call. |
| Privacy policy | Pass | Updated policy is available inside the app and at the website `/privacy` route. Both describe providers, location, retained chat, voice, marketing, and deletion. |
| Chat user safety | Pass in isolated source checks; Blocked for release | Chat now offers message/person reports, blocking, common abusive-language screening, and admin support review. A disposable PostgreSQL test verified directional block privacy and server enforcement. The migration is not deployed to the hosted backend pending an isolated QA project. Image reports still need human review. |
| Social sign-in configuration | Blocked for live iOS sign-in | The iOS Google button fails closed to email if the iOS OAuth client is absent. The protected configuration check confirms `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` is missing. Native Apple/Google sign-in still needs a physical iPhone check after configuring Google and Apple credentials. |
| Account deletion / Sign in with Apple | Blocked for automatic revocation | The app requests a fresh Apple authorization code, the backend verifies and revokes it, and the app provides Apple Settings instructions when automatic revocation is unavailable. `APPLE_CLIENT_SECRET` is missing from the protected GitHub environment; add it as a Supabase Edge Function secret, deploy the function, then verify with a dedicated Apple test account. |
| iOS 26 toolchain build | Pass | Xcode 26 built and uploaded the simulator app in [GitHub Actions run 43127962433](https://github.com/b45406809-ux/Detail/actions/runs/43127962433). |
| Welcome, sign-in, and create-account UI | Pass on simulator; Appetize streaming blocked | Maestro ran the three-screen flow on a GitHub-hosted iOS simulator using the pinned build artifact. It submitted no account. Appetize rejected session streaming because the account had reached its usage limit. Screenshots and the test report are retained in [run 43133295332](https://github.com/b45406809-ux/Detail/actions/runs/43133295332). |
| App Store Connect metadata and privacy labels | Blocked | No App Store Connect role/API key is available in this workspace. Privacy declarations, support/privacy URLs, age rating, screenshots, and reviewer notes still need the app owner’s ASC account. |
| Signed-device review | Not run | Test Apple sign-in, permission denial/recovery, account deletion, calls, camera/library access, and safe areas on a physical iPhone after a signed build is available. |

### Validation evidence for this revision

| Check | Status | Evidence |
| --- | --- | --- |
| `npm ci` for the mobile app, including native patch installation | Pass | Completed with the committed lockfile and all maintained patches applying. |
| Mobile TypeScript check and `expo install --check` | Pass | `npm run type-check`; `npx expo install --check`. |
| Supabase Edge Function type check | Pass | Deno 2.6.4 checked `marketplace-api`, `twilio-voice-token`, and `twilio-voice-twiml`. |
| Staging isolation and Google nonce tests | Pass | Eight staging build isolation and Google ID-token nonce tests passed. |
| iOS JavaScript bundle | Pass | `npx expo export --platform ios` bundled 4,062 modules after adding Expo Router’s missing `query-string` dependency. |
| iOS simulator build | Pass | `macos-26` / Xcode 26 built the release simulator app and uploaded it to Appetize from commit `0282d535d5546c647ee9db003c6eb4f1728bb82d`. |
| iOS simulator UI smoke | Pass | Maestro verified welcome → sign-in → create-account and captured three screenshots from that exact build artifact. Workflow run `43133295332`; no account was submitted. |
| Appetize interactive session | Blocked | App upload succeeded; Appetize returned an account usage-limit error when starting the streaming session. |
| Public website build | Pass | `npm run build --prefix site`; Vite reports one existing 593 kB JavaScript chunk advisory. |
| Chat safety migration and behavior | Pass | Migration applied to a disposable PostgreSQL 17 database. Synthetic customer, cleaner, and bystander checks covered block direction, nonparticipant denial, message idempotency, rejected abusive text, and direct-table privilege boundaries. No hosted data was used. |
| `git diff --check` | Pass | No whitespace errors. |
| Expo Doctor | Blocked by network | 15/18 checks passed; the remaining three checks could not reach Expo’s API or React Native Directory through this environment’s network proxy. No local app-config warning remains. |
| Appetize / Xcode 26 build for this source revision | Pass for build; streaming blocked | The pinned workflow built and uploaded the app. The Appetize session hit the usage cap, so equivalent screen checks ran on the GitHub-hosted iOS Simulator instead. |

Before submission, complete these Apple-side items:

- Enroll the organization in the [Apple Developer Program](https://developer.apple.com/programs/), register the App ID and Sign in with Apple capability, and configure distribution credentials in EAS.
- Create the app in [App Store Connect](https://appstoreconnect.apple.com/), then add the product name, description, category, support URL, privacy-policy URL, age rating, screenshots for the required device sizes, and review notes/test account.
- Complete [App Privacy details](https://developer.apple.com/app-store/app-privacy-details/) accurately for Supabase Auth, identity verification, precise booking location, photos, phone/email, analytics if enabled, and payment processing.
- Review the [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) for user-generated content, service marketplaces, payments, account deletion, privacy, and required moderation/support flows. Cleaning services are physical services, so do not add App Store in-app purchase for the booking charge; verify current policy and local payment obligations before release.
- Build and install a production-signed iOS artifact, test sign-in, account deletion, booking/cancellation, notifications, location permissions, camera/library permissions, payment status and payout support flows on real devices, then submit through EAS Submit or Transporter.

The environment blocks direct requests to `developer.apple.com` with an outbound proxy 403, so the official pages above were not live-verified during this implementation. Confirm the current review requirements and App Store Connect privacy declarations before submitting. No Apple team ID, signing credentials, support URL, screenshots, or reviewer account were present in the workspace, so those release inputs cannot be completed from source code alone.
