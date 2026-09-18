# Cloudflare D1 waitlist

The marketing waitlist and dashboard are independent from Firebase billing. The public site and dashboard use a Cloudflare Worker, and the Worker validates and stores records in D1. The browser never receives D1 or Cloudflare credentials.

## Automated production setup

The normal site deployment creates or reuses the `detail-waitlist` D1 database, applies the SQL migrations, deploys the `detail-waitlist` Worker, configures its D1 binding and secrets, and injects the resulting public Worker URL into the Vite build. No manual database ID or Worker URL is required.

Before either FTPS upload begins, deployment calls the live Worker health endpoint and checks an actual CORS preflight from `https://detail.co.zw`. A broken Worker, missing D1 binding, missing URL, or invalid CORS configuration therefore stops deployment instead of publishing a marketing site that can only display “Failed to fetch”.

Configure these in the protected GitHub `production` environment:

- variable `CLOUDFLARE_ACCOUNT_ID`;
- secret `CLOUDFLARE_API_TOKEN` with **D1: Edit** and **Workers Scripts: Edit** account permissions;
- secret `TURNSTILE_SECRET` when `VITE_TURNSTILE_SITE_KEY` is enabled;
- secret `RESEND_API_KEY` for dashboard marketing campaigns;
- optional `INITIAL_ADMIN_EMAIL` and protected `INITIAL_ADMIN_PASSWORD`. The initial account is created only when it does not already exist and must change its password. Until the secret is configured, the bootstrap fallback is the initial email itself, matching the temporary launch credential requested by the owner.

The API exposes only public waitlist submission, sign-in, invite acceptance and unsubscribe routes without a session. All dashboard operations require an opaque, expiring session whose SHA-256 digest is stored in D1. Passwords use PBKDF2-SHA256 with a unique salt and 210,000 iterations.

On the first successful deployment, the owner can sign in at `dashboard.detail.co.zw` with `crzzphillip@gmail.com`. If `INITIAL_ADMIN_PASSWORD` has not yet been configured, the temporary password is also `crzzphillip@gmail.com`. Change it immediately in **Admins & Security**. Deployments may repair this temporary credential while `must_change_password` is still active, but never overwrite a password after the owner changes it.

## Data ownership

- Marketing site waitlist and campaign audit records: Cloudflare D1.
- Mobile users, bookings, payments and operational app data: Firebase.
- Dashboard waitlist tab: Cloudflare D1.
- Other dashboard modules: authenticated Cloudflare Worker RPC endpoints; mobile operational data remains isolated until a deliberate server-side synchronization is introduced.

The D1 email column is unique. A repeated signup updates contact preferences without creating duplicates, while retaining the original join timestamp. Campaign sends select only active records whose current marketing choice is `YES`, include a unique unsubscribe URL, enforce an idempotency key, and record the actor and recipient count.
