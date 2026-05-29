#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

source "$ROOT_DIR/scripts/android-env.sh"

PACKAGE_NAME="${PACKAGE_NAME:-com.quicktvui.hellotv}"
MAIN_ACTIVITY="${MAIN_ACTIVITY:-com.quicktvui.hellotv/.MainActivity}"
BOX_IP="${BOX_IP:-}"
DEVICE_SERIAL="${DEVICE_SERIAL:-}"
REPORT_DIR="${REPORT_DIR:-$ROOT_DIR/reports}"
OUTPUT_MD="${TV_BOX_PHONE_CAMERA_PAIR_SMOKE_MD:-$REPORT_DIR/tv-box-phone-camera-pair-smoke-latest.md}"
OUTPUT_JSON="${TV_BOX_PHONE_CAMERA_PAIR_SMOKE_JSON:-$REPORT_DIR/tv-box-phone-camera-pair-smoke-latest.json}"
SCREENSHOT_PATH="${TV_BOX_PHONE_CAMERA_PAIR_SMOKE_SCREENSHOT:-$REPORT_DIR/tv-box-phone-camera-pair-smoke-latest.png}"
UI_XML_PATH="${TV_BOX_PHONE_CAMERA_PAIR_SMOKE_UI_XML:-$REPORT_DIR/tv-box-phone-camera-pair-smoke-latest.xml}"
BOX_TARGET=""
adb_cmd=(adb)

mkdir -p "$REPORT_DIR"

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

require_text() {
  local needle="$1"
  local label="$2"
  if ! grep -Fq "$needle" "$UI_XML_PATH"; then
    echo "ERROR: phone camera pairing UI missing $label: $needle" >&2
    exit 1
  fi
}

echo "== HelloTV phone camera pairing smoke test =="
echo "Package: $PACKAGE_NAME"
echo "Activity: $MAIN_ACTIVITY"

if ! command -v adb >/dev/null 2>&1; then
  echo "ERROR: adb is not installed or not in PATH." >&2
  exit 1
fi

select_device

echo
echo "== App install check =="
if ! run_adb shell pm path "$PACKAGE_NAME" >/dev/null; then
  echo "ERROR: $PACKAGE_NAME is not installed. Run: BOX_IP=<box-ip> npm run tv-box:easy" >&2
  exit 1
fi

echo
echo "== Navigate home -> camera setup -> phone camera pairing =="
run_adb shell am force-stop "$PACKAGE_NAME"
START_URI="esapp://action/start?es_pkg=${PACKAGE_NAME}&from=tv_box_phone_camera_pair_smoke&splash=-1&args={\"url\":\"tv_box_home\"}"
run_adb shell am start -n "$MAIN_ACTIVITY" -d "$START_URI"
sleep 6

# Simple home: digit 4 opens "摄像头"; camera setup: digit 4 opens "手机摄像头".
run_adb shell input keyevent KEYCODE_4
sleep 3
run_adb shell input keyevent KEYCODE_4
sleep 3

echo
echo "== Capture UI evidence =="
run_adb shell uiautomator dump /sdcard/hellotv-phone-camera-pair.xml >/dev/null
run_adb exec-out cat /sdcard/hellotv-phone-camera-pair.xml > "$UI_XML_PATH"
run_adb exec-out screencap -p > "$SCREENSHOT_PATH"

if [[ ! -s "$UI_XML_PATH" ]]; then
  echo "ERROR: UI XML evidence was not captured." >&2
  exit 1
fi

if [[ ! -s "$SCREENSHOT_PATH" ]]; then
  echo "ERROR: screenshot evidence was not captured." >&2
  exit 1
fi

require_text "手机当电视摄像头" "page kicker"
require_text "扫码连接手机摄像头" "page title"
require_text "不会把手机伪装成系统摄像头" "Camera2 boundary"
require_text "手机扫码" "QR caption"
require_text "房间码" "room code label"
require_text "一次性房间码，约 10 分钟内有效" "room TTL hint"
require_text "现在只做三步" "three-step guide title"
require_text "电视出现首帧后再记为通过" "first-frame acceptance boundary"
require_text "验收边界" "acceptance boundary panel"
require_text "不证明真实音视频已通过" "not-yet-proven boundary"
require_text "默认不录制" "privacy boundary"
require_text "微信小程序推流" "WeChat gated boundary"
require_text "重新生成" "regenerate action"
require_text "返回摄像头" "back action"
require_text "帮助自检" "help action"

ROOM_CODE="$(grep -Eo 'text="[0-9]{6}"' "$UI_XML_PATH" | head -n 1 | sed -E 's/text="([0-9]{6})"/\1/' || true)"
if [[ -z "$ROOM_CODE" ]]; then
  echo "ERROR: six-digit room code was not visible in UI XML." >&2
  exit 1
fi

SCREENSHOT_BYTES="$(wc -c < "$SCREENSHOT_PATH" | tr -d ' ')"
UI_XML_BYTES="$(wc -c < "$UI_XML_PATH" | tr -d ' ')"
FOCUS_SNAPSHOT="$(current_activity_snapshot)"
GENERATED_AT_UTC="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

node - "$OUTPUT_JSON" "$GENERATED_AT_UTC" "$DEVICE_SERIAL" "$ROOM_CODE" "$SCREENSHOT_PATH" "$SCREENSHOT_BYTES" "$UI_XML_PATH" "$UI_XML_BYTES" "$FOCUS_SNAPSHOT" <<'NODE'
const fs = require('fs')
const [
  outputPath,
  generatedAtUtc,
  deviceSerial,
  roomCode,
  screenshotPath,
  screenshotBytes,
  uiXmlPath,
  uiXmlBytes,
  focusSnapshot
] = process.argv.slice(2)

const report = {
  generatedAtUtc,
  status: 'pass',
  deviceSerial,
  route: 'home_digit_4_to_camera_setup_digit_4_to_phone_camera_pair',
  roomCode,
  evidence: {
    screenshotPath,
    screenshotBytes: Number(screenshotBytes),
    uiXmlPath,
    uiXmlBytes: Number(uiXmlBytes),
    focusSnapshot
  },
  verifiedText: [
    '手机当电视摄像头',
    '扫码连接手机摄像头',
    '不会把手机伪装成系统摄像头',
    '电视出现首帧后再记为通过',
    '默认不录制',
    '微信小程序推流',
    '重新生成',
    '返回摄像头',
    '帮助自检'
  ],
  boundary: 'This proves the TV pairing entry and remote operation path only. Real phone media acceptance still requires signaling, native WebRTC receiver, phone capture, first frame, audio, stats, reconnect, and privacy-stop evidence.'
}

fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`)
NODE

cat > "$OUTPUT_MD" <<MD
# HelloTV 手机摄像头配对页实机冒烟

- 生成时间 UTC: \`$GENERATED_AT_UTC\`
- 状态: \`pass\`
- 设备: \`$DEVICE_SERIAL\`
- 路径: 首页按 4 -> 摄像头页按 4 -> 手机摄像头配对页
- 房间码: \`$ROOM_CODE\`
- 截图: \`$SCREENSHOT_PATH\` (${SCREENSHOT_BYTES} bytes)
- UI XML: \`$UI_XML_PATH\` (${UI_XML_BYTES} bytes)

## 已验证

- 页面显示“手机当电视摄像头”和“扫码连接手机摄像头”。
- 页面显示二维码区域、6 位房间码、10 分钟有效提示。
- 页面显示三步流程，并明确“电视出现首帧后再记为通过”。
- 页面显示验收边界：未接入原生 WebRTC 接收端前，只证明配对入口，不证明真实音视频已通过。
- 页面显示隐私边界：默认不录制，微信小程序推流要等资质和权限通过。
- 遥控器动作只暴露重新生成、返回摄像头、帮助自检。

## 当前前台

\`\`\`
$FOCUS_SNAPSHOT
\`\`\`

MD

echo "Phone camera pairing smoke report: $OUTPUT_MD"
echo "Machine-readable report: $OUTPUT_JSON"
echo "Screenshot evidence: $SCREENSHOT_PATH"
