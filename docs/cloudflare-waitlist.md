# Waitlist service

The current marketing site and dashboard read and write waitlist records in Supabase through the `marketplace-api` Edge Function. The legacy Cloudflare D1 records were imported additively on 2026-10-26: 35 waitlist records and 7 blog posts. Supabase counts were verified after import. Cloudflare D1 was left unchanged as an archive/rollback source; the current site does not use it for new waitlist submissions.

Configure the Turnstile site key as `VITE_TURNSTILE_SITE_KEY` in the site build environment and `TURNSTILE_SECRET` as a Supabase Edge Function secret. The client submits the Turnstile token to the Edge Function, which verifies it before saving the record. Waitlist reads and campaigns require the appropriate verified admin permissions.

Cloudflare KV remains in use for a separate, read-only promotional asset library; those files are not waitlist or dashboard records and do not need to move to Supabase. Cloudflare Turnstile remains the bot-protection provider.

See [GitHub Actions setup](github-actions.md#one-time-cloudflare-d1-migration), [Supabase cutover](supabase-cutover.md), and [API credentials](live-api-credentials.md) for current setup and deployment instructions.
