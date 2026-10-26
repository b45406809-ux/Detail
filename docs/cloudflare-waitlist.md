# Waitlist service

The current marketing site and dashboard read and write waitlist records in Supabase through the `marketplace-api` Edge Function. Cloudflare D1 remains the legacy waitlist source until its records have been reconciled and imported; it is not the current dashboard database. The D1-to-Supabase migration is additive and preserves Cloudflare as a rollback source. Do not retire the D1 worker/database until a dry run and import have been reviewed and counts reconciled.

Configure the Turnstile site key as `VITE_TURNSTILE_SITE_KEY` in the site build environment and `TURNSTILE_SECRET` as a Supabase Edge Function secret. The client submits the Turnstile token to the Edge Function, which verifies it before saving the record. Waitlist reads and campaigns require the appropriate verified admin permissions.

Cloudflare KV remains in use for a separate, read-only promotional asset library; those files are not waitlist or dashboard records and do not need to move to Supabase. Cloudflare Turnstile remains the bot-protection provider.

See [GitHub Actions setup](github-actions.md#one-time-cloudflare-d1-migration), [Supabase cutover](supabase-cutover.md), and [API credentials](live-api-credentials.md) for current setup and deployment instructions.
