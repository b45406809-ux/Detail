# Beta validation matrix v1

Run: `2026-11-06-baseline`

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

## Scenario matrix

Every row describes one area; case details follow the approved plan. Evidence and bug IDs are recorded in [evidence-v1.md](evidence-v1.md) and [bugs-v1.md](bugs-v1.md). A render-only result never passes a functional row.

| ID | Area and required checks | Android | iOS | Backend evidence required |
| --- | --- | --- | --- | --- |
| AUTH-01 | Customer and cleaner registration, email verification, password/code login, wrong/expired/reused codes, recovery, logout, restore/expiry, Google/Apple where offered | Blocked | Blocked | Auth users, verified status, session/revocation state |
| ONB-01 | Splash, customer/cleaner onboarding, commission configuration agreement | Not run | Not run | Persisted profile/role and matching commission setting |
| PERM-01 | Camera, library, location, notification allow/deny/permanent denial/settings recovery | Blocked | Blocked | Permission-dependent action state; physical device evidence |
| NAV-01 | Tabs, controls, dialogs, back, keyboard, empty/loading/error, deep links, long names, small/large text | Blocked | Blocked | State after navigation and account-switch isolation |
| BOOK-01 | House/car scheduling, address/map, options, notes, photos, supplies, date/price, submit | Blocked | Blocked | Persisted booking, eligible visibility, no partial write on failure |
| BID-01 | Multiple bids, compare/decline/accept, eligibility, expiry, unavailable cleaner, races/double taps/overlap | Blocked | Blocked | One valid assignment; losers and expired actions rejected atomically |
| JOB-01 | Request → bid/accept → payment choice → en route → arrival → start → evidence → completion → review; house/car and supported modes | Blocked | Blocked | Server state and money invariants at every transition |
| CHAT-01 | Two-way assigned-participant messaging, order/time/unread/reconnect/background/attachments | Blocked | Blocked | Messages persist once; unauthorized third-party reads/writes rejected |
| TRACK-01 | Location updates, tracking, participant visibility and unauthorized access | Blocked | Blocked | Precise coordinates visible only to participants |
| CANCEL-01 | Either-role cancellation by stage, reschedule, no-show, decline, expiry, favorite/rebook | Blocked | Blocked | Prior job retained, availability/price correct, no partial writes |
| PAY-01 | Paynow official method/icon/handoff; sandbox success/pending/failure/cancel/interruption/retry; direct payment | Blocked | Blocked | Provider sandbox evidence and reconciled amount/fees/commission/balance |
| FIN-01 | Duplicate/out-of-order/invalid callbacks, poll, refund, payout and replay protection | Blocked | Blocked | Ledger invariants; mocked provider runs labeled simulations only |
| NOTIF-01 | Bid, acceptance, chat, cancel, reschedule, en route, arrival, completion; foreground/background/denied/expired token | Blocked | Blocked | Correct recipient, single event, delivery state and route |
| CLEAN-01 | Registration, agreement, verification handoff/return/reject/retry, approval, role switch, availability, portfolio, earnings/payout | Blocked | Blocked | Fixtures do not imply identity approval; restricted actions enforced |
| ADMIN-01 | Two admins with distinct permissions; sessions, invites, booking/support/dispute/payout actions and audit trail | Blocked | Blocked | Only tagged fixtures change; audit event and app state agree |
| PRIV-01 | Third-party booking/chat/photo/location access; account switch/logout; recovery/deletion restrictions | Blocked | Blocked | RLS/function denial and no prior-account data leak |
| RES-01 | Offline before/after submit, kill/relaunch during booking/chat/checkout/progress, slow/error/expired session/upload | Blocked | Blocked | Retry recovers authoritative state without duplicates |
| PERF-01 | 10 cold + 10 warm launches/platform; API p95, event p95, action feedback, spinner/crash and 30-minute soak | Not run | Not run | Measurements carry platform, device, network, sample size, median/p95 |
| LOAD-01 | 10/25/50 concurrent users; competing bids, chat, state transitions and retries | Not run | Not run | Isolated backend only; <1% unexpected errors and invariant checks |
| DEVICE-01 | Android/iPhone camera/library, GPS/background, OAuth, push/tap, links, checkout return, interruption/resume | Blocked | Blocked | Guided physical-device evidence required |

## Baseline evidence

| Evidence | Result | Scope |
| --- | --- | --- |
| [Appetize build inventory](https://github.com/b45406809-ux/Detail/actions/runs/42156904686) | Pass | Target `du2xyaxoiakaw57cecgor2jfd4` was created by the upload run for the exact EAS build; no device session or backend write |
| [Appetize inspection workflow](https://github.com/b45406809-ux/Detail/actions/runs/42152586430) | Pass, limited | Device became inspectable and captured a screenshot. No business flow was exercised. |
| [Validate Detail CI](https://github.com/b45406809-ux/Detail/actions/runs/42152571405) | Fail | Mobile checks and Supabase database/Edge Function checks passed; public site passed; dashboard admin password sign-in did not reach Overview |
| [Configuration check](https://github.com/b45406809-ux/Detail/actions/runs/42156279990) | Pass, read-only | Staging URL/key absent; production booking gate ON; write/payment operations gated OFF |

No production account, booking, message, notification, identity or financial record was created by this baseline inventory.
