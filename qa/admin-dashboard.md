# Admin dashboard release QA

Run against an isolated Supabase staging project after migrations and Edge Functions are deployed. Use separate elevated and least-privilege admin accounts, plus test customer and cleaner accounts. Do not use production financial records for test runs.

| Area | Scenario | Expected result |
|---|---|---|
| Access control | Try every API as signed out, ordinary user, standard admin without permission, and elevated admin | Only the authorized role can read or mutate each record; elevated actions require an audit reason. |
| Search and paging | Search bookings, users, payments, cases; use filters and traverse multiple cursor pages while records are added | Results remain scoped and stable with no duplicates or missing pages. |
| Booking operations | Reschedule, reassign to an available verified cleaner, cancel; attempt each with closed bookings or invalid cleaner IDs | Valid changes persist with event, actor, reason, and notifications; invalid changes fail without partial writes. |
| Refund review | Request full and partial refunds; repeat a request; exceed original amount | Request is recorded once, never exceeds captured value, and is not displayed as paid before Paynow confirms the refund. Issue the actual refund in Paynow's merchant portal and reconcile it. |
| Cleaner account control | Deactivate a cleaner and suspend/reactivate a customer; test sign-in and job visibility | Suspended accounts cannot be assigned or bid; banned customer auth is blocked; history is retained. |
| Support queue | Create general and booking support cases, resolve with notes, attempt resolution without permission | Cases retain the reporter and resolution; unauthorized mutation fails; urgent alerts notify admins. |
| Payout queue | Pay and reject a cleaner payout; replay action; compare wallet transactions and transfer reference | Balance is reserved once; paid settlement is auditable; rejection returns the reserved amount exactly once. |
| Payments overview | Compare booking/payment counts and daily revenue with database rows across Harare day boundaries | Values exclude wallet top-ups from booking revenue and reconcile exactly. |
| Admin invitations | Invite least-privilege staff, accept as wrong/right email, reuse and expire a link | Wrong email, replay, expired token, and unselected permissions are rejected. |
| Waitlist and mail | Test marketing consent, duplicate signup, campaign audience, unsubscribe, and provider failure | No unconsented email is sent; records remain auditable; failures are visible and retry-safe. |
| Large datasets | Seed at least 10,000 rows and search/page under concurrent writes | Requests stay bounded and complete within the agreed operations latency target. |

The dashboard is backed by Supabase Edge Functions; do not use the retired Firebase/Firestore emulator instructions for this workflow.
