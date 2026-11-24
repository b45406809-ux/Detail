#!/usr/bin/env bash
set -euo pipefail
[[ "$SUPABASE_PROJECT_REF" == 'yiyhmueospjwbaywzusp' ]]
test -n "$SUPABASE_ACCESS_TOKEN" && test -n "$CLOUDFLARE_ACCOUNT_ID" && test -n "$CLOUDFLARE_API_TOKEN"
worker=detail-paynow-relay
api="https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers"
auth="Authorization: Bearer $CLOUDFLARE_API_TOKEN"
probe=paynow-supabase-probe
sb=(--project-ref "$SUPABASE_PROJECT_REF")
secrets="$(supabase secrets list "${sb[@]}" --output json)"
functions="$(supabase functions list "${sb[@]}" --output json)"
if jq -e 'any(.[]; .name | IN("PAYNOW_RELAY_URL","PAYNOW_RELAY_TOKEN","PAYNOW_PROBE_ONETIME_SECRET"))' <<< "$secrets" >/dev/null ||
   jq -e 'any(.[]; .slug == "paynow-supabase-probe")' <<< "$functions" >/dev/null ||
   curl -fsS -H "$auth" "$api/scripts" | jq -e 'any(.result[]; .id == "detail-paynow-relay")' >/dev/null; then
  echo 'Existing relay or probe configuration found. Refusing to replace it.'
  exit 1
fi
token="$(openssl rand -hex 32)"
probe_token="$(openssl rand -hex 32)"
printf '::add-mask::%s\n' "$token" "$probe_token"
worker_created=false
secrets_created=false
probe_created=false
complete=false
umask 077
temp="$(mktemp -d)"
cleanup() {
  if [[ "$probe_created" == true ]]; then supabase functions delete "$probe" "${sb[@]}" --yes || echo 'Probe deletion failed'; fi
  if [[ "$secrets_created" == true ]]; then
    supabase secrets unset PAYNOW_PROBE_ONETIME_SECRET "${sb[@]}" --yes || echo 'Probe token removal failed'
    if [[ "$complete" == false ]]; then
      supabase secrets unset PAYNOW_RELAY_URL PAYNOW_RELAY_TOKEN "${sb[@]}" --yes || echo 'Relay configuration rollback failed'
    fi
  fi
  if [[ "$worker_created" == true && "$complete" == false ]]; then
    curl -fsS -H "$auth" -X DELETE "$api/scripts/$worker" | jq -e '.success' || echo 'Worker rollback failed'
  fi
  rm -rf "$temp"
}
trap cleanup EXIT
subdomain="$(curl -fsS -H "$auth" "$api/subdomain" | jq -er '.result.subdomain')"
relay="https://$worker.$subdomain.workers.dev"
jq -n --arg token "$token" '{main_module:"worker.mjs",compatibility_date:"2026-09-18",bindings:[{type:"secret_text",name:"PAYNOW_RELAY_TOKEN",text:$token}]}' > "$temp/metadata"
curl -fsS -H "$auth" -X PUT -F "metadata=@$temp/metadata;type=application/json" \
  -F 'worker.mjs=@cloudflare/paynow-relay.mjs;type=application/javascript+module' "$api/scripts/$worker" | jq -e '.success'
worker_created=true
curl -fsS -H "$auth" -H 'Content-Type: application/json' \
  --data '{"enabled":true,"previews_enabled":false}' "$api/scripts/$worker/subdomain" | jq -e '.success'
printf 'PAYNOW_RELAY_URL=%s\nPAYNOW_RELAY_TOKEN=%s\nPAYNOW_PROBE_ONETIME_SECRET=%s\n' "$relay" "$token" "$probe_token" > "$temp/env"
supabase secrets set "${sb[@]}" --env-file "$temp/env" --yes
secrets_created=true
supabase functions deploy "$probe" "${sb[@]}" --use-api --no-verify-jwt --yes
probe_created=true
probe_url="https://$SUPABASE_PROJECT_REF.supabase.co/functions/v1/$probe"
verified=false
for attempt in 1 2 3; do
  if curl -fsS --max-time 22 -H "Authorization: Bearer $probe_token" --data '{}' "$probe_url" > "$temp/result" &&
     jq -e '.upstream == 200 and .providerError == true' "$temp/result"; then
    verified=true
    cat "$temp/result"
    echo
    break
  fi
  sleep 3
done
[[ "$verified" == true ]]
supabase functions deploy marketplace-api "${sb[@]}" --use-api --yes
supabase functions deploy paynow-reconcile "${sb[@]}" --use-api --yes
complete=true
