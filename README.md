<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Detail

The repository contains three deployable parts:

- `mobile/` — the Expo customer and cleaner application.
- `site/` — the Vite marketing site and protected `/admin` dashboard.
- `functions/` — Firebase callable, HTTP, trigger, and scheduled backends.

## Run Locally

**Prerequisites:**  Node.js


See `mobile/README.md`, `site/README.md`, and `functions/README.md` for package-specific setup. Root `npm run dev`, `npm run build`, and `npm run lint` delegate to the web package.

For a complete live API test environment, credential inventory, provider setup links, and secret placement, see [`docs/live-api-credentials.md`](docs/live-api-credentials.md).
