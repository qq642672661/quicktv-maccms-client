#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

source "$ROOT_DIR/scripts/android-env.sh"

PACKAGE_NAME="${PACKAGE_NAME:-com.quicktvui.hellotv}"
MAIN_ACTIVITY="${MAIN_ACTIVITY:-com.quicktvui.hellotv/.MainActivity}"
BOX_IP="${BOX_IP:-}"
DEVICE_SERIAL="${DEVICE_SERIAL:-}"
RUN_SMOKE="${RUN_SMOKE:-true}"
SKIP_BUILD="${SKIP_BUILD:-false}"
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

if ! command -v adb >/dev/null 2>&1; then
  echo "ERROR: adb is not installed or not in PATH." >&2
  echo "On macOS: brew install android-platform-tools" >&2
  exit 1
fi

echo "== Verify remote navigation logic =="
(cd "$ROOT_DIR" && npm run -s tv-box:remote-test)

if [[ "$SKIP_BUILD" != "true" ]]; then
  echo "== Build debug APK =="
  cd "$ROOT_DIR"
  npm run build-apk-debug
fi

if [[ -n "$BOX_IP" ]]; then
  BOX_TARGET="$(normalize_box_target "$BOX_IP")"
  echo
  echo "== Connect TV box =="
  adb connect "$BOX_TARGET"
fi

devices="$(adb devices | awk 'NR > 1 && $2 == "device" { print $1 }')"
device_count="$(printf '%s\n' "$devices" | sed '/^$/d' | wc -l | tr -d ' ')"
if [[ "$device_count" -eq 0 ]]; then
  echo "ERROR: No authorized Android TV/box device found." >&2
  adb devices -l >&2
  if adb devices | awk 'NR > 1 && ($2 == "unauthorized" || $2 == "offline") { found = 1 } END { exit found ? 0 : 1 }'; then
    echo "A device is visible but not ready. Confirm the RSA authorization dialog on the TV box, or reconnect network debugging." >&2
  fi
  echo "Connect by USB, or run: BOX_IP=<box-ip> npm run tv-box:easy" >&2
  exit 1
fi

if [[ -z "$DEVICE_SERIAL" ]]; then
  if [[ -n "$BOX_TARGET" ]] && printf '%s\n' "$devices" | grep -Fxq "$BOX_TARGET"; then
    DEVICE_SERIAL="$BOX_TARGET"
  elif [[ -n "$BOX_TARGET" ]]; then
    echo "ERROR: Target TV box is not authorized or online: $BOX_TARGET" >&2
    adb devices -l >&2
    exit 1
  fi
fi

if [[ -z "$DEVICE_SERIAL" ]]; then
  if [[ "$device_count" -gt 1 ]]; then
    echo "ERROR: Multiple Android devices are connected. Pick one with DEVICE_SERIAL=<serial>." >&2
    adb devices -l
    exit 1
  fi
  DEVICE_SERIAL="$(printf '%s\n' "$devices" | sed '/^$/d' | sed -n '1p')"
fi

adb_cmd+=( -s "$DEVICE_SERIAL" )

APK_PATH="$(ls -t "$ROOT_DIR"/android/app/build/outputs/apk/debug/*_debug.apk 2>/dev/null | head -n 1 || true)"
if [[ -z "$APK_PATH" ]]; then
  echo "ERROR: Debug APK was not found under android/app/build/outputs/apk/debug." >&2
  exit 1
fi

echo
echo "== Install APK =="
echo "Device: $DEVICE_SERIAL"
echo "APK: $APK_PATH"
"${adb_cmd[@]}" install -r "$APK_PATH"

echo
echo "== Launch HelloTV =="
"${adb_cmd[@]}" shell am force-stop "$PACKAGE_NAME"
"${adb_cmd[@]}" shell am start -n "$MAIN_ACTIVITY"

if [[ "$RUN_SMOKE" == "true" ]]; then
  echo
  echo "== Run remote-control smoke test =="
  DEVICE_SERIAL="$DEVICE_SERIAL" PACKAGE_NAME="$PACKAGE_NAME" MAIN_ACTIVITY="$MAIN_ACTIVITY" "$ROOT_DIR/scripts/tv-box-smoke.sh"
fi

echo
echo "Done. The TV box should now show the simplified HelloTV home screen."
