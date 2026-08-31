#!/usr/bin/env bash
# Run the Maestro flows and, on failure, capture what the screen actually showed.
#
# This lives in a file rather than inline in the workflow for a reason that cost
# a full CI cycle to find: reactivecircus/android-emulator-runner executes the
# `script:` input ONE LINE AT A TIME, each in its own `sh -c`. So `set +e` had
# no effect on the next line, `status=$?` read a different shell's exit code,
# and the action aborted at the first failing command — meaning the failure
# diagnostics never ran at all. One script, one shell, one exit code.
set -uo pipefail

APK=android/app/build/outputs/apk/release/app-release.apk
DISMISSED_FOREIGN_ANR=0

# The device's ABI order decides which lib/<abi> the system extracts. If it
# disagrees with what the APK contains, the app dies in Application.onCreate
# with SoLoaderDSONotFoundError and Maestro only sees a timeout.
echo "device ABIs: $(adb shell getprop ro.product.cpu.abilist | tr -d '\r')"

adb install -r "$APK"

# Clear the log first so what follows is only this run.
adb logcat -c || true

# Let the system settle before driving the UI.
#
# A run once failed with the app healthy and in the foreground — logcat showed
# "Running \"main\"" and "Displayed ... MainActivity" — while a system ANR dialog
# for the LAUNCHER ("Pixel Launcher isn't responding") sat on top of everything,
# so uiautomator saw only that dialog. Freshly booted emulators are still busy
# indexing, and a cold app start on top of that is enough to tip the launcher
# over.
sleep 5

# Dismiss a system ANR dialog ONLY when it is not ours.
#
# Deliberately narrow: if com.kisok.kiosk is the one not responding, that is a
# real defect and this must not paper over it. The dialog belongs to package
# "android", so the test is the title text. The global flag tells the caller
# whether a foreign dialog was actually cleared, so Maestro may be retried once.
dismiss_foreign_anr() {
  DISMISSED_FOREIGN_ANR=0

  local hierarchy
  hierarchy=$(adb shell uiautomator dump /sdcard/pre-check.xml >/dev/null 2>&1 &&
    adb shell cat /sdcard/pre-check.xml 2>/dev/null) || return 0

  case "$hierarchy" in
    *"isn't responding"*)
      # Ownership is decided by the DIALOG TITLE, not by the whole dump. Our own
      # window sits behind the dialog and its package name appears throughout,
      # so grepping the dump for "kisok" would refuse every legitimate dismissal.
      local title
      title=$(printf '%s' "$hierarchy" |
        grep -o "text=\"[^\"]*isn't responding\"" | head -1)

      case "$title" in
        *[Kk]isok*|*kiosk*)
          echo "::error::KISOK itself is not responding ($title) — a real failure, not cleared."
          return 0
          ;;
      esac

      echo "::warning::Dismissing a system ANR dialog that is not KISOK's: $title"
      adb shell am force-stop com.google.android.apps.nexuslauncher || true
      adb shell input keyevent KEYCODE_HOME || true
      sleep 3
      DISMISSED_FOREIGN_ANR=1
      ;;
  esac
}

dismiss_foreign_anr

maestro test .maestro/flows --format junit --output maestro-report.xml
status=$?

# A launcher ANR can appear after the pre-check while Maestro is waiting for the
# sign-in screen. If — and only if — the failed run is currently covered by a
# foreign system ANR, clear it and rerun the same smoke flow once. A second
# failure is preserved and diagnosed normally; KISOK's own ANR is never cleared.
if [ "$status" -ne 0 ]; then
  dismiss_foreign_anr
  if [ "$DISMISSED_FOREIGN_ANR" -eq 1 ]; then
    echo "::warning::Retrying Maestro once after clearing the foreign launcher ANR."
    rm -f maestro-report.xml
    maestro test .maestro/flows --format junit --output maestro-report.xml
    status=$?
  fi
fi

if [ "$status" -ne 0 ]; then
  echo "::group::What was actually on screen"
  adb exec-out screencap -p > failure.png || true
  adb shell dumpsys activity activities \
    | grep -E "mResumedActivity|mFocusedApp|topResumedActivity" || true
  echo "::endgroup::"

  echo "::group::App logcat (crashes, JS errors, Expo)"
  adb logcat -d -v brief \
    -s ReactNative:V ReactNativeJS:V AndroidRuntime:E ExpoModulesCore:V expo:V \
    | tail -300 || true
  echo "::endgroup::"

  echo "::group::Anything the app process logged"
  adb logcat -d -v brief | grep -iE "kisok|hermes|fatal|exception" | tail -200 || true
  echo "::endgroup::"

  # Dump to a file and cat it: `uiautomator dump /dev/tty` is unreliable under
  # `exec-out` and silently produces nothing.
  echo "::group::The full view hierarchy Maestro was searching"
  if adb shell uiautomator dump /sdcard/ui-hierarchy.xml >/dev/null 2>&1; then
    adb shell cat /sdcard/ui-hierarchy.xml | tail -c 20000 || true
  else
    echo "uiautomator dump failed (no window? app not running?)"
  fi
  echo "::endgroup::"
fi

exit "$status"
