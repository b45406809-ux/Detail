#!/usr/bin/env bash
set -uo pipefail

if ! adb install "$RUNNER_TEMP/detail-live-test.apk"; then exit 1; fi

status=0
maestro test --env CUSTOMER_EMAIL="$E2E_CUSTOMER_EMAIL" --env CUSTOMER_PASSWORD="$E2E_CUSTOMER_PASSWORD" .maestro/live-client-booking-gate.yaml || status=1
maestro test --env CLEANER_EMAIL="$E2E_CLEANER_EMAIL" --env CLEANER_PASSWORD="$E2E_CLEANER_PASSWORD" .maestro/live-cleaner-verification-gate.yaml || status=1
maestro test --env CUSTOMER_EMAIL="$E2E_CUSTOMER_EMAIL" --env CUSTOMER_PASSWORD="$E2E_CUSTOMER_PASSWORD" .maestro/live-screen-route-smoke.yaml || status=1
maestro test .maestro/live-auth-screen-smoke.yaml || status=1
exit "$status"
