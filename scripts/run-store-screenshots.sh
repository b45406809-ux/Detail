#!/usr/bin/env bash
# Runs the App Review journey on one device and saves store screenshots.
# Usage: run-store-screenshots.sh android|ios
set -uo pipefail

platform="$1"
shots="$RUNNER_TEMP/store-shots/$platform"
report="$RUNNER_TEMP/store-shots/$platform-report"
mkdir -p "$shots" "$report"
device_args=()

if [[ "$platform" == android ]]; then
  # The emulator can briefly drop offline right after boot; wait until it is stable.
  adb wait-for-device
  for _ in $(seq 1 30); do [[ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == 1 ]] && break; sleep 2; done
  sleep 15
  adb install -r "$RUNNER_TEMP/apk/detail.apk" || exit 1
  adb emu geo fix "$DEVICE_LNG" "$DEVICE_LAT"
  # Clean status bar for screenshots: full battery and signal, fixed time.
  adb shell settings put global sysui_demo_allowed 1
  adb shell am broadcast -a com.android.systemui.demo -e command enter
  adb shell am broadcast -a com.android.systemui.demo -e command clock -e hhmm 0941
  adb shell am broadcast -a com.android.systemui.demo -e command battery -e level 100 -e plugged false
  adb shell am broadcast -a com.android.systemui.demo -e command network -e wifi show -e level 4
  adb shell am broadcast -a com.android.systemui.demo -e command notifications -e visible false
else
  app="$(find "$RUNNER_TEMP/sim" -maxdepth 3 -name '*.app' -print -quit)"
  test -n "$app" || { echo 'Simulator app not found.'; exit 1; }
  # App Store 6.9" screenshots come from a Pro Max simulator (1320x2868).
  device_id="$(xcrun simctl list devices available -j | node -e '
    let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
      const all=Object.values(JSON.parse(s).devices).flat().filter(d=>d.isAvailable&&/^iPhone/.test(d.name));
      const pick=all.filter(d=>/Pro Max/.test(d.name)).sort((a,b)=>b.name.localeCompare(a.name,undefined,{numeric:true}))[0]||all[0];
      if(!pick)process.exit(1);console.error("Using simulator: "+pick.name);process.stdout.write(pick.udid)})')"
  test -n "$device_id" || exit 1
  xcrun simctl boot "$device_id"
  xcrun simctl bootstatus "$device_id" -b
  xcrun simctl install "$device_id" "$app" || exit 1
  bundle_id="$(/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' "$app/Info.plist")"
  xcrun simctl privacy "$device_id" grant location-always "$bundle_id" || true
  xcrun simctl privacy "$device_id" grant photos "$bundle_id" || true
  xcrun simctl location "$device_id" set "$DEVICE_LAT,$DEVICE_LNG"
  xcrun simctl status_bar "$device_id" override --time 9:41 --batteryState charged --batteryLevel 100 --cellularBars 4 --wifiBars 3
  device_args=(--device "$device_id")
fi

run_flow() {
  maestro "${device_args[@]}" test \
    --env CUSTOMER_EMAIL="$CUSTOMER_EMAIL" --env CUSTOMER_PASSWORD="$CUSTOMER_PASSWORD" \
    --env CLEANER_EMAIL="$CLEANER_EMAIL" --env CLEANER_PASSWORD="$CLEANER_PASSWORD" \
    --env SHOTS="$shots" \
    --test-output-dir "$report/$1" \
    ".maestro/store/$1.yaml"
}

status=0
for flow in 01-customer-books 02-cleaner-quotes 03-customer-accepts; do
  echo "::group::$flow"
  [[ "$platform" == android ]] && adb wait-for-device
  # One retry absorbs emulator/simulator glitches (e.g. "device offline"); a real app problem fails twice.
  if ! run_flow "$flow" && ! { echo "Retrying $flow once"; [[ "$platform" == android ]] && adb wait-for-device; run_flow "$flow"; }; then
    echo "::error::$flow failed twice; later steps depend on it, so stopping here."
    status=1
    echo "::endgroup::"
    break
  fi
  echo "::endgroup::"
done

count=$(find "$shots" -name '*.png' | wc -l | tr -d ' ')
{
  echo "## $platform: review-account journey $([[ $status == 0 ]] && echo passed || echo FAILED)"
  echo
  echo "- Screenshots captured: $count (artifact: $([[ $platform == android ]] && echo play-store-screenshots || echo app-store-screenshots))"
  for f in "$shots"/*.png; do [[ -e "$f" ]] && echo "  - $(basename "$f")"; done
} >> "$GITHUB_STEP_SUMMARY"
exit "$status"
