# Beta validation matrix v5

Run: `2026-11-06-follow-up-4`

## Pinned test targets

| Target | Identifier | State |
| --- | --- | --- |
| Source branch | `codex/separate-dashboard-into-routed-modules-fl7jlh` | Pass |
| Baseline source commit | `dedbb98c7fc71d442d4cad47c9178a4c989189e3` | Pass |
| Baseline Android EAS build | `1858f342-02c5-41ad-9672-255b9b22b9e6` | Pass; artifact URL supplied by owner |
| Baseline Android APK | `https://expo.dev/artifacts/eas/BPJYOZS0HFlY2eLZg3fvgdIhh7EJGpp80gXpxmrstXU.apk` | Pass; existing artifact |
| Appetize Android build target | `du2xyaxoiakaw57cecgor2jfd4` | Pass; inventory run `42156904686`; upload run `42151995163` resolved the exact EAS build before upload |
| Backend | Production Supabase | Blocked for writes; booking is enabled and no test-only boundary is configured |
| Isolated backend | No staging URL/key configured | Blocked pending isolated project provisioning |
| iOS candidate | None pinned | Not run |
| Test harness source | Commit `8eb76d17a58b0612e6de70445adf1963ff81882e` | Pass for isolation checks, full local authenticated dashboard run and public read-only site smoke |

## Scenario matrix

Every row describes one area; case details follow the approved plan. Evidence and bug IDs are recorded in [evidence-v5.md](evidence-v5.md) and [bugs-v5.md](bugs-v5.md). A render-only result never passes a functional row.

| ID | Area and required checks | Android | iOS | Web dashboard | Backend evidence required |
| --- | --- | --- | --- | --- | --- |
|  AUTH-01  |  Customer and cleaner registration, email verification, password/code login, wrong/expired/reused codes, recovery, logout, restore/expiry, Google/Apple where offered  |  Blocked  |  Blocked  | Not run |  Auth users, verified status, session/revocation state  |
|  AUTH-00  |  Welcome, sign-in and create-account screens; email/password controls visible on exact baseline target  |  Pass, screen smoke only  |  Not run  | Pass, screen and synthetic sign-in only |  No account submitted; does not establish registration, login or persistence  |
|  ONB-01  |  Splash, customer/cleaner onboarding, commission configuration agreement  |  Not run  |  Not run  | Not run |  Persisted profile/role and matching commission setting  |
|  PERM-01  |  Camera, library, location, notification allow/deny/permanent denial/settings recovery  |  Blocked  |  Blocked  | Not run |  Permission-dependent action state; physical device evidence  |
|  NAV-01  |  Tabs, controls, dialogs, back, keyboard, empty/loading/error, deep links, long names, small/large text  |  Blocked  |  Blocked  | Pass, all 12 dashboard routes and bookings reload only |  State after navigation and account-switch isolation  |
|  BOOK-01  |  House/car scheduling, address/map, options, notes, photos, supplies, date/price, submit  |  Blocked  |  Blocked  | Not run |  Persisted booking, eligible visibility, no partial write on failure  |
|  BID-01  |  Multiple bids, compare/decline/accept, eligibility, expiry, unavailable cleaner, races/double taps/overlap  |  Blocked  |  Blocked  | Not run |  One valid assignment; losers and expired actions rejected atomically  |
|  JOB-01  |  Request → bid/accept → payment choice → en route → arrival → start → evidence → completion → review; house/car and supported modes  |  Blocked  |  Blocked  | Not run |  Server state and money invariants at every transition  |
|  CHAT-01  |  Two-way assigned-participant messaging, order/time/unread/reconnect/background/attachments  |  Blocked  |  Blocked  | Not run |  Messages persist once; unauthorized third-party reads/writes rejected  |
|  TRACK-01  |  Location updates, tracking, participant visibility and unauthorized access  |  Blocked  |  Blocked  | Not run |  Precise coordinates visible only to participants  |
|  CANCEL-01  |  Either-role cancellation by stage, reschedule, no-show, decline, expiry, favorite/rebook  |  Blocked  |  Blocked  | Not run |  Prior job retained, availability/price correct, no partial writes  |
|  PAY-01  |  Paynow official method/icon/handoff; sandbox success/pending/failure/cancel/interruption/retry; direct payment  |  Blocked  |  Blocked  | Not run |  Provider sandbox evidence and reconciled amount/fees/commission/balance  |
|  FIN-01  |  Duplicate/out-of-order/invalid callbacks, poll, refund, payout and replay protection  |  Blocked  |  Blocked  | Not run |  Ledger invariants; mocked provider runs labeled simulations only  |
|  NOTIF-01  |  Bid, acceptance, chat, cancel, reschedule, en route, arrival, completion; foreground/background/denied/expired token  |  Blocked  |  Blocked  | Not run |  Correct recipient, single event, delivery state and route  |
|  CLEAN-01  |  Registration, agreement, verification handoff/return/reject/retry, approval, role switch, availability, portfolio, earnings/payout  |  Blocked  |  Blocked  | Not run |  Fixtures do not imply identity approval; restricted actions enforced  |
|  ADMIN-01  |  Two admins with distinct permissions; sessions, invites, booking/support/dispute/payout actions and audit trail  |  Blocked  |  Blocked  | Pass, admin subset only |  Local Supabase CI proves elevated and restricted admin login, 12 modules, invite create/revoke with persisted audit, and denied restricted invite with no partial write. Booking/support/dispute/payout actions remain untested.  |
|  PRIV-01  |  Third-party booking/chat/photo/location access; account switch/logout; recovery/deletion restrictions  |  Blocked  |  Blocked  | Not run |  RLS/function denial and no prior-account data leak  |
|  RES-01  |  Offline before/after submit, kill/relaunch during booking/chat/checkout/progress, slow/error/expired session/upload  |  Blocked  |  Blocked  | Not run |  Retry recovers authoritative state without duplicates  |
|  PERF-01  |  10 cold + 10 warm launches/platform; API p95, event p95, action feedback, spinner/crash and 30-minute soak  |  Not run  |  Not run  | Not run |  Measurements carry platform, device, network, sample size, median/p95  |
|  LOAD-01  |  10/25/50 concurrent users; competing bids, chat, state transitions and retries  |  Not run  |  Not run  | Not run |  Isolated backend only; <1% unexpected errors and invariant checks  |
|  DEVICE-01  |  Android/iPhone camera/library, GPS/background, OAuth, push/tap, links, checkout return, interruption/resume  |  Blocked  |  Blocked  | Not run |  Guided physical-device evidence required  |

## Baseline evidence

| Evidence | Result | Scope |
| --- | --- | --- |
| [Appetize build inventory](https://github.com/b45406809-ux/Detail/actions/runs/42156904686) | Pass | Target `du2xyaxoiakaw57cecgor2jfd4` was created by the upload run for the exact EAS build; no device session or backend write |
| [Appetize inspection workflow](https://github.com/b45406809-ux/Detail/actions/runs/42152586430) | Pass, limited | Device became inspectable and captured a screenshot. No business flow was exercised. |
| [Validate Detail CI](https://github.com/b45406809-ux/Detail/actions/runs/42152571405) | Fail, test setup | Mobile checks and Supabase database/Edge Function checks passed; the configured admin login was rejected. This does not establish a product authentication defect. |
| [Read-only site/dashboard smoke](evidence-v5.md#ev-008) | Pass, limited | Homepage, privacy, terms, public blog, and production dashboard sign-in screen rendered; no production credentials were submitted. Authenticated dashboard journeys were explicitly blocked. |
| Local QA fixture isolation tests | Pass, 5/5 | Production-target and same-host writes are rejected; only explicit isolated staging and enabled loopback targets are accepted; fixture composition is checked. |
| Staging build config tests | Pass, 5/5 | Staging requires a distinct explicit backend; production rejects staging auth; missing staging auth config fails closed. |
| [Configuration check](https://github.com/b45406809-ux/Detail/actions/runs/42156279990) | Pass, read-only | Staging URL/key absent; production booking gate ON; write/payment operations gated OFF |
| [Local Supabase and dashboard journeys](https://github.com/b45406809-ux/Detail/actions/runs/42162194166) | Pass | Database security/lint/auth checks passed; 13 synthetic accounts were created and cleaned; dashboard routes, invite create/revoke, audit persistence, and restricted-role denial passed. |

The local dashboard fixture pool leaves all five cleaner accounts `NOT_STARTED`; four are tagged for a future official sandbox verification flow. Existing SQL contract tests use synthetic profile rows to exercise approved-cleaner eligibility logic; that does not represent or claim a Didit result. See [bugs-v5.md](bugs-v5.md) for current blockers. Full lifecycle, payment, iOS and physical-device checks remain blocked or not run as indicated above.

No production account, booking, message, notification, identity or financial record was created by this baseline inventory.

## Backend SQL contract coverage

The local `supabase test db --local` suite passed in CI run `42162194166` at source commit `8eb76d17a58b0612e6de70445adf1963ff81882e`. These checks call database functions and inspect persisted local state; they are component coverage, not a client UI journey or a real external provider result.

| Area | Backend status | Passing test files | Scope and remaining gap |
| --- | --- | --- | --- |
| Booking and bidding | Pass, component tests | `booking_idempotency`, `quote_lifecycle`, `bid_acceptance_replay`, `instant_offer_reservation` | Covers persisted creation/replay, quote lifecycle, acceptance replay and reservations. Client submission, real concurrent UI sessions and full house/car journeys remain blocked. |
| Job transitions and cancellation | Pass, component tests | `completion_evidence_arrival`, `offline_booking_payment`, `reschedule_availability`, `admin_reassignment_safety` | Covers arrival geofence, evidence, reschedule/availability, offline cancellation ledger, reassignment invariants. Full en-route/start/completion/review app journey remains blocked. |
| Chat and presence | Pass, component tests | `messaging_lifecycle`, `cleaner_presence_lease` | Checks durable participant messages, retry deduplication, unread state and stale-location cleanup. Realtime delivery, third-party reads and live participant tracking remain untested. |
| Payments and finance | Pass, simulated database contracts | `paynow_poll_reconciliation`, `paynow_provider_event_inbox`, `paynow_refund_ledger`, `paynow_status_monotonicity`, `non_paynow_settlement_review`, `payout_idempotency` | Checks ledger state/replay, event inbox permissions, refunds and payout idempotency. It does not call Paynow or prove sandbox checkout/callback delivery. |
| Notifications | Pass, queue-state tests | `paynow_notification_outbox`, `notification_delivery_status`, `push_device_lifecycle` | Checks durable outbox, delivery status distinctions and device lifecycle. No Expo/APNs push was sent or reported delivered. |
| Admin and privacy | Pass, security/component tests | `admin_role_access`, `security_invariants`, `participant_avatar_access`, `account_deletion_safety` | Checks role/privilege boundaries, participant media access, deletion restrictions and privacy cleanup. App account switching, all admin mutations and physical permission flows remain untested. |
