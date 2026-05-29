#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

source "$ROOT_DIR/scripts/android-env.sh"

PACKAGE_NAME="${PACKAGE_NAME:-com.quicktvui.hellotv}"
BOX_IP="${BOX_IP:-}"
DEVICE_SERIAL="${DEVICE_SERIAL:-}"
REQUIRE_DEVICE="${REQUIRE_DEVICE:-false}"
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

print_value() {
  printf '%-24s %s\n' "$1" "$2"
}

print_command_version() {
  local label="$1"
  local command_name="$2"
  if command -v "$command_name" >/dev/null 2>&1; then
    print_value "$label" "$(command -v "$command_name")"
  else
    print_value "$label" "missing"
  fi
}

print_manifest_summary_with_apkanalyzer() {
  local apk_path="$1"
  local apkanalyzer="${ANDROID_HOME:-}/cmdline-tools/latest/bin/apkanalyzer"
  local java17_home=""

  if [[ ! -x "$apkanalyzer" ]]; then
    return 1
  fi

  if [[ -d "/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home" ]]; then
    java17_home="/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home"
  elif [[ -d "/usr/local/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home" ]]; then
    java17_home="/usr/local/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home"
  fi

  if [[ -n "$java17_home" ]]; then
      JAVA_HOME="$java17_home" "$apkanalyzer" manifest print "$apk_path" \
        | tr -d '\r' \
      | grep -E 'package="|android:banner=|android:name="(android.permission.CAMERA|android.permission.RECORD_AUDIO|android.software.leanback|android.hardware.camera|android.hardware.camera.any|android.hardware.camera.external|android.hardware.microphone|android.hardware.usb.host|android.hardware.touchscreen|com.quicktvui.hellotv.MainActivity|com.quicktvui.hellotv.tvbox.CameraPreviewActivity|android.intent.category.LEANBACK_LAUNCHER)"|android:required="false"'
  else
    "$apkanalyzer" manifest print "$apk_path" \
      | tr -d '\r' \
      | grep -E 'package="|android:banner=|android:name="(android.permission.CAMERA|android.permission.RECORD_AUDIO|android.software.leanback|android.hardware.camera|android.hardware.camera.any|android.hardware.camera.external|android.hardware.microphone|android.hardware.usb.host|android.hardware.touchscreen|com.quicktvui.hellotv.MainActivity|com.quicktvui.hellotv.tvbox.CameraPreviewActivity|android.intent.category.LEANBACK_LAUNCHER)"|android:required="false"'
  fi
}

print_manifest_summary_with_aapt() {
  local apk_path="$1"
  local aapt="${ANDROID_HOME:-}/build-tools/31.0.0/aapt"

  if [[ ! -x "$aapt" ]]; then
    return 1
  fi

  "$aapt" dump badging "$apk_path" \
    | tr -d '\r' \
    | grep -E "package:|application-label:|launchable-activity:|uses-feature: name='android\\.(software\\.leanback|hardware\\.camera|hardware\\.camera\\.any|hardware\\.camera\\.external|hardware\\.microphone|hardware\\.usb\\.host|hardware\\.touchscreen)'" || true
  "$aapt" dump permissions "$apk_path" | tr -d '\r' | grep -E 'android.permission.CAMERA|android.permission.RECORD_AUDIO' || true
}

echo "== HelloTV TV-box doctor =="
print_value "Project" "$ROOT_DIR"
print_value "Package" "$PACKAGE_NAME"

echo
echo "== Host toolchain =="
print_command_version "node" node
print_command_version "npm" npm
print_command_version "adb" adb
print_value "JAVA_HOME" "${JAVA_HOME:-missing}"
print_value "ANDROID_HOME" "${ANDROID_HOME:-missing}"

if [[ -n "${JAVA_HOME:-}" && -x "$JAVA_HOME/bin/java" ]]; then
  "$JAVA_HOME/bin/java" -version 2>&1 | sed 's/^/java: /'
else
  echo "WARN: JDK 11 was not found. Run: brew install openjdk@11"
fi

echo
echo "== Remote navigation self-test =="
if command -v npm >/dev/null 2>&1; then
  (cd "$ROOT_DIR" && npm run -s tv-box:remote-test) || echo "WARN: Remote navigation self-test failed."
else
  echo "WARN: npm is missing; skipped remote navigation self-test."
fi

if [[ -z "${ANDROID_HOME:-}" ]]; then
  echo "WARN: Android SDK was not found. Run: brew install android-commandlinetools android-platform-tools"
else
  [[ -d "$ANDROID_HOME/platforms/android-31" ]] \
    && print_value "platform android-31" "ok" \
    || print_value "platform android-31" "missing"
  [[ -x "$ANDROID_HOME/build-tools/31.0.0/aapt" ]] \
    && print_value "aapt 31.0.0" "$ANDROID_HOME/build-tools/31.0.0/aapt" \
    || print_value "aapt 31.0.0" "missing"
fi

echo
echo "== Latest debug APK =="
APK_PATH="$(ls -t "$ROOT_DIR"/android/app/build/outputs/apk/debug/*_debug.apk 2>/dev/null | head -n 1 || true)"
if [[ -z "$APK_PATH" ]]; then
  echo "WARN: No debug APK found. Build one with: npm run build-apk-debug"
else
  print_value "APK" "$APK_PATH"
  ls -lh "$APK_PATH" | awk '{ print "Size: " $5 }'

  echo
  echo "== APK manifest summary =="
  if print_manifest_summary_with_apkanalyzer "$APK_PATH"; then
    :
  elif print_manifest_summary_with_aapt "$APK_PATH"; then
    :
  else
    echo "WARN: Could not inspect APK manifest. Install Android command-line tools and JDK 17."
  fi
fi

if ! command -v adb >/dev/null 2>&1; then
  echo
  echo "WARN: adb is missing; skipped device checks."
  exit 0
fi

if [[ -n "$BOX_IP" ]]; then
  BOX_TARGET="$(normalize_box_target "$BOX_IP")"
  echo
  echo "== Connect TV box =="
  adb connect "$BOX_TARGET" || true
fi

echo
echo "== Connected devices =="
adb devices -l

devices="$(adb devices | awk 'NR > 1 && $2 == "device" { print $1 }')"
device_count="$(printf '%s\n' "$devices" | sed '/^$/d' | wc -l | tr -d ' ')"

if [[ "$device_count" -eq 0 ]]; then
  echo
  echo "NEXT: No authorized TV box is connected."
  if adb devices | awk 'NR > 1 && ($2 == "unauthorized" || $2 == "offline") { found = 1 } END { exit found ? 0 : 1 }'; then
    echo "      A TV box is visible but not authorized/online. Confirm the RSA dialog on the TV box, or restart network debugging."
  fi
  echo "      Turn on TV-box developer/network debugging, then run:"
  echo "      BOX_IP=<box-ip> npm run tv-box:doctor"
  echo "      BOX_IP=<box-ip> npm run tv-box:easy"
  if [[ "$REQUIRE_DEVICE" == "true" ]]; then
    exit 1
  fi
  exit 0
fi

if [[ -z "$DEVICE_SERIAL" ]]; then
  if [[ -n "$BOX_TARGET" ]] && printf '%s\n' "$devices" | grep -Fxq "$BOX_TARGET"; then
    DEVICE_SERIAL="$BOX_TARGET"
  elif [[ -n "$BOX_TARGET" ]]; then
    echo
    echo "NEXT: Target TV box is not authorized or online: $BOX_TARGET"
    echo "      Confirm the RSA dialog on the TV box, or restart network debugging."
    if [[ "$REQUIRE_DEVICE" == "true" ]]; then
      exit 1
    fi
    exit 0
  fi
fi

if [[ -z "$DEVICE_SERIAL" ]]; then
  if [[ "$device_count" -gt 1 ]]; then
    echo "WARN: Multiple devices are connected. Set DEVICE_SERIAL=<serial> for precise checks."
    exit 0
  fi
  DEVICE_SERIAL="$(printf '%s\n' "$devices" | sed '/^$/d' | sed -n '1p')"
fi

adb_cmd+=( -s "$DEVICE_SERIAL" )

run_adb() {
  "${adb_cmd[@]}" "$@"
}

echo
echo "== Device facts =="
print_value "Serial" "$DEVICE_SERIAL"
print_value "Model" "$(run_adb shell getprop ro.product.model | tr -d '\r')"
print_value "Android SDK" "$(run_adb shell getprop ro.build.version.sdk | tr -d '\r')"
run_adb shell pm list features | tr -d '\r' | grep -E 'leanback|camera|microphone|audio|television|usb.host' || echo "WARN: No TV/camera/audio/USB feature lines were reported."

echo
echo "== Device USB snapshot =="
run_adb shell dumpsys usb \
  | tr -d '\r' \
  | grep -Ei 'Device|Class|class|interface|video|camera|uvc|webcam|audio|microphone|host|accessory' \
  | head -120 || echo "WARN: No useful USB snapshot lines were reported."

echo
echo "== App on device =="
if run_adb shell pm path "$PACKAGE_NAME" >/dev/null; then
  print_value "Installed" "yes"
  run_adb shell dumpsys package "$PACKAGE_NAME" | tr -d '\r' | grep -E 'android.permission.CAMERA|android.permission.RECORD_AUDIO|android.hardware.camera|android.hardware.microphone|android.hardware.usb.host|android.software.leanback' || true
  echo
  echo "Camera appops:"
  run_adb shell appops get "$PACKAGE_NAME" CAMERA 2>/dev/null | tr -d '\r' || true
  echo
  echo "Record audio appops:"
  run_adb shell appops get "$PACKAGE_NAME" RECORD_AUDIO 2>/dev/null | tr -d '\r' || true
else
  print_value "Installed" "no"
  echo "NEXT: Install the app with: BOX_IP=<box-ip> npm run tv-box:easy"
fi

echo
echo "Doctor finished."
