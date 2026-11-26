# App Review notes (App Store and Google Play)

Paste the section below into the "Notes" field of App Review Information. Credentials are created by the
ops-runner task `create-review-demo-account`; read the passwords from that run's summary page and paste
them into the sign-in fields. Do not commit them.

## Notes for the reviewer

Detail is a marketplace for in-person cleaning services in Harare, Zimbabwe. Customers post a cleaning job, verified cleaners send quotes, and the customer accepts one.

Two demo accounts are provided so the full booking flow can be tested:

- Customer: appreview@detailapp.co.zw
- Cleaner: appreview.cleaner@detailapp.co.zw

Both accounts can switch between Customer and Cleaner with the toggle on the home screen. The two accounts are a private test pair: bookings from one reach only the other, from any country, and they never interact with real customers or cleaners. The cleaner account has prepaid test credit, so no payment is needed. Identity verification (Didit) and the cleaner registration fee are already completed for both accounts, so no ID document is needed.

To test a booking:
1. Sign in as the customer account and create a booking (any Harare address, e.g. Solomon Mujuru Drive).
2. Sign in as the cleaner account on a second device (or sign out and back in), switch to Cleaner, tap Go Online, open the booking under Nearby jobs and send a quote.
3. Back on the customer account, open Bids Received and accept the quote. Chat and live tracking then open for both accounts.

Either account can complete the whole flow on its own: create a booking as Customer, switch to Cleaner and send a quote, then switch back to Customer and accept it. The second account is provided in case you prefer testing on two devices.

Location: precise location is used to place the booking pin and to match nearby cleaners. Background location is used only while a cleaner has chosen to be online or is on an active booking, and the cleaner can go offline at any time.

Payments for the cleaning service are made directly between customer and cleaner for a physical, real-world service. Cleaners prepay a 10% platform commission; no digital goods are sold.

Account deletion: Profile > Delete account.

## Owner checklist before submitting

- [ ] Make sure appreview@detailapp.co.zw and appreview.cleaner@detailapp.co.zw are real mailboxes someone reads (or forward them).
- [ ] Optional: record a 1-2 minute screen video of the booking flow and add the link to the notes.
- [ ] Re-run `create-review-demo-account` if a reviewer reports a login problem; it repairs both accounts and resets the passwords.
