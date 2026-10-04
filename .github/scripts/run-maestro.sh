#!/usr/bin/env bash
# Native journeys run once, with animations enabled and isolated process logs.
set -euo pipefail

APP_ID=com.kisok.kiosk
APK=android/app/build/outputs/apk/release/app-release.apk
EVIDENCE=android-runtime-evidence
mkdir -p "$EVIDENCE"

# Only the disposable TEST login documented by the project owner is used.
mapfile -t customer_login < <(node <<'NODE'
const fs = require("node:fs");
const docs = fs.readFileSync("docs/environment.md", "utf8");
const row = docs.match(/\|\s*Customer\s*\|\s*\x60([^\x60\r\n]+)\x60\s*\|\s*\x60([^\x60\r\n]+)\x60/);
if (!row) throw new Error("Documented disposable Customer login is missing");
process.stdout.write(row[1] + "\n" + row[2] + "\n");
NODE
)
if [ "${#customer_login[@]}" -ne 2 ]; then
  echo "::error::Could not read the documented TEST Customer login"
  exit 1
fi
export MAESTRO_CUSTOMER_EMAIL="${customer_login[0]}"
export MAESTRO_CUSTOMER_PASSWORD="${customer_login[1]}"
echo "::add-mask::$MAESTRO_CUSTOMER_EMAIL"
echo "::add-mask::${MAESTRO_CUSTOMER_EMAIL,,}"
echo "::add-mask::$MAESTRO_CUSTOMER_PASSWORD"

# The CI tablet image's Pixel Launcher ANR can cover an otherwise healthy app.
# Disable only this unrelated launcher on the ephemeral GitHub emulator.
# Maestro starts KISOK directly; no app dialog is dismissed and no flow retried.
if [ "${CI:-}" = "true" ]; then
  ci_launcher=com.google.android.apps.nexuslauncher
  ci_packages=$(adb shell pm list packages --user 0 | tr -d '\r')
  if printf '%s\n' "$ci_packages" | grep -Fx "package:$ci_launcher" >/dev/null; then
    adb shell pm disable-user --user 0 "$ci_launcher"
    adb shell am force-stop "$ci_launcher"
    ci_disabled=$(adb shell pm list packages -d --user 0 | tr -d '\r')
    if ! printf '%s\n' "$ci_disabled" | grep -Fx "package:$ci_launcher" >/dev/null; then
      echo "::error::Could not disable the CI image's unrelated Pixel Launcher"
      exit 1
    fi
    ci_launcher_pid=$(adb shell pidof "$ci_launcher" | tr -d '\r' || true)
    if [ -n "$ci_launcher_pid" ]; then
      echo "::error::Pixel Launcher remains alive after CI emulator setup"
      exit 1
    fi
    echo "CI emulator: Pixel Launcher disabled; KISOK launches directly"
  fi
fi

echo "device ABIs: $(adb shell getprop ro.product.cpu.abilist | tr -d '\r')"
for setting in window_animation_scale transition_animation_scale animator_duration_scale; do
  adb shell settings put global "$setting" 1
  scale=$(adb shell settings get global "$setting" | tr -d '\r')
  echo "$setting=$scale"
  if [ "$scale" != "1.0" ] && [ "$scale" != "1" ]; then
    echo "::error::Animations must be enabled for native transition acceptance"
    exit 1
  fi
done

run_flow() {
  local label="$1" apk="$2" flow="$3"
  local name dir flow_status process_status final_pid log_pid events_pid
  name=$(basename "$flow" .yaml)
  dir="$EVIDENCE/$label/$name"
  mkdir -p "$dir"
  adb install -r "$apk" || return 1
  adb shell am force-stop "$APP_ID" || return 1
  adb logcat -b all -c || return 1
  adb logcat -b all -v threadtime > "$dir/logcat.log" &
  log_pid=$!
  adb logcat -b events -v threadtime > "$dir/events.log" &
  events_pid=$!

  flow_status=0
  maestro test "$flow" --format junit --output "$dir/report.xml" \
    --debug-output "$dir/maestro" --test-output-dir "$dir/maestro" || flow_status=$?
  final_pid=$(adb shell pidof "$APP_ID" | tr -d '\r' || true)
  kill "$log_pid" "$events_pid" 2>/dev/null || true
  wait "$log_pid" 2>/dev/null || true
  wait "$events_pid" 2>/dev/null || true
  adb logcat -b events -d -v threadtime > "$dir/events-final.log" || return 1
  adb logcat -b all -d -v threadtime > "$dir/logcat-final.log" || return 1
  adb shell dumpsys activity activities > "$dir/activities.txt"
  adb exec-out screencap -p > "$dir/final.png"
  adb shell uiautomator dump /sdcard/kisok-final.xml >/dev/null 2>&1 &&
    adb shell cat /sdcard/kisok-final.xml > "$dir/hierarchy.xml" || true

  process_status=0
  python3 - "$dir/events-final.log" "$final_pid" <<'PY' > "$dir/process.txt" || process_status=$?
import pathlib
import re
import sys

package = "com.kisok.kiosk"
events = []
for line in pathlib.Path(sys.argv[1]).read_text(errors="replace").splitlines():
    match = re.search(r"\b(am_proc_start|am_proc_died|am_crash|am_anr)\s*:\s*\[(.*)\]", line)
    if match:
        fields = match[2].split(",")
        index = 3 if match[1] == "am_proc_start" else 2
        if len(fields) > index and fields[index].strip() == package:
            events.append((match[1], fields[1].strip()))
starts = [pid for tag, pid in events if tag == "am_proc_start"]
failures = [(tag, pid) for tag, pid in events if tag == "am_crash" or (tag != "am_proc_start" and pid in starts)]
final = sys.argv[2].split()
print("Exact-package events:", events)
print("Final PID:", final)
if len(starts) != 1 or final != starts or failures:
    print("FAIL: process continuity not proven")
    sys.exit(1)
print("PASS: exactly one app process; same PID alive after the test attempt (Maestro result is checked separately)")
PY
  cat "$dir/process.txt"
  echo "$label / $name: Maestro=$flow_status native-process=$process_status"
  if [ "$flow_status" -ne 0 ] || [ "$process_status" -ne 0 ]; then
    echo "::group::$label native exception evidence"
    grep -A 60 -B 5 -E "FATAL EXCEPTION|ViewGroup.dispatchGetDisplayList|Fatal signal|ANR in com.kisok.kiosk" \
      "$dir/logcat-final.log" || true
    echo "::endgroup::"
    echo "::group::$label JS and final UI evidence"
    grep -E "ReactNativeJS|ReactNative|ExpoModulesCore" "$dir/logcat-final.log" | tail -100 || true
    head -c 30000 "$dir/hierarchy.xml" || true
    echo "::endgroup::"
    return 1
  fi
}

# Temporary isolated original-Dialog comparison, removed after evidence capture.
if [ -n "${KISOK_BASELINE_APK:-}" ]; then
  baseline_status=0
  run_flow baseline "$KISOK_BASELINE_APK" .maestro/flows/catalog-review-cart.yaml ||
    baseline_status=$?
  echo "Original Dialog comparison result=$baseline_status (inspect native stack before attributing)"
fi

status=0
for flow in .maestro/flows/*.yaml; do
  run_flow candidate "$APK" "$flow" || status=1
done

# Maestro diagnostics can contain expanded inputText values. Scrub before upload.
node <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const values = [process.env.MAESTRO_CUSTOMER_EMAIL, process.env.MAESTRO_CUSTOMER_PASSWORD];
function redact(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const name = path.join(dir, entry.name);
    if (entry.isDirectory()) redact(name);
    else if (!/\.(png|jpe?g|webm|mp4)$/.test(name)) {
      const bytes = fs.readFileSync(name);
      let text;
      try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
      catch { throw new Error("Unexpected binary diagnostic: " + name); }
      for (const value of [...values, values[0].toLowerCase()]) text = text.split(value).join("[REDACTED]");
      fs.writeFileSync(name, text);
    }
  }
}
redact("android-runtime-evidence");
fs.writeFileSync("android-runtime-evidence/.redacted", "ready\n");
NODE

exit "$status"
