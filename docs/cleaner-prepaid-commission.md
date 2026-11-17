# Cleaner prepaid commission and identity verification

## Commission rules

- Detail commission is 10% of the accepted cleaner quote.
- For offline bookings, the cleaner must have enough commission credit when the customer accepts the quote. Detail reserves that 10% immediately. A $1 credit covers a total of $10 in accepted work; a $20 quote reserves $2.
- A cancelled direct/offline booking returns the reserved amount through a separate wallet ledger entry.
- After completion is confirmed, the existing reserve is recorded as earned platform commission. It is not charged a second time and no new commission debt is created.
- Current customer bookings are paid directly to the cleaner by an agreed method. Paynow remains available for wallet top-ups, not customer booking checkout.
- Any commission debt created under the previous direct-payment policy must be paid before a cleaner can submit or accept more work.

The cleaner bid screen shows the 10% amount before a quote is submitted. The acceptance notification states the amount reserved. The wallet and activity screens show the available commission credit, old amount due, and cleared earnings.

## Didit verification fee

- Cleaners must be Didit verified before they can accept jobs.
- Starting verification costs a one-time $0.50, charged from the Detail wallet. For existing cleaners, the fee uses the commission balance; during cleaner registration it uses the general wallet balance.
- If Didit cannot start a session or Detail cannot save it, the launch fee is returned. That failed launch counts as the one-time fee allowance, so the next attempt is complimentary.
- A successful Didit session consumes the one-time fee even if Didit rejects the check. A rejected cleaner remains unable to accept jobs. They can correct their details, retry without another fee, or contact Detail support to appeal.
- The fee is non-refundable only where permitted by law; the app terms also preserve refunds required by law or where the verification service was not provided.

## Apple payment guideline

Apple’s [App Store Review Guidelines, section 3.1.3(e)](https://developer.apple.com/app-store/review/guidelines/#goods-and-services-outside-of-the-app) says an app that lets people buy physical goods or services consumed outside the app must use a payment method other than in-app purchase. A cleaning booking is a real-world service, so the customer payment and the cleaner’s related commission should use external payment rails rather than Apple in-app purchase. The separate cleaner identity-check charge is less explicit in Apple’s wording because it unlocks marketplace participation; keep it clearly tied to the external Didit verification service and confirm its presentation with App Review for the iOS submission.

## Release note

The behavior is implemented in the mobile app, the `marketplace-api` Edge Function, and migration `20261117010000_prepaid_cleaner_commission_and_kyc_fee.sql`. Deploy the migration and Edge Function before releasing the app build. Existing cleaners will need to accept the revised Cleaner Agreement before they can bid again. The migration has not been applied to production by this change.
