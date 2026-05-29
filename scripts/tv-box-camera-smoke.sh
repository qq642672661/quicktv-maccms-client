#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

source "$ROOT_DIR/scripts/android-env.sh"

PACKAGE_NAME="${PACKAGE_NAME:-com.quicktvui.hellotv}"
MAIN_ACTIVITY="${MAIN_ACTIVITY:-com.quicktvui.hellotv/.MainActivity}"
BOX_IP="${BOX_IP:-}"
DEVICE_SERIAL="${DEVICE_SERIAL:-}"
LOG_LINES="${LOG_LINES:-500}"
CAMERA_PREVIEW_ACTIVITY="${CAMERA_PREVIEW_ACTIVITY:-CameraPreviewActivity}"

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
    echo "ERROR: No authorized Android TV/box device found." >&2
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
      echo "ERROR: Multiple Android devices are connected. Run with DEVICE_SERIAL=<serial>." >&2
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

current_activity_snapshot() {
  {
    run_adb shell dumpsys window windows 2>/dev/null || true
    run_adb shell dumpsys activity activities 2>/dev/null || true
  } \
    | tr -d '\r' \
    | grep -E 'mCurrentFocus|mFocusedApp|mFocusedWindow|mResumedActivity|ResumedActivity|topResumedActivity' \
    | head -30 || true
}

require_current_activity() {
  local expected="$1"
  local snapshot="$2"
  local label="$3"

  if ! printf '%s\n' "$snapshot" | grep -F "$expected" >/dev/null; then
    echo "ERROR: $label did not show $expected." >&2
    echo "Current activity snapshot:" >&2
    printf '%s\n' "$snapshot" >&2
    exit 1
  fi
}

require_not_current_activity() {
  local unexpected="$1"
  local snapshot="$2"
  local label="$3"

  if printf '%s\n' "$snapshot" | grep -F "$unexpected" >/dev/null; then
    echo "ERROR: $label still shows $unexpected." >&2
    echo "Current activity snapshot:" >&2
    printf '%s\n' "$snapshot" >&2
    exit 1
  fi
}

echo "== HelloTV TV-box camera smoke test =="
echo "Package: $PACKAGE_NAME"
echo "Activity: $MAIN_ACTIVITY"

if ! command -v adb >/dev/null 2>&1; then
  echo "ERROR: adb is not installed or not in PATH." >&2
  exit 1
fi

select_device

echo
echo "== Device camera facts =="
echo "Device: $DEVICE_SERIAL"
run_adb shell getprop ro.product.model | tr -d '\r'
run_adb shell getprop ro.build.version.sdk | tr -d '\r'
run_adb shell pm list features | tr -d '\r' | grep -E 'camera|microphone|audio|usb.host|leanback|television' || true
echo
echo "USB snapshot:"
run_adb shell dumpsys usb \
  | tr -d '\r' \
  | grep -Ei 'Device|Class|class|interface|video|camera|uvc|webcam|audio|microphone|host|accessory' \
  | head -120 || true

echo
echo "== App install check =="
if ! run_adb shell pm path "$PACKAGE_NAME" >/dev/null; then
  echo "ERROR: $PACKAGE_NAME is not installed. Run: BOX_IP=<box-ip> npm run tv-box:easy" >&2
  exit 1
fi

run_adb shell dumpsys package "$PACKAGE_NAME" | tr -d '\r' | grep -E 'android.permission.CAMERA|android.permission.RECORD_AUDIO|android.hardware.camera|android.hardware.microphone|android.hardware.usb.host|android.software.leanback' || true

echo
echo "== Media permissions for preview smoke =="
if run_adb shell pm grant "$PACKAGE_NAME" android.permission.CAMERA >/dev/null 2>&1; then
  echo "Granted android.permission.CAMERA via adb."
else
  echo "WARN: adb pm grant did not succeed; the TV may show a permission dialog during smoke."
fi
if run_adb shell pm grant "$PACKAGE_NAME" android.permission.RECORD_AUDIO >/dev/null 2>&1; then
  echo "Granted android.permission.RECORD_AUDIO via adb."
else
  echo "WARN: adb pm grant RECORD_AUDIO did not succeed; voice/video features may show a permission dialog later."
fi
run_adb shell appops set "$PACKAGE_NAME" CAMERA allow >/dev/null 2>&1 || true
run_adb shell appops set "$PACKAGE_NAME" RECORD_AUDIO allow >/dev/null 2>&1 || true

echo
echo "== Navigate to camera setup and trigger camera test =="
run_adb logcat -c
run_adb shell am force-stop "$PACKAGE_NAME"
START_URI="esapp://action/start?es_pkg=${PACKAGE_NAME}&from=tv_box_camera_smoke&splash=-1&args={\"url\":\"tv_box_home\"}"
run_adb shell am start -n "$MAIN_ACTIVITY" -d "$START_URI"
sleep 6

# Simple home: digit 4 directly opens "摄像头", avoiding focus drift on TV launchers
# and stale restored pages from earlier manual tests.
run_adb shell input keyevent 11
sleep 3

# Camera setup: digit 3 directly opens "测试摄像头" and the native CameraPreviewActivity.
run_adb shell input keyevent 10
sleep 3

echo
echo "== Current activity after camera test =="
FOCUS_DURING_PREVIEW="$(current_activity_snapshot)"
if [[ -n "$FOCUS_DURING_PREVIEW" ]]; then
  printf '%s\n' "$FOCUS_DURING_PREVIEW"
else
  echo "No focused activity lines were captured."
fi
require_current_activity "$CAMERA_PREVIEW_ACTIVITY" "$FOCUS_DURING_PREVIEW" "camera preview launch"

run_adb shell input keyevent 4
sleep 1

echo
echo "== Current activity after back from camera preview =="
FOCUS_AFTER_BACK="$(current_activity_snapshot)"
if [[ -n "$FOCUS_AFTER_BACK" ]]; then
  printf '%s\n' "$FOCUS_AFTER_BACK"
else
  echo "No focused activity lines were captured."
fi
require_not_current_activity "$CAMERA_PREVIEW_ACTIVITY" "$FOCUS_AFTER_BACK" "camera preview back navigation"

echo
echo "== Camera smoke log snapshot =="
LOG_SNAPSHOT="$(run_adb logcat -d -t "$LOG_LINES" | tr -d '\r' | grep -E 'TvBoxModule|CameraPreviewActivity|Camera|camera|Audio|audio|Microphone|microphone|Hippy|tdf|reportException|render view exception|Uncaught|ActivityNotFound|AndroidRuntime|FATAL EXCEPTION|Permission' || true)"
if [[ -n "$LOG_SNAPSHOT" ]]; then
  printf '%s\n' "$LOG_SNAPSHOT"
else
  echo "No camera-related log lines were captured."
fi

if printf '%s\n' "$LOG_SNAPSHOT" | grep -E 'E AndroidRuntime|FATAL EXCEPTION|reportException|render view exception|Uncaught' >/dev/null; then
  echo "ERROR: Android or JS runtime failure was captured during camera smoke." >&2
  exit 1
fi

echo
echo "Internal camera preview opened and remote BACK exited it without Android or JS crash logs."
echo "Camera smoke finished."
