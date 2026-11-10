# Physical-device marketplace verification

Use this checklist after installing a build from the exact commit under test. Appetize and simulators cannot verify all native permissions, background delivery, camera behavior, or real call audio.

## Before testing

- Use a dedicated QA backend and sandbox credentials for every provider. Do not run booking, KYC, payout, or payment checks against production data.
- Use one synthetic customer and two synthetic cleaners. Use a second customer only when testing concurrency. Keep no more than four QA accounts active for this checklist.
- Record platform, OS version, app version, source commit, build identifier, backend environment, and test account aliases. Do not record tokens, identity documents, card details, or full phone numbers.
- Confirm that booking, notifications, email, SMS, KYC, payment, and payout endpoints are in the intended sandbox/QA mode. Stop that provider flow if its mode is unknown.
- Capture screenshots or screen recordings and the matching backend record IDs. Mark each row **Pass**, **Fail**, **Blocked**, or **Not run**. Clean up only the synthetic QA records created for that run.

## Customer and cleaner marketplace journey

| Step | Action | Verify in the app and backend |
| --- | --- | --- |
| Registration | Create a synthetic customer account using the configured email flow, then repeat using the SMS flow only if SMS sandbox mode and a test recipient are confirmed. | OTP is delivered and accepted once; expired or reused codes are rejected; exactly one profile exists for each auth user. |
| Cleaner setup | Create two cleaner accounts. Complete the provider's documented KYC sandbox flow where available. | An unverified cleaner cannot go online or submit bids. Verified status is recorded only after a genuine signed provider result. |
| Search and booking | Set test locations and availability. Search, open cleaner profiles, select a service, enter details, and submit one QA booking. | Booking has the expected customer, address/service, schedule, status and idempotency key. No real cleaner receives a test job. |
| Competing bids | Have both synthetic cleaners submit different offers. Edit or withdraw one offer, then accept the other as the customer. | Both bids persist; only one cleaner is assigned; replaying acceptance does not assign twice; the losing offer closes. |
| Chat and safety | Exchange messages from both accounts. Check the 24-hour notice, scam-safety copy, delivery state, and a message with an attachment. | Both accounts see the correct conversation; authorization rejects a third account; expired messages disappear from app views while remaining stored according to policy. |
| In-app call | Start a call from the active booking chat, grant microphone permission, connect both devices, mute/unmute, and hang up. Repeat with the callee backgrounded after push credentials are configured. | Only booking participants can get call tokens; call setup and disconnect are recorded without exposing phone numbers; server-enforced call end occurs at 300 seconds. |
| Tracking and permissions | Grant foreground location, begin the assigned job, move the cleaner device, background/restore the app, deny location once, then retry after enabling it. | Customer sees fresh cleaner location only during the active booking; permission-denied UI explains recovery; stale/background locations are not shown as live. |
| Arrival and completion | Cleaner records arrival, starts service, uploads before/after evidence, and completes the job. Customer confirms completion. | State transitions require the assigned cleaner/customer; evidence objects use the QA bucket; duplicate actions are idempotent. |
| Reviews | Customer submits one rating and review; open the cleaner profile from the customer account. | Review is linked to the completed booking, visible once, and rating aggregates update once. |
| Rebook | Rebook the same cleaner from history/reviews and change the time or service details before submitting. | The new booking has a new ID, preserves the selected cleaner and edited details, and does not copy old payment or completion state. |
| Cancellation | Cancel once before acceptance and once after acceptance using separate QA bookings. | Each policy outcome and refund decision is persisted; sandbox refund callbacks are verified cryptographically; no successful refund is inferred from a request alone. |

## Sandbox payments and cleaner wallet

Run only after Paynow confirms the configured integration is sandbox and the QA backend is isolated. Use provider-supplied test instruments; never use a real card, wallet, or bank account.

1. Accept a QA bid with Paynow and complete the provider sandbox checkout.
2. Verify the signed callback and persisted payment state before treating the booking as paid or escrowed.
3. Complete the QA booking, then verify the platform fee and cleaner share in the ledger and wallet.
4. Request a sandbox withdrawal and verify its provider status and idempotency. Check replayed or forged callbacks are rejected.
5. Test cancellation/refund and confirm the ledger balances reconcile with the provider sandbox record.

## Push, email, SMS, and campaign checks

- Test each channel separately with a QA recipient. Confirm the sender and provider environment before sending anything; do not include real beta testers in the audience.
- Test foreground, background, terminated-app, denied-permission, and reopened-app behavior on both platforms.
- Send a campaign once to a one-account QA segment. Check audience count, consent/unsubscribe filtering, delivery result, per-channel usage counters, and audit record.
- Trigger one inactivity reminder only after validating the QA scheduler and recipient segment. Pause it from the dashboard and verify that no subsequent QA reminder is queued.
- Confirm the dashboard shows channel and purpose attribution separately. A provider API acceptance response is not proof of handset delivery.

## Device-specific checks

### Android

- Test on a Play Services device and a device without Play Services if supported. Verify Google sign-in, microphone, notification, location, camera, and photo permissions.
- Background and restore the app during an active booking and call. Verify incoming call notification and audio routing with screen locked.
- Check Android back navigation, keyboard dismissal, edge-to-edge insets, bottom navigation, and dialogs at the smallest supported screen size and large text setting.

### iPhone

- Test Apple sign-in on a physical device, including cancel, first consent, and a returning account. Confirm Supabase receives the expected identity token and creates one profile.
- Test PushKit/CallKit incoming calls with the app foregrounded, backgrounded, and terminated; confirm microphone route, speaker, Bluetooth, lock screen controls, and the five-minute cap.
- Check photo library/camera, foreground/background location, notification permission denial/re-enable, safe-area insets, keyboard dismissal, and large text.

## Results record

| Platform / OS | Build ID and commit | Scenario | Status | Evidence link / backend IDs | Bug ID |
| --- | --- | --- | --- | --- | --- |
|  |  |  | Not run |  |  |

