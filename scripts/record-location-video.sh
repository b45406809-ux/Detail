#!/usr/bin/env bash
# Records the Google Play background-location walkthrough on the Android emulator:
# Go Online -> Detail's explanation -> Android prompts -> notification -> Go Offline.
# Writes $RUNNER_TEMP/location-video/detail-background-location.mp4 with captions.
set -uo pipefail
out="$RUNNER_TEMP/location-video"; mkdir -p "$out"
marks="$out/marks.txt"; : > "$marks"

adb wait-for-device
for _ in $(seq 1 30); do [[ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == 1 ]] && break; sleep 2; done
sleep 15
adb install -r "$RUNNER_TEMP/apk/detail.apk" || exit 1
adb emu geo fix "$DEVICE_LNG" "$DEVICE_LAT"
adb shell settings put global sysui_demo_allowed 1
adb shell am broadcast -a com.android.systemui.demo -e command enter >/dev/null
adb shell am broadcast -a com.android.systemui.demo -e command clock -e hhmm 0941 >/dev/null
adb shell am broadcast -a com.android.systemui.demo -e command battery -e level 100 -e plugged false >/dev/null

flow() {
  maestro test --env EMAIL="$CLEANER_EMAIL" --env PASSWORD="$CLEANER_PASSWORD" \
    --test-output-dir "$out/report/$1" ".maestro/video/$1.yaml"
}
mark() { echo "$(awk "BEGIN{print $(date +%s.%N)-$start}") $*" >> "$marks"; }

# Sign in and switch to Cleaner mode before recording (not part of the walkthrough).
flow 01-sign-in || flow 01-sign-in || exit 1

adb shell screenrecord --bit-rate 6000000 --time-limit 180 /sdcard/walkthrough.mp4 &
rec=$!
start=$(date +%s.%N)
sleep 3
mark "In Cleaner mode, the cleaner taps Go Online"
flow 02-disclosure || { kill -INT $rec; exit 1; }
mark "Before any permission prompt, Detail explains why it needs location in the background"
sleep 7
mark "The cleaner taps Continue and allows location: While using the app, then Allow all the time"
flow 03-allow || { kill -INT $rec; exit 1; }
flow 04-online || { kill -INT $rec; exit 1; }
mark "The cleaner is online. Location is shared only while online or on an active booking"
sleep 4
mark "A persistent notification shows that location sharing is on"
adb shell cmd statusbar expand-notifications
sleep 6
adb shell cmd statusbar collapse
sleep 1
mark "Tapping Go Offline stops location sharing"
flow 05-offline || { kill -INT $rec; exit 1; }
sleep 3
mark END
adb shell pkill -INT screenrecord; wait $rec 2>/dev/null; sleep 3
adb pull /sdcard/walkthrough.mp4 "$out/raw.mp4" || exit 1

# Captions: each mark's text shows until the next mark.
font=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf
filters=()
mapfile -t lines < "$marks"
for i in "${!lines[@]}"; do
  t0=${lines[$i]%% *}; text=${lines[$i]#* }; [[ "$text" == END ]] && continue
  t1=${lines[$((i+1))]%% *}
  printf '%s' "$text" | fold -s -w 34 > "$out/cap$i.txt"
  filters+=("drawtext=fontfile=$font:textfile=$out/cap$i.txt:fontsize=46:fontcolor=white:line_spacing=10:box=1:boxcolor=0x3906d2@0.92:boxborderw=24:x=(w-text_w)/2:y=h-text_h-170:enable='between(t,$t0,$t1)'")
done
vf=$(IFS=,; echo "${filters[*]}")
ffmpeg -y -loglevel error -i "$out/raw.mp4" -vf "$vf" -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -movflags +faststart "$out/detail-background-location.mp4" || exit 1
duration=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$out/detail-background-location.mp4")
{ echo "## Background location video recorded (${duration%.*}s)"; echo; echo "Artifact: play-location-video"; sed 's/^/- /' "$marks"; } >> "$GITHUB_STEP_SUMMARY"
