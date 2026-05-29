#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

source "$ROOT_DIR/scripts/android-env.sh"

REPORT_DIR="${REPORT_DIR:-$ROOT_DIR/reports}"
PACKAGE_NAME="${PACKAGE_NAME:-com.quicktvui.hellotv}"
BOX_IP="${BOX_IP:-192.168.10.122}"
DEVICE_SERIAL="${DEVICE_SERIAL:-}"
CAMERA_MODEL="${FIELD_CAMERA_MODEL:-Logitech C920 PRO / C920 Pro HD}"
MICROPHONE_MODEL="${FIELD_MICROPHONE_MODEL:-Logitech C920 PRO built-in microphone}"
RUN_REMOTE_SMOKE="${RUN_REMOTE_SMOKE:-true}"
STRICT="${STRICT:-false}"
INTERACTIVE="${INTERACTIVE:-auto}"

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
  adb -s "$DEVICE_SERIAL" shell dumpsys media.camera >"$RUN_DIR/media-camera.txt" 2>&1 || true
  adb -s "$DEVICE_SERIAL" shell 'ls -l /dev/video* 2>/dev/null || true; echo; ls -l /dev/snd 2>/dev/null || true' >"$RUN_DIR/dev-media.txt" 2>&1 || true
  adb -s "$DEVICE_SERIAL" shell "dumpsys usb | grep -Ei 'Device|Class|class|interface|video|camera|uvc|webcam|audio|microphone|host|accessory' | head -160" >"$RUN_DIR/usb-snapshot.txt" 2>&1 || true
else
  : >"$RUN_DIR/media-camera.txt"
  : >"$RUN_DIR/dev-media.txt"
  : >"$RUN_DIR/usb-snapshot.txt"
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

field_notes="C920 PRO 到货接入验收；remote_smoke_exit=$remote_smoke_status，camera_smoke_exit=$camera_smoke_status，CameraService Number of camera devices=${camera_count:-unknown}，normal=${normal_camera_count:-unknown}。日志目录：$RUN_DIR。真实画面、音频输入和 USB 热插拔按本次 FIELD_* 结果判定；unknown 不可关闭。"

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

node - "$LATEST_JSON" "$LATEST_MD" "$RUN_DIR" "$STAMP" "$BOX_IP" "$DEVICE_SERIAL" "$CAMERA_MODEL" "$camera_smoke_status" "$remote_smoke_status" "${camera_count:-unknown}" "${normal_camera_count:-unknown}" "$camera_preview_result" "$audio_input_result" "$usb_hotplug_result" <<'NODE'
const fs = require('fs')
const [
  latestJsonPath,
  latestMarkdownPath,
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

const fieldRecord = readJson('reports/tv-box-field-record-latest.json')
const summary = readJson('reports/tv-box-compatibility-summary-latest.json')
const audit = readJson('reports/tv-box-completion-audit-latest.json')
const pass = cameraSmokeStatus === '0' && cameraPreviewResult === 'pass'
const nextActions = []
if (cameraSmokeStatus !== '0') {
  nextActions.push('摄像头冒烟未通过：先确认 C920 PRO 插紧；仍失败时改用带独立供电 USB Hub，重启盒子后重跑本命令。')
}
if (cameraCount === '0' || cameraCount === 'unknown' || cameraPreviewResult !== 'pass') {
  nextActions.push('Camera2 预览还未闭环：只有电视上看到 C920 PRO 真实画面后，才能把 FIELD_CAMERA_PREVIEW 记为 pass。')
}
if (audioInputResult === 'unknown') {
  nextActions.push('C920 PRO 自带麦克风未闭环：需要在摄像头页维护码/录音链路确认音频输入；不稳定时改用独立 USB 会议麦克风。')
}
if (usbHotplugResult === 'unknown') {
  nextActions.push('USB 热插拔未闭环：拔插 C920 PRO 后再跑一次验收，确认不会掉线或卡死。')
}
if (!nextActions.length) {
  nextActions.push('C920 PRO 组合可进入更完整现场验收：直播播放、播放暂停键、退出确认、遥控器练习页和维护码照片。')
}

const report = {
  generatedAtUtc: new Date().toISOString(),
  stamp,
  runDir,
  boxIp,
  deviceSerial,
  cameraModel,
  remoteSmokeExitCode: Number(remoteSmokeStatus),
  cameraSmokeExitCode: Number(cameraSmokeStatus),
  cameraService: {
    cameraCount,
    normalCameraCount
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
  nextActions
}

fs.writeFileSync(latestJsonPath, `${JSON.stringify(report, null, 2)}\n`)

const markdown = `# Logitech C920 PRO 到货接入验收

- 生成时间 UTC: \`${report.generatedAtUtc}\`
- 盒子 IP: \`${boxIp || '未填写'}\`
- 设备序列号: \`${deviceSerial || '未选择'}\`
- 摄像头: \`${cameraModel}\`
- remote smoke exit: \`${remoteSmokeStatus}\`
- camera smoke exit: \`${cameraSmokeStatus}\`
- CameraService cameraCount: \`${cameraCount}\`
- CameraService normalCameraCount: \`${normalCameraCount}\`
- 摄像头真实画面: \`${cameraPreviewResult}\`
- 音频输入: \`${audioInputResult}\`
- USB 热插拔: \`${usbHotplugResult}\`
- 最新兼容性记录: \`${report.fieldResults.latestRecordId || 'unknown'}\`
- 最新记录结论: \`${report.fieldResults.latestVerdict}\`
- 当前状态: \`${report.status}\`
- 日志目录: \`${runDir}\`

## 下一步

${nextActions.map((item) => `- ${item}`).join('\n')}

## 相关文件

- \`reports/tv-box-field-record-latest.md\`
- \`reports/tv-box-compatibility-summary-latest.md\`
- \`reports/tv-box-hardware-profile-latest.md\`
- \`reports/tv-box-completion-audit-latest.md\`
- \`reports/tv-box-command-center-latest.md\`
`

fs.writeFileSync(latestMarkdownPath, markdown)
NODE

popd >/dev/null

echo
echo "C920 PRO acceptance report: $LATEST_MD"
echo "Machine-readable report: $LATEST_JSON"
echo "Logs: $RUN_DIR"

if [[ "$camera_smoke_status" -ne 0 ]]; then
  echo "WARN: C920 camera smoke did not pass."
  if is_truthy "$STRICT"; then
    exit "$camera_smoke_status"
  fi
fi
