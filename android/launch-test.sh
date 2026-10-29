#!/usr/bin/env bash
# Installs the APK on a running emulator, opens it, and fails unless Hailey starts: no crash, and
# the in-app server (mobile/engine.ts) reports it is ready. Saves a screenshot and the log.
set -u
APK="$1"
PKG=app.hailey.twa
adb install -r "$APK" || exit 1
adb logcat -c
adb shell pm grant "$PKG" android.permission.POST_NOTIFICATIONS 2>/dev/null || true
adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1
ok=""
for i in $(seq 1 45); do
  sleep 2
  if adb logcat -d -s Hailey:* | grep -q "Hailey engine ready"; then ok=1; break; fi
done
sleep 4
adb exec-out screencap -p > screenshot.png || true
adb logcat -d > logcat.txt
echo "---- Hailey log ----"
grep -E "AndroidRuntime| Hailey|$PKG" logcat.txt | tail -80
if grep -q "FATAL EXCEPTION" logcat.txt; then
  echo "---- CRASH ----"
  grep -A 40 "FATAL EXCEPTION" logcat.txt
  exit 1
fi
if [ -z "$ok" ]; then
  echo "Hailey did not report that it started (no 'Hailey engine ready' in the log)."
  exit 1
fi
echo "Hailey started on the emulator."
