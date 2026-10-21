<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Detail

The repository contains three deployable parts:

- `mobile/` — the Expo customer and cleaner application.
- `site/` — the Vite marketing site and protected `/admin` dashboard.
- `supabase/` — Supabase database migrations, private storage policies, and Edge Functions.
- `functions/` — migration/bootstrap operator scripts and retained Firebase source for cutover reference; do not deploy the Firebase runtime.

## Run Locally

**Prerequisites:**  Node.js


See [the site guide](site/README.md) and [the Supabase cutover guide](docs/supabase-cutover.md) for setup. The mobile app uses Expo from `mobile/`; root `npm run dev`, `npm run build`, and `npm run lint` delegate to the web package.

For a complete live API test environment, credential inventory, provider setup links, and secret placement, see [`docs/live-api-credentials.md`](docs/live-api-credentials.md).
