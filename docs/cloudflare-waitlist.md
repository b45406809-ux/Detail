# Cloudflare D1 waitlist

The marketing waitlist is independent from Firebase billing. The public site writes to a Cloudflare Worker, the Worker validates and stores records in D1, and the dashboard reads the same D1 database after verifying the signed Firebase administrator token. Firebase Authentication remains the identity provider; the browser never receives D1 or Cloudflare credentials.

## Automated production setup

The normal site deployment creates or reuses the `detail-waitlist` D1 database, applies the SQL migrations, deploys the `detail-waitlist` Worker, configures its D1 binding and secrets, and injects the resulting public Worker URL into the Vite build. No manual database ID or Worker URL is required.

Configure these in the protected GitHub `production` environment:

- variable `CLOUDFLARE_ACCOUNT_ID`;
- secret `CLOUDFLARE_API_TOKEN` with **D1: Edit** and **Workers Scripts: Edit** account permissions;
- secret `TURNSTILE_SECRET` when `VITE_TURNSTILE_SITE_KEY` is enabled;
- secret `RESEND_API_KEY` for dashboard marketing campaigns;
- the existing Firebase public web variables, because dashboard sign-in and verified `admin` custom claims remain the authorization boundary.

The API exposes only public waitlist submission and unsubscribe routes without authentication. Waitlist listing and campaign sending require a valid, unexpired Firebase ID token whose cryptographically verified custom claims include `admin: true`.

## Data ownership

- Marketing site waitlist and campaign audit records: Cloudflare D1.
- Mobile users, bookings, payments and operational app data: Firebase.
- Dashboard waitlist tab: Cloudflare D1.
- Other operational dashboard modules: existing privileged Firebase endpoints.

The D1 email column is unique. A repeated signup updates contact preferences without creating duplicates, while retaining the original join timestamp. Campaign sends select only active records whose current marketing choice is `YES`, include a unique unsubscribe URL, enforce an idempotency key, and record the actor and recipient count.
