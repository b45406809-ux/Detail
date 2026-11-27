#!/usr/bin/env bash
# Records the Google Play background-location walkthrough on the Android emulator:
# Go Online -> Detail's explanation -> Android prompts -> notification -> Go Offline.
# Writes $RUNNER_TEMP/location-video/detail-background-location.mp4 with captions.
set -uo pipefail
out="$RUNNER_TEMP/location-video"; mkdir -p "$out"

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

# Sign in and switch to Cleaner mode before recording (not part of the walkthrough).
flow 01-sign-in || flow 01-sign-in || exit 1

adb logcat -c
adb logcat '*:W' ReactNativeJS:V > "$out/logcat.txt" 2>&1 &
logcat=$!
adb shell screenrecord --bit-rate 6000000 --time-limit 180 /sdcard/walkthrough.mp4 &
rec=$!
start=$(date +%s.%N)
now() { awk "BEGIN{print $(date +%s.%N)-$start}"; }
# Each kept segment: "from to caption". Maestro's start-up pauses are cut out.
segs="$out/segments.txt"; : > "$segs"
seg() { awk -v a="$1" -v b="$2" -v t="$3" 'BEGIN{if(a<0)a=0; printf "%.2f %.2f %s\n", a, b, t}' >> "$segs"; }
stop_all() { adb shell pkill -INT screenrecord; wait $rec 2>/dev/null; kill $logcat 2>/dev/null; }
sleep 2
flow 02-disclosure || { stop_all; exit 1; }
e=$(now); sleep 7
seg "$(awk "BEGIN{print $e-4}")" "$(awk "BEGIN{print $e+7}")" "The cleaner taps Go Online. Before any permission prompt, Detail explains why it uses location in the background."
flow 03-allow || { stop_all; exit 1; }
e=$(now)
seg "$(awk "BEGIN{print $e-14}")" "$e" "The cleaner taps Continue, then chooses Allow all the time."
flow 04-online || { stop_all; exit 1; }
e=$(now); sleep 5
seg "$e" "$(awk "BEGIN{print $e+5}")" "The cleaner is online. Location is shared only while online or on an active booking."
n=$(now)
adb shell cmd statusbar expand-notifications
sleep 6
adb shell cmd statusbar collapse
seg "$n" "$(awk "BEGIN{print $n+6}")" "A notification stays visible while location sharing is on."
sleep 1
flow 05-offline || { stop_all; exit 1; }
e=$(now); sleep 4
seg "$(awk "BEGIN{print $e-4}")" "$(awk "BEGIN{print $e+4}")" "Tapping Go Offline stops location sharing."
stop_all; sleep 3
adb pull /sdcard/walkthrough.mp4 "$out/raw.mp4" || exit 1

# screenrecord writes frames only when the screen changes; make it constant 30 fps first
# so cuts land on the right moment. Then cut each segment, put its caption in a band above
# the phone screen (so nothing in the app is covered), and join the segments.
ffmpeg -nostdin -y -loglevel error -i "$out/raw.mp4" -map 0:v:0 -vf fps=30 -c:v libx264 -preset veryfast -crf 16 -pix_fmt yuv420p "$out/cfr.mp4" || exit 1
font=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf
band=320; lineh=72
: > "$out/concat.txt"; i=0
while read -r from to text; do
  mapfile -t lines < <(printf '%s\n' "$text" | fold -s -w 36 | sed 's/ *$//')
  n=${#lines[@]}; top=$(( (band - n*lineh) / 2 + 10 ))
  filters=("pad=iw:ih+$band:0:$band:color=0x3906d2"); y=0
  for line in "${lines[@]}"; do
    printf '%s' "$line" > "$out/cap$i-$y.txt"
    filters+=("drawtext=fontfile=$font:textfile=$out/cap$i-$y.txt:fontsize=46:fontcolor=white:x=(w-text_w)/2:y=$top+$y*$lineh")
    y=$((y+1))
  done
  vf=$(IFS=,; echo "${filters[*]}")
  ffmpeg -nostdin -y -loglevel error -ss "$from" -to "$to" -i "$out/cfr.mp4" -vf "$vf" -an -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -r 30 "$out/clip$i.mp4" || exit 1
  echo "file '$out/clip$i.mp4'" >> "$out/concat.txt"
  i=$((i+1))
done < "$segs"
ffmpeg -nostdin -y -loglevel error -f concat -safe 0 -i "$out/concat.txt" -c copy -movflags +faststart "$out/detail-background-location.mp4" || exit 1
rm -f "$out"/clip*.mp4 "$out"/cap*.txt "$out/cfr.mp4"
duration=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$out/detail-background-location.mp4")
{ echo "## Background location video recorded (${duration%.*}s)"; echo; echo "Artifact: play-location-video"; sed 's/^/- /' "$segs"; } >> "$GITHUB_STEP_SUMMARY"
