# Marketplace beta test matrix

**Version:** 1.4
**Updated:** 2026-11-10
**Branch:** `codex/separate-dashboard-into-routed-modules-fl7jlh`

Statuses are **Pass**, **Fail**, **Blocked**, or **Not run**. Local tests do not prove hosted free-plan capacity, and UI readiness times include Appetize automation/network overhead.

## Test matrix

| Area | Status | Scope and result |
| --- | --- | --- |
| CI, dashboard, mobile, Supabase migrations and Edge Functions | Pass | Latest full successful run 42750266588 on commit `d9cbace4f8cb717edff6a72fc5db2c597636f758`: site/dashboard, mobile type-check and lint, Google nonce tests, local Supabase migrations/security/pgTAP, Edge Function checks, and authenticated dashboard journeys passed. The docs-only update has CI run 42751147161 in progress. |
| Concurrent registration burst | Pass | Run 42745132147: 20/20 local synthetic Auth registrations and profiles persisted at concurrency 20; 0 failed; p50 738 ms, p95 783 ms, p99 786 ms. All 20 local accounts were deleted. No hosted accounts were created by this pressure test. |
| Booking write pressure | Pass | Run 42745132147: 10,000/10,000 synthetic booking RPC writes persisted at concurrency 100 with 1,000 eligible synthetic cleaners and 200,000 nearby-cleaner notification rows. Runtime 82.64 s (121 bookings/s); p50 548 ms, p95 2,216 ms, p99 6,001 ms. Eleven transient local PostgREST pool-acquisition errors were retried; 0 bookings failed. This is not a hosted Supabase free-tier guarantee. |
| Android build and current Appetize upload | Pass | Direct GitHub Actions build run 42745938717 built commit `803be2234625597075d6d8d27ec2d44d70ce68a4`, uploaded target `qnjjqo4sz4kcis73grjirqur7e`, and saved the home screenshot artifact. No EAS build was run. Android Firebase config was absent in this artifact, so push delivery is not covered. |
| Android customer routes on pinned Appetize build | Pass | Expanded run 42750004390 used target `qnjjqo4sz4kcis73grjirqur7e`, source commit `803be2234625597075d6d8d27ec2d44d70ce68a4`, source build run 42745938717. Sign-in, customer agreement/profile/permissions onboarding, service selection through booking details, and persisted profile state passed; no booking was submitted. Auth recovery, reset password, and email-code-entry screens rendered before sign-in. Twenty-five marketplace/account/legal routes rendered in 0.73–2.22 s (median 1.38 s): tabs, history, favorites, cleaner search, notifications, reviews, help/support, organization, email, portfolio, instant offers, announcement, not-found, policies, booking form, offers/confirmation, job, and tracking states. Two disposable accounts were deleted. |
| Android cleaner onboarding and server gates | Pass | Fresh-build run 42750487343 used target `qnjjqo4sz4kcis73grjirqur7e` from build run 42745938717. UI reached the Didit identity gate; the backend returned HTTP 409 for both unverified `submitCleanerApplication` and `setActiveRole`. Persisted gate state was checked; both disposable accounts were deleted. No KYC session was created. |
| Android email registration | Pass | Run 42744667151 used the same pinned target and AgentMail test inbox. A fresh email code was received and accepted; Auth/profile/agreement state persisted; the one disposable account was deleted. One test verification email was sent. The underlying provider's sandbox/live mode was not independently established. |
| Reported Google Sign-In nonce error | Partially verified | Commit `803be22` sends the original nonce to Supabase only when Google's ID token contains a nonce claim; three focused tests and mobile CI pass. The fresh APK contains the fix, but a real Google account sign-in still needs a dedicated test account. |
| SMSPoP API payload | Pass | Run 42747410823 sent one harmless test SMS to the protected test recipient. SMSPoP reported `sent` and 1 credit used. This confirms provider API acceptance, not carrier delivery or the Supabase Auth OTP hook end-to-end. The local Auth-hook payload tests pass in CI. |
| Full app marketplace booking/bid/chat/tracking/completion/payment lifecycle | Blocked | No verified isolated hosted backend or test-only boundary is available. The current APK points at the hosted project, so no job was posted, no real cleaner was notified, and no payment/KYC/payout was attempted. Local database and Edge Function tests cover lifecycle transitions and access control but do not replace a two-account UI transaction. |
| iOS simulator/Appetize | Blocked / retry in progress | Run 42746627615 failed building the NitroModules Clang module because `folly/folly-config.h` was missing. Workflow commit `d9cbace` passes Folly no-config flags to module scanning and pod compilation; retry run 42750267000 is in progress. No iOS target is available yet. Physical iPhone checks remain outstanding. |
| Paynow, Didit, push, campaigns, and Twilio Voice provider transactions | Not run | No Paynow checkout, identity verification, push/campaign delivery, or voice call was made. Provider key values were not read or changed; their environment modes cannot be inferred from secret presence. |
| Twilio in-app calling and usage display | Blocked | Chat call controls, authenticated participant checks, signed Voice tokens, the client cutoff, and server TwiML `timeLimit=300` are implemented and covered by local tests. The admin overview separates account-wide prior-month Twilio Voice usage from SMS. Voice credentials/push credentials are incomplete, so no call or live Voice meter was verified; provider usage cannot be attributed to Detail calls. |
| Physical Android/iPhone checks | Not run | Permission denial/recovery, actual push delivery, location backgrounding, camera/photo access, Google/Apple sign-in, incoming-call audio/CallKit/PushKit, large text, and real-device layout require physical devices and confirmed test configuration. |

## Bug register

| ID | Finding | Status | Evidence / follow-up |
| --- | --- | --- | --- |
| B-01 | Campaign waitlist UI had malformed JSX and its SQL enqueue query used an invalid lateral alias. | Fixed | Existing CI and local migration tests pass. |
| B-02 | A campaign regression fixture could collide with the auth-triggered profile row. | Fixed | Fixture uses an upsert; local pgTAP passes. |
| B-03 | Dashboard route smoke test expected a menu label instead of the rendered page heading. | Fixed | Authenticated dashboard journey passes in run 42746904371. |
| B-04 | Concurrent local booking writes can hit transient PostgREST pool acquisition limits. | Open / capacity signal | Latest run retried 11 local pool errors and persisted all 10,000 writes. Repeat only against a dedicated hosted QA project before making hosted capacity claims. |
| B-05 | User-reported SMS/Google/email/notification errors and dialog sizing needed rechecking. | Partially fixed | Fresh AgentMail code passed; Google nonce handling was fixed and unit-tested; one SMSPoP API test was accepted. Supabase phone OTP, visual dialog sizing, push delivery, and physical permissions are not fully verified. |
| B-06 | Appetize inventory did not expose upload notes reliably to route tests. | Fixed | Route tests now pin target ID, source commit, and successful source run metadata/logs. |
| B-07 | iOS simulator compilation failed because NitroModules could not find `folly/folly-config.h`. | Fix under verification | The new workflow passes `FOLLY_NO_CONFIG=1` and `FOLLY_CFG_NO_COROUTINES=1` to Xcode module scanning and compilation; retry run 42750267000 is building. |
| B-08 | Twilio Voice has not been exercised against a provider. | Blocked | Protected Voice API key, TwiML App, platform push credentials, and physical call checks are required. The server enforces the five-minute limit. |
| B-09 | Android requested microphone access at app launch instead of when a user started or answered a call. | Fixed | Commit `1524dfc` defers Android microphone permission to call actions; Appetize login/home journey passed without the startup prompt. |
| B-10 | Google Sign-In failed when Supabase received a nonce that was absent from Google's ID token. | Fix under verification | Commit `803be22` conditionally forwards the nonce; focused tests and CI pass. Verify with a fresh build and a dedicated test Google account. |
| B-11 | Expanded Appetize auth routes originally ran after sign-in and were redirected by the session guard; the first isolated rerun then carried navigation state into onboarding. | Fixed in test workflow | Auth-only screens now run before sign-in, and onboarding restarts in a fresh Appetize session. Pinned customer route run 42750004390 verifies both phases and account cleanup. |

## Safety and limits

- Provider credential values were not printed, exported, or modified. Presence does not establish whether a key is sandbox or live.
- The local 20-account and 10,000-booking pressure tests use an isolated loopback Supabase instance and clean their data.
- Appetize account tests use disposable synthetic users and verify cleanup. Each Appetize run creates at most two accounts; completed runs verify deletion. The 20-user burst was isolated locally, not run against hosted Auth.
- One controlled email OTP and one controlled SMS test were sent. The SMSPoP test used one provider credit. Home screens rendered Mapbox maps; no usage/billing polling was run to avoid creating extra provider traffic.
- No live booking, bid, acceptance, chat message, KYC session, Paynow transaction, payout, campaign, push, or call was submitted.
- Current Appetize builds use the hosted Supabase project and are limited to bounded auth/profile/UI checks until an isolated backend boundary is verified.
- UI route times measure `open` plus the first matching visible content, not a device performance benchmark or network waterfall.

## Evidence index

| Evidence | Link |
| --- | --- |
| Latest CI validation on commit `989fdeef` | [GitHub Actions run 42746904371](https://github.com/b45406809-ux/Detail/actions/runs/42746904371) |
| Android Appetize build, uploaded target, and home screenshot | [GitHub Actions run 42745938717](https://github.com/b45406809-ux/Detail/actions/runs/42745938717) |
| Interactive Android Appetize app | [Open target `qnjjqo4sz4kcis73grjirqur7e`](https://appetize.io/app/qnjjqo4sz4kcis73grjirqur7e) |
| Expanded Android customer route sweep, screenshots, persisted profile, and cleanup | [GitHub Actions run 42750004390](https://github.com/b45406809-ux/Detail/actions/runs/42750004390) |
| iOS simulator/Appetize build failure (missing Folly header) | [GitHub Actions run 42746627615](https://github.com/b45406809-ux/Detail/actions/runs/42746627615) |
| iOS simulator/Appetize rebuild with propagated Folly flags | [GitHub Actions run 42750267000](https://github.com/b45406809-ux/Detail/actions/runs/42750267000) |
| Android cleaner verification gate and cleanup on fresh APK | [GitHub Actions run 42750487343](https://github.com/b45406809-ux/Detail/actions/runs/42750487343) |
| Resolved route-test sequencing attempts (all test accounts cleaned) | [Run 42748867394](https://github.com/b45406809-ux/Detail/actions/runs/42748867394) · [Run 42749535556](https://github.com/b45406809-ux/Detail/actions/runs/42749535556) |
| Earlier Android customer route sweep | [GitHub Actions run 42744666734](https://github.com/b45406809-ux/Detail/actions/runs/42744666734) |
| Android cleaner verification gate and cleanup | [GitHub Actions run 42744666657](https://github.com/b45406809-ux/Detail/actions/runs/42744666657) |
| AgentMail email registration and OTP verification | [GitHub Actions run 42744667151](https://github.com/b45406809-ux/Detail/actions/runs/42744667151) |
| SMSPoP API acceptance test (one credit) | [GitHub Actions run 42747410823](https://github.com/b45406809-ux/Detail/actions/runs/42747410823) |
| 20 concurrent registrations and 10,000 local booking writes | [GitHub Actions run 42745132147](https://github.com/b45406809-ux/Detail/actions/runs/42745132147) |
| Prior Android build, home screenshot, and microphone-startup fix verification | [GitHub Actions run 42740802700](https://github.com/b45406809-ux/Detail/actions/runs/42740802700) |
| Isolated hosted QA project request (creation returned HTTP 403) | [GitHub Actions run 42558073940](https://github.com/b45406809-ux/Detail/actions/runs/42558073940) |
