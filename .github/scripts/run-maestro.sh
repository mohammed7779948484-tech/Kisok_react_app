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

adb install -r "$APK"

# Clear the log first so what follows is only this run.
adb logcat -c || true

maestro test .maestro/flows --format junit --output maestro-report.xml
status=$?

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

  echo "::group::The full view hierarchy Maestro was searching"
  adb exec-out uiautomator dump /dev/tty 2>/dev/null | tail -c 20000 || true
  echo "::endgroup::"
fi

exit "$status"
