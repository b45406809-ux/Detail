# Booking lifecycle emulator QA

Run Functions and Firestore emulators, use two authenticated fixture users (`customer`, `cleaner`) and assert both document state and `jobs/{jobId}/events`.

| Case | Procedure | Expected |
|---|---|---|
| Delayed push | Disable network, transition, reconnect | Firestore state restores; notification deep-link opens tracking. |
| Duplicate acceptance | Invoke `acceptBid` twice concurrently with one idempotency key | One payment/event; one accepted bid; competitors rejected. |
| Insufficient funds | Wallet below bid | `INSUFFICIENT_FUNDS`; no assignment or debit. |
| App terminated | Kill after acceptance, relaunch | Assigned job is restored from Firestore. |
| Cancellation/completion race | Invoke both concurrently | Exactly one terminal result; invalid transition rejected. |
| Customer/cleaner no-show | Report from each role with notes/evidence | Separate `ADMIN_REVIEW` case and immutable event. |
| Duplicate webhook | Replay provider payload | One ledger credit. |
| Refund retry | Force provider failure then retry same key | Pending/failed is visible; one eventual refund. |
| Low rating | Submit 1–2 stars without/with description | First rejected; second creates one review case; duplicate rejected. |
| Kill switches | Toggle each beta config flag | Booking/payment disabled independently; maintenance blocks beta; contact fallback shown. |
| Completion idempotency | Call completion twice | One earnings mutation and one completion event. |
| Account deletion | Try with active job, then resolve and retry after recent auth | First blocked; second anonymizes retained records, removes private data/tokens, revokes and deletes auth user. |
