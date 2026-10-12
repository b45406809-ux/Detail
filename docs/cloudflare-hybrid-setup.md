# Detail hybrid backend setup

Firebase Authentication remains the source of identity. Cloudflare Workers,
D1, and R2 provide the application API, relational data, and photo storage.
The mobile environment chooses each provider, so Firebase Functions or Storage
can be restored later without changing app code.

## Run everything locally first

You do not need a Cloudflare payment method, a remote D1 database, or a remote
R2 bucket for local development. Wrangler simulates both D1 and R2 on your
computer and keeps their data in local state.

```powershell
Copy-Item cloudflare\.dev.vars.example cloudflare\.dev.vars
npx wrangler d1 migrations apply detail --local --persist-to .wrangler\detail-local --config cloudflare/wrangler.detail-api.toml
npx wrangler dev --local --persist-to .wrangler\detail-local --config cloudflare/wrangler.detail-api.toml
```

The Worker will print a local address, normally `http://localhost:8787`.
For an Android emulator use `http://10.0.2.2:8787` in the mobile `.env`; for
the iOS simulator use `http://localhost:8787`. A physical phone needs an HTTPS
tunnel to your computer, because `localhost` on the phone means the phone
itself, not your development machine.

```env
EXPO_PUBLIC_BACKEND_PROVIDER=cloudflare
EXPO_PUBLIC_STORAGE_PROVIDER=cloudflare-r2
EXPO_PUBLIC_CLOUDFLARE_API_URL=http://10.0.2.2:8787
EXPO_PUBLIC_MAP_PROVIDER=mapbox
EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN=pk.your_public_mapbox_token
EXPO_PUBLIC_SIMULATE_FUNCTIONS=false
```

Local D1/R2 state is deliberately separate from the future deployed backend.
When you are ready to publish, create real Cloudflare resources, replace the
placeholder D1 ID in the Wrangler file, apply migrations with `--remote`, and
deploy.

## Create the Cloudflare resources

From the repository root:

```powershell
npx wrangler login
npx wrangler d1 create detail
npx wrangler r2 bucket create detail-photos
```

Copy the D1 database ID printed by the create command into
`cloudflare/wrangler.detail-api.toml`. Then apply the schema and deploy:

```powershell
npx wrangler d1 migrations apply detail --remote --config cloudflare/wrangler.detail-api.toml
npx wrangler secret put PESEPAY_INTEGRATION_KEY --config cloudflare/wrangler.detail-api.toml
npx wrangler secret put PESEPAY_ENCRYPTION_KEY --config cloudflare/wrangler.detail-api.toml
npx wrangler secret put PESEPAY_WEBHOOK_SECRET --config cloudflare/wrangler.detail-api.toml
npx wrangler deploy --config cloudflare/wrangler.detail-api.toml
```

`PESEPAY_WEBHOOK_SECRET` must be sent by PesePay as
`x-detail-webhook-secret`; if PesePay supplies a signed webhook scheme for
this merchant account, replace that shared-secret check with their documented
signature validation before enabling real payments.

Set PesePay's result/webhook URL to:

```text
https://detail-api.<your-subdomain>.workers.dev/v1/payments/pesepay/webhook
```

The Worker deliberately does not simulate checkout: `createPesePayPayment`
returns a configuration error until the merchant's documented checkout request
and webhook signature scheme are supplied. That exchange belongs in the Worker
only; never put either PesePay secret in the Expo environment.

## Mobile environment

Add the deployed worker address to `mobile/.env`:

```env
EXPO_PUBLIC_BACKEND_PROVIDER=cloudflare
EXPO_PUBLIC_STORAGE_PROVIDER=cloudflare-r2
EXPO_PUBLIC_CLOUDFLARE_API_URL=https://detail-api.<your-subdomain>.workers.dev
EXPO_PUBLIC_MAP_PROVIDER=mapbox
EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN=pk.your_public_mapbox_token
EXPO_PUBLIC_SIMULATE_FUNCTIONS=false
EXPO_PUBLIC_DEMO_MODE=false
```

Keep the existing Firebase public configuration because the app still signs in
with Firebase Auth and the Worker verifies those Firebase ID tokens.

To roll back a provider without a code change:

```env
EXPO_PUBLIC_BACKEND_PROVIDER=firebase
EXPO_PUBLIC_STORAGE_PROVIDER=firebase
EXPO_PUBLIC_MAP_PROVIDER=google
```

The Worker currently owns the callable-operation path. Screens that still use
direct Firestore listeners must be migrated to `callFunction`/Worker queries
before Cloudflare can be the sole data source; do not delete Firestore or its
rules until that screen-by-screen migration is complete.
