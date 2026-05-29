#!/usr/bin/env bash
set -euo pipefail

PACKAGE_NAME="${PACKAGE_NAME:-com.quicktvui.hellotv}"
MAIN_ACTIVITY="${MAIN_ACTIVITY:-com.quicktvui.hellotv/.MainActivity}"
BOX_IP="${BOX_IP:-}"
DEVICE_SERIAL="${DEVICE_SERIAL:-}"
LOG_SECONDS="${LOG_SECONDS:-8}"
BOX_TARGET=""

adb_cmd=(adb)

normalize_box_target() {
  local target="$1"
  if [[ "$target" == *":"* ]]; then
    printf '%s' "$target"
  else
    printf '%s:5555' "$target"
  fi
}

select_device() {
  if [[ -n "$BOX_IP" ]]; then
    BOX_TARGET="$(normalize_box_target "$BOX_IP")"
    echo
    echo "== Connect TV box =="
    adb connect "$BOX_TARGET" || true
  fi

  echo
  echo "== Connected devices =="
  adb devices -l

  local devices
  devices="$(adb devices | awk 'NR > 1 && $2 == "device" { print $1 }')"
  local device_count
  device_count="$(printf '%s\n' "$devices" | sed '/^$/d' | wc -l | tr -d ' ')"

  if [[ "$device_count" -eq 0 ]]; then
    echo "ERROR: No authorized Android TV/box device found. Run: adb connect <box-ip>:5555" >&2
    if adb devices | awk 'NR > 1 && ($2 == "unauthorized" || $2 == "offline") { found = 1 } END { exit found ? 0 : 1 }'; then
      echo "A device is visible but not ready. Confirm the RSA authorization dialog on the TV box, or reconnect network debugging." >&2
    fi
    exit 1
  fi

  if [[ -z "$DEVICE_SERIAL" && -n "$BOX_TARGET" ]] && printf '%s\n' "$devices" | grep -Fxq "$BOX_TARGET"; then
    DEVICE_SERIAL="$BOX_TARGET"
  elif [[ -z "$DEVICE_SERIAL" && -n "$BOX_TARGET" ]]; then
    echo "ERROR: Target TV box is not authorized or online: $BOX_TARGET" >&2
    adb devices -l >&2
    exit 1
  fi

  if [[ -z "$DEVICE_SERIAL" ]]; then
    if [[ "$device_count" -gt 1 ]]; then
      echo "ERROR: Multiple Android devices are connected. Run with DEVICE_SERIAL=<serial> or BOX_IP=<box-ip>." >&2
      adb devices -l >&2
      exit 1
    fi
    DEVICE_SERIAL="$(printf '%s\n' "$devices" | sed '/^$/d' | sed -n '1p')"
  fi

  adb_cmd+=( -s "$DEVICE_SERIAL" )
}

run_adb() {
  "${adb_cmd[@]}" "$@"
}

echo "== HelloTV TV-box smoke test =="
echo "Package: $PACKAGE_NAME"
echo "Activity: $MAIN_ACTIVITY"

if ! command -v adb >/dev/null 2>&1; then
  echo "ERROR: adb is not installed or not in PATH." >&2
  exit 1
fi

select_device

echo
echo "== Device facts =="
echo "Device: $DEVICE_SERIAL"
run_adb shell getprop ro.product.model | tr -d '\r'
run_adb shell getprop ro.build.version.sdk | tr -d '\r'
run_adb shell pm list features | tr -d '\r' | grep -E 'leanback|camera|television|usb.host' || true

echo
echo "== App install check =="
if ! run_adb shell pm path "$PACKAGE_NAME" >/dev/null; then
  echo "ERROR: $PACKAGE_NAME is not installed. Build and install the APK first." >&2
  exit 1
fi
run_adb shell dumpsys package "$PACKAGE_NAME" | tr -d '\r' | grep -E 'android.permission.CAMERA|android.hardware.camera|android.hardware.usb.host|android.software.leanback' || true

echo
echo "== Launch app =="
run_adb logcat -c
run_adb shell am force-stop "$PACKAGE_NAME"
run_adb shell am start -n "$MAIN_ACTIVITY"
sleep 3

echo
echo "== Remote control walk-through =="
echo "Pressing 0, BACK, MENU, BACK, OK, 0, BACK, OK, RIGHT, BACK, BACK to cover help, live rescue, live menu, and home return paths."
run_adb shell input keyevent 7
sleep 1
run_adb shell input keyevent 4
sleep 1
run_adb shell input keyevent 82
sleep 1
run_adb shell input keyevent 4
sleep 1
run_adb shell input keyevent 23
sleep 2
run_adb shell input keyevent 7
sleep 1
run_adb shell input keyevent 4
sleep 1
run_adb shell input keyevent 23
sleep 2
run_adb shell input keyevent 22
sleep 1
run_adb shell input keyevent 4
sleep 1
run_adb shell input keyevent 4
sleep 1

echo
echo "== Search and history rescue walk-through =="
echo "Pressing 2, 0, BACK, 3, MENU, BACK to cover search/history help rescue and simple-home return paths."
run_adb shell am force-stop "$PACKAGE_NAME"
run_adb shell am start -n "$MAIN_ACTIVITY" >/dev/null
sleep 3
run_adb shell input keyevent 9
sleep 2
run_adb shell input keyevent 7
sleep 1
run_adb shell input keyevent 4
sleep 1
run_adb shell input keyevent 10
sleep 2
run_adb shell input keyevent 82
sleep 1
run_adb shell input keyevent 4
sleep 1

echo
echo "== Classic home rescue walk-through =="
echo "Pressing 5, 0, BACK, 5, 6, BACK, 5, BACK to cover accidental all-content entry, 0/6 help rescue, and simple-home return."
run_adb shell am force-stop "$PACKAGE_NAME"
run_adb shell am start -n "$MAIN_ACTIVITY" >/dev/null
sleep 3
run_adb shell input keyevent 12
sleep 2
run_adb shell input keyevent 7
sleep 1
run_adb shell input keyevent 4
sleep 1
run_adb shell input keyevent 12
sleep 2
run_adb shell input keyevent 13
sleep 1
run_adb shell input keyevent 4
sleep 1
run_adb shell input keyevent 12
sleep 2
run_adb shell input keyevent 4
sleep 1

echo
echo "== Camera setup walk-through =="
echo "Pressing DOWN, OK, MENU, BACK, DOWN, OK, RIGHT, DOWN, UP, LEFT, BACK to cover home/camera/help return paths without opening permission dialogs."
run_adb shell am force-stop "$PACKAGE_NAME"
run_adb shell am start -n "$MAIN_ACTIVITY" >/dev/null
sleep 3
run_adb shell input keyevent 20
sleep 1
run_adb shell input keyevent 23
sleep 2
run_adb shell input keyevent 82
sleep 1
run_adb shell input keyevent 4
sleep 1
run_adb shell input keyevent 20
sleep 1
run_adb shell input keyevent 23
sleep 2
run_adb shell input keyevent 22
sleep 1
run_adb shell input keyevent 20
sleep 1
run_adb shell input keyevent 19
sleep 1
run_adb shell input keyevent 21
sleep 1
run_adb shell input keyevent 4
sleep 1

echo
echo "== Recent app log snapshot =="
sleep "$LOG_SECONDS"
LOG_SNAPSHOT="$(run_adb logcat -d -t 500 | tr -d '\r' | grep -E 'HelloTV|TvBoxModule|Hippy|tdf|reportException|render view exception|Uncaught|AndroidRuntime|FATAL EXCEPTION|Permission|ActivityNotFound' || true)"
if [[ -n "$LOG_SNAPSHOT" ]]; then
  printf '%s\n' "$LOG_SNAPSHOT"
else
  echo "No matching app, permission, or crash log lines were captured."
fi

if printf '%s\n' "$LOG_SNAPSHOT" | grep -E 'E AndroidRuntime|FATAL EXCEPTION|reportException|render view exception|Uncaught' >/dev/null; then
  echo "ERROR: Android or JS runtime failure was captured during the TV-box smoke walk-through." >&2
  exit 1
fi

echo
echo "Smoke test finished. Continue manual camera permission and playback checks on the TV."
