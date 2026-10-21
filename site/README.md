# Detail marketing site and dashboard

This Vite app contains the public marketing/waitlist site and the protected operations dashboard. It uses Supabase Auth, Edge Functions, and the database; privileged operations are checked by the backend using `adminRoles`.

## Local development

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `site/.env.local` from the local Supabase stack or your staging project. Configure `VITE_TURNSTILE_SITE_KEY` to test waitlist submission. Then run:

```sh
npm install
npm run dev
npm run build
```

See [Supabase cutover](../docs/supabase-cutover.md) for local backend startup, provider setup, and secrets. The Supabase service role and provider keys must never be included in Vite variables.

## Deployment

GitHub Actions builds the site and dashboard, then deploys them over FTPS to Webzim. Configure the `production` environment with `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `VITE_TURNSTILE_SITE_KEY`, and the existing FTPS credentials. Supabase migrations and Edge Functions deploy through `.github/workflows/deploy-supabase.yml` after `SUPABASE_PROJECT_REF`, `SUPABASE_ACCESS_TOKEN`, and `SUPABASE_DB_PASSWORD` are configured.

The dashboard build writes a dashboard-specific metadata page to `dashboard.html`; the workflow deploys a copy as the dashboard subdomain's `index.html` so shared links preview the Detail brand. Apache SPA routing rules are in `site/public/.htaccess`. See [cPanel deployment](../docs/cpanel-deployment.md).
