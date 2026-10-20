# Detail — Cloud Functions

Server-side logic that the client cannot be trusted to do (moving money between
users, computing rating averages, and handling payment provider credentials).

| Function | Type | What it does |
|---|---|---|
| `settleJobPayment` | callable | Customer confirms a finished WALLET/CASH job; releases the cleaner's share and records Detail's 10% commission exactly once. |
| `submitRating` | callable | Writes a review and recomputes the cleaner's `ratingAverage` / `ratingCount`. |
| `acceptBid` | callable | Customer accepts a quote; sets the authoritative price and auto-declines every other outstanding bid on the job. |
| `counterOffer` | callable | Customer or cleaner proposes a new price on an open bid; appended to the bid's `history`. |
| `createPesePayPayment` | callable | Starts a PesePay hosted checkout for a wallet top-up; writes a PENDING transaction. |
| `pesepayWebhook` | HTTP | PesePay calls this on completion; verifies, then credits the wallet (idempotent). |
| `acceptBid` (PAYNOW) | callable | Assigns the selected cleaner and starts a per-booking Paynow BuySafe checkout. |
| `paynowWebhook` | HTTP | Validates Paynow's status hash; advances escrow state and credits cleaner earnings only on `Paid` after job completion. |
| `refreshPaynowBookingPayment` | callable | Polls Paynow's trusted poll URL when a callback is delayed. |
| `retryPaynowBookingPayment` | callable | Starts a new checkout after a failed Paynow initiation. |
| `onBidCreated` | Firestore trigger | New quote → notifies the job's customer (in-app + push). |
| `onJobUpdated` | Firestore trigger | Job status change (en route / arrived / in progress / completed / cancelled) → notifies the other party. |
| `onMessageCreated` | Firestore trigger | New chat message → notifies whichever participant didn't send it. |

Notifications are written to `/notifications/{id}` (readable only by the recipient) and,
when the recipient has an `expoPushToken` on their user doc, also sent as an Expo push
through `https://exp.host/--/api/v2/push/send`. The mobile app registers its token by
writing `expoPushToken` on its own `/users/{uid}` doc — no callable required, since it's
not one of the trust/money fields locked to Cloud Functions in `firestore.rules`.

## One-time setup

```bash
# From the repo root
npm install -g firebase-tools
firebase login

# Put your project id in .firebaserc (replace YOUR_FIREBASE_PROJECT_ID)
firebase use --add

cd functions
npm install
```

## PesePay secrets (never commit these)

```bash
firebase functions:secrets:set PESEPAY_INTEGRATION_KEY
firebase functions:secrets:set PESEPAY_ENCRYPTION_KEY
```

In your PesePay dashboard, set the **Result URL** to:
`https://us-central1-<PROJECT_ID>.cloudfunctions.net/pesepayWebhook`

## Paynow BuySafe secrets (never commit these)

```bash
firebase functions:secrets:set PAYNOW_INTEGRATION_ID
firebase functions:secrets:set PAYNOW_INTEGRATION_KEY
```

Configure `https://us-central1-<PROJECT_ID>.cloudfunctions.net/paynowWebhook` as the integration's result URL and keep BuySafe enabled. The customer pays for each booking through the hosted Paynow checkout. Paynow sends signed status updates; the backend also polls Paynow's signed status endpoint when the customer refreshes. Cleaner balance is credited only after Paynow reports `Paid` and the job is complete. Paynow settles to Detail's merchant bank account; cleaner transfers are separate and currently require an operational payout process.

## Deploy

```bash
# Functions only
firebase deploy --only functions

# Or everything (rules + indexes + functions) together
firebase deploy
```

## Local testing (optional)

```bash
cd functions
npm run serve   # builds + starts the emulator
```

> The mobile app runs these in PROD builds (`__DEV__ === false`). In DEV / Expo Go
> the app simulates payment & rating locally, so you don't need the functions
> deployed just to click through the UI — but you do need them for real money flow.
