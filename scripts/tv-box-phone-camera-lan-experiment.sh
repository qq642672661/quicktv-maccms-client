#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

source "$ROOT_DIR/scripts/android-env.sh"

PACKAGE_NAME="${PACKAGE_NAME:-com.quicktvui.hellotv}"
BOX_IP="${BOX_IP:-192.168.10.122}"
PHONE_CAMERA_SIGNALING_PORT="${PHONE_CAMERA_SIGNALING_PORT:-17891}"
PHONE_CAMERA_HOST_IP="${TV_BOX_PHONE_CAMERA_HOST_IP:-${PHONE_CAMERA_HOST_IP:-}}"
REPORT_DIR="${REPORT_DIR:-$ROOT_DIR/reports}"
SERVER_LOG="${TV_BOX_PHONE_CAMERA_LAN_SERVER_LOG:-$REPORT_DIR/tv-box-phone-camera-lan-signaling-latest.log}"
SERVER_PID=""

mkdir -p "$REPORT_DIR"

normalize_box_target() {
  local target="$1"
  if [[ "$target" == *":"* ]]; then
    printf '%s' "$target"
  else
    printf '%s:5555' "$target"
  fi
}

detect_lan_ip() {
  if command -v ipconfig >/dev/null 2>&1; then
    local default_interface
    local candidate_ip
    default_interface="$(route -n get default 2>/dev/null | awk '/interface:/{print $2; exit}' || true)"
    if [[ -n "$default_interface" ]]; then
      candidate_ip="$(ipconfig getifaddr "$default_interface" 2>/dev/null || true)"
      if [[ -n "$candidate_ip" ]]; then
        printf '%s\n' "$candidate_ip"
        return
      fi
    fi
    for fallback_interface in en0 en1 bridge0; do
      candidate_ip="$(ipconfig getifaddr "$fallback_interface" 2>/dev/null || true)"
      if [[ -n "$candidate_ip" ]]; then
        printf '%s\n' "$candidate_ip"
        return
      fi
    done
    return
  fi
  hostname -I 2>/dev/null | awk '{print $1}' || true
}

wait_for_health() {
  local health_url="$1"
  local attempt
  for ((attempt = 1; attempt <= 20; attempt += 1)); do
    if curl -fsS "$health_url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.5
  done
  return 1
}

cleanup() {
  if [[ -n "$SERVER_PID" ]]; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT

if ! command -v adb >/dev/null 2>&1; then
  echo "ERROR: adb is not installed or not in PATH." >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "ERROR: curl is required for the local signaling health check." >&2
  exit 1
fi

if [[ -z "$PHONE_CAMERA_HOST_IP" ]]; then
  PHONE_CAMERA_HOST_IP="$(detect_lan_ip)"
fi

if [[ -z "$PHONE_CAMERA_HOST_IP" ]]; then
  echo "ERROR: Could not detect a LAN IP. Set TV_BOX_PHONE_CAMERA_HOST_IP=<mac-lan-ip>." >&2
  exit 1
fi

PAIR_BASE_URL="${TV_BOX_PHONE_CAMERA_PAIR_BASE_URL:-http://$PHONE_CAMERA_HOST_IP:$PHONE_CAMERA_SIGNALING_PORT/phone-camera}"
EXPECTED_SIGNALING_HOST="$(node -e "console.log(new URL(process.argv[1]).hostname)" "$PAIR_BASE_URL")"
BOX_TARGET="$(normalize_box_target "$BOX_IP")"

echo "== HelloTV phone-camera LAN experiment =="
echo "TV box: $BOX_TARGET"
echo "Phone camera pair URL: $PAIR_BASE_URL"
echo "Expected signaling host: $EXPECTED_SIGNALING_HOST"
echo "Report dir: $REPORT_DIR"

echo
echo "== Build experiment APK with optional native WebRTC =="
(
  cd "$ROOT_DIR"
  ENABLE_PHONE_CAMERA_WEBRTC=true \
  PHONE_CAMERA_WEBRTC_COORDINATE="${PHONE_CAMERA_WEBRTC_COORDINATE:-io.github.webrtc-sdk:android:114.5735.11}" \
  VITE_PHONE_CAMERA_PAIR_BASE_URL="$PAIR_BASE_URL" \
  npm run build-apk-debug
)

APK_PATH="$(ls -t "$ROOT_DIR"/android/app/build/outputs/apk/debug/*_debug.apk 2>/dev/null | head -n 1 || true)"
if [[ -z "$APK_PATH" ]]; then
  echo "ERROR: Debug APK was not found after build." >&2
  exit 1
fi

echo
echo "== Install experiment APK =="
adb connect "$BOX_TARGET" || true
adb -s "$BOX_TARGET" install -r "$APK_PATH"

echo
echo "== Start local phone-camera signaling service =="
rm -f "$SERVER_LOG"
PHONE_CAMERA_PUBLIC_BASE_URL="$PAIR_BASE_URL" \
PHONE_CAMERA_SIGNALING_PORT="$PHONE_CAMERA_SIGNALING_PORT" \
node "$ROOT_DIR/scripts/tv-box-phone-camera-signaling-server.js" >"$SERVER_LOG" 2>&1 &
SERVER_PID="$!"

if ! wait_for_health "http://127.0.0.1:$PHONE_CAMERA_SIGNALING_PORT/healthz"; then
  echo "ERROR: local signaling service did not become healthy." >&2
  sed -n '1,160p' "$SERVER_LOG" >&2 || true
  exit 1
fi

echo "Signaling service log: $SERVER_LOG"

echo
echo "== Run TV receiver smoke with hard native WebRTC gate =="
BOX_IP="$BOX_TARGET" \
TV_BOX_PHONE_CAMERA_EXPECTED_SIGNALING_HOST="$EXPECTED_SIGNALING_HOST" \
TV_BOX_PHONE_CAMERA_REQUIRE_NATIVE_WEBRTC_ENGINE=true \
TV_BOX_PHONE_CAMERA_REQUIRE_SIGNALING_ROOM=true \
"$ROOT_DIR/scripts/tv-box-phone-camera-pair-smoke.sh"

echo
echo "Done. This proves the experiment APK can open the native receiver, create the TV signaling room, and expose the native WebRTC media engine."
echo "Boundary: real phone media is still not accepted until phone permissions, TV first frame, audio, stats, reconnect, and privacy-stop evidence are captured."
