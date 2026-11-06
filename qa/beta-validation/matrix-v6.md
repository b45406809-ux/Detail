# Beta validation matrix v6

Run: `2026-11-06-follow-up-6`

## Pinned test targets

| Target | Identifier | State |
| --- | --- | --- |
| Source branch | `codex/separate-dashboard-into-routed-modules-fl7jlh` | Pass |
| Baseline source commit | `dedbb98c7fc71d442d4cad47c9178a4c989189e3` | Pass |
| Baseline Android EAS build | `1858f342-02c5-41ad-9672-255b9b22b9e6` | Pass; artifact URL supplied by owner |
| Baseline Android APK | `https://expo.dev/artifacts/eas/BPJYOZS0HFlY2eLZg3fvgdIhh7EJGpp80gXpxmrstXU.apk` | Pass; existing artifact |
| Appetize Android build target | `du2xyaxoiakaw57cecgor2jfd4` | Pass; inventory run `42156904686`; upload run `42151995163` resolved the exact EAS build before upload |
| Backend | Production Supabase | Synthetic customer/cleaner accounts were used for bounded UI tests and cleaned up; booking submission was not attempted |
| Production booking state | `bookingEnabled=ON`; `operationsBookingCreation=OFF` | Creation is allowed by the current function guard; submission would fan out notices to eligible real cleaners |
| Production payment state | `operationsPayments=OFF`; Paynow credentials absent | No payment action was attempted; no sandbox provider credentials are configured |
| Isolated backend | No staging URL/key configured | Not required for the bounded screens/auth checks; needed for the full booking-to-completion lifecycle without reaching real cleaners |
| iOS candidate | No iOS Appetize target in inventory run `42177217588` | Not run |
| Test harness source | Current branch through `e8a0eef` | Pinned AgentMail, synthetic customer and cleaner journeys; full local authenticated dashboard and backend contract checks |

## Scenario matrix

Every row describes one area; case details follow the approved plan. Evidence and bug IDs are recorded in [evidence-v6.md](evidence-v6.md) and [bugs-v6.md](bugs-v6.md). A render-only result never passes a functional row.

| ID | Area and required checks | Android | iOS | Web dashboard | Backend evidence required |
| --- | --- | --- | --- | --- | --- |
|  AUTH-01  |  Customer and cleaner registration, email verification, password/code login, wrong/expired/reused codes, recovery, logout, restore/expiry, Google/Apple where offered  |  Blocked; AgentMail signup/code verification and customer onboarding passed, while other required auth cases were not run  |  Blocked  | Not run |  Auth account created, OTP verified, then login removed by cleanup; see EV-025  |
|  AUTH-00  |  Welcome, sign-in and create-account screens; email/password controls visible on exact baseline target  |  Pass, screen smoke plus successful AgentMail signup  |  Not run  | Pass, screen and synthetic sign-in only |  Customer registration and profile onboarding persisted before cleanup  |
|  ONB-01  |  Splash, customer/cleaner onboarding, commission configuration agreement  |  Blocked; customer profile/permissions step and five cleaner info slides passed; Didit and final cleaner agreement were not completed  |  Blocked  | Not run |  Customer auth was cleaned; cleaner account remains unverified and was cleaned  |
|  PERM-01  |  Camera, library, location, notification allow/deny/permanent denial/settings recovery  |  Blocked  |  Blocked  | Not run |  Permission-dependent action state; physical device evidence  |
|  NAV-01  |  Tabs, controls, dialogs, back, keyboard, empty/loading/error, deep links, long names, small/large text  |  Blocked; customer tabs/account/legal routes and invalid booking/job/tracking states passed; remaining controls and layout cases were not run  |  Blocked  | Blocked; all 12 dashboard routes and bookings reload passed locally, but the full route interaction scope was not run |  Customer auth/profile setup persisted; route reads only after setup  |
|  BOOK-01  |  House/car scheduling, address/map, options, notes, photos, supplies, date/price, submit  |  Blocked; house flow reached Details & Condition; submit and car flow were not run  |  Blocked  | Not run |  No booking row created; submitting would notify real eligible cleaners  |
|  BID-01  |  Multiple bids, compare/decline/accept, eligibility, expiry, unavailable cleaner, races/double taps/overlap  |  Blocked  |  Blocked  | Not run |  One valid assignment; losers and expired actions rejected atomically  |
|  JOB-01  |  Request → bid/accept → payment choice → en route → arrival → start → evidence → completion → review; house/car and supported modes  |  Blocked  |  Blocked  | Not run |  Server state and money invariants at every transition  |
|  CHAT-01  |  Two-way assigned-participant messaging, order/time/unread/reconnect/background/attachments  |  Blocked  |  Blocked  | Not run |  Messages persist once; unauthorized third-party reads/writes rejected  |
|  TRACK-01  |  Location updates, tracking, participant visibility and unauthorized access  |  Blocked  |  Blocked  | Not run |  Precise coordinates visible only to participants  |
|  CANCEL-01  |  Either-role cancellation by stage, reschedule, no-show, decline, expiry, favorite/rebook  |  Blocked  |  Blocked  | Not run |  Prior job retained, availability/price correct, no partial writes  |
|  PAY-01  |  Paynow official method/icon/handoff; sandbox success/pending/failure/cancel/interruption/retry; direct payment  |  Blocked  |  Blocked  | Not run |  Provider sandbox evidence and reconciled amount/fees/commission/balance  |
|  FIN-01  |  Duplicate/out-of-order/invalid callbacks, poll, refund, payout and replay protection  |  Blocked  |  Blocked  | Not run |  Ledger invariants; mocked provider runs labeled simulations only  |
|  NOTIF-01  |  Bid, acceptance, chat, cancel, reschedule, en route, arrival, completion; foreground/background/denied/expired token  |  Blocked  |  Blocked  | Not run |  Correct recipient, single event, delivery state and route  |
|  CLEAN-01  |  Registration, agreement, verification handoff/return/reject/retry, approval, role switch, availability, portfolio, earnings/payout  |  Blocked; intro/form and Didit gate reached; protected application/role actions rejected HTTP 409  |  Blocked  | Not run |  No Didit session or identity success; synthetic cleaner account cleaned  |
|  ADMIN-01  |  Two admins with distinct permissions; sessions, invites, booking/support/dispute/payout actions and audit trail  |  Blocked  |  Blocked  | Blocked; local admin subset passed |  Local Supabase CI proves elevated and restricted admin login, 12 modules, invite create/revoke with persisted audit, and denied restricted invite with no partial write. Booking/support/dispute/payout actions remain untested.  |
|  PRIV-01  |  Third-party booking/chat/photo/location access; account switch/logout; recovery/deletion restrictions  |  Blocked  |  Blocked  | Not run |  RLS/function denial and no prior-account data leak  |
|  RES-01  |  Offline before/after submit, kill/relaunch during booking/chat/checkout/progress, slow/error/expired session/upload  |  Blocked  |  Blocked  | Not run |  Retry recovers authoritative state without duplicates  |
|  PERF-01  |  10 cold + 10 warm launches/platform; API p95, event p95, action feedback, spinner/crash and 30-minute soak  |  Not run  |  Not run  | Not run |  Measurements carry platform, device, network, sample size, median/p95  |
|  LOAD-01  |  10/25/50 concurrent users; competing bids, chat, state transitions and retries  |  Not run  |  Not run  | Not run |  Isolated backend only; <1% unexpected errors and invariant checks  |
|  DEVICE-01  |  Android/iPhone camera/library, GPS/background, OAuth, push/tap, links, checkout return, interruption/resume  |  Blocked  |  Blocked  | Not run |  Guided physical-device evidence required  |

## Follow-up evidence

| Evidence | Result | Scope |
| --- | --- | --- |
| [Pinned AgentMail registration and customer Appetize journey](https://github.com/b45406809-ux/Detail/actions/runs/42175055057) | Pass | Baseline Android APK; email OTP, customer agreement/profile/permissions, house booking form to details, customer route screens; exact test account cleaned and verified absent from Auth |
| [Pinned synthetic customer Appetize journey](https://github.com/b45406809-ux/Detail/actions/runs/42175327533) | Pass | Baseline Android APK; customer onboarding, house form through details, customer tabs/routes and invalid booking/job/tracking states; 2 test accounts cleaned |
| [Pinned synthetic cleaner Appetize journey](https://github.com/b45406809-ux/Detail/actions/runs/42176505491) | Pass | Baseline Android APK; cleaner intro/form, Didit gate, and backend 409 rejection for unverified application/role switch; accounts cleaned |
| [Appetize build inventory](https://github.com/b45406809-ux/Detail/actions/runs/42177217588) | Pass | Read-only inventory returned Android targets only; no iOS Appetize build is available |
| [Current configuration gates](https://github.com/b45406809-ux/Detail/actions/runs/42173675079) | Pass, read-only | Booking is currently enabled and production create requests can dispatch to verified available cleaners; no sandbox payment credentials are configured |
| [Full CI and local backend/dashboard suite](https://github.com/b45406809-ux/Detail/actions/runs/42169969403) | Pass | Mobile lint/type checks, local Supabase security/Edge Function tests, fixture setup/cleanup, site checks and local dashboard journeys |
| [AgentMail registration with persisted-state verification](https://github.com/b45406809-ux/Detail/actions/runs/42177965237) | Pass | On the pinned Android APK, AgentMail email confirmation and customer onboarding persisted with expected role/profile fields; zero jobs/payments were present, then the account was cleaned |
| [Synthetic customer journey with persisted-state verification](https://github.com/b45406809-ux/Detail/actions/runs/42178257016) | Pass | On the pinned Android APK, customer UI journey and persisted profile assertions passed; zero jobs/payments were present, then both accounts were cleaned |
| [Synthetic cleaner journey with persisted-state verification](https://github.com/b45406809-ux/Detail/actions/runs/42178527205) | Pass | Pinned Android APK; cleaner profile stayed CUSTOMER with identity NOT_STARTED, no jobs/payments were present, and cleanup completed |

## Baseline evidence

| Evidence | Result | Scope |
| --- | --- | --- |
| [Appetize build inventory](https://github.com/b45406809-ux/Detail/actions/runs/42156904686) | Pass | Target `du2xyaxoiakaw57cecgor2jfd4` was created by the upload run for the exact EAS build; no device session or backend write |
| [Appetize inspection workflow](https://github.com/b45406809-ux/Detail/actions/runs/42152586430) | Pass, limited | Device became inspectable and captured a screenshot. No business flow was exercised. |
| [Validate Detail CI](https://github.com/b45406809-ux/Detail/actions/runs/42152571405) | Fail, test setup | Mobile checks and Supabase database/Edge Function checks passed; the configured admin login was rejected. This does not establish a product authentication defect. |
| [Read-only site/dashboard smoke](evidence-v5.md#ev-008) | Pass, limited | Homepage, privacy, terms, public blog, and production dashboard sign-in screen rendered; no production credentials were submitted. Authenticated dashboard journeys were explicitly blocked. |
| Local QA fixture isolation tests | Pass, 5/5 | Production-target and same-host writes are rejected; only explicit isolated staging and enabled loopback targets are accepted; fixture composition is checked. |
| Staging build config tests | Pass, 5/5 | Staging requires a distinct explicit backend; production rejects staging auth; missing staging auth config fails closed. |
| [Configuration check](https://github.com/b45406809-ux/Detail/actions/runs/42173675079) | Pass, read-only | Staging URL/key absent; booking creation currently allowed; payment action not exercised |
| [Local Supabase and dashboard journeys](https://github.com/b45406809-ux/Detail/actions/runs/42162194166) | Pass | Database security/lint/auth checks passed; 13 synthetic accounts were created and cleaned; dashboard routes, invite create/revoke, audit persistence, and restricted-role denial passed. |

The local dashboard fixture pool leaves all five cleaner accounts `NOT_STARTED`; four are tagged for a future official sandbox verification flow. The production Appetize cleaner account also stopped at the Didit gate; no identity result was fabricated. The production test accounts were removed or anonymized by the cleanup routines. No booking, bid, message, booking-triggered notification, identity, or financial transaction was created during these runs. See [bugs-v6.md](bugs-v6.md) for remaining blockers.

Synthetic production Auth accounts were created for the bounded Appetize runs. Cleanup verified their login removal and profile anonymization. The baseline inventory itself remained read-only.

## Backend SQL contract coverage

The local `supabase test db --local` suite passed again in CI run `42169969403`. These checks call database functions and inspect persisted local state; they are component coverage, not a client UI journey or a real external provider result.

| Area | Backend status | Passing test files | Scope and remaining gap |
| --- | --- | --- | --- |
| Booking and bidding | Pass, component tests | `booking_idempotency`, `quote_lifecycle`, `bid_acceptance_replay`, `instant_offer_reservation` | Covers persisted creation/replay, quote lifecycle, acceptance replay and reservations. Client submission, real concurrent UI sessions and full house/car journeys remain blocked. |
| Job transitions and cancellation | Pass, component tests | `completion_evidence_arrival`, `offline_booking_payment`, `reschedule_availability`, `admin_reassignment_safety` | Covers arrival geofence, evidence, reschedule/availability, offline cancellation ledger, reassignment invariants. Full en-route/start/completion/review app journey remains blocked. |
| Chat and presence | Pass, component tests | `messaging_lifecycle`, `cleaner_presence_lease` | Checks durable participant messages, retry deduplication, unread state and stale-location cleanup. Realtime delivery, third-party reads and live participant tracking remain untested. |
| Payments and finance | Pass, simulated database contracts | `paynow_poll_reconciliation`, `paynow_provider_event_inbox`, `paynow_refund_ledger`, `paynow_status_monotonicity`, `non_paynow_settlement_review`, `payout_idempotency` | Checks ledger state/replay, event inbox permissions, refunds and payout idempotency. It does not call Paynow or prove sandbox checkout/callback delivery. |
| Notifications | Pass, queue-state tests | `paynow_notification_outbox`, `notification_delivery_status`, `push_device_lifecycle` | Checks durable outbox, delivery status distinctions and device lifecycle. No Expo/APNs push was sent or reported delivered. |
| Admin and privacy | Pass, security/component tests | `admin_role_access`, `security_invariants`, `participant_avatar_access`, `account_deletion_safety` | Checks role/privilege boundaries, participant media access, deletion restrictions and privacy cleanup. App account switching, all admin mutations and physical permission flows remain untested. |
