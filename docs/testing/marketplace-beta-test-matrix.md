# Marketplace beta test matrix

**Version:** 1.0  
**Updated:** 2026-11-10  
**Branch:** `codex/separate-dashboard-into-routed-modules-fl7jlh`

Status is reported as **Pass**, **Fail**, **Blocked**, or **Not run**. A passing local test does not establish that the hosted free plan has the same capacity.

## Test matrix

| Area | Status | Scope and result |
| --- | --- | --- |
| Site, dashboard, mobile type check/lint, Edge Functions | Pass | CI run 42728357867 passed the site/dashboard build, mobile type check and lint, Functions build/type checks, local Supabase reset, pgTAP security/lifecycle tests, and authenticated dashboard journeys. |
| Backend booking lifecycle and security | Pass | The isolated local Supabase suite covers booking idempotency, bid acceptance replay, quote/reschedule/instant-offer lifecycles, messaging, arrival/completion evidence, payout idempotency, account deletion, notification status, Paynow webhook/reconciliation/refund records, and access-control invariants. These are database/function tests, not provider transactions. |
| Concurrent registration burst | Pass | 20/20 synthetic registrations persisted profiles at concurrency 20; 0 failed; p50 915 ms, p95 942 ms, p99 1,014 ms; all 20 were deleted. Target was local Supabase at `127.0.0.1`, not the hosted project. |
| Booking write pressure | Pass with capacity signal | 10,000/10,000 synthetic booking RPC writes persisted with concurrency 100, 1,000 synthetic eligible cleaners, and 200,000 nearby-cleaner notification rows. Runtime 93.78 s (106.6 bookings/s); latency p50 641 ms, p95 2,589 ms, p99 6,205 ms. Five transient local PostgREST pool-acquisition errors were retried. This is not a hosted Supabase free-tier guarantee. |
| Android build and Appetize home/onboarding journey | In progress | GitHub Actions is building the APK directly (not EAS) and will upload it to Appetize. The first attempt hit a Google Maven read timeout before any account creation; a retry is running. See evidence link below. |
| Android account and route UI journey | Not run | Workflow now accepts a pinned Appetize build ID and source commit, verifies the build note, covers customer booking setup and account routes, and records time until expected text appears. It will not submit a booking or create a payment. Run it after the APK upload completes. |
| Full live marketplace transaction through the app | Blocked | The configured live backend has the booking gate closed; a separate hosted QA project could not be provisioned because Supabase project creation returned HTTP 403. The UI does not bypass either boundary. A local database suite covers individual state transitions, but does not replace a two-account Appetize transaction. |
| iOS device build/UI and call lifecycle | Not run | No iOS artifact or physical-device pass is recorded in this test cycle. |
| Paynow, Didit, SMSPoP, Resend, push, and other provider transactions | Not run | No payment, identity verification, email, SMS, or push was generated. Provider secrets were not read or changed, so the sandbox/live mode of each configured credential cannot be independently confirmed from this run. |
| Twilio app-to-app WebRTC | Not run | The app currently has no Twilio Voice SDK call flow. See the open dependency list in the conversation/report before enabling a billable call path. |

## Bug register

| ID | Finding | Status | Evidence / follow-up |
| --- | --- | --- | --- |
| B-01 | Campaign waitlist UI had malformed JSX, and the campaign SQL enqueue query used an invalid lateral alias. | Fixed | Resolved in `f5081fa`; site build and local database tests pass in CI run 42728357867. |
| B-02 | A campaign regression fixture could collide with the auth-triggered profile row. | Fixed | Fixture now upserts the profile; pgTAP passes in CI run 42728357867. |
| B-03 | Dashboard route smoke test expected a menu label instead of the rendered page heading. | Fixed | Test now navigates by the visible “Waitlist & Email” menu item; CI dashboard journey passes. |
| B-04 | At 100 concurrent local booking writes, PostgREST returned five transient `PGRST003` pool-acquisition failures. | Open / capacity signal | The pressure harness retries this specific pre-query pool error and reached 10,000 persisted writes. Repeat against a dedicated hosted QA project before making hosted free-plan capacity claims. |
| B-05 | User-reported login/API/dialog issues and visual spacing issues have not been rechecked against a newly built APK in this cycle. | Not verified | Appetize build/route run is pending; capture and inspect screenshots before marking fixed or regressed. |

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
| GitHub Android build/Appetize upload (currently retrying) | [GitHub Actions run 42726618583](https://github.com/b45406809-ux/Detail/actions/runs/42726618583) |
| Hosted isolated Supabase project request (HTTP 403) | [GitHub Actions run 42558073940](https://github.com/b45406809-ux/Detail/actions/runs/42558073940) |
| Prior EAS build attempt (Starter plan required) | [GitHub Actions run 42328844702](https://github.com/b45406809-ux/Detail/actions/runs/42328844702) |
