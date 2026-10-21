# Webzim cPanel site deployment

The marketing site and dashboard share one Vite build (`site/dist`). The app selects the protected dashboard on `dashboard.detail.co.zw` or `/admin`. CI uploads the marketing artifact to `public_html/` and a dashboard-specific `index.html` to `public_html/dashboard/`, preserving link previews on both domains.

Create `dashboard.detail.co.zw` with document root `public_html/dashboard`, add Webzim's DNS record, and enable AutoSSL. The SPA routing rules in `site/public/.htaccess` must be copied to both roots and Apache must allow `mod_rewrite`/`AllowOverride`.

## GitHub environment

Create a protected `production` environment and configure these values:

### Secrets

- `FTP_SERVER`, `FTP_USERNAME`, and `FTP_PASSWORD` for the Webzim FTPS account.
- `SUPABASE_ANON_KEY` for the public dashboard/site bundle.
- `VITE_POSTHOG_KEY` (optional).
- `VITE_TURNSTILE_SITE_KEY` for the public waitlist form.

### Variables

- `SUPABASE_URL` — project URL, such as `https://<project-ref>.supabase.co`.
- `VITE_POSTHOG_HOST` (optional; defaults to `https://us.i.posthog.com`).

Never put the Supabase service role key, Paynow integration credentials, Didit key, Resend key, or Turnstile secret in Vite variables. Set those as Supabase Edge Function secrets. Supabase Auth owns email/password, email-code, Google, Apple, and phone authentication; configure those providers and redirect URLs in the Supabase dashboard.

## Backend deployment

The site workflow deploys only static files. The separate Supabase workflow applies `supabase/migrations` and deploys Edge Functions when `SUPABASE_PROJECT_REF` is configured. It requires GitHub secrets `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD`. Provider secrets must be set in Supabase before enabling live Paynow, Didit, waitlist, or campaign flows. See the [Supabase cutover runbook](supabase-cutover.md) and [API credential guide](live-api-credentials.md).

The retired Firebase deployment workflow has been removed. Keep the old Firebase project available during migration and reconciliation; do not remove its data until the rollback window is complete.

## First site deployment checklist

1. Confirm explicit FTPS on port 21 and passive mode are supported; verify whether the FTP account expects `public_html/` or `/`.
2. Back up the current `public_html` contents and create the dashboard subdomain document root.
3. Add GitHub environment values and approve the protected environment.
4. Push to `main`, inspect the build and both FTPS steps, and verify `.htaccess` exists in both destinations.
5. Test `/`, `/privacy`, hard reloads, dashboard root, `/admin/waitlist`, sign-in, and sign-out.
6. Verify Supabase Auth redirect URLs include both production hostnames and test email/SMS/provider delivery.
7. Roll back static assets by redeploying a known-good commit from Actions. Keep a cPanel backup for launch.

## Initial Supabase administrator

Create and verify the account through Supabase Auth, then grant the first admin role from a protected local shell with the service role key:

```sh
cd functions
SUPABASE_URL=https://<project-ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
ADMIN_EMAIL=owner@example.com \
BOOTSTRAP_ADMIN_CONFIRM=YES \
npm run bootstrap-admin
```

This grants the initial elevated operations permissions. After sign-in, create additional admins through invitation links with limited permissions.
