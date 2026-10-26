# Booking lifecycle release QA

## Live Android UI smoke test

Run the `Live Android APK UI test` GitHub Actions workflow on a branch to build its production-configured APK and exercise the customer and cleaner screens on an Android emulator against the live Supabase project. The test creates confirmed, run-specific accounts without sending email, checks customer agreement/profile/permission writes, and verifies that closed bookings and unfinished cleaner identity checks block submission. It stops before booking creation, Didit, Paynow, SMS, and cleaner notifications, then anonymizes and removes the temporary accounts.

The workflow fails its safety preflight if the live beta config says bookings are enabled. This smoke test does not replace the full booking lifecycle matrix below; a verified cleaner, enabled booking area, and provider sandbox are still required to test quotes, acceptance, job progression, and settlement end to end.

Use an isolated Supabase staging project and two verified test accounts (customer and cleaner). Exercise Android and iOS on real devices with push notifications, location, and photo permissions enabled and denied.

| Case | Procedure | Expected |
|---|---|---|
| Customer booking | Search all cleaners, filter House/Car, nearby search, favorites, create booking with checklist/photos, receive bids | Search returns only eligible verified cleaners; nearby results honor the user's radius and cleaner coverage; booking and bid data are private to participants. |
| Instant matching | Go online as a verified cleaner, create Book Now from a nearby customer, accept/decline from two cleaners, and let an offer expire | Only online, verified, fresh-location cleaners within radius receive safe summaries; one accepted offer is presented to the customer for payment choice; duplicate/expired offers cannot assign an unpaid booking. |
| Supplies pricing | Create scheduled and instant requests with supplies both off and on; accept a scheduled bid | The server price includes the configured surcharge once, the displayed total matches payment, and cleaner payout/commission use that same gross amount. |
| Offer acceptance | Accept a bid with Paynow BuySafe, cancel hosted checkout, then retry; separately accept direct payment | The Detail-branded payment handoff is clear, status never claims payment before provider confirmation, BuySafe must clear before cleaner starts, and direct payment clearly explains no escrow. |
| Provider callback | Replay valid/invalid Paynow callbacks, poll while pending, deliver duplicate and out-of-order statuses | Hash/amount/reference checks reject invalid updates; duplicate events do not credit twice; terminal/refund/dispute statuses remain reconcilable. |
| Cancellation | Cancel wallet, direct-payment, pending Paynow, escrowed, and active bookings from both roles | Wallet refund/commission reserve is applied once; Paynow cancellation opens review instead of claiming a refund; invalid terminal cancellation is rejected. |
| Reschedule | Reschedule future pending/assigned booking, choose past/too-soon date, try after work starts | Valid future date persists and notifies the other party; server rejects dates inside the two-hour window and in-progress/closed jobs. |
| Availability collision | Assign two jobs to the same cleaner with overlapping duration/buffer, then reschedule one into the other | The second assignment/reschedule fails atomically; the original availability block remains intact; completed/cancelled work releases its block. |
| Cleaner portfolio | Upload, view as another customer, delete, exceed 12 photos, upload another user's path | Only verified active cleaners can publish; public signed URLs expose only portfolio photos; ownership checks prevent tampering and delete removes storage object. |
| Job progress | Cleaner accepts, shares location, arrives, starts, uploads completion evidence and completes; customer tracks | Only valid status transitions succeed; precise location is visible only to booking participants; evidence is stored in private media. |
| Notifications | Enable/disable push, transition status, send urgent alert, revoke a device token | In-app event is retained, push delivery is attempted, stale Expo tokens are removed, notification opens the relevant job/case. |
| Outbox recovery | Make Expo/Twilio unavailable, restore provider access, run the scheduled worker, and deliver an Expo receipt error | Failed delivery retries with backoff, terminal failures remain visible, and missing-device receipts clear only the matching token. |
| Safety and support | Send SOS from an active booking; submit generic support request; report no-show/dispute | Cases are created with severity, booking, and reporter, and admins are notified; failure is shown to the user. |
| Payout | Earn, request payout, settle and reject requests; replay operations | Funds remain reserved until settled; transfer reference is required; rejection restores balance once; ledger totals reconcile. |
| Account recovery/deletion | Test email/SMS/OAuth recovery, delete with active job, payout, and clean account | Active financial obligations block deletion; eligible deletion anonymizes retained marketplace history and removes private identity/media data according to policy. |
| Network resilience | Kill the app during checkout, go offline during transitions, relaunch, retry operations | Server status is authoritative; idempotency prevents duplicate bookings, debits, refunds, or payouts. |

No end-to-end or provider sandbox execution is claimed until this matrix passes against a configured staging project.
