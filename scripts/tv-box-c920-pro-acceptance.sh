#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

source "$ROOT_DIR/scripts/android-env.sh"

if [[ -n "${TV_BOX_TOOL_PATH:-}" ]]; then
  export PATH="$TV_BOX_TOOL_PATH:$PATH"
fi

REPORT_DIR="${REPORT_DIR:-$ROOT_DIR/reports}"
PACKAGE_NAME="${PACKAGE_NAME:-com.quicktvui.hellotv}"
BOX_IP="${BOX_IP:-192.168.10.122}"
DEVICE_SERIAL="${DEVICE_SERIAL:-}"
CAMERA_MODEL="${FIELD_CAMERA_MODEL:-Logitech C920 PRO / C920 Pro HD}"
MICROPHONE_MODEL="${FIELD_MICROPHONE_MODEL:-Logitech C920 PRO built-in microphone}"
C920_PHYSICAL_STATUS="${C920_PHYSICAL_STATUS:-unknown}"
C920_PURCHASE_CHANNEL="${C920_PURCHASE_CHANNEL:-}"
C920_EXPECTED_ARRIVAL_DATE="${C920_EXPECTED_ARRIVAL_DATE:-}"
C920_PURCHASE_NOTE="${C920_PURCHASE_NOTE:-}"
RUN_REMOTE_SMOKE="${RUN_REMOTE_SMOKE:-true}"
STRICT="${STRICT:-false}"
INTERACTIVE="${INTERACTIVE:-auto}"

export REPORT_DIR C920_PHYSICAL_STATUS C920_PURCHASE_CHANNEL C920_EXPECTED_ARRIVAL_DATE C920_PURCHASE_NOTE

mkdir -p "$REPORT_DIR/tv-box-c920-pro-acceptance"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RUN_DIR="$REPORT_DIR/tv-box-c920-pro-acceptance/$STAMP"
LATEST_JSON="$REPORT_DIR/tv-box-c920-pro-acceptance-latest.json"
LATEST_MD="$REPORT_DIR/tv-box-c920-pro-acceptance-latest.md"
mkdir -p "$RUN_DIR"

if [[ -z "$DEVICE_SERIAL" && -n "$BOX_IP" ]]; then
  if [[ "$BOX_IP" == *":"* ]]; then
    DEVICE_SERIAL="$BOX_IP"
  else
    DEVICE_SERIAL="${BOX_IP}:5555"
  fi
fi

is_truthy() {
  case "$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')" in
    true|1|yes|y|pass|ok) return 0 ;;
    *) return 1 ;;
  esac
}

can_prompt() {
  if [[ "$INTERACTIVE" == "false" ]]; then
    return 1
  fi
  if [[ "$INTERACTIVE" == "true" ]]; then
    return 0
  fi
  [[ -t 0 && -t 1 ]]
}

normalize_result() {
  local value
  value="$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]' | xargs)"
  case "$value" in
    y|yes|p|pass|ok|true|1|通过) printf 'pass' ;;
    n|no|f|fail|failed|false|0|失败) printf 'fail' ;;
    s|skip|跳过) printf 'skip' ;;
    na|n/a|none|not_applicable|not-applicable|不适用) printf 'na' ;;
    *) printf 'unknown' ;;
  esac
}

prompt_result() {
  local var_name="$1"
  local label="$2"
  local fallback="${3:-unknown}"
  local existing="${!var_name:-}"

  if [[ -n "$existing" ]]; then
    normalize_result "$existing"
    return
  fi

  if can_prompt; then
    local answer
    printf '%s [y=通过 / n=失败 / na=不适用 / 回车=unknown]: ' "$label" >&2
    read -r answer || answer=""
    if [[ -n "$answer" ]]; then
      normalize_result "$answer"
      return
    fi
  fi

  normalize_result "$fallback"
}

run_capture() {
  local label="$1"
  local log_path="$2"
  shift 2

  echo
  echo "== $label =="
  set +e
  "$@" >"$log_path" 2>&1
  local status=$?
  set -e
  if [[ "$status" -eq 0 ]]; then
    echo "OK: $label"
  else
    echo "WARN: $label failed with exit code $status"
    echo "Log: $log_path"
  fi
  return "$status"
}

json_eval() {
  local expression="$1"
  node -e "const fs=require('fs'); const p='$REPORT_DIR/tv-box-inspection-latest.json'; const j=fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf8')):{}; ${expression}" 2>/dev/null || true
}

echo "== Logitech C920 PRO TV-box acceptance =="
echo "Box IP: $BOX_IP"
echo "Device serial: ${DEVICE_SERIAL:-auto}"
echo "Camera: $CAMERA_MODEL"
echo "Physical status: $C920_PHYSICAL_STATUS"
if [[ -n "$C920_PURCHASE_CHANNEL" || -n "$C920_EXPECTED_ARRIVAL_DATE" ]]; then
  echo "Purchase: ${C920_PURCHASE_CHANNEL:-unknown}; expected arrival: ${C920_EXPECTED_ARRIVAL_DATE:-unknown}"
fi
echo
echo "接线建议：先让 C920 PRO 直接接小米盒子 USB 口；如果 CameraService 仍是 0 或反复掉线，再改成 C920 PRO -> 带独立供电 USB Hub -> 小米盒子。"
echo "注意：脚本能证明 Activity、权限、日志和系统枚举；真实画面和麦克风效果仍需要你看电视屏幕后确认。"

pushd "$ROOT_DIR" >/dev/null

run_capture "Inspect before C920 smoke" "$RUN_DIR/inspect-before.log" \
  env BOX_IP="$BOX_IP" DEVICE_SERIAL="$DEVICE_SERIAL" PACKAGE_NAME="$PACKAGE_NAME" npm run -s tv-box:inspect || true

remote_smoke_status=0
if is_truthy "$RUN_REMOTE_SMOKE"; then
  run_capture "Remote smoke before C920 smoke" "$RUN_DIR/remote-smoke.log" \
    env DEVICE_SERIAL="$DEVICE_SERIAL" PACKAGE_NAME="$PACKAGE_NAME" npm run -s tv-box:smoke || remote_smoke_status=$?
else
  remote_smoke_status=99
fi

camera_smoke_status=0
run_capture "C920 camera smoke" "$RUN_DIR/camera-smoke.log" \
  env BOX_IP="$BOX_IP" DEVICE_SERIAL="$DEVICE_SERIAL" PACKAGE_NAME="$PACKAGE_NAME" npm run -s tv-box:camera-smoke || camera_smoke_status=$?

run_capture "Inspect after C920 smoke" "$RUN_DIR/inspect-after.log" \
  env BOX_IP="$BOX_IP" DEVICE_SERIAL="$DEVICE_SERIAL" PACKAGE_NAME="$PACKAGE_NAME" npm run -s tv-box:inspect || true

if command -v adb >/dev/null 2>&1 && [[ -n "$DEVICE_SERIAL" ]]; then
  adb devices -l >"$RUN_DIR/adb-devices.txt" 2>&1 || true
  adb -s "$DEVICE_SERIAL" shell dumpsys media.camera >"$RUN_DIR/media-camera.txt" 2>&1 || true
  adb -s "$DEVICE_SERIAL" shell 'ls -l /dev/video* 2>/dev/null || true; echo; ls -l /dev/snd 2>/dev/null || true' >"$RUN_DIR/dev-media.txt" 2>&1 || true
  adb -s "$DEVICE_SERIAL" shell dumpsys usb >"$RUN_DIR/usb-raw.txt" 2>&1 || true
  adb -s "$DEVICE_SERIAL" shell "dumpsys usb | grep -Ei 'Device|Class|class|interface|video|camera|uvc|webcam|audio|microphone|host|accessory' | head -160" >"$RUN_DIR/usb-snapshot.txt" 2>&1 || true
  adb -s "$DEVICE_SERIAL" shell "dumpsys audio | grep -Ei 'input|microphone|mic|usb|device|record|capture|source' | head -180" >"$RUN_DIR/audio-snapshot.txt" 2>&1 || true
else
  : >"$RUN_DIR/adb-devices.txt"
  : >"$RUN_DIR/media-camera.txt"
  : >"$RUN_DIR/dev-media.txt"
  : >"$RUN_DIR/usb-raw.txt"
  : >"$RUN_DIR/usb-snapshot.txt"
  : >"$RUN_DIR/audio-snapshot.txt"
fi

camera_count="$(sed -n 's/.*Number of camera devices: *//p' "$RUN_DIR/media-camera.txt" | sed -n '1p' | xargs || true)"
normal_camera_count="$(sed -n 's/.*Number of normal camera devices: *//p' "$RUN_DIR/media-camera.txt" | sed -n '1p' | xargs || true)"
device_model="$(json_eval "console.log(j.deviceEvidence?.model || '')")"
android_sdk="$(json_eval "console.log(j.deviceEvidence?.androidSdk || '')")"
camera_permission_auto="$(json_eval "const d=j.deviceEvidence||{}; const text=[...(d.cameraPermissionContext||[]),...(d.cameraAppOpsLines||[])].join('\\n'); console.log(/granted=true|CAMERA: allow/.test(text)?'pass':'unknown')")"
record_audio_permission_auto="$(json_eval "const d=j.deviceEvidence||{}; const text=[...(d.recordAudioPermissionContext||[]),...(d.recordAudioAppOpsLines||[])].join('\\n'); console.log(/granted=true|RECORD_AUDIO: allow/.test(text)?'pass':'unknown')")"

if [[ "$camera_smoke_status" -ne 0 ]]; then
  camera_preview_default="fail"
else
  camera_preview_default="unknown"
fi

camera_preview_result="$(prompt_result FIELD_CAMERA_PREVIEW "电视上刚才是否看到 C920 PRO 的真实预览画面" "$camera_preview_default")"
audio_input_result="$(prompt_result FIELD_AUDIO_INPUT "C920 PRO 自带麦克风/音频输入是否被识别或已验证可录音" "unknown")"
usb_hotplug_result="$(prompt_result FIELD_USB_HOTPLUG "拔插一次 C920 PRO 后是否仍能识别并预览" "unknown")"
support_code_result="$(prompt_result FIELD_SUPPORT_CODE "摄像头页或帮助页维护码是否可读、可拍照回传" "unknown")"

camera_permission_result="${FIELD_CAMERA_PERMISSION:-$camera_permission_auto}"
record_audio_permission_result="${FIELD_RECORD_AUDIO_PERMISSION:-$record_audio_permission_auto}"

if [[ "$camera_smoke_status" -ne 0 && -z "${FIELD_CAMERA_PERMISSION:-}" ]]; then
  camera_permission_result="$(normalize_result "$camera_permission_result")"
fi

if [[ "$remote_smoke_status" -eq 0 ]]; then
  FIELD_NUMERIC_SHORTCUTS_VALUE="${FIELD_NUMERIC_SHORTCUTS:-pass}"
  FIELD_ZERO_KEY_HELP_VALUE="${FIELD_ZERO_KEY_HELP:-pass}"
  FIELD_HELP_KEY_SHORTCUTS_VALUE="${FIELD_HELP_KEY_SHORTCUTS:-pass}"
  FIELD_CLASSIC_HOME_RESCUE_VALUE="${FIELD_CLASSIC_HOME_RESCUE:-pass}"
  FIELD_SEARCH_RESCUE_VALUE="${FIELD_SEARCH_RESCUE:-pass}"
  FIELD_HISTORY_RESCUE_VALUE="${FIELD_HISTORY_RESCUE:-pass}"
else
  FIELD_NUMERIC_SHORTCUTS_VALUE="${FIELD_NUMERIC_SHORTCUTS:-unknown}"
  FIELD_ZERO_KEY_HELP_VALUE="${FIELD_ZERO_KEY_HELP:-unknown}"
  FIELD_HELP_KEY_SHORTCUTS_VALUE="${FIELD_HELP_KEY_SHORTCUTS:-unknown}"
  FIELD_CLASSIC_HOME_RESCUE_VALUE="${FIELD_CLASSIC_HOME_RESCUE:-unknown}"
  FIELD_SEARCH_RESCUE_VALUE="${FIELD_SEARCH_RESCUE:-unknown}"
  FIELD_HISTORY_RESCUE_VALUE="${FIELD_HISTORY_RESCUE:-unknown}"
fi

field_notes="C920 PRO 到货接入验收；purchase=${C920_PURCHASE_CHANNEL:-unknown}，expected_arrival=${C920_EXPECTED_ARRIVAL_DATE:-unknown}，remote_smoke_exit=${remote_smoke_status}，camera_smoke_exit=${camera_smoke_status}，CameraService Number of camera devices=${camera_count:-unknown}，normal=${normal_camera_count:-unknown}。日志目录：${RUN_DIR}。真实画面、音频输入和 USB 热插拔按本次 FIELD_* 结果判定；unknown 不可关闭。"

run_capture "Write C920 field record" "$RUN_DIR/field-record.log" \
  env \
    BOX_IP="$BOX_IP" \
    DEVICE_SERIAL="$DEVICE_SERIAL" \
    PACKAGE_NAME="$PACKAGE_NAME" \
    FIELD_APPEND_MATRIX="${FIELD_APPEND_MATRIX:-true}" \
    FIELD_OPERATOR="${FIELD_OPERATOR:-Codex}" \
    FIELD_LOCATION="${FIELD_LOCATION:-C920 PRO 到货验收}" \
    FIELD_BOX_BRAND="${FIELD_BOX_BRAND:-小米}" \
    FIELD_BOX_MODEL="${FIELD_BOX_MODEL:-${device_model:-MiTV-AZFP0 / 小米盒子4S Pro}}" \
    FIELD_ANDROID_SDK="${FIELD_ANDROID_SDK:-$android_sdk}" \
    FIELD_REMOTE_MODEL="${FIELD_REMOTE_MODEL:-小米盒子原装遥控器/ADB keyevent smoke}" \
    FIELD_CAMERA_MODEL="$CAMERA_MODEL" \
    FIELD_CAMERA_CONNECTION="${FIELD_CAMERA_CONNECTION:-usb}" \
    FIELD_MICROPHONE_MODEL="$MICROPHONE_MODEL" \
    FIELD_MICROPHONE_CONNECTION="${FIELD_MICROPHONE_CONNECTION:-usb}" \
    FIELD_REMOTE_FOCUS="${FIELD_REMOTE_FOCUS:-unknown}" \
    FIELD_NUMERIC_SHORTCUTS="$FIELD_NUMERIC_SHORTCUTS_VALUE" \
    FIELD_ZERO_KEY_HELP="$FIELD_ZERO_KEY_HELP_VALUE" \
    FIELD_HELP_KEY_SHORTCUTS="$FIELD_HELP_KEY_SHORTCUTS_VALUE" \
    FIELD_REMOTE_PRACTICE="${FIELD_REMOTE_PRACTICE:-unknown}" \
    FIELD_EXIT_CONFIRM="${FIELD_EXIT_CONFIRM:-unknown}" \
    FIELD_LIVE_PLAYBACK="${FIELD_LIVE_PLAYBACK:-unknown}" \
    FIELD_LIVE_NUMERIC_CHANNELS="${FIELD_LIVE_NUMERIC_CHANNELS:-unknown}" \
    FIELD_LIVE_MEDIA_KEYS="${FIELD_LIVE_MEDIA_KEYS:-unknown}" \
    FIELD_LIVE_FAVORITES="${FIELD_LIVE_FAVORITES:-unknown}" \
    FIELD_CLASSIC_HOME_RESCUE="$FIELD_CLASSIC_HOME_RESCUE_VALUE" \
    FIELD_SEARCH_RESCUE="$FIELD_SEARCH_RESCUE_VALUE" \
    FIELD_HISTORY_RESCUE="$FIELD_HISTORY_RESCUE_VALUE" \
    FIELD_CAMERA_PERMISSION="$(normalize_result "$camera_permission_result")" \
    FIELD_CAMERA_PREVIEW="$camera_preview_result" \
    FIELD_AUDIO_INPUT="$audio_input_result" \
    FIELD_RECORD_AUDIO_PERMISSION="$(normalize_result "$record_audio_permission_result")" \
    FIELD_USB_HOTPLUG="$usb_hotplug_result" \
    FIELD_SUPPORT_CODE="$support_code_result" \
    FIELD_NOTES="${FIELD_NOTES:-$field_notes}" \
    npm run -s tv-box:field-record || true

run_capture "Refresh compatibility summary" "$RUN_DIR/compatibility-summary.log" npm run -s tv-box:compatibility-summary || true
run_capture "Refresh hardware profile" "$RUN_DIR/hardware-profile.log" npm run -s tv-box:hardware-profile || true
run_capture "Refresh completion audit" "$RUN_DIR/completion-audit.log" npm run -s tv-box:completion-audit || true
run_capture "Refresh command center" "$RUN_DIR/command-center.log" npm run -s tv-box:command-center || true
run_capture "Refresh release ledger" "$RUN_DIR/release-ledger.log" npm run -s tv-box:release-ledger || true

node - "$LATEST_JSON" "$LATEST_MD" "$REPORT_DIR" "$RUN_DIR" "$STAMP" "$BOX_IP" "$DEVICE_SERIAL" "$CAMERA_MODEL" "$camera_smoke_status" "$remote_smoke_status" "${camera_count:-unknown}" "${normal_camera_count:-unknown}" "$camera_preview_result" "$audio_input_result" "$usb_hotplug_result" <<'NODE'
const fs = require('fs')
const path = require('path')
const [
  latestJsonPath,
  latestMarkdownPath,
  reportDir,
  runDir,
  stamp,
  boxIp,
  deviceSerial,
  cameraModel,
  cameraSmokeStatus,
  remoteSmokeStatus,
  cameraCount,
  normalCameraCount,
  cameraPreviewResult,
  audioInputResult,
  usbHotplugResult
] = process.argv.slice(2)

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

function readText(fileName) {
  try {
    return fs.readFileSync(path.join(runDir, fileName), 'utf8')
  } catch {
    return ''
  }
}

function textLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function unique(items) {
  return [...new Set(items)]
}

function firstPresent(...values) {
  return values.map((value) => String(value || '').trim()).find(Boolean) || ''
}

function ensureUsbDevice(devices, currentRef) {
  if (!currentRef.current) {
    currentRef.current = {
      address: '',
      vendorId: '',
      productId: '',
      deviceClass: null,
      deviceSubclass: null,
      manufacturerName: '',
      productName: '',
      serialNumber: '',
      interfaceClasses: [],
      interfaceNames: []
    }
    devices.push(currentRef.current)
  }
  return currentRef.current
}

function parseUsbDeviceInventory(rawText) {
  const devices = []
  const currentRef = { current: null }
  let inInterfaces = false

  for (const line of textLines(rawText)) {
    let match = line.match(/^name=(\/dev\/bus\/usb\/\S+)/)
    if (match) {
      currentRef.current = null
      const device = ensureUsbDevice(devices, currentRef)
      device.address = match[1]
      inInterfaces = false
      continue
    }

    match = line.match(/^device_address=(\/dev\/bus\/usb\/\S+)/)
    if (match) {
      const device = ensureUsbDevice(devices, currentRef)
      device.address = device.address || match[1]
      continue
    }

    if (/^interfaces=\[/.test(line)) {
      inInterfaces = true
      continue
    }

    match = line.match(/^vendor_id=(\d+)/)
    if (match) {
      ensureUsbDevice(devices, currentRef).vendorId = match[1]
      continue
    }

    match = line.match(/^product_id=(\d+)/)
    if (match) {
      ensureUsbDevice(devices, currentRef).productId = match[1]
      continue
    }

    match = line.match(/^manufacturer_name=(.*)/i) || line.match(/^Manufacturer:\s*(.*)/i)
    if (match) {
      ensureUsbDevice(devices, currentRef).manufacturerName = firstPresent(match[1])
      continue
    }

    match = line.match(/^product_name=(.*)/i) || line.match(/^Product:\s*(.*)/i)
    if (match) {
      ensureUsbDevice(devices, currentRef).productName = firstPresent(match[1])
      continue
    }

    match = line.match(/^serial_number=(.*)/i)
    if (match) {
      ensureUsbDevice(devices, currentRef).serialNumber = firstPresent(match[1])
      continue
    }

    match = line.match(/^class=(\d+)/)
    if (match) {
      const device = ensureUsbDevice(devices, currentRef)
      const value = Number(match[1])
      if (inInterfaces || device.deviceClass !== null) {
        device.interfaceClasses.push(value)
      } else {
        device.deviceClass = value
      }
      continue
    }

    match = line.match(/^subclass=(\d+)/)
    if (match) {
      const device = ensureUsbDevice(devices, currentRef)
      if (!inInterfaces && device.deviceSubclass === null) device.deviceSubclass = Number(match[1])
      continue
    }

    match = line.match(/^name=(?!\/dev\/bus\/usb\/)(.*)/)
    if (match && inInterfaces) {
      const name = firstPresent(match[1])
      if (name) ensureUsbDevice(devices, currentRef).interfaceNames.push(name)
    }
  }

  return devices
    .filter((device) => firstPresent(device.address, device.vendorId, device.productId, device.manufacturerName, device.productName, device.serialNumber, device.interfaceNames.join(' ')))
    .map((device) => ({
      ...device,
      interfaceClasses: unique(device.interfaceClasses).sort((a, b) => a - b),
      interfaceNames: unique(device.interfaceNames)
    }))
}

function usbDeviceDisplayName(device) {
  return firstPresent(
    [device.manufacturerName, device.productName].filter(Boolean).join(' '),
    device.productName,
    device.manufacturerName,
    device.address,
    [device.vendorId && `vendor=${device.vendorId}`, device.productId && `product=${device.productId}`].filter(Boolean).join(' ')
  )
}

function summarizeUsbDevice(device) {
  const classes = []
  const allClasses = [device.deviceClass, ...device.interfaceClasses].filter((value) => Number.isFinite(value))
  if (allClasses.includes(14)) classes.push('USB Video/UVC')
  if (allClasses.includes(1)) classes.push('USB Audio')
  if (allClasses.includes(224)) classes.push('Wireless/Bluetooth')
  if (allClasses.includes(239)) classes.push('Misc/composite')
  if (allClasses.length) classes.push(`class=${unique(allClasses).join('/')}`)
  const ids = [device.vendorId && `vendor=${device.vendorId}`, device.productId && `product=${device.productId}`].filter(Boolean).join(' ')
  return [usbDeviceDisplayName(device), ids, classes.join(', ')].filter(Boolean).join(' / ')
}

function buildUsbInventorySummary(devices) {
  const names = devices.map(usbDeviceDisplayName).filter(Boolean)
  const text = devices.map((device) => [
    device.manufacturerName,
    device.productName,
    device.vendorId,
    device.productId,
    device.interfaceNames.join(' '),
    device.interfaceClasses.join(' ')
  ].join(' ')).join('\n')
  const logitechC920Detected = /logitech|c920|quickcam/i.test(text) || /\b1133\b/.test(text)
  const usbVideoDeviceDetected = devices.some((device) => device.deviceClass === 14 || device.interfaceClasses.includes(14) || /uvc|webcam|camera|video/i.test([device.productName, ...device.interfaceNames].join(' ')))
  const usbAudioDeviceDetected = devices.some((device) => device.deviceClass === 1 || device.interfaceClasses.includes(1) || /audio|microphone|mic/i.test([device.productName, ...device.interfaceNames].join(' ')))
  const realtekDetected = /realtek|802\.11ac|wireless|bluetooth/i.test(text)
  const realtekOnly = devices.length > 0 && realtekDetected && !logitechC920Detected && !usbVideoDeviceDetected

  let summary = 'USB host 当前未列出外设。'
  if (logitechC920Detected) {
    summary = `USB host 已看到 Logitech/C920 线索：${names.join('；') || '已检测到 Logitech/C920'}。`
  } else if (realtekOnly) {
    summary = `当前 USB host 只看到 ${names.join('；') || 'Realtek/无线网卡类设备'}，未看到 Logitech/C920 或 USB Video Class 设备。`
  } else if (devices.length > 0) {
    summary = `当前 USB host 看到：${names.join('；')}；未看到 Logitech/C920${usbVideoDeviceDetected ? '，但有 USB Video Class 线索' : ' 或 USB Video Class 设备'}。`
  }

  return {
    visibleDeviceCount: devices.length,
    deviceSummaries: devices.map(summarizeUsbDevice),
    summary,
    logitechC920Detected,
    usbVideoDeviceDetected,
    usbAudioDeviceDetected,
    realtekDetected,
    realtekOnly
  }
}

function numberFromCapabilities(line, name) {
  const match = String(line || '').match(new RegExp(`${name}=(-?\\d+)`))
  return match ? Number(match[1]) : null
}

function envTruthy(name) {
  return /^(1|true|yes|y|force)$/i.test(process.env[name] || '')
}

function toNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function normalizePhysicalStatus(value) {
  const normalized = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  if ([
    'purchased',
    'ordered',
    'paid',
    'purchased_pending_arrival',
    'not_arrived',
    'pending_arrival',
    '已购买',
    '已采购',
    '已下单',
    '已付款',
    '未到货',
    '待到货',
    '已购买待到货',
    '已采购待到货'
  ].includes(normalized)) {
    return 'purchased_pending_arrival'
  }
  if ([
    'not_inserted',
    'unplugged',
    'baseline',
    'not_connected',
    'arrived',
    'arrived_not_inserted',
    'delivered_not_inserted',
    '到货',
    '已到货',
    '未插入',
    '未接入',
    '没插',
    '没有插',
    '到货未插',
    '到货未插入',
    '已到货未插',
    '已到货未插入'
  ].includes(normalized)) {
    return 'not_inserted'
  }
  if ([
    'inserted',
    'plugged',
    'connected',
    'arrived_inserted',
    'delivered_inserted',
    '已插入',
    '已接入',
    '已连接',
    '插入',
    '接入',
    '连接',
    '插上',
    '插上了',
    '到货已插',
    '到货已插入',
    '已到货已插入'
  ].includes(normalized)) {
    return 'inserted'
  }
  return 'unknown'
}

function physicalStatusLabel(value) {
  if (value === 'purchased_pending_arrival') return '已采购，待到货/接入'
  if (value === 'not_inserted') return '已到手或待测，但当前未插入'
  if (value === 'inserted') return '已插入 C920，按识别结果排障'
  return '未确认是否已插入'
}

const fieldRecord = readJson(path.join(reportDir, 'tv-box-field-record-latest.json'))
const summary = readJson(path.join(reportDir, 'tv-box-compatibility-summary-latest.json'))
const audit = readJson(path.join(reportDir, 'tv-box-completion-audit-latest.json'))
const adbDevicesText = readText('adb-devices.txt')
const devMediaText = readText('dev-media.txt')
const usbRawText = readText('usb-raw.txt')
const usbSnapshotText = readText('usb-snapshot.txt')
const audioSnapshotText = readText('audio-snapshot.txt')
const cameraSmokeLogText = readText('camera-smoke.log')
const adbDeviceLines = textLines(adbDevicesText).filter((line) => !/^List of devices attached/i.test(line))
const offlineAdbDevices = adbDeviceLines
  .filter((line) => /\boffline\b|\bunauthorized\b/i.test(line))
  .map((line) => line.split(/\s+/)[0])
const videoNodes = unique(textLines(devMediaText)
  .filter((line) => /\/dev\/video\d+/.test(line))
  .map((line) => (line.match(/\/dev\/video\d+/) || [''])[0])
  .filter(Boolean))
const sndCaptureNodes = unique(textLines(devMediaText)
  .filter((line) => /(?:\/dev\/snd\/)?pcmC\d+D\d+c\b/.test(line))
  .map((line) => {
    const value = (line.match(/(?:\/dev\/snd\/)?pcmC\d+D\d+c\b/) || [''])[0]
    return value.startsWith('/dev/snd/') ? value : `/dev/snd/${value}`
  })
  .filter(Boolean))
const usbLines = textLines(usbSnapshotText)
const usbVideoHints = unique(usbLines.filter((line) => /video|uvc|webcam|camera|\bclass=14\b/i.test(line)))
const usbAudioHints = unique([
  ...usbLines.filter((line) => /audio|microphone|\bclass=1\b/i.test(line)),
  ...textLines(audioSnapshotText).filter((line) => /usb|microphone|mic/i.test(line))
])
  .filter((line) => !/audio_accessory_connected=false|mSafeUsb|event log|dump time/i.test(line))
  .slice(0, 40)
const usbDeviceInventory = parseUsbDeviceInventory(usbRawText)
const usbInventorySummary = buildUsbInventorySummary(usbDeviceInventory)
const remoteSmokeReport = readJson(path.join(reportDir, 'tv-box-remote-smoke-latest.json'))
const capabilityLine = textLines(cameraSmokeLogText).find((line) => /capabilities cameraCount=/.test(line)) || ''
const nativeCapabilities = {
  cameraCount: numberFromCapabilities(capabilityLine, 'cameraCount'),
  externalCameraCount: numberFromCapabilities(capabilityLine, 'externalCameraCount'),
  usbDeviceCount: numberFromCapabilities(capabilityLine, 'usbDeviceCount'),
  usbVideoDeviceCount: numberFromCapabilities(capabilityLine, 'usbVideoDeviceCount'),
  audioInputDeviceCount: numberFromCapabilities(capabilityLine, 'audioInputDeviceCount'),
  usbAudioInputDeviceCount: numberFromCapabilities(capabilityLine, 'usbAudioInputDeviceCount')
}
const pass = cameraSmokeStatus === '0' && cameraPreviewResult === 'pass'
const parsedCameraCount = Number(cameraCount)
const camera2Enumerated = Number.isFinite(parsedCameraCount) && parsedCameraCount > 0
const usbVideoDetected = usbVideoHints.length > 0 || usbInventorySummary.usbVideoDeviceDetected || (nativeCapabilities.usbVideoDeviceCount || 0) > 0
const usbAudioDetected = usbAudioHints.length > 0 || usbInventorySummary.usbAudioDeviceDetected || (nativeCapabilities.usbAudioInputDeviceCount || 0) > 0
const previewActivityOpened = cameraSmokeStatus === '0'
const realPreviewConfirmed = cameraPreviewResult === 'pass'
const audioConfirmed = audioInputResult === 'pass'
const hotplugConfirmed = usbHotplugResult === 'pass'
const physicalStatus = normalizePhysicalStatus(process.env.C920_PHYSICAL_STATUS)
const procurement = {
  purchaseChannel: process.env.C920_PURCHASE_CHANNEL || '',
  expectedArrivalDate: process.env.C920_EXPECTED_ARRIVAL_DATE || '',
  note: process.env.C920_PURCHASE_NOTE || ''
}
const baselineJsonPath = path.join(reportDir, 'tv-box-c920-pro-baseline.json')
const baselineMarkdownPath = path.join(reportDir, 'tv-box-c920-pro-baseline.md')

function buildFieldDecision() {
  if (!usbVideoDetected && !camera2Enumerated) {
    return {
      level: 'waiting_for_camera_or_usb_not_detected',
      title: '未看到 C920 视频设备',
      summary: '当前更像是摄像头未接入、线材/供电/Hub 问题，或盒子 USB 层没有识别到视频设备。',
      primaryAction: '先确认 C920 已插紧且指示灯/硬件正常；直插不行就改用带独立供电 USB Hub 后重跑。'
    }
  }
  if (usbVideoDetected && !camera2Enumerated) {
    return {
      level: 'usb_seen_camera_hal_missing',
      title: 'USB 已见视频线索，但 Camera2 未枚举',
      summary: '摄像头可能已被 USB 层看到，但盒子固件或 Camera HAL 没有开放给 Android Camera2。',
      primaryAction: '优先换带独立供电 USB Hub；仍为 0 时试 C270。C270 也不通再走用户态 UVC 或手机 WebRTC 路线。'
    }
  }
  if (camera2Enumerated && !previewActivityOpened) {
    return {
      level: 'camera2_seen_preview_failed',
      title: 'Camera2 已见设备，但预览冒烟失败',
      summary: '系统能枚举摄像头，但 App 预览 Activity、权限、分辨率或 Camera2 会话可能失败。',
      primaryAction: '查看 camera-smoke.log；重启盒子后重跑，必要时降低预览规格或修 CameraPreviewActivity。'
    }
  }
  if (previewActivityOpened && !realPreviewConfirmed) {
    return {
      level: 'preview_opened_needs_visual_confirmation',
      title: '预览页能打开，等待电视画面确认',
      summary: '自动化只能证明 Activity 打开且无崩溃；还必须肉眼确认电视上是真实 C920 画面。',
      primaryAction: '看电视屏幕：有真实画面才设置 FIELD_CAMERA_PREVIEW=pass；黑屏/静态/权限弹窗都不能算通过。'
    }
  }
  if (realPreviewConfirmed && (!audioConfirmed || !hotplugConfirmed)) {
    return {
      level: 'camera_ok_audio_or_hotplug_open',
      title: '摄像头画面已确认，音频或热插拔未闭环',
      summary: 'C920 视频链路可以继续现场验收，但麦克风和拔插稳定性仍要补证据。',
      primaryAction: '确认录音/互动课音频输入，并拔插 C920 后重跑一次验收；全部通过后再关闭。'
    }
  }
  return {
    level: 'ready_for_extended_field_acceptance',
    title: 'C920 视频、音频和热插拔已闭环',
    summary: '摄像头组合已具备继续做直播、遥控器和维护码照片的完整现场验收条件。',
    primaryAction: '继续完成直播播放、播放暂停键、退出确认、遥控器练习页和维护码照片。'
  }
}

const fieldDecision = buildFieldDecision()

function fileExistsRelative(filePath) {
  if (!filePath) return ''
  return fs.existsSync(filePath) ? path.relative(reportDir, filePath) : ''
}

function buildRemoteSmokeEvidence(sourceReport, exitCode) {
  if (!sourceReport) {
    return {
      status: exitCode === '99' ? 'skipped' : 'missing',
      exitCode: Number(exitCode),
      reportPath: '',
      markdownPath: '',
      screenshotPath: '',
      runDir: '',
      deviceSerial: '',
      scenarioCount: 0,
      keyEventCount: 0,
      crashDetected: false,
      replacesRealRemoteAcceptance: false,
      replacesC920Acceptance: false,
      boundary: [
        'ADB remote smoke report was not found; run tv-box:smoke or leave RUN_REMOTE_SMOKE=true in c920-arrived.'
      ]
    }
  }

  const artifacts = sourceReport.artifacts || {}
  return {
    status: sourceReport.status || (Number(exitCode) === 0 ? 'pass' : 'unknown'),
    exitCode: sourceReport.exitCode ?? Number(exitCode),
    reportPath: fileExistsRelative(artifacts.json?.path || path.join(reportDir, 'tv-box-remote-smoke-latest.json')),
    markdownPath: fileExistsRelative(artifacts.markdown?.path || path.join(reportDir, 'tv-box-remote-smoke-latest.md')),
    screenshotPath: fileExistsRelative(artifacts.screenshotLatest?.path || path.join(reportDir, 'tv-box-remote-smoke-latest.png')),
    runDir: sourceReport.runDir || '',
    deviceSerial: sourceReport.deviceSerial || '',
    scenarioCount: Array.isArray(sourceReport.scenarios) ? sourceReport.scenarios.length : 0,
    keyEventCount: Array.isArray(sourceReport.keyEvents) ? sourceReport.keyEvents.length : 0,
    crashDetected: sourceReport.crashCheck?.crashDetected === true,
    replacesRealRemoteAcceptance: sourceReport.boundary?.replacesRealRemoteAcceptance === true,
    replacesC920Acceptance: sourceReport.boundary?.replacesC920Acceptance === true,
    boundary: [
      'Remote smoke proves only the ADB keyevent walk-through, launch/focus evidence, screenshot capture, and filtered crash-log state.',
      'Remote smoke does not replace physical remote-control hand-feel acceptance.',
      'Remote smoke does not replace C920 real preview, microphone input, or USB hotplug acceptance.'
    ]
  }
}

const remoteSmokeEvidence = buildRemoteSmokeEvidence(remoteSmokeReport, remoteSmokeStatus)

const report = {
  generatedAtUtc: new Date().toISOString(),
  stamp,
  runDir,
  boxIp,
  deviceSerial,
  cameraModel,
  physicalStatus: {
    status: physicalStatus,
    label: physicalStatusLabel(physicalStatus),
    raw: process.env.C920_PHYSICAL_STATUS || ''
  },
  procurement,
  remoteSmokeExitCode: Number(remoteSmokeStatus),
  remoteSmokeEvidence,
  cameraSmokeExitCode: Number(cameraSmokeStatus),
  cameraService: {
    cameraCount,
    normalCameraCount
  },
  fieldDecision: {
    ...fieldDecision,
    checklist: {
      usbVideoDetected,
      camera2Enumerated,
      previewActivityOpened,
      realPreviewConfirmed,
      usbAudioDetected,
      audioConfirmed,
      hotplugConfirmed
    }
  },
  hardwareEvidence: {
    adbOfflineOrUnauthorizedDevices: offlineAdbDevices,
    kernelVideoNodeCount: videoNodes.length,
    kernelVideoNodes: videoNodes,
    kernelSndCaptureNodeCount: sndCaptureNodes.length,
    kernelSndCaptureNodes: sndCaptureNodes,
    usbHostVisibleDeviceCount: usbInventorySummary.visibleDeviceCount,
    usbDeviceInventory: usbDeviceInventory.slice(0, 12),
    usbDeviceSummaries: usbInventorySummary.deviceSummaries.slice(0, 12),
    usbDeviceSummary: usbInventorySummary.summary,
    usbLogitechC920Detected: usbInventorySummary.logitechC920Detected,
    usbVideoDeviceDetected: usbInventorySummary.usbVideoDeviceDetected,
    usbAudioDeviceDetected: usbInventorySummary.usbAudioDeviceDetected,
    usbRealtekDetected: usbInventorySummary.realtekDetected,
    usbRealtekOnly: usbInventorySummary.realtekOnly,
    usbVideoHintCount: usbVideoHints.length,
    usbVideoHints: usbVideoHints.slice(0, 40),
    usbAudioHintCount: usbAudioHints.length,
    usbAudioHints,
    nativeCapabilities,
    note: 'Kernel /dev/video* 节点和 USB hints 只说明底层可能有媒体设备；Camera2/CameraService 枚举和电视真实画面才是摄像头业务通过证据。'
  },
  fieldResults: {
    cameraPreview: cameraPreviewResult,
    audioInput: audioInputResult,
    usbHotplug: usbHotplugResult,
    latestVerdict: fieldRecord?.verdict || 'unknown',
    latestRecordId: fieldRecord?.recordId || ''
  },
  compatibility: {
    totalRecords: summary?.totalRecords ?? 0,
    recommended: summary?.recommended?.length ?? 0,
    tvCoreReady: summary?.tvCoreReady?.length ?? 0,
    needsManualAcceptance: summary?.needsManualAcceptance?.length ?? 0
  },
  completionAuditNextActions: audit?.nextActions || [],
  status: pass ? 'camera_preview_confirmed' : 'needs_camera_follow_up',
  nextActions: []
}

function baselineSnapshotFromReport(sourceReport) {
  return {
    generatedAtUtc: sourceReport.generatedAtUtc,
    stamp: sourceReport.stamp,
    runDir: sourceReport.runDir,
    boxIp: sourceReport.boxIp,
    deviceSerial: sourceReport.deviceSerial,
    cameraModel: sourceReport.cameraModel,
    physicalStatus: sourceReport.physicalStatus,
    status: sourceReport.status,
    fieldDecision: sourceReport.fieldDecision,
    cameraService: sourceReport.cameraService,
    hardwareEvidence: {
      kernelVideoNodeCount: sourceReport.hardwareEvidence.kernelVideoNodeCount,
      kernelSndCaptureNodeCount: sourceReport.hardwareEvidence.kernelSndCaptureNodeCount,
      usbVideoHintCount: sourceReport.hardwareEvidence.usbVideoHintCount,
      usbAudioHintCount: sourceReport.hardwareEvidence.usbAudioHintCount,
      nativeCapabilities: sourceReport.hardwareEvidence.nativeCapabilities
    },
    note: 'C920 到货前基线；用于后续比较插入摄像头后的 USB/Camera2/Audio 变化。'
  }
}

function writeBaseline(snapshot, reason) {
  fs.writeFileSync(baselineJsonPath, `${JSON.stringify({ ...snapshot, reason }, null, 2)}\n`)
  const md = `# C920 到货前基线

- 保存时间 UTC: \`${snapshot.generatedAtUtc}\`
- 原因: \`${reason}\`
- 盒子: \`${snapshot.boxIp || snapshot.deviceSerial || 'unknown'}\`
- 物理状态: \`${snapshot.physicalStatus?.label || 'unknown'}\`
- 到货判定: \`${snapshot.fieldDecision?.level || 'unknown'}\`
- CameraService cameraCount: \`${snapshot.cameraService?.cameraCount ?? 'unknown'}\`
- USB 视频线索数: \`${snapshot.hardwareEvidence?.usbVideoHintCount ?? 'unknown'}\`
- USB 音频线索数: \`${snapshot.hardwareEvidence?.usbAudioHintCount ?? 'unknown'}\`
- App 原生能力: \`camera=${snapshot.hardwareEvidence?.nativeCapabilities?.cameraCount ?? 'unknown'} external=${snapshot.hardwareEvidence?.nativeCapabilities?.externalCameraCount ?? 'unknown'} usbVideo=${snapshot.hardwareEvidence?.nativeCapabilities?.usbVideoDeviceCount ?? 'unknown'} audioInput=${snapshot.hardwareEvidence?.nativeCapabilities?.audioInputDeviceCount ?? 'unknown'} usbAudio=${snapshot.hardwareEvidence?.nativeCapabilities?.usbAudioInputDeviceCount ?? 'unknown'}\`
- 原始日志目录: \`${snapshot.runDir}\`
`
  fs.writeFileSync(baselineMarkdownPath, md)
}

function metricSnapshot(sourceReport) {
  return {
    cameraServiceCameraCount: toNumber(sourceReport.cameraService?.cameraCount),
    cameraServiceNormalCameraCount: toNumber(sourceReport.cameraService?.normalCameraCount),
    usbVideoHintCount: toNumber(sourceReport.hardwareEvidence?.usbVideoHintCount),
    usbAudioHintCount: toNumber(sourceReport.hardwareEvidence?.usbAudioHintCount),
    kernelVideoNodeCount: toNumber(sourceReport.hardwareEvidence?.kernelVideoNodeCount),
    kernelSndCaptureNodeCount: toNumber(sourceReport.hardwareEvidence?.kernelSndCaptureNodeCount),
    nativeCameraCount: toNumber(sourceReport.hardwareEvidence?.nativeCapabilities?.cameraCount),
    nativeExternalCameraCount: toNumber(sourceReport.hardwareEvidence?.nativeCapabilities?.externalCameraCount),
    nativeUsbDeviceCount: toNumber(sourceReport.hardwareEvidence?.nativeCapabilities?.usbDeviceCount),
    nativeUsbVideoDeviceCount: toNumber(sourceReport.hardwareEvidence?.nativeCapabilities?.usbVideoDeviceCount),
    nativeAudioInputDeviceCount: toNumber(sourceReport.hardwareEvidence?.nativeCapabilities?.audioInputDeviceCount),
    nativeUsbAudioInputDeviceCount: toNumber(sourceReport.hardwareEvidence?.nativeCapabilities?.usbAudioInputDeviceCount)
  }
}

function buildBaselineComparison(sourceReport) {
  const currentMetrics = metricSnapshot(sourceReport)
  const baselineEligible = sourceReport.fieldDecision?.level === 'waiting_for_camera_or_usb_not_detected'
  const baselineExists = fs.existsSync(baselineJsonPath)
  const captureRequested = envTruthy('C920_BASELINE_CAPTURE')
  const forceCapture = /^force$/i.test(process.env.C920_BASELINE_CAPTURE || '')

  if ((!baselineExists && baselineEligible) || (captureRequested && (baselineEligible || forceCapture))) {
    const reason = baselineExists ? 'refreshed_by_request' : 'initialized_from_no_camera_run'
    writeBaseline(baselineSnapshotFromReport(sourceReport), reason)
    return {
      status: baselineExists ? 'baseline_refreshed' : 'baseline_initialized',
      baselinePath: baselineJsonPath,
      baselineMarkdownPath,
      baselineGeneratedAtUtc: sourceReport.generatedAtUtc,
      currentMetrics,
      deltas: {},
      signals: {
        usbVideoIncreased: false,
        camera2Increased: false,
        usbAudioIncreased: false,
        audioInputChanged: false
      },
      summary: '已保存当前无摄像头状态作为 C920 到货前基线；插上 C920 后重跑会自动比较变化。'
    }
  }

  const baseline = readJson(baselineJsonPath)
  if (!baseline) {
    return {
      status: 'baseline_missing',
      baselinePath: baselineJsonPath,
      baselineMarkdownPath,
      currentMetrics,
      deltas: {},
      signals: {
        usbVideoIncreased: false,
        camera2Increased: false,
        usbAudioIncreased: false,
        audioInputChanged: false
      },
      summary: '还没有 C920 到货前基线；在未插摄像头时运行一次本命令即可自动保存。'
    }
  }

  const baselineMetrics = metricSnapshot(baseline)
  const deltas = Object.fromEntries(Object.keys(currentMetrics).map((key) => [
    key,
    currentMetrics[key] - baselineMetrics[key]
  ]))
  const signals = {
    usbVideoIncreased: deltas.usbVideoHintCount > 0 || deltas.nativeUsbVideoDeviceCount > 0,
    camera2Increased: deltas.cameraServiceCameraCount > 0 || deltas.nativeCameraCount > 0 || deltas.nativeExternalCameraCount > 0,
    usbAudioIncreased: deltas.usbAudioHintCount > 0 || deltas.nativeUsbAudioInputDeviceCount > 0,
    audioInputChanged: deltas.nativeAudioInputDeviceCount !== 0
  }
  const signalSummary = []
  if (signals.usbVideoIncreased) signalSummary.push('相对基线新增 USB 视频线索')
  if (signals.camera2Increased) signalSummary.push('相对基线新增 Camera2 摄像头枚举')
  if (signals.usbAudioIncreased) signalSummary.push('相对基线新增 USB 音频线索')
  if (signals.audioInputChanged) signalSummary.push('相对基线音频输入数量有变化')
  if (!signalSummary.length) signalSummary.push('相对基线没有看到新增 USB 视频、Camera2 或 USB 音频变化')

  return {
    status: 'compared',
    baselinePath: baselineJsonPath,
    baselineMarkdownPath,
    baselineGeneratedAtUtc: baseline.generatedAtUtc || '',
    baselineRunDir: baseline.runDir || '',
    baselineMetrics,
    currentMetrics,
    deltas,
    signals,
    summary: signalSummary.join('；')
  }
}

report.baselineComparison = buildBaselineComparison(report)

const nextActions = []
if (offlineAdbDevices.length > 0) {
  nextActions.push(`ADB 设备列表还有离线/未授权噪声：${offlineAdbDevices.join(', ')}；现场验收前可执行 adb disconnect <序列号> 清理，避免选错设备。`)
}
if (report.baselineComparison.status === 'baseline_missing') {
  nextActions.push('建议先在未插摄像头时跑一次本命令保存 C920 到货前基线；之后插上 C920 的变化会更清楚。')
}
if (report.baselineComparison.status === 'compared') {
  nextActions.push(`基线对比：${report.baselineComparison.summary}。`)
}
if (remoteSmokeEvidence.status === 'missing' || remoteSmokeEvidence.status === 'fail' || remoteSmokeEvidence.crashDetected) {
  nextActions.push('ADB 遥控器冒烟证据未通过或缺失：先打开 tv-box-remote-smoke-latest.md/json/png，确认远程按键、当前 Activity、截图和崩溃日志，再继续 C920 实物验收。')
}
if (physicalStatus === 'inserted' && !usbInventorySummary.logitechC920Detected && usbInventorySummary.visibleDeviceCount > 0) {
  nextActions.push(usbInventorySummary.summary)
}
const noNewHardwareSignal = report.baselineComparison.status === 'compared' &&
  !report.baselineComparison.signals.usbVideoIncreased &&
  !report.baselineComparison.signals.camera2Increased &&
  !report.baselineComparison.signals.usbAudioIncreased &&
  !report.baselineComparison.signals.audioInputChanged
if (fieldDecision.level === 'waiting_for_camera_or_usb_not_detected' && physicalStatus === 'purchased_pending_arrival') {
  nextActions.push('C920 PRO 当前按已采购待到货处理；这是到货前基线，不是兼容失败。到货插入后运行 npm run tv-box:c920-arrived。')
  nextActions.push('明天接入时先直插小米盒子 USB 口；插上后如果 USB 清单仍只看到 Realtek/无线网卡类设备，再按插紧、供电 Hub、电脑复测、C270 备机顺序排障。')
} else if (fieldDecision.level === 'waiting_for_camera_or_usb_not_detected' && physicalStatus !== 'inserted' && noNewHardwareSignal) {
  nextActions.push('如果 C920 当前未插入，这是正常未插入基线，不是兼容失败。插入后重跑本命令。')
  nextActions.push('如果现场确认 C920 已经插入，再按插紧、带独立供电 USB Hub、电脑复测、C270 备机顺序排障。')
} else {
  nextActions.push(fieldDecision.primaryAction)
}
if (cameraSmokeStatus !== '0') {
  nextActions.push('摄像头冒烟未通过：先确认 C920 PRO 插紧；仍失败时改用带独立供电 USB Hub，重启盒子后重跑本命令。')
}
if (cameraCount === '0' || cameraCount === 'unknown' || cameraPreviewResult !== 'pass') {
  nextActions.push('Camera2 预览还未闭环：只有电视上看到 C920 PRO 真实画面后，才能把 FIELD_CAMERA_PREVIEW 记为 pass。')
}
if ((usbVideoHints.length > 0 || (nativeCapabilities.usbVideoDeviceCount || 0) > 0) && (cameraCount === '0' || cameraCount === 'unknown')) {
  nextActions.push('USB 层疑似看到视频设备但 CameraService 仍为 0：优先试带独立供电 USB Hub 和 C270；仍失败再评估盒子 Camera HAL 或用户态 UVC/WebRTC 路线。')
}
if (audioInputResult === 'unknown') {
  nextActions.push('C920 PRO 自带麦克风未闭环：需要在摄像头页维护码/录音链路确认音频输入；不稳定时改用独立 USB 会议麦克风。')
}
if ((nativeCapabilities.usbAudioInputDeviceCount || 0) > 0 && audioInputResult !== 'pass') {
  nextActions.push('系统/原生能力疑似看到 USB 音频输入，但业务录音未确认；请用录音或互动课链路确认后再把音频记为 pass。')
}
if (usbHotplugResult === 'unknown') {
  nextActions.push('USB 热插拔未闭环：拔插 C920 PRO 后再跑一次验收，确认不会掉线或卡死。')
}
if (!nextActions.length) {
  nextActions.push('C920 PRO 组合可进入更完整现场验收：直播播放、播放暂停键、退出确认、遥控器练习页和维护码照片。')
}
report.nextActions = nextActions

fs.writeFileSync(latestJsonPath, `${JSON.stringify(report, null, 2)}\n`)

const markdown = `# Logitech C920 PRO 到货接入验收

- 生成时间 UTC: \`${report.generatedAtUtc}\`
- 盒子 IP: \`${boxIp || '未填写'}\`
- 设备序列号: \`${deviceSerial || '未选择'}\`
- 摄像头: \`${cameraModel}\`
- 物理状态: \`${report.physicalStatus.label}\`
- remote smoke exit: \`${remoteSmokeStatus}\`
- remote smoke status: \`${remoteSmokeEvidence.status}\`
- remote smoke scenarios/keyevents: \`${remoteSmokeEvidence.scenarioCount}/${remoteSmokeEvidence.keyEventCount}\`
- remote smoke screenshot: \`${remoteSmokeEvidence.screenshotPath || '未生成'}\`
- camera smoke exit: \`${cameraSmokeStatus}\`
- CameraService cameraCount: \`${cameraCount}\`
- CameraService normalCameraCount: \`${normalCameraCount}\`
- ADB 离线/未授权噪声: \`${offlineAdbDevices.length ? offlineAdbDevices.join(', ') : '无'}\`
- USB host 可见设备数: \`${usbInventorySummary.visibleDeviceCount}\`
- USB 设备清单: \`${usbInventorySummary.summary}\`
- USB 是否看到 Logitech/C920: \`${usbInventorySummary.logitechC920Detected ? 'yes' : 'no'}\`
- Kernel /dev/video* 节点数: \`${videoNodes.length}\`
- Kernel /dev/snd 采集节点数: \`${sndCaptureNodes.length}\`
- USB 视频线索数: \`${usbVideoHints.length}\`
- USB 音频线索数: \`${usbAudioHints.length}\`
- App 原生能力: \`camera=${nativeCapabilities.cameraCount ?? 'unknown'} external=${nativeCapabilities.externalCameraCount ?? 'unknown'} usbVideo=${nativeCapabilities.usbVideoDeviceCount ?? 'unknown'} audioInput=${nativeCapabilities.audioInputDeviceCount ?? 'unknown'} usbAudio=${nativeCapabilities.usbAudioInputDeviceCount ?? 'unknown'}\`
- 摄像头真实画面: \`${cameraPreviewResult}\`
- 音频输入: \`${audioInputResult}\`
- USB 热插拔: \`${usbHotplugResult}\`
- 到货判定: \`${fieldDecision.level}\`
- 判定标题: \`${fieldDecision.title}\`
- 基线对比状态: \`${report.baselineComparison.status}\`
- 基线对比摘要: ${report.baselineComparison.summary}
- 最新兼容性记录: \`${report.fieldResults.latestRecordId || 'unknown'}\`
- 最新记录结论: \`${report.fieldResults.latestVerdict}\`
- 当前状态: \`${report.status}\`
- 日志目录: \`${runDir}\`

## 到货判定卡

- USB host 清单: ${usbInventorySummary.deviceSummaries.length ? usbInventorySummary.deviceSummaries.map((item) => `\`${item}\``).join('；') : '`未列出外设`'}
- USB 视频设备: \`${usbVideoDetected ? 'seen' : 'not_seen'}\`
- Camera2 枚举: \`${camera2Enumerated ? 'seen' : 'not_seen'}\`
- 预览 Activity: \`${previewActivityOpened ? 'opened' : 'not_opened'}\`
- 电视真实画面: \`${realPreviewConfirmed ? 'confirmed' : 'not_confirmed'}\`
- USB 音频线索: \`${usbAudioDetected ? 'seen' : 'not_seen'}\`
- 麦克风业务输入: \`${audioConfirmed ? 'confirmed' : 'not_confirmed'}\`
- USB 热插拔: \`${hotplugConfirmed ? 'confirmed' : 'not_confirmed'}\`
- 物理状态: \`${report.physicalStatus.label}\`
- 结论: ${fieldDecision.summary}
- 优先动作: ${fieldDecision.primaryAction}

## ADB 遥控器冒烟证据

- 状态: \`${remoteSmokeEvidence.status}\`
- 退出码: \`${remoteSmokeEvidence.exitCode}\`
- 设备: \`${remoteSmokeEvidence.deviceSerial || deviceSerial || 'unknown'}\`
- 场景数 / keyevent 数: \`${remoteSmokeEvidence.scenarioCount} / ${remoteSmokeEvidence.keyEventCount}\`
- 捕获 fatal/JS 运行时异常: \`${remoteSmokeEvidence.crashDetected ? 'yes' : 'no'}\`
- JSON 报告: \`${remoteSmokeEvidence.reportPath || '未生成'}\`
- Markdown 报告: \`${remoteSmokeEvidence.markdownPath || '未生成'}\`
- 截图: \`${remoteSmokeEvidence.screenshotPath || '未生成'}\`
- 边界: ADB 冒烟只证明远程 keyevent、启动/焦点、截图和崩溃日志；不能替代真实遥控器手感，也不能替代 C920 真实画面、麦克风和热插拔。

## 到货前基线对比

- 基线状态: \`${report.baselineComparison.status}\`
- 基线文件: \`${path.relative(reportDir, report.baselineComparison.baselinePath)}\`
- 基线时间 UTC: \`${report.baselineComparison.baselineGeneratedAtUtc || 'unknown'}\`
- 相对基线新增 USB 视频: \`${report.baselineComparison.signals.usbVideoIncreased ? 'yes' : 'no'}\`
- 相对基线新增 Camera2 摄像头: \`${report.baselineComparison.signals.camera2Increased ? 'yes' : 'no'}\`
- 相对基线新增 USB 音频: \`${report.baselineComparison.signals.usbAudioIncreased ? 'yes' : 'no'}\`
- 相对基线音频输入变化: \`${report.baselineComparison.signals.audioInputChanged ? 'yes' : 'no'}\`
- 对比摘要: ${report.baselineComparison.summary}

## 下一步

${nextActions.map((item) => `- ${item}`).join('\n')}

## 相关文件

- \`reports/tv-box-field-record-latest.md\`
- \`reports/tv-box-compatibility-summary-latest.md\`
- \`reports/tv-box-hardware-profile-latest.md\`
- \`reports/tv-box-completion-audit-latest.md\`
- \`reports/tv-box-command-center-latest.md\`
- \`reports/tv-box-c920-pro-baseline.md\`
- \`reports/tv-box-c920-pro-baseline.json\`
- \`reports/tv-box-remote-smoke-latest.md\`
- \`reports/tv-box-remote-smoke-latest.json\`
- \`reports/tv-box-remote-smoke-latest.png\`
- \`${path.relative(reportDir, path.join(runDir, 'adb-devices.txt'))}\`
- \`${path.relative(reportDir, path.join(runDir, 'media-camera.txt'))}\`
- \`${path.relative(reportDir, path.join(runDir, 'dev-media.txt'))}\`
- \`${path.relative(reportDir, path.join(runDir, 'usb-raw.txt'))}\`
- \`${path.relative(reportDir, path.join(runDir, 'usb-snapshot.txt'))}\`
- \`${path.relative(reportDir, path.join(runDir, 'audio-snapshot.txt'))}\`
`

fs.writeFileSync(latestMarkdownPath, markdown)
NODE

run_capture "Write C920 arrival operation card" "$RUN_DIR/arrival-card.log" \
  node scripts/tv-box-c920-arrival-card.js || true

popd >/dev/null

echo
echo "C920 PRO acceptance report: $LATEST_MD"
echo "Machine-readable report: $LATEST_JSON"
echo "C920 arrival card: $REPORT_DIR/tv-box-c920-arrival-card-latest.md"
echo "Printable C920 arrival card: $REPORT_DIR/tv-box-c920-arrival-card.html"
echo "Logs: $RUN_DIR"

if [[ "$camera_smoke_status" -ne 0 ]]; then
  echo "WARN: C920 camera smoke did not pass."
  if is_truthy "$STRICT"; then
    exit "$camera_smoke_status"
  fi
fi
