#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPORT_DIR="${REPORT_DIR:-$ROOT_DIR/reports}"
PACKAGE_NAME="${PACKAGE_NAME:-com.quicktvui.hellotv}"
BOX_IP="${BOX_IP:-}"
DEVICE_SERIAL="${DEVICE_SERIAL:-}"
INSPECTION_PATH="${TV_BOX_INSPECTION_JSON:-$REPORT_DIR/tv-box-inspection-latest.json}"
FIELD_RECORD_DIR="${FIELD_RECORD_DIR:-$REPORT_DIR/tv-box-field-records}"
LATEST_JSON="$REPORT_DIR/tv-box-field-record-latest.json"
LATEST_MD="$REPORT_DIR/tv-box-field-record-latest.md"
MATRIX_CSV="$REPORT_DIR/tv-box-field-matrix.csv"

mkdir -p "$REPORT_DIR" "$FIELD_RECORD_DIR"

(cd "$ROOT_DIR" && \
  PACKAGE_NAME="$PACKAGE_NAME" \
  BOX_IP="$BOX_IP" \
  DEVICE_SERIAL="$DEVICE_SERIAL" \
  TV_BOX_INSPECTION_JSON="$INSPECTION_PATH" \
  npm run -s tv-box:inspect >/dev/null) || true

node - "$ROOT_DIR" "$REPORT_DIR" "$INSPECTION_PATH" "$FIELD_RECORD_DIR" "$LATEST_JSON" "$LATEST_MD" "$MATRIX_CSV" <<'NODE'
const fs = require('fs')
const path = require('path')

const [
  rootDir,
  reportDir,
  inspectionPath,
  recordDir,
  latestJsonPath,
  latestMarkdownPath,
  matrixCsvPath
] = process.argv.slice(2)
const { phoneCameraResultPrompts } = require(path.join(rootDir, 'scripts/tv-box-field-wizard-schema'))

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return {}
  }
}

function env(name, fallback = '') {
  const value = process.env[name]
  return value === undefined || value === '' ? fallback : value
}

function normalizeResult(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (['pass', 'passed', 'ok', 'true', 'yes', 'y'].includes(normalized)) return 'pass'
  if (['fail', 'failed', 'false', 'no', 'n'].includes(normalized)) return 'fail'
  if (['skip', 'skipped'].includes(normalized)) return 'skip'
  if (['na', 'n/a', 'not_applicable', 'not-applicable'].includes(normalized)) return 'na'
  return 'unknown'
}

function resultText(result) {
  return {
    pass: '通过',
    fail: '失败',
    skip: '跳过',
    na: '不适用',
    unknown: '未填写'
  }[result] || '未填写'
}

function csvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`
}

function compactLines(value, max = 6) {
  if (!Array.isArray(value)) return ''
  return value.slice(0, max).join(' | ')
}

function boolText(value) {
  if (value === true) return 'yes'
  if (value === false) return 'no'
  return ''
}

function deriveVerdict(checks, inspection, phoneCameraChecks) {
  if (env('FIELD_VERDICT')) return env('FIELD_VERDICT')
  const values = Object.values(checks)
  const phoneValues = Object.values(phoneCameraChecks || {})
  if (values.includes('fail')) return 'needs_fix'
  if (phoneValues.includes('fail')) return 'needs_fix'
  if ((inspection.deviceEvidence || {}).status !== 'selected') return 'needs_box'
  if (values.includes('unknown')) return 'needs_manual_acceptance'
  return 'pass'
}

const manualFieldNames = [
  'BOX_IP',
  'DEVICE_SERIAL',
  'FIELD_OPERATOR',
  'FIELD_LOCATION',
  'FIELD_BOX_BRAND',
  'FIELD_BOX_MODEL',
  'FIELD_ANDROID_SDK',
  'FIELD_REMOTE_MODEL',
  'FIELD_CAMERA_MODEL',
  'FIELD_CAMERA_CONNECTION',
  'FIELD_MICROPHONE_MODEL',
  'FIELD_MICROPHONE_CONNECTION',
  'FIELD_REMOTE_FOCUS',
  'FIELD_NUMERIC_SHORTCUTS',
  'FIELD_ZERO_KEY_HELP',
  'FIELD_HELP_KEY_SHORTCUTS',
  'FIELD_REMOTE_PRACTICE',
  'FIELD_EXIT_CONFIRM',
  'FIELD_LIVE_PLAYBACK',
  'FIELD_LIVE_NUMERIC_CHANNELS',
  'FIELD_LIVE_MEDIA_KEYS',
  'FIELD_LIVE_FAVORITES',
  'FIELD_CLASSIC_HOME_RESCUE',
  'FIELD_SEARCH_RESCUE',
  'FIELD_HISTORY_RESCUE',
  'FIELD_CAMERA_PERMISSION',
  'FIELD_CAMERA_PREVIEW',
  'FIELD_AUDIO_INPUT',
  'FIELD_RECORD_AUDIO_PERMISSION',
  'FIELD_USB_HOTPLUG',
  'FIELD_SUPPORT_CODE',
  ...phoneCameraResultPrompts.map(([name]) => name),
  'FIELD_VERDICT',
  'FIELD_NOTES'
]

function hasManualFieldInput() {
  return manualFieldNames.some((name) => Boolean(process.env[name]))
}

function shouldAppendMatrixRow(deviceEvidence) {
  const forced = String(env('FIELD_APPEND_MATRIX')).trim().toLowerCase()
  if (['true', '1', 'yes', 'y'].includes(forced)) return true
  if (['false', '0', 'no', 'n'].includes(forced)) return false
  return deviceEvidence.status === 'selected' || hasManualFieldInput()
}

const inspection = readJson(inspectionPath)
const deviceEvidence = inspection.deviceEvidence || {}
const readiness = inspection.readiness || {}
const apk = inspection.apk || {}
const generatedAtUtc = new Date().toISOString()
const recordId = generatedAtUtc.replace(/[-:.]/g, '').replace('T', 'T').replace('Z', 'Z')
const appendMatrixRow = shouldAppendMatrixRow(deviceEvidence)

const checks = {
  remoteFocus: normalizeResult(env('FIELD_REMOTE_FOCUS')),
  numericShortcuts: normalizeResult(env('FIELD_NUMERIC_SHORTCUTS')),
  zeroKeyHelp: normalizeResult(env('FIELD_ZERO_KEY_HELP')),
  helpKeyShortcuts: normalizeResult(env('FIELD_HELP_KEY_SHORTCUTS')),
  remotePractice: normalizeResult(env('FIELD_REMOTE_PRACTICE')),
  exitConfirm: normalizeResult(env('FIELD_EXIT_CONFIRM')),
  livePlayback: normalizeResult(env('FIELD_LIVE_PLAYBACK')),
  liveNumericChannels: normalizeResult(env('FIELD_LIVE_NUMERIC_CHANNELS')),
  liveMediaKeys: normalizeResult(env('FIELD_LIVE_MEDIA_KEYS')),
  liveFavorites: normalizeResult(env('FIELD_LIVE_FAVORITES')),
  classicHomeRescue: normalizeResult(env('FIELD_CLASSIC_HOME_RESCUE')),
  searchRescue: normalizeResult(env('FIELD_SEARCH_RESCUE')),
  historyRescue: normalizeResult(env('FIELD_HISTORY_RESCUE')),
  cameraPermission: normalizeResult(env('FIELD_CAMERA_PERMISSION')),
  cameraPreview: normalizeResult(env('FIELD_CAMERA_PREVIEW')),
  audioInput: normalizeResult(env('FIELD_AUDIO_INPUT')),
  recordAudioPermission: normalizeResult(env('FIELD_RECORD_AUDIO_PERMISSION')),
  usbHotplug: normalizeResult(env('FIELD_USB_HOTPLUG')),
  supportCode: normalizeResult(env('FIELD_SUPPORT_CODE'))
}

const phoneCameraChecks = {
  pairing: normalizeResult(env('FIELD_PHONE_CAMERA_PAIRING')),
  phoneCameraPermission: normalizeResult(env('FIELD_PHONE_CAMERA_PERMISSION')),
  phoneMicrophonePermission: normalizeResult(env('FIELD_PHONE_MICROPHONE_PERMISSION')),
  tvFirstFrame: normalizeResult(env('FIELD_PHONE_TV_FIRST_FRAME')),
  tvAudioReceiving: normalizeResult(env('FIELD_PHONE_TV_AUDIO')),
  sessionStats: normalizeResult(env('FIELD_PHONE_SESSION_STATS')),
  reconnect: normalizeResult(env('FIELD_PHONE_RECONNECT')),
  privacyStop: normalizeResult(env('FIELD_PHONE_PRIVACY_STOP'))
}

const record = {
  recordId,
  generatedAtUtc,
  projectRoot: rootDir,
  packageName: inspection.packageName || env('PACKAGE_NAME', 'com.quicktvui.hellotv'),
  operator: env('FIELD_OPERATOR'),
  location: env('FIELD_LOCATION'),
  box: {
    brand: env('FIELD_BOX_BRAND'),
    model: env('FIELD_BOX_MODEL', deviceEvidence.model || ''),
    androidSdk: env('FIELD_ANDROID_SDK', deviceEvidence.androidSdk || ''),
    serial: env('FIELD_DEVICE_SERIAL', deviceEvidence.selectedSerial || ''),
    ip: env('BOX_IP'),
    deviceStatus: deviceEvidence.status || '',
    appInstalled: deviceEvidence.appInstalled === true
  },
  remote: {
    model: env('FIELD_REMOTE_MODEL'),
    result: checks.remoteFocus
  },
  camera: {
    model: env('FIELD_CAMERA_MODEL'),
    connection: env('FIELD_CAMERA_CONNECTION', 'unknown'),
    permissionResult: checks.cameraPermission,
    previewResult: checks.cameraPreview,
    usbHotplugResult: checks.usbHotplug
  },
  audio: {
    microphoneModel: env('FIELD_MICROPHONE_MODEL'),
    microphoneConnection: env('FIELD_MICROPHONE_CONNECTION', 'unknown'),
    inputResult: checks.audioInput,
    recordAudioPermissionResult: checks.recordAudioPermission
  },
  phoneCamera: {
    route: 'phone_webrtc',
    pairingResult: phoneCameraChecks.pairing,
    phoneCameraPermissionResult: phoneCameraChecks.phoneCameraPermission,
    phoneMicrophonePermissionResult: phoneCameraChecks.phoneMicrophonePermission,
    tvFirstFrameResult: phoneCameraChecks.tvFirstFrame,
    tvAudioReceivingResult: phoneCameraChecks.tvAudioReceiving,
    sessionStatsResult: phoneCameraChecks.sessionStats,
    reconnectResult: phoneCameraChecks.reconnect,
    privacyStopResult: phoneCameraChecks.privacyStop,
    closeRule: '手机摄像头真实通过必须同时具备手机摄像头/麦克风权限、电视首帧、电视音频、session.stats、断线重连和停止按钮证据；unknown/na 不算通过。'
  },
  checks,
  phoneCameraChecks,
  verdict: deriveVerdict(checks, inspection, phoneCameraChecks),
  matrix: {
    csvPath: matrixCsvPath,
    appendRow: appendMatrixRow,
    appendReason: appendMatrixRow
      ? '实机已连接，或本次提供了现场/人工验收字段'
      : '未连接实机且未提供现场字段，仅生成 latest 记录，不追加累计矩阵'
  },
  notes: env('FIELD_NOTES'),
  evidence: {
    readinessLevel: readiness.level || '',
    readinessSummary: readiness.humanSummary || '',
    apkSha256: apk.sha256 || '',
    apkSizeBytes: apk.sizeBytes || 0,
    remoteSelfTestOk: Boolean((inspection.remoteSelfTest || {}).ok),
    featureLines: deviceEvidence.featureLines || [],
    usbSnapshot: deviceEvidence.usbSnapshot || [],
    cameraAppOpsLines: deviceEvidence.cameraAppOpsLines || [],
    recordAudioAppOpsLines: deviceEvidence.recordAudioAppOpsLines || [],
    currentFocusLines: deviceEvidence.currentFocusLines || [],
    resumedActivityLines: deviceEvidence.resumedActivityLines || []
  }
}

const recordJsonPath = path.join(recordDir, `${recordId}.json`)
const recordMarkdownPath = path.join(recordDir, `${recordId}.md`)
fs.writeFileSync(recordJsonPath, `${JSON.stringify(record, null, 2)}\n`)
fs.copyFileSync(recordJsonPath, latestJsonPath)

const markdown = `# HelloTV 电视盒子实机兼容性记录

- 记录 ID: \`${record.recordId}\`
- 生成时间 UTC: \`${record.generatedAtUtc}\`
- 结论: \`${record.verdict}\`
- 项目目录: \`${record.projectRoot}\`
- 包名: \`${record.packageName}\`
- APK SHA256: \`${record.evidence.apkSha256 || '未生成'}\`
- 是否追加累计 CSV: ${record.matrix.appendRow ? '是' : '否'}

## 现场信息

| 项目 | 值 |
| --- | --- |
| 安装/验收人员 | ${record.operator || '未填写'} |
| 地点 | ${record.location || '未填写'} |
| 盒子品牌 | ${record.box.brand || '未填写'} |
| 盒子型号 | ${record.box.model || '未识别'} |
| Android SDK | ${record.box.androidSdk || '未识别'} |
| 盒子 IP | ${record.box.ip || '未提供'} |
| 设备序列号 | ${record.box.serial || '未选择'} |
| ADB 状态 | ${record.box.deviceStatus || '未知'} |
| App 已安装 | ${boolText(record.box.appInstalled) || '未知'} |
| 遥控器型号 | ${record.remote.model || '未填写'} |
| 摄像头型号 | ${record.camera.model || '未填写'} |
| 摄像头连接方式 | ${record.camera.connection || '未填写'} |
| 麦克风型号 | ${record.audio.microphoneModel || '未填写'} |
| 麦克风连接方式 | ${record.audio.microphoneConnection || '未填写'} |

## 人工验收结果

| 项目 | 结果 |
| --- | --- |
| 遥控器焦点移动 | ${resultText(record.checks.remoteFocus)} |
| 数字键 1-6 直达 | ${resultText(record.checks.numericShortcuts)} |
| 0 键帮助/自检 | ${resultText(record.checks.zeroKeyHelp)} |
| 菜单/信息/帮助键自检 | ${resultText(record.checks.helpKeyShortcuts)} |
| 遥控器练习页 | ${resultText(record.checks.remotePractice)} |
| 首页退出确认 | ${resultText(record.checks.exitConfirm)} |
| 直播播放和换台 | ${resultText(record.checks.livePlayback)} |
| 直播页数字键 1-9 换台 | ${resultText(record.checks.liveNumericChannels)} |
| 直播页播放/暂停物理键 | ${resultText(record.checks.liveMediaKeys)} |
| 直播收藏/只看收藏 | ${resultText(record.checks.liveFavorites)} |
| 全部内容页帮助/返回救援 | ${resultText(record.checks.classicHomeRescue)} |
| 搜索页帮助/返回救援 | ${resultText(record.checks.searchRescue)} |
| 继续看页帮助/返回救援 | ${resultText(record.checks.historyRescue)} |
| 摄像头权限 | ${resultText(record.checks.cameraPermission)} |
| 摄像头预览 | ${resultText(record.checks.cameraPreview)} |
| 音频输入检测 | ${resultText(record.checks.audioInput)} |
| 录音权限 | ${resultText(record.checks.recordAudioPermission)} |
| USB 摄像头热插拔 | ${resultText(record.checks.usbHotplug)} |
| 维护码可读 | ${resultText(record.checks.supportCode)} |

## 手机当电视摄像头真实验收

| 项目 | 结果 |
| --- | --- |
| 扫码/房间码配对 | ${resultText(record.phoneCameraChecks.pairing)} |
| 手机摄像头权限 | ${resultText(record.phoneCameraChecks.phoneCameraPermission)} |
| 手机麦克风权限 | ${resultText(record.phoneCameraChecks.phoneMicrophonePermission)} |
| 电视端首帧画面 | ${resultText(record.phoneCameraChecks.tvFirstFrame)} |
| 电视端手机音频 | ${resultText(record.phoneCameraChecks.tvAudioReceiving)} |
| session.stats 证据 | ${resultText(record.phoneCameraChecks.sessionStats)} |
| 断线重连 | ${resultText(record.phoneCameraChecks.reconnect)} |
| 停止按钮关闭采集 | ${resultText(record.phoneCameraChecks.privacyStop)} |

${record.phoneCamera.closeRule}

## 自动证据

- readiness: \`${record.evidence.readinessLevel || 'unknown'}\`
- readiness 摘要: ${record.evidence.readinessSummary || '未生成'}
- remote self-test: ${record.evidence.remoteSelfTestOk ? 'pass' : 'fail'}
- TV/camera feature: ${compactLines(record.evidence.featureLines) || '未采集'}
- USB snapshot: ${compactLines(record.evidence.usbSnapshot) || '未采集'}
- Camera appops: ${compactLines(record.evidence.cameraAppOpsLines) || '未采集'}
- Record audio appops: ${compactLines(record.evidence.recordAudioAppOpsLines) || '未采集'}
- Current focus: ${compactLines(record.evidence.currentFocusLines, 3) || '未采集'}
- Resumed activity: ${compactLines(record.evidence.resumedActivityLines, 3) || '未采集'}

## 如何填写一次完整记录

不想手写环境变量时，优先运行中文问答向导：

\`\`\`bash
BOX_IP=<盒子IP> npm run tv-box:field-wizard
\`\`\`

熟悉命令行时，也可直接填写环境变量：

\`\`\`bash
FIELD_OPERATOR=张三 \\
FIELD_LOCATION=客厅A \\
FIELD_BOX_BRAND=小米 \\
FIELD_BOX_MODEL="Mi Box 4S" \\
FIELD_REMOTE_MODEL=原装蓝牙遥控器 \\
FIELD_CAMERA_MODEL="Logitech C270" \\
FIELD_CAMERA_CONNECTION=usb \\
FIELD_MICROPHONE_MODEL="Logitech C270 Mic" \\
FIELD_MICROPHONE_CONNECTION=usb \\
FIELD_REMOTE_FOCUS=pass \\
FIELD_NUMERIC_SHORTCUTS=pass \\
FIELD_ZERO_KEY_HELP=pass \\
FIELD_HELP_KEY_SHORTCUTS=pass \\
FIELD_REMOTE_PRACTICE=pass \\
FIELD_EXIT_CONFIRM=pass \\
FIELD_LIVE_PLAYBACK=pass \\
FIELD_LIVE_NUMERIC_CHANNELS=pass \\
FIELD_LIVE_MEDIA_KEYS=pass \\
FIELD_LIVE_FAVORITES=pass \\
FIELD_CLASSIC_HOME_RESCUE=pass \\
FIELD_SEARCH_RESCUE=pass \\
FIELD_HISTORY_RESCUE=pass \\
FIELD_CAMERA_PERMISSION=pass \\
FIELD_CAMERA_PREVIEW=pass \\
FIELD_AUDIO_INPUT=pass \\
FIELD_RECORD_AUDIO_PERMISSION=skip \\
FIELD_USB_HOTPLUG=pass \\
FIELD_SUPPORT_CODE=pass \\
FIELD_NOTES="USB 摄像头重插后可识别" \\
BOX_IP=<盒子IP> npm run tv-box:field-record
\`\`\`

可用结果值：\`pass\`、\`fail\`、\`skip\`、\`na\`、\`unknown\`。

说明：本地或 CI 没接盒子、也没填写现场字段时，只会刷新 latest 记录，不会把空白 \`needs_box\` 行追加进累计 CSV。需要强制追加时可设置 \`FIELD_APPEND_MATRIX=true\`；需要重建 CSV 表头时可先设置 \`FIELD_RESET_MATRIX=true\`。

## 备注

${record.notes || '无'}
`

fs.writeFileSync(recordMarkdownPath, markdown)
fs.copyFileSync(recordMarkdownPath, latestMarkdownPath)

const header = [
  'generatedAtUtc',
  'recordId',
  'verdict',
  'operator',
  'location',
  'boxBrand',
  'boxModel',
  'androidSdk',
  'deviceStatus',
  'appInstalled',
  'remoteModel',
  'cameraModel',
  'cameraConnection',
  'microphoneModel',
  'microphoneConnection',
  'remoteFocus',
  'numericShortcuts',
  'zeroKeyHelp',
  'helpKeyShortcuts',
  'remotePractice',
  'exitConfirm',
  'livePlayback',
  'liveNumericChannels',
  'liveMediaKeys',
  'liveFavorites',
  'classicHomeRescue',
  'searchRescue',
  'historyRescue',
  'cameraPermission',
  'cameraPreview',
  'audioInput',
  'recordAudioPermission',
  'usbHotplug',
  'supportCode',
  'phoneCameraPairing',
  'phoneCameraPermission',
  'phoneMicrophonePermission',
  'phoneTvFirstFrame',
  'phoneTvAudio',
  'phoneSessionStats',
  'phoneReconnect',
  'phonePrivacyStop',
  'readinessLevel',
  'apkSha256',
  'notes'
]
const row = [
  record.generatedAtUtc,
  record.recordId,
  record.verdict,
  record.operator,
  record.location,
  record.box.brand,
  record.box.model,
  record.box.androidSdk,
  record.box.deviceStatus,
  boolText(record.box.appInstalled),
  record.remote.model,
  record.camera.model,
  record.camera.connection,
  record.audio.microphoneModel,
  record.audio.microphoneConnection,
  record.checks.remoteFocus,
  record.checks.numericShortcuts,
  record.checks.zeroKeyHelp,
  record.checks.helpKeyShortcuts,
  record.checks.remotePractice,
  record.checks.exitConfirm,
  record.checks.livePlayback,
  record.checks.liveNumericChannels,
  record.checks.liveMediaKeys,
  record.checks.liveFavorites,
  record.checks.classicHomeRescue,
  record.checks.searchRescue,
  record.checks.historyRescue,
  record.checks.cameraPermission,
  record.checks.cameraPreview,
  record.checks.audioInput,
  record.checks.recordAudioPermission,
  record.checks.usbHotplug,
  record.checks.supportCode,
  record.phoneCameraChecks.pairing,
  record.phoneCameraChecks.phoneCameraPermission,
  record.phoneCameraChecks.phoneMicrophonePermission,
  record.phoneCameraChecks.tvFirstFrame,
  record.phoneCameraChecks.tvAudioReceiving,
  record.phoneCameraChecks.sessionStats,
  record.phoneCameraChecks.reconnect,
  record.phoneCameraChecks.privacyStop,
  record.evidence.readinessLevel,
  record.evidence.apkSha256,
  record.notes
]

function parseCsvLine(line) {
  const cells = []
  let current = ''
  let inQuotes = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const nextChar = line[index + 1]
    if (inQuotes && char === '"' && nextChar === '"') {
      current += '"'
      index += 1
      continue
    }
    if (char === '"') {
      inQuotes = !inQuotes
      continue
    }
    if (!inQuotes && char === ',') {
      cells.push(current)
      current = ''
      continue
    }
    current += char
  }
  cells.push(current)
  return cells
}

function migrateMatrixCsvIfNeeded(filePath, nextHeader) {
  if (!fs.existsSync(filePath)) return

  const raw = fs.readFileSync(filePath, 'utf8').trim()
  if (!raw) {
    fs.writeFileSync(filePath, `${nextHeader.map(csvCell).join(',')}\n`)
    return
  }

  const lines = raw.split(/\r?\n/).filter(Boolean)
  const currentHeader = parseCsvLine(lines[0])
  if (currentHeader.join('\u0000') === nextHeader.join('\u0000')) return

  const migratedRows = lines.slice(1).map((line) => {
    const sourceCells = parseCsvLine(line)
    const source = new Map(currentHeader.map((name, index) => [name, sourceCells[index] || '']))
    return nextHeader.map((name) => source.get(name) || '')
  })
  const backupPath = `${filePath}.bak-${recordId}`
  fs.copyFileSync(filePath, backupPath)
  fs.writeFileSync(filePath, `${nextHeader.map(csvCell).join(',')}\n`)
  for (const migratedRow of migratedRows) {
    fs.appendFileSync(filePath, `${migratedRow.map(csvCell).join(',')}\n`)
  }
}

if (String(env('FIELD_RESET_MATRIX')).trim().toLowerCase() === 'true' && fs.existsSync(matrixCsvPath)) {
  fs.rmSync(matrixCsvPath)
}
migrateMatrixCsvIfNeeded(matrixCsvPath, header)
if (!fs.existsSync(matrixCsvPath)) {
  fs.writeFileSync(matrixCsvPath, `${header.map(csvCell).join(',')}\n`)
}
if (appendMatrixRow) {
  fs.appendFileSync(matrixCsvPath, `${row.map(csvCell).join(',')}\n`)
}

console.log(`TV-box field compatibility record written to: ${latestMarkdownPath}`)
console.log(`Machine-readable record: ${latestJsonPath}`)
console.log(`Compatibility matrix CSV: ${matrixCsvPath}${appendMatrixRow ? '' : ' (row append skipped)'}`)
NODE
