#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPORT_DIR="${REPORT_DIR:-$ROOT_DIR/reports}"
STAMP="$(date -u '+%Y%m%dT%H%M%SZ')"
REMOTE_SMOKE_ROOT="${REMOTE_SMOKE_ROOT:-$REPORT_DIR/tv-box-remote-smoke}"
REMOTE_SMOKE_DIR="${REMOTE_SMOKE_DIR:-$REMOTE_SMOKE_ROOT/$STAMP}"
REMOTE_SMOKE_JSON="${TV_BOX_REMOTE_SMOKE_JSON:-$REPORT_DIR/tv-box-remote-smoke-latest.json}"
REMOTE_SMOKE_MD="${TV_BOX_REMOTE_SMOKE_MD:-$REPORT_DIR/tv-box-remote-smoke-latest.md}"
REMOTE_SMOKE_SCREENSHOT="${TV_BOX_REMOTE_SMOKE_SCREENSHOT:-$REPORT_DIR/tv-box-remote-smoke-latest.png}"
ADB_DEVICES_PATH="$REMOTE_SMOKE_DIR/adb-devices.txt"
DEVICE_FACTS_PATH="$REMOTE_SMOKE_DIR/device-facts.txt"
APP_FACTS_PATH="$REMOTE_SMOKE_DIR/app-facts.txt"
USB_SNAPSHOT_PATH="$REMOTE_SMOKE_DIR/usb-snapshot.txt"
CURRENT_FOCUS_PATH="$REMOTE_SMOKE_DIR/current-focus.txt"
RESUMED_ACTIVITY_PATH="$REMOTE_SMOKE_DIR/resumed-activity.txt"
LOG_SNAPSHOT_PATH="$REMOTE_SMOKE_DIR/logcat-filtered.txt"
SCREENSHOT_PATH="$REMOTE_SMOKE_DIR/screenshot.png"
STEPS_PATH="$REMOTE_SMOKE_DIR/steps.tsv"
KEY_EVENTS_PATH="$REMOTE_SMOKE_DIR/key-events.tsv"
SMOKE_FAILURE_REASON=""
CURRENT_SCENARIO="setup"
REPORT_WRITTEN=0

PACKAGE_NAME="${PACKAGE_NAME:-com.quicktvui.hellotv}"
MAIN_ACTIVITY="${MAIN_ACTIVITY:-com.quicktvui.hellotv/.MainActivity}"
BOX_IP="${BOX_IP:-}"
DEVICE_SERIAL="${DEVICE_SERIAL:-}"
LOG_SECONDS="${LOG_SECONDS:-8}"
BOX_TARGET=""

adb_cmd=(adb)

mkdir -p "$REMOTE_SMOKE_DIR" "$REPORT_DIR"
: > "$STEPS_PATH"
: > "$KEY_EVENTS_PATH"

record_step() {
  local status="$1"
  local scenario="$2"
  local detail="$3"
  printf '%s\t%s\t%s\t%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$status" "$scenario" "$detail" >> "$STEPS_PATH"
}

start_scenario() {
  CURRENT_SCENARIO="$1"
  record_step "start" "$1" "$2"
}

finish_scenario() {
  record_step "pass" "$1" "$2"
}

send_key() {
  local key_code="$1"
  local label="${2:-KEYCODE_$1}"
  printf '%s\t%s\t%s\t%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$CURRENT_SCENARIO" "$key_code" "$label" >> "$KEY_EVENTS_PATH"
  run_adb shell input keyevent "$key_code"
}

capture_device_evidence() {
  set +e
  if [[ -n "$DEVICE_SERIAL" ]] && command -v adb >/dev/null 2>&1; then
    {
      echo "Device: $DEVICE_SERIAL"
      echo "Model:"
      run_adb shell getprop ro.product.model | tr -d '\r'
      echo "Android SDK:"
      run_adb shell getprop ro.build.version.sdk | tr -d '\r'
      echo
      echo "TV/camera/audio features:"
      run_adb shell pm list features | tr -d '\r' | grep -E 'leanback|camera|microphone|audio|television|usb.host' || true
    } > "$DEVICE_FACTS_PATH" 2>&1

    {
      echo "Package path:"
      run_adb shell pm path "$PACKAGE_NAME" | tr -d '\r' || true
      echo
      echo "Package media/TV declarations:"
      run_adb shell dumpsys package "$PACKAGE_NAME" | tr -d '\r' | grep -E 'android.permission.CAMERA|android.permission.RECORD_AUDIO|android.hardware.camera|android.hardware.microphone|android.hardware.usb.host|android.software.leanback' || true
      echo
      echo "Camera appops:"
      run_adb shell appops get "$PACKAGE_NAME" CAMERA 2>/dev/null | tr -d '\r' || true
      echo
      echo "Record audio appops:"
      run_adb shell appops get "$PACKAGE_NAME" RECORD_AUDIO 2>/dev/null | tr -d '\r' || true
    } > "$APP_FACTS_PATH" 2>&1

    run_adb shell dumpsys usb 2>/dev/null | tr -d '\r' | grep -Ei 'Device|Class|class|interface|video|camera|uvc|webcam|audio|microphone|host|accessory' | head -180 > "$USB_SNAPSHOT_PATH" || true
    run_adb shell dumpsys window windows 2>/dev/null | tr -d '\r' | grep -E 'mCurrentFocus|mFocusedApp|mFocusedWindow' | head -60 > "$CURRENT_FOCUS_PATH" || true
    run_adb shell dumpsys activity activities 2>/dev/null | tr -d '\r' | grep -E 'mResumedActivity|ResumedActivity|topResumedActivity' | head -60 > "$RESUMED_ACTIVITY_PATH" || true
    run_adb exec-out screencap -p > "$SCREENSHOT_PATH" 2>/dev/null || true
    if [[ -s "$SCREENSHOT_PATH" ]]; then
      cp "$SCREENSHOT_PATH" "$REMOTE_SMOKE_SCREENSHOT"
    else
      rm -f "$SCREENSHOT_PATH" "$REMOTE_SMOKE_SCREENSHOT"
    fi
  fi
}

write_report() {
  local exit_code="$1"
  if [[ "$REPORT_WRITTEN" -eq 1 ]]; then
    return
  fi
  REPORT_WRITTEN=1
  set +e
  capture_device_evidence

  GENERATED_AT_UTC="$(date -u '+%Y-%m-%dT%H:%M:%SZ')" \
  SMOKE_EXIT_CODE="$exit_code" \
  SMOKE_FAILURE_REASON="$SMOKE_FAILURE_REASON" \
  ROOT_DIR="$ROOT_DIR" \
  REPORT_DIR="$REPORT_DIR" \
  REMOTE_SMOKE_DIR="$REMOTE_SMOKE_DIR" \
  REMOTE_SMOKE_JSON="$REMOTE_SMOKE_JSON" \
  REMOTE_SMOKE_MD="$REMOTE_SMOKE_MD" \
  REMOTE_SMOKE_SCREENSHOT="$REMOTE_SMOKE_SCREENSHOT" \
  PACKAGE_NAME="$PACKAGE_NAME" \
  MAIN_ACTIVITY="$MAIN_ACTIVITY" \
  BOX_IP="$BOX_IP" \
  DEVICE_SERIAL="$DEVICE_SERIAL" \
  ADB_DEVICES_PATH="$ADB_DEVICES_PATH" \
  DEVICE_FACTS_PATH="$DEVICE_FACTS_PATH" \
  APP_FACTS_PATH="$APP_FACTS_PATH" \
  USB_SNAPSHOT_PATH="$USB_SNAPSHOT_PATH" \
  CURRENT_FOCUS_PATH="$CURRENT_FOCUS_PATH" \
  RESUMED_ACTIVITY_PATH="$RESUMED_ACTIVITY_PATH" \
  LOG_SNAPSHOT_PATH="$LOG_SNAPSHOT_PATH" \
  SCREENSHOT_PATH="$SCREENSHOT_PATH" \
  STEPS_PATH="$STEPS_PATH" \
  KEY_EVENTS_PATH="$KEY_EVENTS_PATH" \
  node <<'NODE'
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

function env(name, fallback = '') {
  const value = process.env[name]
  return value === undefined ? fallback : value
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8')
  } catch {
    return ''
  }
}

function readTsv(filePath, columns) {
  return readText(filePath)
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const cells = line.split('\t')
      return Object.fromEntries(columns.map((column, index) => [column, cells[index] || '']))
    })
}

function fileState(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return {
      path: filePath || '',
      exists: false,
      sizeBytes: 0,
      sha256: ''
    }
  }

  const bytes = fs.readFileSync(filePath)
  return {
    path: filePath,
    exists: true,
    sizeBytes: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex')
  }
}

function linePreview(filePath, maxLines = 30) {
  return readText(filePath).split(/\r?\n/).filter(Boolean).slice(0, maxLines)
}

const exitCode = Number(env('SMOKE_EXIT_CODE', '1'))
const status = exitCode === 0 ? 'pass' : 'fail'
const failureReason = env('SMOKE_FAILURE_REASON') || (exitCode === 0 ? '' : 'tv-box:smoke exited before completing all ADB keyevent scenarios')
const logText = readText(env('LOG_SNAPSHOT_PATH'))
const crashPatterns = /E AndroidRuntime|FATAL EXCEPTION|reportException|render view exception|Uncaught/
const crashDetected = crashPatterns.test(logText)
const steps = readTsv(env('STEPS_PATH'), ['timestampUtc', 'status', 'scenario', 'detail'])
const keyEvents = readTsv(env('KEY_EVENTS_PATH'), ['timestampUtc', 'scenario', 'keyCode', 'label'])
const scenarios = [
  {
    id: 'live_help_menu_home',
    name: '直播页帮助、菜单和返回首页路径',
    expectedKeys: ['0', 'BACK', 'MENU', 'BACK', 'OK', '0', 'BACK', 'OK', 'RIGHT', 'BACK', 'BACK']
  },
  {
    id: 'search_history_rescue',
    name: '搜索/历史页帮助救援和简易首页返回路径',
    expectedKeys: ['2', '0', 'BACK', '3', 'MENU', 'BACK']
  },
  {
    id: 'classic_home_rescue',
    name: '全部内容误入后的 0/6 帮助救援和返回路径',
    expectedKeys: ['5', '0', 'BACK', '5', '6', 'BACK', '5', 'BACK']
  },
  {
    id: 'camera_setup_navigation',
    name: '摄像头设置页帮助、焦点移动和返回路径',
    expectedKeys: ['DOWN', 'OK', 'MENU', 'BACK', 'DOWN', 'OK', 'RIGHT', 'DOWN', 'UP', 'LEFT', 'BACK']
  }
]

function buildArtifacts() {
  return {
    markdown: fileState(env('REMOTE_SMOKE_MD')),
    json: fileState(env('REMOTE_SMOKE_JSON')),
    screenshotLatest: fileState(env('REMOTE_SMOKE_SCREENSHOT')),
    screenshotRun: fileState(env('SCREENSHOT_PATH')),
    adbDevices: fileState(env('ADB_DEVICES_PATH')),
    deviceFacts: fileState(env('DEVICE_FACTS_PATH')),
    appFacts: fileState(env('APP_FACTS_PATH')),
    usbSnapshot: fileState(env('USB_SNAPSHOT_PATH')),
    currentFocus: fileState(env('CURRENT_FOCUS_PATH')),
    resumedActivity: fileState(env('RESUMED_ACTIVITY_PATH')),
    filteredLogcat: fileState(env('LOG_SNAPSHOT_PATH')),
    steps: fileState(env('STEPS_PATH')),
    keyEvents: fileState(env('KEY_EVENTS_PATH'))
  }
}

let artifacts = buildArtifacts()
const report = {
  generatedAtUtc: env('GENERATED_AT_UTC'),
  projectRoot: env('ROOT_DIR'),
  reportDir: env('REPORT_DIR'),
  runDir: env('REMOTE_SMOKE_DIR'),
  status,
  exitCode,
  failureReason,
  packageName: env('PACKAGE_NAME'),
  mainActivity: env('MAIN_ACTIVITY'),
  boxIp: env('BOX_IP'),
  deviceSerial: env('DEVICE_SERIAL'),
  boundary: {
    type: 'adb_keyevent_remote_smoke_only',
    proves: [
      'ADB can connect to the selected TV box',
      'the installed app launches',
      'the scripted remote key paths ran without captured Android/JS fatal logs when status is pass'
    ],
    doesNotProve: [
      'physical remote-control hand feel or family usability',
      'real Logitech C920 PRO video preview',
      'real Logitech C920 PRO microphone input',
      'USB hotplug recovery after unplug/replug'
    ],
    replacesRealRemoteAcceptance: false,
    replacesC920Acceptance: false
  },
  crashCheck: {
    crashDetected,
    filteredLineCount: logText.split(/\r?\n/).filter(Boolean).length,
    patterns: ['E AndroidRuntime', 'FATAL EXCEPTION', 'reportException', 'render view exception', 'Uncaught']
  },
  scenarios,
  steps,
  keyEvents,
  evidencePreview: {
    currentFocus: linePreview(env('CURRENT_FOCUS_PATH'), 10),
    resumedActivity: linePreview(env('RESUMED_ACTIVITY_PATH'), 10),
    usbSnapshot: linePreview(env('USB_SNAPSHOT_PATH'), 16),
    filteredLogcat: linePreview(env('LOG_SNAPSHOT_PATH'), 25)
  },
  artifacts
}

fs.mkdirSync(path.dirname(env('REMOTE_SMOKE_JSON')), { recursive: true })

function artifactRow(label, artifact, note = '') {
  const state = artifact.exists ? '已生成' : '缺失'
  const size = artifact.exists ? `${artifact.sizeBytes} bytes` : ''
  return `| ${label} | ${state} | \`${artifact.path || '未生成'}\` | ${size} | ${note} |`
}

function renderMarkdown(report, artifacts) {
  return `# HelloTV ADB 遥控器冒烟证据报告

- 生成时间 UTC: \`${report.generatedAtUtc}\`
- 状态: \`${report.status}\`
- 退出码: \`${report.exitCode}\`
- 失败原因: ${report.failureReason || '无'}
- 包名: \`${report.packageName}\`
- Activity: \`${report.mainActivity}\`
- BOX_IP: \`${report.boxIp || '未提供'}\`
- DEVICE_SERIAL: \`${report.deviceSerial || '未选择'}\`

## 证据边界

这份报告只证明 ADB keyevent 自动冒烟路径。它可以帮助我们远程发现崩溃、权限异常、焦点丢失和返回路径问题，但不能替代真实遥控器手感验收，也不能替代 C920 PRO 的真实画面、麦克风和热插拔验收。

## 冒烟路径

${report.scenarios.map((scenario) => `- \`${scenario.id}\`: ${scenario.name}；按键序列 ${scenario.expectedKeys.join(' -> ')}`).join('\n')}

## 崩溃检查

- 捕获到 fatal/JS 运行时异常: \`${report.crashCheck.crashDetected ? 'yes' : 'no'}\`
- 过滤日志行数: \`${report.crashCheck.filteredLineCount}\`

## 当前 Activity / 焦点摘要

${report.evidencePreview.currentFocus.length ? report.evidencePreview.currentFocus.map((line) => `- ${line}`).join('\n') : '- 未捕获当前焦点'}

## USB / 摄像头 / 麦克风摘要

${report.evidencePreview.usbSnapshot.length ? report.evidencePreview.usbSnapshot.map((line) => `- ${line}`).join('\n') : '- 未捕获 USB 线索；如果 C920 已插入，需要明天现场复测。'}

## 自动生成物

| 文件 | 状态 | 路径 | 大小 | 作用 |
| --- | --- | --- | --- | --- |
${[
  artifactRow('Markdown 报告', artifacts.markdown, '给人阅读'),
  artifactRow('JSON 报告', artifacts.json, '机器可读状态'),
  artifactRow('最新截图', artifacts.screenshotLatest, '远程确认当前画面'),
  artifactRow('本次截图', artifacts.screenshotRun, '本次运行原始截图'),
  artifactRow('ADB 设备列表', artifacts.adbDevices, '证明连接状态'),
  artifactRow('设备事实', artifacts.deviceFacts, '型号、SDK、feature'),
  artifactRow('App/权限事实', artifacts.appFacts, '包、Camera/Record audio appops'),
  artifactRow('USB 快照', artifacts.usbSnapshot, 'USB video/audio 线索'),
  artifactRow('当前焦点', artifacts.currentFocus, '焦点和窗口线索'),
  artifactRow('当前 Activity', artifacts.resumedActivity, '前台 Activity 线索'),
  artifactRow('过滤日志', artifacts.filteredLogcat, '崩溃/权限/渲染线索'),
  artifactRow('步骤日志', artifacts.steps, '场景开始/完成记录'),
  artifactRow('按键日志', artifacts.keyEvents, '实际 keyevent 序列')
].join('\n')}

## 下一步

- C920 PRO 到货并接上 USB 后，先运行 \`BOX_IP=<盒子IP> npm run tv-box:smoke\` 保存远程截图、焦点和 USB 证据。
- 再运行 \`BOX_IP=<盒子IP> npm run tv-box:c920-arrived\` 做真实摄像头、麦克风、热插拔验收。
- 最终关闭前仍需要现场确认真实遥控器操作、C920 真实画面、麦克风输入和拔插恢复。
`
}

fs.writeFileSync(env('REMOTE_SMOKE_JSON'), `${JSON.stringify(report, null, 2)}\n`)
fs.writeFileSync(env('REMOTE_SMOKE_MD'), renderMarkdown(report, artifacts))
artifacts = buildArtifacts()
report.artifacts = artifacts
fs.writeFileSync(env('REMOTE_SMOKE_JSON'), `${JSON.stringify(report, null, 2)}\n`)
fs.writeFileSync(env('REMOTE_SMOKE_MD'), renderMarkdown(report, artifacts))
NODE

  echo
  echo "Remote smoke evidence report:"
  echo "$REMOTE_SMOKE_MD"
  echo "$REMOTE_SMOKE_JSON"
}

finalize_on_exit() {
  local exit_code=$?
  write_report "$exit_code"
  exit "$exit_code"
}

trap finalize_on_exit EXIT

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
  adb devices -l | tee "$ADB_DEVICES_PATH"

  local devices
  devices="$(adb devices | awk 'NR > 1 && $2 == "device" { print $1 }')"
  local device_count
  device_count="$(printf '%s\n' "$devices" | sed '/^$/d' | wc -l | tr -d ' ')"

  if [[ "$device_count" -eq 0 ]]; then
    SMOKE_FAILURE_REASON="No authorized Android TV/box device found"
    echo "ERROR: No authorized Android TV/box device found. Run: adb connect <box-ip>:5555" >&2
    if adb devices | awk 'NR > 1 && ($2 == "unauthorized" || $2 == "offline") { found = 1 } END { exit found ? 0 : 1 }'; then
      echo "A device is visible but not ready. Confirm the RSA authorization dialog on the TV box, or reconnect network debugging." >&2
    fi
    exit 1
  fi

  if [[ -z "$DEVICE_SERIAL" && -n "$BOX_TARGET" ]] && printf '%s\n' "$devices" | grep -Fxq "$BOX_TARGET"; then
    DEVICE_SERIAL="$BOX_TARGET"
  elif [[ -z "$DEVICE_SERIAL" && -n "$BOX_TARGET" ]]; then
    SMOKE_FAILURE_REASON="Target TV box is not authorized or online: $BOX_TARGET"
    echo "ERROR: Target TV box is not authorized or online: $BOX_TARGET" >&2
    adb devices -l >&2
    exit 1
  fi

  if [[ -z "$DEVICE_SERIAL" ]]; then
    if [[ "$device_count" -gt 1 ]]; then
      SMOKE_FAILURE_REASON="Multiple Android devices are connected; DEVICE_SERIAL or BOX_IP is required"
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
  SMOKE_FAILURE_REASON="adb is not installed or not in PATH"
  echo "ERROR: adb is not installed or not in PATH." >&2
  exit 1
fi

record_step "start" "setup" "selecting ADB device"
select_device
finish_scenario "setup" "ADB device selected"

echo
echo "== Device facts =="
echo "Device: $DEVICE_SERIAL"
{
  echo "Device: $DEVICE_SERIAL"
  run_adb shell getprop ro.product.model | tr -d '\r'
  run_adb shell getprop ro.build.version.sdk | tr -d '\r'
  run_adb shell pm list features | tr -d '\r' | grep -E 'leanback|camera|microphone|audio|television|usb.host' || true
} | tee "$DEVICE_FACTS_PATH"

echo
echo "== App install check =="
if ! run_adb shell pm path "$PACKAGE_NAME" >/dev/null; then
  SMOKE_FAILURE_REASON="$PACKAGE_NAME is not installed"
  echo "ERROR: $PACKAGE_NAME is not installed. Build and install the APK first." >&2
  exit 1
fi
run_adb shell dumpsys package "$PACKAGE_NAME" | tr -d '\r' | grep -E 'android.permission.CAMERA|android.permission.RECORD_AUDIO|android.hardware.camera|android.hardware.microphone|android.hardware.usb.host|android.software.leanback' | tee "$APP_FACTS_PATH" || true

echo
echo "== Launch app =="
run_adb logcat -c
run_adb shell am force-stop "$PACKAGE_NAME"
run_adb shell am start -n "$MAIN_ACTIVITY"
sleep 3

echo
echo "== Remote control walk-through =="
echo "Pressing 0, BACK, MENU, BACK, OK, 0, BACK, OK, RIGHT, BACK, BACK to cover help, live rescue, live menu, and home return paths."
start_scenario "live_help_menu_home" "Pressing 0, BACK, MENU, BACK, OK, 0, BACK, OK, RIGHT, BACK, BACK to cover help, live rescue, live menu, and home return paths."
send_key 7 "0"
sleep 1
send_key 4 "BACK"
sleep 1
send_key 82 "MENU"
sleep 1
send_key 4 "BACK"
sleep 1
send_key 23 "OK"
sleep 2
send_key 7 "0"
sleep 1
send_key 4 "BACK"
sleep 1
send_key 23 "OK"
sleep 2
send_key 22 "RIGHT"
sleep 1
send_key 4 "BACK"
sleep 1
send_key 4 "BACK"
sleep 1
finish_scenario "live_help_menu_home" "completed live help/menu/home key path"

echo
echo "== Search and history rescue walk-through =="
echo "Pressing 2, 0, BACK, 3, MENU, BACK to cover search/history help rescue and simple-home return paths."
run_adb shell am force-stop "$PACKAGE_NAME"
run_adb shell am start -n "$MAIN_ACTIVITY" >/dev/null
sleep 3
start_scenario "search_history_rescue" "Pressing 2, 0, BACK, 3, MENU, BACK to cover search/history help rescue and simple-home return paths."
send_key 9 "2"
sleep 2
send_key 7 "0"
sleep 1
send_key 4 "BACK"
sleep 1
send_key 10 "3"
sleep 2
send_key 82 "MENU"
sleep 1
send_key 4 "BACK"
sleep 1
finish_scenario "search_history_rescue" "completed search/history rescue key path"

echo
echo "== Classic home rescue walk-through =="
echo "Pressing 5, 0, BACK, 5, 6, BACK, 5, BACK to cover accidental all-content entry, 0/6 help rescue, and simple-home return."
run_adb shell am force-stop "$PACKAGE_NAME"
run_adb shell am start -n "$MAIN_ACTIVITY" >/dev/null
sleep 3
start_scenario "classic_home_rescue" "Pressing 5, 0, BACK, 5, 6, BACK, 5, BACK to cover accidental all-content entry, 0/6 help rescue, and simple-home return."
send_key 12 "5"
sleep 2
send_key 7 "0"
sleep 1
send_key 4 "BACK"
sleep 1
send_key 12 "5"
sleep 2
send_key 13 "6"
sleep 1
send_key 4 "BACK"
sleep 1
send_key 12 "5"
sleep 2
send_key 4 "BACK"
sleep 1
finish_scenario "classic_home_rescue" "completed classic home rescue key path"

echo
echo "== Camera setup walk-through =="
echo "Pressing DOWN, OK, MENU, BACK, DOWN, OK, RIGHT, DOWN, UP, LEFT, BACK to cover home/camera/help return paths without opening permission dialogs."
run_adb shell am force-stop "$PACKAGE_NAME"
run_adb shell am start -n "$MAIN_ACTIVITY" >/dev/null
sleep 3
start_scenario "camera_setup_navigation" "Pressing DOWN, OK, MENU, BACK, DOWN, OK, RIGHT, DOWN, UP, LEFT, BACK to cover home/camera/help return paths without opening permission dialogs."
send_key 20 "DOWN"
sleep 1
send_key 23 "OK"
sleep 2
send_key 82 "MENU"
sleep 1
send_key 4 "BACK"
sleep 1
send_key 20 "DOWN"
sleep 1
send_key 23 "OK"
sleep 2
send_key 22 "RIGHT"
sleep 1
send_key 20 "DOWN"
sleep 1
send_key 19 "UP"
sleep 1
send_key 21 "LEFT"
sleep 1
send_key 4 "BACK"
sleep 1
finish_scenario "camera_setup_navigation" "completed camera setup navigation key path"

echo
echo "== Recent app log snapshot =="
sleep "$LOG_SECONDS"
LOG_SNAPSHOT="$(run_adb logcat -d -t 500 | tr -d '\r' | grep -E 'HelloTV|TvBoxModule|Hippy|tdf|reportException|render view exception|Uncaught|AndroidRuntime|FATAL EXCEPTION|Permission|ActivityNotFound' || true)"
if [[ -n "$LOG_SNAPSHOT" ]]; then
  printf '%s\n' "$LOG_SNAPSHOT" | tee "$LOG_SNAPSHOT_PATH"
else
  echo "No matching app, permission, or crash log lines were captured." | tee "$LOG_SNAPSHOT_PATH"
fi

if printf '%s\n' "$LOG_SNAPSHOT" | grep -E 'E AndroidRuntime|FATAL EXCEPTION|reportException|render view exception|Uncaught' >/dev/null; then
  SMOKE_FAILURE_REASON="Android or JS runtime failure was captured during the TV-box smoke walk-through"
  echo "ERROR: Android or JS runtime failure was captured during the TV-box smoke walk-through." >&2
  exit 1
fi

echo
echo "Smoke test finished. Continue manual camera permission and playback checks on the TV."
