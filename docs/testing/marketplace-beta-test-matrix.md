# Marketplace beta test matrix

**Version:** 1.9
**Updated:** 2026-11-10
**Branch:** `codex/separate-dashboard-into-routed-modules-fl7jlh`

Statuses are **Pass**, **Fail**, **Blocked**, or **Not run**. Local tests do not prove hosted free-plan capacity, and UI readiness times include Appetize automation/network overhead.

## Test matrix

| Area | Status | Scope and result |
| --- | --- | --- |
| CI, dashboard, mobile, Supabase migrations and Edge Functions | Pass | Full successful run 42761794028 on commit `b29d25a`: site/dashboard, mobile type-check and lint, Google nonce tests, local Supabase migrations/security/pgTAP, Edge Function checks, and authenticated dashboard journeys passed. The only lint output was the repository's existing unused-import warnings. |
| Concurrent registration burst | Pass | Corrected run 42755759601: 20/20 local synthetic Auth registrations and profiles persisted at concurrency 20; 0 failed; p50 825 ms, p95 854 ms, p99 967 ms. All 20 local accounts were deleted. No hosted accounts or provider messages were created by this pressure test. |
| Booking write pressure | Pass | Corrected run 42755759601: 10,000/10,000 synthetic booking RPC writes persisted at concurrency 100; 0 failed; p50 241 ms, p95 904 ms, p99 1,379 ms (306 bookings/s). The 1,000 synthetic cleaners were unverified and offline; eligible cleaner count and dispatch notifications were both zero. This confirms the KYC dispatch gate and booking writes, not a full accepted-booking marketplace flow or hosted free-tier capacity. |
| Android build and current Appetize upload | Pass | Direct GitHub Actions build run 42745938717 built commit `803be2234625597075d6d8d27ec2d44d70ce68a4`, uploaded target `qnjjqo4sz4kcis73grjirqur7e`, and saved the home screenshot artifact. No EAS build was run. Android Firebase config was absent in this artifact, so push delivery is not covered. |
| Android customer routes on pinned Appetize build | Pass | Expanded run 42750004390 used target `qnjjqo4sz4kcis73grjirqur7e`, source commit `803be2234625597075d6d8d27ec2d44d70ce68a4`, source build run 42745938717. Sign-in, customer agreement/profile/permissions onboarding, service selection through booking details, and persisted profile state passed; no booking was submitted. Auth recovery, reset password, and email-code-entry screens rendered before sign-in. Twenty-five marketplace/account/legal routes rendered in 0.73–2.22 s (median 1.38 s): tabs, history, favorites, cleaner search, notifications, reviews, help/support, organization, email, portfolio, instant offers, announcement, not-found, policies, booking form, offers/confirmation, job, and tracking states. Two disposable accounts were deleted. |
| Android cleaner onboarding and server gates | Pass | Fresh-build run 42750487343 used target `qnjjqo4sz4kcis73grjirqur7e` from build run 42745938717. UI reached the Didit identity gate; the backend returned HTTP 409 for both unverified `submitCleanerApplication` and `setActiveRole`. Persisted gate state was checked; both disposable accounts were deleted. No KYC session was created. |
| Android email registration | Pass | Run 42744667151 used the same pinned target and AgentMail test inbox. A fresh email code was received and accepted; Auth/profile/agreement state persisted; the one disposable account was deleted. One test verification email was sent. The underlying provider's sandbox/live mode was not independently established. |
| Reported Google Sign-In nonce error | Pass | Commit `803be22` sends the original nonce to Supabase only when Google's ID token contains a nonce claim; three focused tests and mobile CI pass, and the fresh APK contains the fix. A real Google account sign-in is separately not run. |
| SMSPoP API payload | Pass | Run 42747410823 sent one harmless test SMS to the protected test recipient. SMSPoP reported `sent` and 1 credit used. This confirms provider API acceptance, not carrier delivery or the Supabase Auth OTP hook end-to-end. The local Auth-hook payload tests pass in CI. |
| Full app marketplace booking/bid/chat/tracking/completion/payment lifecycle | Blocked | Protected project inventory reads the current project, but project creation still returns HTTP 403 (run 42758089450). The current Appetize build points at the hosted project; no job was posted, no real cleaner was notified, and no payment/KYC/payout was attempted. Local database and Edge Function tests cover lifecycle transitions and access control but do not replace a two-account UI transaction. |
| iOS simulator build and Appetize upload | Pass | Direct GitHub Actions/Xcode build run 42755155542 built source commit `aca6b1babbd314073b0ceb9bf4239ef18ea9ab53` and uploaded immutable iOS target `q3s6mu5wgdv5tlovezm776wequ`; no EAS build was used. The target launched and displayed onboarding and the customer home screen. |
| iOS customer route sweep | Fail | Run 42761352687 used pinned target `q3s6mu5wgdv5tlovezm776wequ`, source commit `aca6b1babbd314073b0ceb9bf4239ef18ea9ab53`, source build run 42755155542, and two disposable accounts (both deleted). Sign-in, agreement/profile onboarding, location-permission handling, home, and entry to booking-category selection rendered. The run stopped because Appetize could not tap the visible “House Cleaning” child text. This is a test selector failure; no app defect was established, and no booking was submitted. Workflow commit `b29d25a` now uses a visible-position tap and saves the category screenshot, but it could not be exercised: run 42761805384 was blocked before account creation because Appetize reported that the account had reached its streaming usage limit. The remaining iOS routes and screen timings are not verified. |
| Paynow, Didit, push, campaigns, and Twilio Voice provider transactions | Not run | No Paynow checkout, identity verification, push/campaign delivery, or voice call was made. Protected presence run 42757787278 found Paynow integration secrets missing, Didit API key/workflow ID present but KYC secret missing, and Twilio Voice-specific credentials missing. Presence does not establish sandbox mode; values were never read or changed. |
| Twilio in-app calling and usage display | Blocked | Chat call controls, authenticated participant checks, signed Voice tokens, the client cutoff, and server TwiML `timeLimit=300` are implemented and covered by local tests. The admin overview separates account-wide prior-month Twilio Voice usage from SMS. Only Twilio account SID/auth token/Messaging Service SID exist for messaging; Voice API key ID/secret, TwiML App SID, and both platform push credential SIDs are missing, so no call or live Voice meter was verified. Usage cannot be attributed to Detail calls. |
| Physical Android/iPhone checks | Not run | Permission denial/recovery, actual push delivery, location backgrounding, camera/photo access, Google/Apple sign-in, incoming-call audio/CallKit/PushKit, large text, and real-device layout require physical devices and confirmed test configuration. |

## Android route readiness times

Run 42750004390 measured `open` until the expected screen text was visible. These include Appetize and network overhead and are not device benchmarks. Welcome, sign-in, agreement/profile/permissions onboarding, and booking service selection were also visibly checked, but were not individually timed. GitHub masked the timing values attached to the two password-route labels.

| Screen | Time to expected content |
| --- | ---: |
| Activity tab | 1,596 ms |
| Messages tab | 1,250 ms |
| Wallet tab | 2,218 ms |
| Profile tab | 727 ms |
| Service history | 1,857 ms |
| Favorites | 1,040 ms |
| Cleaner search | 907 ms |
| Notifications | 1,320 ms |
| Reviews | 1,231 ms |
| Help | 1,466 ms |
| Support requests | 1,659 ms |
| Organization | 1,666 ms |
| Account email | 1,216 ms |
| Portfolio | 1,400 ms |
| Instant offers | 1,376 ms |
| Announcement detail | 1,833 ms |
| Unknown route / not found | 853 ms |
| Privacy policy | 910 ms |
| Customer agreement | 1,384 ms |
| Cleaner agreement | 1,408 ms |
| Booking creation | 1,446 ms |
| Booking offers, unknown ID | 1,566 ms |
| Booking confirmation, unknown ID | 1,370 ms |
| Job, unknown ID | 1,204 ms |
| Tracking, unknown ID | 1,474 ms |
| Forgot password | Rendered; value masked in GitHub log |
| Reset password | Rendered; value masked in GitHub log |
| Email verification code | 2,129 ms |

## Provider mode and use evidence

Provider key values were not read, printed, exported, or changed. A key name or secret presence cannot establish sandbox mode.

| Provider | Verified in this test pass | Sandbox/live mode |
| --- | --- | --- |
| Supabase | Appetize used the configured hosted project for disposable sign-in/profile checks; local Supabase handled the concurrency and booking pressure tests. A protected management token can read project metadata, but create returned HTTP 403. | Hosted project is not an isolated QA project. No marketplace booking was submitted. Plan was not returned by the metadata endpoint. |
| Resend / Supabase email | `RESEND_API_KEY` is configured; one email code reached the controlled AgentMail inbox and was accepted. | The SMTP/API key mode was not verified. |
| SMSPoP | One harmless test SMS was accepted by the API; provider reported one credit used. | API acceptance does not prove sandbox mode or handset delivery. |
| Paynow | No payment, refund, wallet top-up, or withdrawal was attempted. The integration ID/key are absent from GitHub and Supabase secrets in protected check 42757787278; webhook/reconcile functions are deployed. | No sandbox transaction has been confirmed. |
| Didit | API key and workflow ID are present; KYC secret is missing. No KYC session was created; the unverified cleaner remained blocked by the backend. | Usage was reported exhausted; sandbox mode was not verified. |
| Mapbox | The home map rendered in Appetize. No usage/billing endpoint was polled. | App token is used for map rendering; no sandbox or cost report was established. |
| Firebase / Expo Push | No push was sent; Android Firebase configuration was absent from the APK build environment. | Push configuration and delivery mode were not verified. |
| Twilio Voice | App call code and the 300-second server limit have local coverage; no provider call or usage request was made. | Account/messaging secrets are set, but Voice API key, TwiML App, and platform push credentials are missing. Mode is unknown. |
| Google / Apple sign-in | Google nonce handling has focused unit tests; no native provider login was completed. Android and Web Google client IDs are configured; iOS Google client ID is missing. | OAuth project mode and Apple sign-in configuration were not verified. |
| PostHog, Turnstile, Cloudflare R2 | No usage report was polled or deliberate analytics event sent; no Turnstile challenge or media upload was run. Route navigation and map rendering may generate routine app analytics/map requests. | No sandbox/billing mode was verified. |

## Bug register

| ID | Finding | Status | Evidence / follow-up |
| --- | --- | --- | --- |
| B-01 | Campaign waitlist UI had malformed JSX and its SQL enqueue query used an invalid lateral alias. | Fixed | Existing CI and local migration tests pass. |
| B-02 | A campaign regression fixture could collide with the auth-triggered profile row. | Fixed | Fixture uses an upsert; local pgTAP passes. |
| B-03 | Dashboard route smoke test expected a menu label instead of the rendered page heading. | Fixed | Authenticated dashboard journey passes in run 42746904371. |
| B-04 | Concurrent local booking writes previously hit transient PostgREST pool acquisition limits under a heavy synthetic notification workload. | Partially resolved / capacity signal | Corrected run 42755759601 persisted all 10,000 booking writes at concurrency 100 with no pool retries, while dispatch correctly produced zero notifications for unverified offline cleaners. The earlier 42745132147 result seeded cleaners as `VERIFIED` without Didit results; its 200,000 notification result is invalid and superseded. Hosted capacity is still unmeasured. |
| B-05 | User-reported SMS/Google/email/notification errors and dialog sizing needed rechecking. | Partially fixed | Fresh AgentMail code passed; Google nonce handling was fixed and unit-tested; one SMSPoP API test was accepted. Supabase phone OTP, visual dialog sizing, push delivery, and physical permissions are not fully verified. |
| B-06 | Appetize inventory did not expose upload notes reliably to route tests. | Fixed | Route tests now pin target ID, source commit, and successful source run metadata/logs. |
| B-07 | RCT-Folly required a no-generated-config mode for NitroModules' Clang module. | Fixed | Xcode now passes `FOLLY_NO_CONFIG=1` and `FOLLY_CFG_NO_COROUTINES=1`; iOS run 42750267000 compiled past the previous missing-header error. |
| B-08 | Twilio Voice has not been exercised against a provider. | Blocked | Protected Voice API key, TwiML App, platform push credentials, and physical call checks are required. The server enforces the five-minute limit. |
| B-09 | Android requested microphone access at app launch instead of when a user started or answered a call. | Fixed | Commit `1524dfc` defers Android microphone permission to call actions; Appetize login/home journey passed without the startup prompt. |
| B-10 | Google Sign-In failed when Supabase received a nonce that was absent from Google's ID token. | Fix under verification | Commit `803be22` conditionally forwards the nonce; focused tests and CI pass. Verify with a fresh build and a dedicated test Google account. |
| B-11 | Expanded Appetize auth routes originally ran after sign-in and were redirected by the session guard; the first isolated rerun then carried navigation state into onboarding. | Fixed in test workflow | Auth-only screens now run before sign-in, and onboarding restarts in a fresh Appetize session. Pinned customer route run 42750004390 verifies both phases and account cleanup. |
| B-12 | Nitro Google Sign-In's generated Fabric view uses a `ViewProps` constructor unavailable in React Native 0.76. | Fixed | The Detail app renders its own React Native sign-in button and doesn't use this generated view. Commit `aca6b1b` excludes only the unused iOS view sources; run 42755155542 built and uploaded the simulator app, and the pinned target launched into onboarding/home. |
| B-13 | Fresh iOS onboarding opens Apple's native location permission sheet, which covered the home screen and made the next Appetize tap a no-op. | Fixed in test workflow | Commit `30ce70b` detects Apple's labeled “Allow While Using App” button and accepts it only when the native prompt is present. Run 42761352687 advanced to booking-category selection afterward. |
| B-14 | Appetize's iOS accessibility tree exposed “House Cleaning” as child text but not as an actionable booking-category control. | Blocked | Commit `b29d25a` saves the category screenshot and taps the center of the visible card. Appetize streaming quota was exhausted before this fix could be exercised; no app behavior failure was confirmed. |

## Safety and limits

- Provider credential values were not printed, exported, or modified. Presence does not establish whether a key is sandbox or live.
- The corrected 20-account and 10,000-booking pressure tests use an isolated loopback Supabase instance and clean their data. No local email-confirmed or Didit-verified state is fabricated in the current capacity fixture.
- The earlier booking run 42745132147 did set local cleaners to `VERIFIED` without provider verification; do not use its cleaner-notification count as evidence. The corrected run 42755759601 supersedes it and verifies that unverified, offline cleaners get no dispatch notifications.
- Appetize account tests use disposable synthetic users and verify cleanup. Each Appetize run creates at most two accounts; completed runs verify deletion. The 20-user burst was isolated locally, not run against hosted Auth.
- One controlled email OTP and one controlled SMS test were sent. The SMSPoP test used one provider credit. Home screens rendered Mapbox maps; no usage/billing polling was run to avoid creating extra provider traffic.
- No live booking, bid, acceptance, chat message, KYC session, Paynow transaction, payout, campaign, push, or call was submitted.
- Current Appetize builds use the hosted Supabase project and are limited to bounded auth/profile/UI checks until an isolated backend boundary is verified.
- Appetize rejected a new session on run 42761805384 with “You've reached your account's usage limit. Upgrade your plan to continue streaming.” No session started and no test accounts were created by that run. No alternate Appetize account or quota workaround was used.
- UI route times measure `open` plus the first matching visible content, not a device performance benchmark or network waterfall.

## Evidence index

| Evidence | Link |
| --- | --- |
| Latest full CI validation | [GitHub Actions run 42761794028](https://github.com/b45406809-ux/Detail/actions/runs/42761794028) |
| iOS simulator build and Appetize target upload | [GitHub Actions run 42755155542](https://github.com/b45406809-ux/Detail/actions/runs/42755155542) · [Open iOS target `q3s6mu5wgdv5tlovezm776wequ`](https://appetize.io/app/q3s6mu5wgdv5tlovezm776wequ) |
| iOS customer onboarding partial route evidence | [GitHub Actions run 42761352687](https://github.com/b45406809-ux/Detail/actions/runs/42761352687) |
| iOS Appetize quota block (no session/accounts started) | [GitHub Actions run 42761805384](https://github.com/b45406809-ux/Detail/actions/runs/42761805384) |
| Corrected 20-user registration and 10,000 booking pressure run | [GitHub Actions run 42755759601](https://github.com/b45406809-ux/Detail/actions/runs/42755759601) |
| Android Appetize build, uploaded target, and home screenshot | [GitHub Actions run 42745938717](https://github.com/b45406809-ux/Detail/actions/runs/42745938717) |
| Interactive Android Appetize app | [Open target `qnjjqo4sz4kcis73grjirqur7e`](https://appetize.io/app/qnjjqo4sz4kcis73grjirqur7e) |
| Expanded Android customer route sweep, screenshots, persisted profile, and cleanup | [GitHub Actions run 42750004390](https://github.com/b45406809-ux/Detail/actions/runs/42750004390) |
| First iOS simulator/Appetize build failure (missing Folly header) | [GitHub Actions run 42746627615](https://github.com/b45406809-ux/Detail/actions/runs/42746627615) |
| iOS rebuild passed Folly and exposed unused Nitro Google Fabric view incompatibility | [GitHub Actions run 42750267000](https://github.com/b45406809-ux/Detail/actions/runs/42750267000) |
| Corrected iOS simulator/Appetize build after clean npm and pod installs | [GitHub Actions run 42755155542](https://github.com/b45406809-ux/Detail/actions/runs/42755155542) |
| Prior iOS retry failed during patch parsing; superseded by the corrected patch | [GitHub Actions run 42754376266](https://github.com/b45406809-ux/Detail/actions/runs/42754376266) |
| Android cleaner verification gate and cleanup on fresh APK | [GitHub Actions run 42750487343](https://github.com/b45406809-ux/Detail/actions/runs/42750487343) |
| Resolved route-test sequencing attempts (all test accounts cleaned) | [Run 42748867394](https://github.com/b45406809-ux/Detail/actions/runs/42748867394) · [Run 42749535556](https://github.com/b45406809-ux/Detail/actions/runs/42749535556) |
| Earlier Android customer route sweep | [GitHub Actions run 42744666734](https://github.com/b45406809-ux/Detail/actions/runs/42744666734) |
| Android cleaner verification gate and cleanup | [GitHub Actions run 42744666657](https://github.com/b45406809-ux/Detail/actions/runs/42744666657) |
| AgentMail email registration and OTP verification | [GitHub Actions run 42744667151](https://github.com/b45406809-ux/Detail/actions/runs/42744667151) |
| SMSPoP API acceptance test (one credit) | [GitHub Actions run 42747410823](https://github.com/b45406809-ux/Detail/actions/runs/42747410823) |
| 20 concurrent registrations and 10,000 local booking writes | [GitHub Actions run 42745132147](https://github.com/b45406809-ux/Detail/actions/runs/42745132147) |
| Prior Android build, home screenshot, and microphone-startup fix verification | [GitHub Actions run 42740802700](https://github.com/b45406809-ux/Detail/actions/runs/42740802700) |
| Isolated hosted QA project request (creation returned HTTP 403) | [GitHub Actions run 42558073940](https://github.com/b45406809-ux/Detail/actions/runs/42558073940) |
| Latest protected configuration presence check (names only; no values) | [GitHub Actions run 42757787278](https://github.com/b45406809-ux/Detail/actions/runs/42757787278) |
| Latest read-only Supabase project inventory | [GitHub Actions run 42757901079](https://github.com/b45406809-ux/Detail/actions/runs/42757901079) |
| Isolated QA project retry (HTTP 403; no project created) | [GitHub Actions run 42758089450](https://github.com/b45406809-ux/Detail/actions/runs/42758089450) |
