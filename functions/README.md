# Detail — Cloud Functions

Server-side logic that the client cannot be trusted to do (moving money between
users, computing rating averages, talking to PesePay with secret keys).

| Function | Type | What it does |
|---|---|---|
| `settleJobPayment` | callable | Customer pays a finished job. WALLET = atomic debit/credit + ledger; CASH = mark paid. |
| `submitRating` | callable | Writes a review and recomputes the cleaner's `ratingAverage` / `ratingCount`. |
| `createPesePayPayment` | callable | Starts a PesePay hosted checkout for a wallet top-up; writes a PENDING transaction. |
| `pesepayWebhook` | HTTP | PesePay calls this on completion; verifies, then credits the wallet (idempotent). |

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
