#!/usr/bin/env bash
# Installs the APK on a running emulator, opens it and fails if Hailey crashes on launch.
set -u
APK="$1"
PKG=app.hailey.twa
adb install -r "$APK" || exit 1
adb logcat -c
adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1
sleep 20
adb logcat -d > logcat.txt
echo "---- Hailey log ----"
grep -E "AndroidRuntime|$PKG|TWA|LauncherActivity|androidbrowserhelper|ActivityTaskManager" logcat.txt | tail -80
if grep -q "FATAL EXCEPTION" logcat.txt; then
  echo "---- CRASH ----"
  grep -A 40 "FATAL EXCEPTION" logcat.txt
  exit 1
fi
echo "No crash: Hailey opened."
