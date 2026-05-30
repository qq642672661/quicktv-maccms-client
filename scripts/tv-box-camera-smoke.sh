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
REPORT_DIR="${REPORT_DIR:-$ROOT_DIR/reports}"

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

extract_log_metric() {
  local key="$1"
  printf '%s\n' "$LOG_SNAPSHOT" \
    | sed -n "s/.*${key}=\([0-9][0-9]*\).*/\1/p" \
    | tail -n 1
}

is_positive_int() {
  [[ "$1" =~ ^[0-9]+$ ]] && [[ "$1" -gt 0 ]]
}

is_zero_int() {
  [[ "$1" =~ ^[0-9]+$ ]] && [[ "$1" -eq 0 ]]
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

mkdir -p "$REPORT_DIR"

CAMERA_SMOKE_LOG="$REPORT_DIR/tv-box-camera-smoke-latest.log"
CAMERA_SMOKE_FOCUS_DURING="$REPORT_DIR/tv-box-camera-smoke-focus-during-latest.txt"
CAMERA_SMOKE_FOCUS_AFTER="$REPORT_DIR/tv-box-camera-smoke-focus-after-latest.txt"
CAMERA_SMOKE_JSON="$REPORT_DIR/tv-box-camera-smoke-latest.json"
CAMERA_SMOKE_MD="$REPORT_DIR/tv-box-camera-smoke-latest.md"

printf '%s\n' "$LOG_SNAPSHOT" > "$CAMERA_SMOKE_LOG"
printf '%s\n' "$FOCUS_DURING_PREVIEW" > "$CAMERA_SMOKE_FOCUS_DURING"
printf '%s\n' "$FOCUS_AFTER_BACK" > "$CAMERA_SMOKE_FOCUS_AFTER"

CAMERA_COUNT="$(extract_log_metric cameraCount)"
EXTERNAL_CAMERA_COUNT="$(extract_log_metric externalCameraCount)"
USB_DEVICE_COUNT="$(extract_log_metric usbDeviceCount)"
USB_VIDEO_DEVICE_COUNT="$(extract_log_metric usbVideoDeviceCount)"
AUDIO_INPUT_DEVICE_COUNT="$(extract_log_metric audioInputDeviceCount)"
USB_AUDIO_INPUT_DEVICE_COUNT="$(extract_log_metric usbAudioInputDeviceCount)"

CAMERA_SMOKE_VERDICT="preview_activity_no_crash_unknown_camera_inventory"
CAMERA_SMOKE_SUMMARY="CameraPreviewActivity 能打开并可返回，未捕获 Android/JS 崩溃；仍需人工确认电视是否有真实画面。"
REAL_PREVIEW_PROVEN="false"
C920_ACCEPTANCE_ELIGIBLE="needs_visual_confirmation"
if printf '%s\n' "$LOG_SNAPSHOT" | grep -F '未检测到系统可用摄像头' >/dev/null \
  || { is_zero_int "$CAMERA_COUNT" && is_zero_int "${USB_VIDEO_DEVICE_COUNT:-0}"; }; then
  CAMERA_SMOKE_VERDICT="no_system_camera"
  CAMERA_SMOKE_SUMMARY="摄像头页和预览 Activity 无崩溃，但 Android CameraService 当前没有暴露可用摄像头；这不能作为 C920 通过证据。"
  C920_ACCEPTANCE_ELIGIBLE="no"
elif is_zero_int "$CAMERA_COUNT" && is_positive_int "${USB_VIDEO_DEVICE_COUNT:-0}"; then
  CAMERA_SMOKE_VERDICT="usb_video_seen_camera_hal_missing"
  CAMERA_SMOKE_SUMMARY="USB 视频硬件有线索，但 Android CameraService 未暴露摄像头；优先按盒子固件/Camera HAL 风险处理。"
  C920_ACCEPTANCE_ELIGIBLE="no"
elif is_positive_int "$CAMERA_COUNT" || is_positive_int "$EXTERNAL_CAMERA_COUNT"; then
  CAMERA_SMOKE_VERDICT="camera_hal_visible_preview_activity_no_crash"
  CAMERA_SMOKE_SUMMARY="Android CameraService 已暴露摄像头，预览 Activity 能打开并可返回；仍需要现场看见真实画面后才把 C920 预览记为 pass。"
fi

CAMERA_SMOKE_GENERATED_AT_UTC="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
export CAMERA_SMOKE_GENERATED_AT_UTC ROOT_DIR PACKAGE_NAME BOX_IP DEVICE_SERIAL CAMERA_PREVIEW_ACTIVITY
export CAMERA_SMOKE_VERDICT CAMERA_SMOKE_SUMMARY REAL_PREVIEW_PROVEN C920_ACCEPTANCE_ELIGIBLE
export CAMERA_COUNT EXTERNAL_CAMERA_COUNT USB_DEVICE_COUNT USB_VIDEO_DEVICE_COUNT AUDIO_INPUT_DEVICE_COUNT USB_AUDIO_INPUT_DEVICE_COUNT
export CAMERA_SMOKE_LOG CAMERA_SMOKE_FOCUS_DURING CAMERA_SMOKE_FOCUS_AFTER CAMERA_SMOKE_JSON CAMERA_SMOKE_MD

node <<'NODE'
const fs = require('fs')

function env(name, fallback = '') {
  const value = process.env[name]
  return value === undefined ? fallback : value
}

function maybeNumber(value) {
  return /^[0-9]+$/.test(String(value || '')) ? Number(value) : null
}

function fileState(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return { path: filePath || '', exists: false, sizeBytes: 0 }
  return { path: filePath, exists: true, sizeBytes: fs.statSync(filePath).size }
}

const report = {
  generatedAtUtc: env('CAMERA_SMOKE_GENERATED_AT_UTC'),
  projectRoot: env('ROOT_DIR'),
  packageName: env('PACKAGE_NAME'),
  boxIp: env('BOX_IP'),
  deviceSerial: env('DEVICE_SERIAL'),
  previewActivity: env('CAMERA_PREVIEW_ACTIVITY'),
  status: env('CAMERA_SMOKE_VERDICT'),
  summary: env('CAMERA_SMOKE_SUMMARY'),
  evidence: {
    previewActivityOpened: true,
    backExitedPreviewActivity: true,
    noAndroidOrJsCrashLogs: true,
    realPreviewProven: env('REAL_PREVIEW_PROVEN') === 'true',
    c920AcceptanceEligible: env('C920_ACCEPTANCE_ELIGIBLE')
  },
  inventory: {
    cameraCount: maybeNumber(env('CAMERA_COUNT')),
    externalCameraCount: maybeNumber(env('EXTERNAL_CAMERA_COUNT')),
    usbDeviceCount: maybeNumber(env('USB_DEVICE_COUNT')),
    usbVideoDeviceCount: maybeNumber(env('USB_VIDEO_DEVICE_COUNT')),
    audioInputDeviceCount: maybeNumber(env('AUDIO_INPUT_DEVICE_COUNT')),
    usbAudioInputDeviceCount: maybeNumber(env('USB_AUDIO_INPUT_DEVICE_COUNT'))
  },
  artifacts: {
    markdown: { path: env('CAMERA_SMOKE_MD'), exists: true },
    json: { path: env('CAMERA_SMOKE_JSON'), exists: true },
    log: fileState(env('CAMERA_SMOKE_LOG')),
    focusDuringPreview: fileState(env('CAMERA_SMOKE_FOCUS_DURING')),
    focusAfterBack: fileState(env('CAMERA_SMOKE_FOCUS_AFTER'))
  },
  boundary: {
    replacesRealCameraAcceptance: false,
    replacesC920Acceptance: false,
    closeProjectAllowed: false,
    note: '脚本只能证明摄像头入口和预览 Activity 不崩溃；C920 真实画面、麦克风和热插拔必须现场确认。'
  },
  nextActions: [
    env('C920_ACCEPTANCE_ELIGIBLE') === 'no'
      ? 'C920 到货并直插小米盒子 USB 后，重新执行 BOX_IP=<盒子IP> RUN_CAMERA_SMOKE=true npm run tv-box:easy。'
      : '现场看见真实摄像头画面后，再把 FIELD_CAMERA_PREVIEW 记为 pass。',
    '麦克风输入和 USB 热插拔不能由本脚本自动判定，仍需现场表单和回传证据。'
  ]
}

fs.writeFileSync(env('CAMERA_SMOKE_JSON'), `${JSON.stringify(report, null, 2)}\n`)

const markdown = `# HelloTV 摄像头冒烟报告

- 生成时间 UTC: \`${report.generatedAtUtc}\`
- 结论: \`${report.status}\`
- 摘要: ${report.summary}
- 盒子: \`${report.deviceSerial || report.boxIp || '未指定'}\`
- 包名: \`${report.packageName}\`

## 设备线索

| 项目 | 值 |
| --- | --- |
| CameraService cameraCount | \`${report.inventory.cameraCount ?? 'unknown'}\` |
| externalCameraCount | \`${report.inventory.externalCameraCount ?? 'unknown'}\` |
| usbDeviceCount | \`${report.inventory.usbDeviceCount ?? 'unknown'}\` |
| usbVideoDeviceCount | \`${report.inventory.usbVideoDeviceCount ?? 'unknown'}\` |
| audioInputDeviceCount | \`${report.inventory.audioInputDeviceCount ?? 'unknown'}\` |
| usbAudioInputDeviceCount | \`${report.inventory.usbAudioInputDeviceCount ?? 'unknown'}\` |

## 自动验证边界

- 预览 Activity 打开: \`${report.evidence.previewActivityOpened ? 'yes' : 'no'}\`
- 返回键退出预览 Activity: \`${report.evidence.backExitedPreviewActivity ? 'yes' : 'no'}\`
- Android/JS 崩溃日志: \`${report.evidence.noAndroidOrJsCrashLogs ? '未发现' : '发现'}\`
- 真实摄像头画面: \`${report.evidence.realPreviewProven ? '已证明' : '未证明'}\`
- 可否作为 C920 通过证据: \`${report.evidence.c920AcceptanceEligible}\`

## 下一步

${report.nextActions.map((action) => `- ${action}`).join('\n')}

## 证据文件

- logcat: \`${report.artifacts.log.path}\`
- 预览时焦点: \`${report.artifacts.focusDuringPreview.path}\`
- 返回后焦点: \`${report.artifacts.focusAfterBack.path}\`

`

fs.writeFileSync(env('CAMERA_SMOKE_MD'), markdown)
NODE

echo
echo "Camera smoke report:"
echo "$CAMERA_SMOKE_MD"
echo "$CAMERA_SMOKE_JSON"
echo "$CAMERA_SMOKE_SUMMARY"
echo "Boundary: this is not C920 real-preview, microphone, or hotplug acceptance."
echo "Camera smoke finished."
