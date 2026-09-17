# Webzim cPanel deployment runbook

## Architecture

The marketing site and dashboard intentionally share one Vite build (`site/dist`). The app selects the protected dashboard when the hostname is `dashboard.detailapp.co.zw` or the path starts with `/admin`. CI uploads the same immutable artifact to:

- `public_html/` for the main domain;
- `public_html/dashboard/` for the dashboard subdomain document root.

In cPanel, create `dashboard.detailapp.co.zw` and set its document root to `public_html/dashboard`. Add the DNS record supplied by Webzim and enable AutoSSL. Do not expose Firebase service-account credentials in cPanel: all administrative writes use deployed callable Cloud Functions.

## Apache SPA routing

`site/public/.htaccess` is copied by Vite to `site/dist/.htaccess`. It sends non-file/non-directory routes to `/index.html`, so reloads of `/privacy`, `/admin/bookings`, and dashboard routes do not return Apache 404s. `mod_rewrite` and `AllowOverride` must be enabled by Webzim.

If the dashboard is ever hosted as a **path** (`example.co.zw/dashboard/`) instead of a subdomain, create a separate dashboard build with `base: '/dashboard/'`, use `RewriteBase /dashboard/`, and rewrite to `/dashboard/index.html`. That change is not required for the current subdomain design because its document root is already the URL root.

If the dashboard later becomes a separate repository, give it an independent build, FTPS account scoped to `public_html/dashboard/`, workflow, environment approval, and deployment history. Keep the Firebase custom-claim authorization and callable-only writes unchanged.

## GitHub production environment

Create a GitHub Environment named `production`, protect it with required reviewers, then add:

### Required secrets

- `FTP_SERVER` — Webzim FTP hostname, without `ftps://`.
- `FTP_USERNAME` — cPanel FTP user with access to both target directories.
- `FTP_PASSWORD` — FTP password.
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_APP_ID`
- `VITE_POSTHOG_KEY` (optional; omit to disable analytics)
- `VITE_TURNSTILE_SITE_KEY` (recommended)

### Repository/environment variables

- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_FUNCTIONS_REGION` (`us-central1`)
- `VITE_POSTHOG_HOST` (`https://us.i.posthog.com`)

Although Firebase web configuration is public in the generated browser bundle, API key and app ID are stored as GitHub secrets to keep environment management consistent. Never add `RESEND_API_KEY`, `TURNSTILE_SECRET`, Firebase service-account JSON, or payment secrets to Vite variables; configure those with Firebase Functions secrets.

## First deployment checklist

1. Confirm explicit FTPS on port 21 and passive mode are supported.
2. Confirm the FTP user's home/path semantics. The workflow expects `public_html/`; some restricted FTP accounts may require `/` instead.
3. Back up the current `public_html` content.
4. Create the subdomain and its `public_html/dashboard` document root.
5. Add GitHub secrets/variables and approve the `production` environment.
6. Push to `main`, inspect build and both FTPS steps, then verify `.htaccess` exists in both destinations.
7. Test `/`, `/privacy`, a hard reload, dashboard root, `/admin/waitlist`, sign-in, callable Functions, and sign-out.
8. Confirm Firebase Auth authorized domains include both production hostnames.
9. Verify CSP/security headers with Webzim; `.htaccess` supplies baseline nosniff/referrer/frame headers.
10. Roll back by redeploying a known-good commit from Actions. Keep a cPanel backup for first launch.
