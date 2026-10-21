# Waitlist service

The marketing waitlist and dashboard now use Supabase through the `marketplace-api` Edge Function. Cloudflare is used for Turnstile bot protection only; it does not host the current waitlist database or API.

Configure the Turnstile site key as `VITE_TURNSTILE_SITE_KEY` in the site build environment and `TURNSTILE_SECRET` as a Supabase Edge Function secret. The client submits the Turnstile token to the Edge Function, which verifies it before saving the record. Waitlist reads and campaigns require the appropriate verified admin permissions.

See [Supabase cutover](supabase-cutover.md) and [API credentials](live-api-credentials.md) for current setup and deployment instructions. The old Cloudflare D1 workflow is retired.
