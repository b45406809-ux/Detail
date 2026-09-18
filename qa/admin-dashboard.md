# Admin dashboard QA matrix

All scenarios run with the Firestore emulator and Functions emulator. Seed at least 125 bookings, use `Africa/Harare` as the operational timezone, store money in ISO-currency minor units, and test once with an admin custom claim and once with only `users.role = ADMIN`.

| Area | Scenario | Expected result |
|---|---|---|
| Every list | Exercise each search term, filter value, empty state, and five cursor pages | Stable server ordering, no duplicates, filters retained |
| Permission | Profile says ADMIN but token has no `admin` claim; finance permission absent | Dashboard denied; sensitive refunds omitted/denied |
| Booking | Two admins assign different cleaners simultaneously | One transaction wins; loser receives conflict; both attempts audited |
| Lifecycle | Create, reschedule, reassign, move through every valid/invalid status, cancel | Only valid transitions succeed; reason/event actor and timestamp persist |
| Refund | Submit same idempotency key twice; then concurrent partial refunds above capture | One refund; cumulative refund never exceeds captured amount |
| No-show | Resolve customer and cleaner no-shows with and without reason | Reason required; payment/support state and immutable events reconcile |
| QR sale | Scan signed cleaner URL, tamper token, expire token, complete sale | Opaque payload attributes valid sale/commission; tampered/expired link fails |
| Time | Create records around 21:59/22:00 UTC and month/year boundaries | Harare local-day/week/month totals are exact |
| Analytics | Reconcile Firestore aggregate with raw events and compare PostHog funnel | Operational and behavioral figures are separately labelled and explain drift |
| Kill switches | Toggle each switch without elevated claim, then with it | First denied; second records reason, actor, server timestamp and banner |
| Alerts | Seed every stale notification, sync, overdue, completion, no-show, payment/refund and low-rating condition | Each alert appears once and links to its booking/case |
| Customer | Edit note/state and inspect sensitive profile with/without permission | Mutations audited; sensitive fields permission-gated |
| Cleaner | Deactivate cleaner with historic paid jobs, then request destructive deletion | History remains; destructive operation rejected |
| Large data | Seed 10,000 bookings and paginate while writes occur | Bounded response size, deterministic cursor behavior, usable latency |
| Waitlist | Submit every required field with marketing Yes and No, then resubmit same email with changed preference | One normalized record per email; profile fields and latest timestamped preference are retained |
| Marketing permission | Attempt list/send without `marketing.read` / `marketing.send`, then with each claim | Unauthorized calls are denied; authorized staff see records and can send |
| Bulk email | Filter by country, city, language and service; reuse an idempotency key; exceed 100 recipients | Only opted-in matches receive one message; duplicate is not resent; oversized send is rejected |
| Unsubscribe | Follow a campaign unsubscribe link and attempt a later campaign | Preference becomes No with a server timestamp and recipient is excluded from later campaigns |
| cPanel routing | Deploy artifact to root and dashboard document roots; hard-refresh nested routes | Apache returns the SPA while preserving real assets and `.htaccess` is present in both roots |
| Admin bootstrap | Run bootstrap helper with credentials supplied only through environment variables | User receives elevated custom claims; no password is written to source or Firestore |
| Manual admin invite | Create an email-restricted link, copy it, accept with the wrong and right email, then reuse after acceptance | Wrong email and replay are denied; matching user receives only selected claims |
| Password change | Submit a wrong current password, weak new password and valid credentials | Firebase reauthentication is required; only the valid change succeeds; password is never logged |
| Waitlist domain | Submit from `detail.co.zw` with Resend unavailable | CORS succeeds, Firestore record persists and signup succeeds despite confirmation-email failure |
| Waitlist role | Submit customer and cleaner entries for House, Car and Both | Participant type and service interest are stored and displayed; cleaner copy says services offered |
| Firebase deployment | Deploy static site without Functions, then run backend workflow | Old callable fails before backend deploy; updated callable accepts `detail.co.zw` and persists the new schema afterward |
