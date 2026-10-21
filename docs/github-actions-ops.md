# Running allowlisted GitHub operations

GitHub Actions can use repository secrets as an external runner, but the workflow is deliberately not a remote shell. It never evaluates arbitrary text from a file. Add individual values under the protected GitHub `production` environment; do not commit or upload a `.env` file.

For automatic checks, set `cmd.txt` to exactly one fixed task name and push it to `main` or `codex/separate-dashboard-into-routed-modules-fl7jlh`:

- `site-checks`
- `mobile-checks`
- `mobile-export-checks` (bundles Android and iOS JS assets using non-production placeholder config)
- `functions-checks`
- `supabase-local-checks` (starts disposable local Supabase, resets/applies migrations, lints the schema, and type-checks Edge Functions)
- `full-checks` (runs site, mobile, functions, and local Supabase checks)

For remote, read-only diagnostics, use **Actions → Detail allowlisted GitHub operations → Run workflow** and select one of:

- `supabase-migration-list`
- `supabase-migration-dry-run`
- `waitlist-migration-dry-run`

Remote diagnostics run only from `main`, require the explicit `confirm_production_access` checkbox, and use the `production` environment. Configure required reviewers for that environment in GitHub if you want approval before its secrets are released. Supabase CLI tasks need `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, and `SUPABASE_DB_PASSWORD`. The waitlist dry run needs the D1 query credentials and `SUPABASE_SERVICE_ROLE_KEY` documented in [GitHub Actions setup](github-actions.md).

Each run uploads a redacted text artifact for three days and writes a status summary. The artifact records outputs from these fixed checks/diagnostics; it does not contain a dump of environment variables or database rows. Write operations remain in their dedicated protected workflows, such as `deploy-supabase.yml` and `migrate-cloudflare-waitlist.yml`.

The local checks need no production credentials. `full-checks` uses CI placeholder Supabase values and disposable local containers, so it does not call the live Supabase, Paynow, Twilio, Didit, Mapbox, or Cloudflare services. Live provider testing should use provider sandbox credentials and explicit, provider-specific test operations; never point synthetic booking/payment tests at production accounts.

To add a capability, add a named operation with a fixed script, minimal credentials, and an output review. Update the workflow's enum/allowlist and this page. Never add `eval`, run a file as shell, print the environment, or commit raw command output.
