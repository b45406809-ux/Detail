# Running allowlisted GitHub operations

GitHub Actions can use repository secrets as an external runner, but the workflow is deliberately not a remote shell. It never evaluates arbitrary text from a file. Add individual values under the protected GitHub `production` environment; do not commit or upload a `.env` file.

For automatic checks, set `cmd.txt` to exactly one fixed task name and push it to `main` or `codex/separate-dashboard-into-routed-modules-fl7jlh`:

- `site-checks`
- `mobile-checks`
- `mobile-export-checks` (bundles Android and iOS JS assets using non-production placeholder config)
- `functions-checks`
- `supabase-local-checks` (starts disposable local Supabase, resets/applies migrations, lints the schema, and type-checks Edge Functions)
- `full-checks` (runs site, mobile, native JS bundle export, functions, and local Supabase checks)

For remote, read-only diagnostics, use **Actions → Detail allowlisted GitHub operations → Run workflow** and select one of:

- `supabase-migration-list`
- `supabase-migration-dry-run`
- `waitlist-migration-dry-run`

The same manual workflow has live-provider tasks: `live-readiness` checks Supabase Auth/REST and the deployed read-only marketplace route, plus Twilio, Resend, and Mapbox credentials. `live-paynow-e2e`, `live-didit-e2e`, `live-email-e2e`, and `live-sms-e2e` test one provider at a time; `live-provider-e2e` runs the complete set. These jobs use the protected `production` environment, accept only `main` or the routed-dashboard branch, and require the `confirm_live_access` checkbox. Provider tests that create records or send messages also require `confirm_live_side_effects`.

Live tests print only fixed PASS/FAIL labels in step logs and the workflow summary. They do not save response bodies or upload artifacts. Paynow initialization leaves an unpaid test checkout in the merchant account; Didit creates a synthetic session; email and SMS checks send a short test message only to `LIVE_E2E_EMAIL_TO` and `LIVE_E2E_SMS_TO` configured as environment secrets, then poll for delivery status. These actions can consume provider quota or incur charges. Configure required reviewers on the `production` environment before using these operations, and use dedicated test recipients.

Remote diagnostics run only from `main`, require the explicit `confirm_production_access` checkbox, and use the `production` environment. Configure required reviewers for that environment in GitHub if you want approval before its secrets are released. Supabase CLI tasks need `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, and `SUPABASE_DB_PASSWORD`. The waitlist dry run needs the D1 query credentials and `SUPABASE_SERVICE_ROLE_KEY` documented in [GitHub Actions setup](github-actions.md).

Each run uploads a redacted text artifact for three days and writes a status summary. The artifact records outputs from these fixed checks/diagnostics; it does not contain a dump of environment variables or database rows. Write operations remain in their dedicated protected workflows, such as `deploy-supabase.yml` and `migrate-cloudflare-waitlist.yml`.

The local checks need no production credentials. `full-checks` uses CI placeholder Supabase values and disposable local containers, so it does not call live services. Live tasks are manual and separately confirmed; they test service connectivity and provider entry points. Paynow is only initialized, no payment is completed; Didit session creation is tested, but identity review still needs a human. A full customer-to-cleaner booking needs dedicated test accounts and fixtures.

To add a capability, add a named operation with a fixed script, minimal credentials, and an output review. Update the workflow's enum/allowlist and this page. Never add `eval`, run a file as shell, print the environment, or commit raw command output.
