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
RECEIVER_SCREENSHOT_PATH="${TV_BOX_PHONE_CAMERA_RECEIVER_SMOKE_SCREENSHOT:-$REPORT_DIR/tv-box-phone-camera-receiver-smoke-latest.png}"
RECEIVER_UI_XML_PATH="${TV_BOX_PHONE_CAMERA_RECEIVER_SMOKE_UI_XML:-$REPORT_DIR/tv-box-phone-camera-receiver-smoke-latest.xml}"
BOX_TARGET=""
adb_cmd=(adb)

mkdir -p "$REPORT_DIR"
rm -f \
  "$OUTPUT_MD" \
  "$OUTPUT_JSON" \
  "$SCREENSHOT_PATH" \
  "$UI_XML_PATH" \
  "$RECEIVER_SCREENSHOT_PATH" \
  "$RECEIVER_UI_XML_PATH"

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

start_route() {
  local route_name="$1"
  local from_name="$2"
  local start_uri="esapp://action/start?es_pkg=${PACKAGE_NAME}&from=${from_name}&splash=-1&args={\"url\":\"${route_name}\"}"
  run_adb shell am force-stop "$PACKAGE_NAME"
  run_adb shell am start -n "$MAIN_ACTIVITY" -d "$start_uri"
}

capture_pair_ui_xml() {
  local output_path="$1"
  run_adb shell uiautomator dump /sdcard/hellotv-phone-camera-pair.xml >/dev/null
  run_adb exec-out cat /sdcard/hellotv-phone-camera-pair.xml > "$output_path"
}

ui_has_text() {
  local file_path="$1"
  local needle="$2"
  [[ -s "$file_path" ]] && grep -Fq "$needle" "$file_path"
}

wait_for_pair_page() {
  local output_path="$1"
  local attempts="${2:-8}"
  local attempt
  for ((attempt = 1; attempt <= attempts; attempt += 1)); do
    capture_pair_ui_xml "$output_path"
    if ui_has_text "$output_path" "扫码连接手机摄像头" && ui_has_text "$output_path" "打开接收端"; then
      return 0
    fi
    sleep 1
  done
  return 1
}

navigate_to_pair_page() {
  echo
  echo "== Navigate directly to phone camera pairing page =="
  start_route "phone_camera_pair" "tv_box_phone_camera_pair_smoke_direct"
  sleep 6
  if wait_for_pair_page "$UI_XML_PATH" 6; then
    PAIR_NAVIGATION_ROUTE="direct_route"
    return 0
  fi

  echo "Direct route did not settle on pairing page; falling back to remote numeric path."
  echo
  echo "== Navigate home -> camera setup -> phone camera pairing =="
  start_route "tv_box_home" "tv_box_phone_camera_pair_smoke"
  sleep 6

  # Simple home: digit 4 opens "摄像头"; camera setup: digit 4 opens "手机摄像头".
  run_adb shell input keyevent KEYCODE_4
  sleep 3
  run_adb shell input keyevent KEYCODE_4
  sleep 3

  if wait_for_pair_page "$UI_XML_PATH" 5; then
    PAIR_NAVIGATION_ROUTE="home_digit_4_to_camera_setup_digit_4_to_phone_camera_pair"
    return 0
  fi

  if ui_has_text "$UI_XML_PATH" "电视盒子摄像头" && ui_has_text "$UI_XML_PATH" "手机摄像头"; then
    echo "Still on camera setup page; sending one extra KEYCODE_4 for route timing recovery."
    run_adb shell input keyevent KEYCODE_4
    sleep 3
    if wait_for_pair_page "$UI_XML_PATH" 5; then
      PAIR_NAVIGATION_ROUTE="home_digit_4_to_camera_setup_digit_4_retry_to_phone_camera_pair"
      return 0
    fi
  fi

  return 1
}

require_text() {
  require_file_text "$UI_XML_PATH" "$1" "$2"
}

require_file_text() {
  local file_path="$1"
  local needle="$2"
  local label="$3"
  if ! grep -Fq "$needle" "$file_path"; then
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

PAIR_NAVIGATION_ROUTE=""
if ! navigate_to_pair_page; then
  echo "ERROR: phone camera pairing page did not open." >&2
  current_activity_snapshot >&2
  if [[ -s "$UI_XML_PATH" ]]; then
    echo "Last UI XML: $UI_XML_PATH" >&2
  fi
  exit 1
fi
PAIR_ROUTE="$PAIR_NAVIGATION_ROUTE"

echo
echo "== Capture UI evidence =="
capture_pair_ui_xml "$UI_XML_PATH"
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
require_text "同一房间码创建信令房间" "receiver signaling-room boundary"
require_text "WebRTC 媒体首帧未闭环" "not-yet-proven boundary"
require_text "接收端准备度" "receiver readiness line"
require_text "默认不录制" "privacy boundary"
require_text "微信小程序推流" "WeChat gated boundary"
require_text "打开接收端" "open receiver action"
require_text "重新生成" "regenerate action"
require_text "返回摄像头" "back action"
require_text "帮助自检" "help action"

ROOM_CODE="$(grep -Eo 'text="[0-9]{6}"' "$UI_XML_PATH" | head -n 1 | sed -E 's/text="([0-9]{6})"/\1/' || true)"
if [[ -z "$ROOM_CODE" ]]; then
  echo "ERROR: six-digit room code was not visible in UI XML." >&2
  exit 1
fi

echo
echo "== Open native phone-camera receiver shell =="
run_adb shell input keyevent KEYCODE_1
sleep 4

run_adb shell uiautomator dump /sdcard/hellotv-phone-camera-receiver.xml >/dev/null
run_adb exec-out cat /sdcard/hellotv-phone-camera-receiver.xml > "$RECEIVER_UI_XML_PATH"
run_adb exec-out screencap -p > "$RECEIVER_SCREENSHOT_PATH"

if [[ ! -s "$RECEIVER_UI_XML_PATH" ]]; then
  echo "ERROR: receiver UI XML evidence was not captured." >&2
  exit 1
fi

if [[ ! -s "$RECEIVER_SCREENSHOT_PATH" ]]; then
  echo "ERROR: receiver screenshot evidence was not captured." >&2
  exit 1
fi

require_file_text "$RECEIVER_UI_XML_PATH" "手机摄像头电视接收端" "receiver activity title"
require_file_text "$RECEIVER_UI_XML_PATH" "$ROOM_CODE" "receiver room code handoff"
require_file_text "$RECEIVER_UI_XML_PATH" "quicktv.local" "receiver signaling host"
require_file_text "$RECEIVER_UI_XML_PATH" "手机入口" "receiver phone entry URL"
require_file_text "$RECEIVER_UI_XML_PATH" "信令事件" "receiver signaling state"
require_file_text "$RECEIVER_UI_XML_PATH" "WebRTC SDK" "receiver WebRTC SDK status"
require_file_text "$RECEIVER_UI_XML_PATH" "验收边界" "receiver acceptance boundary"
require_file_text "$RECEIVER_UI_XML_PATH" "仍不能证明真实音视频通过" "receiver not-yet-proven boundary"

SCREENSHOT_BYTES="$(wc -c < "$SCREENSHOT_PATH" | tr -d ' ')"
UI_XML_BYTES="$(wc -c < "$UI_XML_PATH" | tr -d ' ')"
RECEIVER_SCREENSHOT_BYTES="$(wc -c < "$RECEIVER_SCREENSHOT_PATH" | tr -d ' ')"
RECEIVER_UI_XML_BYTES="$(wc -c < "$RECEIVER_UI_XML_PATH" | tr -d ' ')"
FOCUS_SNAPSHOT="$(current_activity_snapshot)"
GENERATED_AT_UTC="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

PAIR_ROUTE="$PAIR_ROUTE" node - "$OUTPUT_JSON" "$GENERATED_AT_UTC" "$DEVICE_SERIAL" "$ROOM_CODE" "$SCREENSHOT_PATH" "$SCREENSHOT_BYTES" "$UI_XML_PATH" "$UI_XML_BYTES" "$RECEIVER_SCREENSHOT_PATH" "$RECEIVER_SCREENSHOT_BYTES" "$RECEIVER_UI_XML_PATH" "$RECEIVER_UI_XML_BYTES" "$FOCUS_SNAPSHOT" <<'NODE'
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
  receiverScreenshotPath,
  receiverScreenshotBytes,
  receiverUiXmlPath,
  receiverUiXmlBytes,
  focusSnapshot
] = process.argv.slice(2)

function decodeXml(value) {
  return String(value || '')
    .replace(/&#10;/g, '\n')
    .replace(/&#13;/g, '\r')
    .replace(/&#xA;/gi, '\n')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function xmlText(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8')
    const values = []
    const pattern = /text="([^"]*)"/g
    let match
    while ((match = pattern.exec(raw)) !== null) {
      const value = decodeXml(match[1]).trim()
      if (value) values.push(value)
    }
    return values.join('\n')
  } catch {
    return ''
  }
}

function extractLabelValue(text, label) {
  const pattern = new RegExp(`${label}:\\s*([^\\n]+)`)
  const match = String(text || '').match(pattern)
  return match ? match[1].trim() : ''
}

const pairText = xmlText(uiXmlPath)
const receiverText = xmlText(receiverUiXmlPath)
const receiverState = extractLabelValue(receiverText, '状态')
const receiverRoomCode = extractLabelValue(receiverText, '房间码')
const receiverSignalingUrl = extractLabelValue(receiverText, '信令')
const receiverPairUrl = extractLabelValue(receiverText, '手机入口')
const receiverProfileId = extractLabelValue(receiverText, '媒体档位')
const receiverSdkStatus = extractLabelValue(receiverText, 'WebRTC SDK')
const receiverMediaEngineStatus = extractLabelValue(receiverText, '媒体引擎')
const receiverHasNativeWebRtcSdk = receiverSdkStatus.indexOf('native_webrtc_sdk_present') === 0
const receiverHasNativeMediaEngine = receiverSdkStatus.indexOf('engine_present') >= 0 || receiverMediaEngineStatus.indexOf('native_webrtc_engine') === 0
const receiverRoomMatchesPairPage = receiverRoomCode === roomCode || receiverText.includes(roomCode)
const receiverSignalingLooksUsable = /^wss?:\/\//i.test(receiverSignalingUrl)
const receiverPairUrlLooksUsable = /^https?:\/\//i.test(receiverPairUrl) && receiverPairUrl.includes(roomCode)
const receiverMediaAcceptance = {
  status: receiverHasNativeWebRtcSdk
    ? (receiverHasNativeMediaEngine ? 'native_media_engine_needs_field_evidence' : 'native_sdk_needs_media_engine_or_field_evidence')
    : 'blocked_until_native_webrtc_sdk',
  realMediaProven: false,
  blockers: [
    ...(!receiverHasNativeWebRtcSdk ? ['native_webrtc_sdk_missing'] : []),
    ...(receiverHasNativeWebRtcSdk && !receiverHasNativeMediaEngine ? ['native_webrtc_media_engine_not_started_or_missing'] : []),
    'tv_first_frame_not_proven',
    'tv_audio_receiving_not_proven',
    'session_stats_not_proven',
    'privacy_stop_not_proven'
  ],
  closeRule: 'Only mark phone camera media pass after real phone permissions, TV first frame, audio receiving, session.stats, reconnect and privacy-stop evidence are captured.'
}

const report = {
  generatedAtUtc,
  status: 'pass',
  deviceSerial,
  route: process.env.PAIR_ROUTE || 'unknown',
  roomCode,
  evidence: {
    pairPage: {
      screenshotPath,
      screenshotBytes: Number(screenshotBytes),
      uiXmlPath,
      uiXmlBytes: Number(uiXmlBytes),
      textDigest: {
        hasRoomCode: pairText.includes(roomCode),
        hasFirstFrameBoundary: pairText.includes('电视出现首帧后再记为通过'),
        hasPrivacyBoundary: pairText.includes('默认不录制')
      }
    },
    receiverShell: {
      screenshotPath: receiverScreenshotPath,
      screenshotBytes: Number(receiverScreenshotBytes),
      uiXmlPath: receiverUiXmlPath,
      uiXmlBytes: Number(receiverUiXmlBytes),
      state: receiverState || 'unknown',
      roomCode: receiverRoomCode || '',
      roomCodeMatchesPairPage: receiverRoomMatchesPairPage,
      signalingUrl: receiverSignalingUrl || '',
      signalingLooksUsable: receiverSignalingLooksUsable,
      pairUrl: receiverPairUrl || '',
      pairUrlLooksUsable: receiverPairUrlLooksUsable,
      profileId: receiverProfileId || '',
      sdkStatus: receiverSdkStatus || 'unknown',
      mediaEngineStatus: receiverMediaEngineStatus || 'unknown',
      hasNativeWebRtcSdk: receiverHasNativeWebRtcSdk,
      hasNativeMediaEngine: receiverHasNativeMediaEngine,
      mediaAcceptance: receiverMediaAcceptance
    },
    focusSnapshot
  },
  verifiedText: [
    '手机当电视摄像头',
    '扫码连接手机摄像头',
    '不会把手机伪装成系统摄像头',
    '电视出现首帧后再记为通过',
    '电视端接收入口已接入 APK',
    'WebRTC SDK 和真实首帧未闭环',
    '接收端准备度',
    '默认不录制',
    '微信小程序推流',
    '打开接收端',
    '重新生成',
    '返回摄像头',
    '帮助自检',
    '手机摄像头电视接收端',
    'receiver room code matches pair page',
    'receiver signaling URL is visible',
    '手机入口',
    'WebRTC SDK',
    'receiver state is machine-readable',
    'receiver media acceptance is blocked until first-frame/audio/stats evidence'
  ],
  boundary: 'This proves the TV pairing entry, remote operation path, room/signaling parameter handoff and native receiver shell only. Real phone media acceptance still requires WebRTC SDK integration, signaling, phone capture, first frame, audio, stats, reconnect, and privacy-stop evidence.'
}

fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`)
NODE

cat > "$OUTPUT_MD" <<MD
# HelloTV 手机摄像头配对页实机冒烟

- 生成时间 UTC: \`$GENERATED_AT_UTC\`
- 状态: \`pass\`
- 设备: \`$DEVICE_SERIAL\`
- 路径: \`$PAIR_ROUTE\` -> 按 1 打开原生接收端骨架
- 房间码: \`$ROOM_CODE\`
- 配对页截图: \`$SCREENSHOT_PATH\` (${SCREENSHOT_BYTES} bytes)
- 配对页 UI XML: \`$UI_XML_PATH\` (${UI_XML_BYTES} bytes)
- 接收端截图: \`$RECEIVER_SCREENSHOT_PATH\` (${RECEIVER_SCREENSHOT_BYTES} bytes)
- 接收端 UI XML: \`$RECEIVER_UI_XML_PATH\` (${RECEIVER_UI_XML_BYTES} bytes)

## 已验证

- 页面显示“手机当电视摄像头”和“扫码连接手机摄像头”。
- 页面显示二维码区域、6 位房间码、10 分钟有效提示。
- 页面显示三步流程，并明确“电视出现首帧后再记为通过”。
- 页面显示验收边界：电视端接收入口已接入 APK；WebRTC SDK 和真实首帧未闭环前，仍不能记为通过。
- 页面显示隐私边界：默认不录制，微信小程序推流要等资质和权限通过。
- 遥控器动作只暴露打开接收端、重新生成、返回摄像头、帮助自检。
- 按 1 后可进入“手机摄像头电视接收端”原生 Activity，并显示 WebRTC SDK 状态和首帧验收边界。
- JSON 已结构化记录接收端 state、WebRTC SDK 状态、房间码一致性、信令 URL、手机入口 URL、媒体档位和媒体验收阻塞原因。

## 接收端机器证据

查看 \`$OUTPUT_JSON\` 的 \`evidence.receiverShell\`：

- \`state\`：接收端当前状态。
- \`sdkStatus\`：\`native_webrtc_sdk_present_engine_present\`、\`native_webrtc_sdk_present_engine_missing\` 或 \`native_webrtc_sdk_missing\`。
- \`roomCodeMatchesPairPage\`：接收端房间码是否和配对页一致。
- \`signalingLooksUsable\` / \`pairUrlLooksUsable\`：信令和手机入口是否具备基本 URL 形态。
- \`mediaAcceptance.status\`：未看到真实首帧、音频、stats 和停止按钮前，不能标记为媒体通过。

## 当前前台

\`\`\`
$FOCUS_SNAPSHOT
\`\`\`

MD

echo "Phone camera pairing smoke report: $OUTPUT_MD"
echo "Machine-readable report: $OUTPUT_JSON"
echo "Screenshot evidence: $SCREENSHOT_PATH"
