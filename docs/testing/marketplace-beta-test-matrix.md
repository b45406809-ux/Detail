# Marketplace beta test matrix

**Version:** 1.2
**Updated:** 2026-11-10  
**Branch:** `codex/separate-dashboard-into-routed-modules-fl7jlh`

Status is reported as **Pass**, **Fail**, **Blocked**, or **Not run**. A passing local test does not establish that the hosted free plan has the same capacity.

## Test matrix

| Area | Status | Scope and result |
| --- | --- | --- |
| Site, dashboard, mobile type check/lint, Edge Functions | Pass | CI run 42732660944: site build and browser smoke, mobile type check/lint, local Supabase migrations, pgTAP, and dashboard fixture journeys passed. The new Voice endpoints and UI require the next CI run. |
| Backend booking lifecycle and security | Pass | The isolated local Supabase suite covers booking idempotency, bid acceptance replay, quote/reschedule/instant-offer lifecycles, messaging, arrival/completion evidence, payout idempotency, account deletion, notification status, Paynow webhook/reconciliation/refund records, and access-control invariants. These are database/function tests, not provider transactions. |
| Concurrent registration burst | Pass | 20/20 synthetic registrations persisted profiles at concurrency 20; 0 failed; p50 915 ms, p95 942 ms, p99 1,014 ms; all 20 were deleted. Target was local Supabase at `127.0.0.1`, not the hosted project. |
| Booking write pressure | Pass | 10,000/10,000 synthetic booking RPC writes persisted with concurrency 100, 1,000 synthetic eligible cleaners, and 200,000 nearby-cleaner notification rows. Runtime 93.78 s (106.6 bookings/s); latency p50 641 ms, p95 2,589 ms, p99 6,205 ms. Five transient local PostgREST pool-acquisition errors were retried. This is not a hosted Supabase free-tier guarantee. |
| Android baseline screens on existing APK | Pass | Pinned build `du2xyaxoiakaw57cecgor2jfd4` (EAS `1858f342-02c5-41ad-9672-255b9b22b9e6`, source `dedbb98c7fc71d442d4cad47c9178a4c989189e3`). Welcome, sign-in, create-account, email, and password screens rendered; no account was submitted. Screenshots are attached to run 42729896172. |
| Android build and Appetize home/onboarding journey | Pass | GitHub Actions built the APK directly (not EAS), uploaded it as Appetize target `dnyjnnuzqq5ip3vp53da4ew6um`, and verified persisted customer onboarding. Two temporary auth accounts were removed. No booking or payment was submitted. |
| Android customer account and route UI journey | Pass | Pinned route run 42732054256 against target `dnyjnnuzqq5ip3vp53da4ew6um`, source commit `f5081fab504133e38e53f3f1580f99d7e186ac0d`, build run 42726618583. On-screen route readiness: Activity 1.71 s, Messages 1.66 s, Wallet 2.32 s, Profile 0.99 s, Cleaner search 2.04 s, Booking creation 1.47 s, booking-offers/confirmation/job/tracking invalid-ID states 1.41–1.72 s, other tested routes 0.61–2.14 s. These Appetize timings include remote automation/network overhead. The flow stopped before booking submission. |
| Android cleaner UI and server-side verification gates | Pass | Pinned cleaner run 42732497555 against the same target/source. UI reached the Didit identity-check gate; live backend rejected both `submitCleanerApplication` and `setActiveRole` for the unverified synthetic cleaner (HTTP 409); profile persistence was checked, and both temporary accounts were deleted. No KYC request was started. |
| Full live marketplace transaction through the app | Blocked | The live backend booking gate is open, but there is no verified test-only boundary and a separate hosted QA project could not be provisioned because Supabase project creation returned HTTP 403. No production booking was submitted. The local database suite covers individual state transitions, but does not replace a two-account Appetize transaction. |
| iOS simulator build/UI | Not run | First direct macOS/Xcode simulator Release build failed in the `fmt` pod under Xcode 26 (run 42732672881). The runner is now pinned to macOS 15/Xcode 16 for the retry. No iOS artifact or physical-device pass is recorded yet. |
| Paynow, Didit, SMSPoP, Resend, push, and other provider transactions | Not run | No payment, identity verification, email, SMS, or push was generated. Provider secrets were not read or changed, so the sandbox/live mode of each configured credential cannot be independently confirmed from this run. |
| Twilio app-to-app WebRTC | Blocked / not run | Mobile call controls and backend token/TwiML endpoints are implemented with a hard 300 second server limit. No voice keys were read and no call was placed. To activate: configure the protected Twilio Voice API key, TwiML App, webhook URL and (for incoming calls) platform Push Credential. Simulator cannot validate physical CallKit/PushKit. Setup is documented in `docs/providers/twilio-voice-setup.md`. |

## Bug register

| ID | Finding | Status | Evidence / follow-up |
| --- | --- | --- | --- |
| B-01 | Campaign waitlist UI had malformed JSX, and the campaign SQL enqueue query used an invalid lateral alias. | Fixed | Resolved in `f5081fa`; site build and local database tests pass in CI run 42728357867. |
| B-02 | A campaign regression fixture could collide with the auth-triggered profile row. | Fixed | Fixture now upserts the profile; pgTAP passes in CI run 42728357867. |
| B-03 | Dashboard route smoke test expected a menu label instead of the rendered page heading. | Fixed | Test now navigates by the visible “Waitlist & Email” menu item; CI dashboard journey passes. |
| B-04 | At 100 concurrent local booking writes, PostgREST returned five transient `PGRST003` pool-acquisition failures. | Open / capacity signal | The pressure harness retries this specific pre-query pool error and reached 10,000 persisted writes. Repeat against a dedicated hosted QA project before making hosted free-plan capacity claims. |
| B-05 | User-reported login/API/dialog issues and visual spacing issues have not been comprehensively rechecked against the new APK. | Partially verified | New APK successfully signs in and reaches customer/cleaner routes. Route screenshots are attached to run 42732054256 and cleaner gate screenshots to run 42732497555. Dialog dimensions, Google Sign-In, SMS/email OTP, push delivery, and visual spacing still need dedicated checks. |
| B-06 | Appetize build inventory omitted the upload note even though the upload request carried it, so the first route run stopped at artifact validation before creating accounts. | Fixed | Route workflows now verify the exact target ID against the successful source workflow's run metadata and upload logs. The failed attempt created no accounts. |
| B-07 | Direct iOS simulator build failed compiling the `fmt` pod under Xcode 26 on the moving macOS latest runner. | Fix queued | Failure was isolated to Apple Clang 26 constant-evaluation errors in `fmt`; CocoaPods completed. The next simulator run pins the macOS 15 runner/Xcode 16 toolchain. |
| B-08 | New Twilio call integration has not been exercised against Twilio. | Blocked | Voice keys, TwiML App, and incoming-call push credentials must be provisioned in the protected GitHub environment. No calls were made. The route enforces active-booking participant checks and five minutes in server TwiML, with a client-side cutoff as backup. |

## Safety and limits

- Provider credential values are not printed, exported, or modified by these checks.
- The local 20-account and 10,000-booking tests use an isolated loopback Supabase instance and clean their data.
- The live Appetize workflow creates at most two synthetic, disposable auth accounts and verifies cleanup. It does not submit a booking, charge a customer, perform KYC, or send a provider message.
- The current Appetize APK is configured with the repository's hosted Supabase project. It is suitable for bounded authentication/profile UI checks only; use a verified isolated backend for destructive or multi-party marketplace transactions.
- UI time-to-text is a practical route readiness measure, not a device performance benchmark or a network waterfall.

## Evidence index

| Evidence | Link |
| --- | --- |
| CI validation, migration reset, pgTAP, dashboard journeys | [GitHub Actions run 42728357867](https://github.com/b45406809-ux/Detail/actions/runs/42728357867) |
| 20-user signup burst and 10,000-booking local pressure test | [GitHub Actions run 42728206600](https://github.com/b45406809-ux/Detail/actions/runs/42728206600) |
| Pinned existing-APK baseline screens and screenshots | [GitHub Actions run 42729896172](https://github.com/b45406809-ux/Detail/actions/runs/42729896172) |
| GitHub Android build/Appetize upload and home/onboarding screenshots | [GitHub Actions run 42726618583](https://github.com/b45406809-ux/Detail/actions/runs/42726618583) |
| Pinned Android customer screen route sweep and screenshots | [GitHub Actions run 42732054256](https://github.com/b45406809-ux/Detail/actions/runs/42732054256) |
| Pinned Android cleaner registration/identity gate and cleanup | [GitHub Actions run 42732497555](https://github.com/b45406809-ux/Detail/actions/runs/42732497555) |
| Direct iOS simulator build and Appetize inspection (in progress) | [GitHub Actions run 42732672881](https://github.com/b45406809-ux/Detail/actions/runs/42732672881) |
| Earlier iOS build failure (Xcode 26 `fmt` compile) | [GitHub Actions run 42732672881](https://github.com/b45406809-ux/Detail/actions/runs/42732672881) |
| Latest CI validation | [GitHub Actions run 42732660944](https://github.com/b45406809-ux/Detail/actions/runs/42732660944) |
| Hosted isolated Supabase project request (HTTP 403) | [GitHub Actions run 42558073940](https://github.com/b45406809-ux/Detail/actions/runs/42558073940) |
| Prior EAS build attempt (Starter plan required) | [GitHub Actions run 42328844702](https://github.com/b45406809-ux/Detail/actions/runs/42328844702) |
