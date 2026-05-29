#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/tv-box-c920-acceptance-test.XXXXXX")"
FAKE_BIN="$TMP_ROOT/bin"
REPORT_DIR="$TMP_ROOT/reports"

cleanup() {
  local status=$?
  if [[ "$status" -ne 0 && -f "$TMP_ROOT/c920-acceptance.log" ]]; then
    echo "== C920 acceptance self-test log ==" >&2
    cat "$TMP_ROOT/c920-acceptance.log" >&2
  fi
  rm -rf "$TMP_ROOT"
  exit "$status"
}
trap cleanup EXIT

mkdir -p "$FAKE_BIN" "$REPORT_DIR"

cat >"$FAKE_BIN/adb" <<'SH'
#!/usr/bin/env bash
set -euo pipefail

args="$*"
if [[ "$args" == "devices -l" ]]; then
  cat <<'EOF'
List of devices attached
192.0.2.10:5555        offline transport_id:1
192.168.10.122:5555    device product:frozen model:MiTV_AZFP0 device:frozen transport_id:2
EOF
  exit 0
fi

if [[ "$args" == *"dumpsys media.camera"* ]]; then
  cat <<'EOF'
== Service global info: ==

Number of camera devices: 0
Number of normal camera devices: 0
EOF
  exit 0
fi

if [[ "$args" == *"ls -l /dev/video"* ]]; then
  cat <<'EOF'
crw-rw---- 1 system mediadrm 81, 0 2015-01-01 08:00 /dev/video10

total 0
crw-rw-rw- 1 system audio 116, 0 2015-01-01 08:00 controlC0
crw-rw-rw- 1 system audio 116, 24 2015-01-01 08:00 pcmC0D0c
EOF
  exit 0
fi

if [[ "$args" == *"dumpsys usb"* ]]; then
  cat <<'EOF'
  host_manager={
    devices={
      Product: Fake UVC Camera
      Manufacturer: Logitech
      class=239
      subclass=2
        interfaces=[
            class=14
            subclass=2
            name=UVC video
            class=1
            subclass=2
            name=USB audio
            class=224
            subclass=1
EOF
  exit 0
fi

if [[ "$args" == *"dumpsys audio"* ]]; then
  cat <<'EOF'
  input devices:
    USB audio input device
    microphone source available
EOF
  exit 0
fi

echo "fake adb: $args"
SH

cat >"$FAKE_BIN/npm" <<'SH'
#!/usr/bin/env bash
set -euo pipefail

args="$*"
report_dir="${REPORT_DIR:-$(pwd)/reports}"
mkdir -p "$report_dir"

write_inspection() {
  cat >"$report_dir/tv-box-inspection-latest.json" <<'JSON'
{
  "deviceEvidence": {
    "status": "selected",
    "selectedSerial": "192.168.10.122:5555",
    "model": "MiTV-AZFP0",
    "androidSdk": "28",
    "appInstalled": true,
    "featureLines": [
      "feature:android.hardware.camera.external",
      "feature:android.hardware.usb.host"
    ],
    "cameraPermissionContext": [
      "android.permission.CAMERA: granted=true"
    ],
    "recordAudioPermissionContext": [
      "android.permission.RECORD_AUDIO: granted=true"
    ],
    "cameraAppOpsLines": [
      "CAMERA: allow"
    ],
    "recordAudioAppOpsLines": [
      "RECORD_AUDIO: allow"
    ]
  },
  "readiness": {
    "level": "device_verified",
    "humanSummary": "fake inspection"
  },
  "apk": {
    "sha256": "fake-sha",
    "sizeBytes": 1
  },
  "remoteSelfTest": {
    "ok": true
  }
}
JSON
}

case "$args" in
  *"tv-box:inspect"*)
    write_inspection
    echo "fake inspect"
    ;;
  *"tv-box:smoke"*)
    node - "$report_dir" <<'NODE'
const fs = require('fs')
const path = require('path')
const reportDir = process.argv[2]
const screenshotPath = path.join(reportDir, 'tv-box-remote-smoke-latest.png')
fs.writeFileSync(screenshotPath, 'fake-png')
const report = {
  status: 'pass',
  exitCode: 0,
  deviceSerial: '192.168.10.122:5555',
  runDir: path.join(reportDir, 'tv-box-remote-smoke', 'fake-run'),
  boundary: {
    replacesRealRemoteAcceptance: false,
    replacesC920Acceptance: false
  },
  crashCheck: {
    crashDetected: false
  },
  scenarios: [
    { id: 'live_help_menu_home' },
    { id: 'search_history_rescue' },
    { id: 'classic_home_rescue' },
    { id: 'camera_setup_navigation' }
  ],
  keyEvents: Array.from({ length: 36 }, (_, index) => ({ keyCode: index })),
  artifacts: {
    json: { path: path.join(reportDir, 'tv-box-remote-smoke-latest.json'), exists: true },
    markdown: { path: path.join(reportDir, 'tv-box-remote-smoke-latest.md'), exists: true },
    screenshotLatest: { path: screenshotPath, exists: true }
  }
}
fs.writeFileSync(path.join(reportDir, 'tv-box-remote-smoke-latest.json'), `${JSON.stringify(report, null, 2)}\n`)
fs.writeFileSync(path.join(reportDir, 'tv-box-remote-smoke-latest.md'), '# fake remote smoke\n')
NODE
    echo "fake remote smoke"
    ;;
  *"tv-box:camera-smoke"*)
    echo "I/TvBoxModule: capabilities cameraCount=0 externalCameraCount=0 usbDeviceCount=1 usbVideoDeviceCount=1 audioInputDeviceCount=2 usbAudioInputDeviceCount=1 hasUsbHost=true hasCameraPermission=true hasRecordAudioPermission=true" >&2
    echo "fake camera smoke failure" >&2
    exit 42
    ;;
  *"tv-box:field-record"*)
    node - "$report_dir" <<'NODE'
const fs = require('fs')
const path = require('path')
const reportDir = process.argv[2]
const record = {
  recordId: 'fake-c920-record',
  verdict: process.env.FIELD_CAMERA_PREVIEW === 'fail' ? 'needs_fix' : 'needs_manual_acceptance',
  box: {
    model: process.env.FIELD_BOX_MODEL || '',
    serial: process.env.DEVICE_SERIAL || ''
  },
  camera: {
    model: process.env.FIELD_CAMERA_MODEL || '',
    connection: process.env.FIELD_CAMERA_CONNECTION || ''
  },
  audio: {
    microphoneModel: process.env.FIELD_MICROPHONE_MODEL || '',
    microphoneConnection: process.env.FIELD_MICROPHONE_CONNECTION || ''
  },
  checks: {
    cameraPermission: process.env.FIELD_CAMERA_PERMISSION || '',
    cameraPreview: process.env.FIELD_CAMERA_PREVIEW || '',
    audioInput: process.env.FIELD_AUDIO_INPUT || '',
    recordAudioPermission: process.env.FIELD_RECORD_AUDIO_PERMISSION || '',
    usbHotplug: process.env.FIELD_USB_HOTPLUG || ''
  },
  matrix: {
    appendRow: process.env.FIELD_APPEND_MATRIX === 'true'
  },
  notes: process.env.FIELD_NOTES || ''
}
fs.writeFileSync(path.join(reportDir, 'tv-box-field-record-latest.json'), `${JSON.stringify(record, null, 2)}\n`)
fs.writeFileSync(path.join(reportDir, 'tv-box-field-record-latest.md'), '# fake C920 field record\n')
NODE
    ;;
  *"tv-box:compatibility-summary"*)
    cat >"$report_dir/tv-box-compatibility-summary-latest.json" <<'JSON'
{"totalRecords":0,"recommended":[],"tvCoreReady":[],"needsManualAcceptance":[]}
JSON
    echo "# fake compatibility" >"$report_dir/tv-box-compatibility-summary-latest.md"
    ;;
  *"tv-box:hardware-profile"*)
    echo '{"readiness":"fake"}' >"$report_dir/tv-box-hardware-profile-latest.json"
    echo "# fake hardware profile" >"$report_dir/tv-box-hardware-profile-latest.md"
    ;;
  *"tv-box:completion-audit"*)
    echo '{"nextActions":["fake next action"]}' >"$report_dir/tv-box-completion-audit-latest.json"
    echo "# fake completion audit" >"$report_dir/tv-box-completion-audit-latest.md"
    ;;
  *"tv-box:command-center"*)
    echo '{"readiness":"fake"}' >"$report_dir/tv-box-command-center-latest.json"
    echo "# fake command center" >"$report_dir/tv-box-command-center-latest.md"
    ;;
  *"tv-box:release-ledger"*)
    echo '{"releaseId":"fake"}' >"$report_dir/tv-box-release-ledger-latest.json"
    echo "# fake release ledger" >"$report_dir/tv-box-release-ledger-latest.md"
    ;;
  *)
    echo "unexpected fake npm command: $args" >&2
    exit 64
    ;;
esac
SH

chmod +x "$FAKE_BIN/adb" "$FAKE_BIN/npm"

cat >"$REPORT_DIR/tv-box-c920-pro-baseline.json" <<'JSON'
{
  "generatedAtUtc": "2026-05-29T00:00:00.000Z",
  "stamp": "baseline",
  "runDir": "/tmp/fake-baseline",
  "boxIp": "192.168.10.122",
  "deviceSerial": "192.168.10.122:5555",
  "cameraModel": "Logitech C920 PRO / C920 Pro HD",
  "status": "needs_camera_follow_up",
  "fieldDecision": {
    "level": "waiting_for_camera_or_usb_not_detected"
  },
  "cameraService": {
    "cameraCount": "0",
    "normalCameraCount": "0"
  },
  "hardwareEvidence": {
    "kernelVideoNodeCount": 1,
    "kernelSndCaptureNodeCount": 1,
    "usbVideoHintCount": 0,
    "usbAudioHintCount": 0,
    "nativeCapabilities": {
      "cameraCount": 0,
      "externalCameraCount": 0,
      "usbDeviceCount": 1,
      "usbVideoDeviceCount": 0,
      "audioInputDeviceCount": 1,
      "usbAudioInputDeviceCount": 0
    }
  }
}
JSON

(
  cd "$ROOT_DIR"
  TV_BOX_TOOL_PATH="$FAKE_BIN" \
  REPORT_DIR="$REPORT_DIR" \
  BOX_IP=192.168.10.122 \
  DEVICE_SERIAL=192.168.10.122:5555 \
  C920_PHYSICAL_STATUS=已插入 \
  C920_PURCHASE_CHANNEL="京东自营" \
  C920_EXPECTED_ARRIVAL_DATE=2026-05-30 \
  INTERACTIVE=false \
  FIELD_APPEND_MATRIX=false \
  ./scripts/tv-box-c920-pro-acceptance.sh >"$TMP_ROOT/c920-acceptance.log" 2>&1
)

node - "$REPORT_DIR" <<'NODE'
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const reportDir = process.argv[2]

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(reportDir, name), 'utf8'))
}

const report = readJson('tv-box-c920-pro-acceptance-latest.json')
const record = readJson('tv-box-field-record-latest.json')
const card = readJson('tv-box-c920-arrival-card-latest.json')
const cardMarkdown = fs.readFileSync(path.join(reportDir, 'tv-box-c920-arrival-card-latest.md'), 'utf8')
const cardHtml = fs.readFileSync(path.join(reportDir, 'tv-box-c920-arrival-card.html'), 'utf8')

assert.equal(report.status, 'needs_camera_follow_up')
assert.equal(report.procurement.purchaseChannel, '京东自营')
assert.equal(report.procurement.expectedArrivalDate, '2026-05-30')
assert.equal(report.physicalStatus.status, 'inserted')
assert.match(report.physicalStatus.label, /已插入 C920/)
assert.equal(report.remoteSmokeEvidence.status, 'pass')
assert.equal(report.remoteSmokeEvidence.scenarioCount, 4)
assert.equal(report.remoteSmokeEvidence.keyEventCount, 36)
assert.equal(report.remoteSmokeEvidence.crashDetected, false)
assert.equal(report.remoteSmokeEvidence.replacesC920Acceptance, false)
assert.equal(report.remoteSmokeEvidence.screenshotPath, 'tv-box-remote-smoke-latest.png')
assert.equal(report.cameraSmokeExitCode, 42)
assert.equal(report.cameraService.cameraCount, '0')
assert.equal(report.fieldDecision.level, 'usb_seen_camera_hal_missing')
assert.equal(report.fieldDecision.checklist.usbVideoDetected, true)
assert.equal(report.fieldDecision.checklist.camera2Enumerated, false)
assert.equal(report.fieldDecision.checklist.previewActivityOpened, false)
assert.equal(report.fieldDecision.checklist.usbAudioDetected, true)
assert.equal(report.baselineComparison.status, 'compared')
assert.equal(report.baselineComparison.signals.usbVideoIncreased, true)
assert.equal(report.baselineComparison.signals.camera2Increased, false)
assert.equal(report.baselineComparison.signals.usbAudioIncreased, true)
assert.equal(report.baselineComparison.signals.audioInputChanged, true)
assert.equal(report.baselineComparison.deltas.nativeUsbVideoDeviceCount, 1)
assert.equal(report.baselineComparison.deltas.nativeUsbAudioInputDeviceCount, 1)
assert.deepEqual(report.hardwareEvidence.adbOfflineOrUnauthorizedDevices, ['192.0.2.10:5555'])
assert.ok(report.hardwareEvidence.kernelVideoNodeCount >= 1)
assert.ok(report.hardwareEvidence.kernelSndCaptureNodeCount >= 1)
assert.ok(report.hardwareEvidence.usbVideoHintCount >= 1)
assert.ok(report.hardwareEvidence.usbAudioHintCount >= 1)
assert.ok(report.hardwareEvidence.usbHostVisibleDeviceCount >= 1)
assert.equal(report.hardwareEvidence.usbLogitechC920Detected, true)
assert.equal(report.hardwareEvidence.usbVideoDeviceDetected, true)
assert.equal(report.hardwareEvidence.usbAudioDeviceDetected, true)
assert.match(report.hardwareEvidence.usbDeviceSummary, /Logitech|C920|Fake UVC/)
assert.equal(report.hardwareEvidence.nativeCapabilities.usbVideoDeviceCount, 1)
assert.equal(report.hardwareEvidence.nativeCapabilities.usbAudioInputDeviceCount, 1)
assert.equal(report.fieldResults.cameraPreview, 'fail')
assert.equal(record.checks.cameraPreview, 'fail')
assert.equal(record.checks.cameraPermission, 'pass')
assert.equal(record.checks.recordAudioPermission, 'pass')
assert.equal(record.matrix.appendRow, false)
assert.match(record.notes, /CameraService Number of camera devices=0/)
assert.equal(card.status, 'usb_seen_camera_hal_missing')
assert.equal(card.procurement.purchaseChannel, '京东自营')
assert.equal(card.procurement.expectedArrivalDate, '2026-05-30')
assert.equal(card.checklist.usbVideoDetected, true)
assert.equal(card.hardwareEvidence.usbLogitechC920Detected, true)
assert.match(card.command, /tv-box:c920-arrived/)
assert.equal(card.evidenceReturn.folder, 'FIELD_RETURN/')
assert.match(card.evidenceReturn.returnInboxCommand, /tv-box:return-inbox/)
assert.ok(card.evidenceReturn.items.some((item) => item.fileName.includes('C920_PREVIEW_TV_SCREEN')))
assert.ok(card.evidenceReturn.items.some((item) => item.fileName.includes('C920_MIC_BUSINESS_INPUT')))
assert.ok(card.evidenceReturn.items.some((item) => item.fileName.includes('C920_HOTPLUG_RETEST')))
assert.ok(card.evidenceReturn.items.some((item) => item.fileName.includes('SUPPORT_CODE_C920')))
assert.match(cardMarkdown, /只有电视上看到 C920 PRO 真实画面/)
assert.match(cardMarkdown, /C920_PHYSICAL_STATUS=已插入/)
assert.match(cardMarkdown, /带独立供电 USB Hub/)
assert.match(cardMarkdown, /USB Host 清单/)
assert.match(cardMarkdown, /C920 回传证据文件名/)
assert.match(cardMarkdown, /C920_PREVIEW_TV_SCREEN/)
assert.match(cardMarkdown, /C920_MIC_BUSINESS_INPUT/)
assert.match(cardMarkdown, /C920_HOTPLUG_RETEST/)
assert.match(cardMarkdown, /npm run tv-box:return-inbox/)
assert.match(cardMarkdown, /Fake UVC Camera|Logitech/)
assert.match(cardMarkdown, /ADB 遥控器冒烟证据/)
assert.match(cardMarkdown, /tv-box-remote-smoke-latest\.png/)
assert.match(cardHtml, /打印 C920 到货操作卡/)
assert.match(cardHtml, /C920 回传证据文件名/)
assert.match(cardHtml, /SUPPORT_CODE_C920/)
NODE

REALTEK_REPORT_DIR="$TMP_ROOT/realtek-card-reports"
mkdir -p "$REALTEK_REPORT_DIR"
cat >"$TMP_ROOT/realtek-acceptance.json" <<'JSON'
{
  "generatedAtUtc": "2026-05-29T00:00:00.000Z",
  "boxIp": "192.168.10.122",
  "physicalStatus": {
    "status": "inserted",
    "label": "已插入 C920，按识别结果排障"
  },
  "cameraService": {
    "cameraCount": "0",
    "normalCameraCount": "0"
  },
  "fieldDecision": {
    "level": "waiting_for_camera_or_usb_not_detected",
    "title": "未看到 C920 视频设备",
    "summary": "当前更像是摄像头未接入、线材/供电/Hub 问题，或盒子 USB 层没有识别到视频设备。",
    "primaryAction": "先确认 C920 已插紧且指示灯/硬件正常；直插不行就改用带独立供电 USB Hub 后重跑。",
    "checklist": {
      "usbVideoDetected": false,
      "camera2Enumerated": false,
      "previewActivityOpened": true,
      "realPreviewConfirmed": false,
      "usbAudioDetected": false,
      "audioConfirmed": false,
      "hotplugConfirmed": false
    }
  },
  "hardwareEvidence": {
    "usbHostVisibleDeviceCount": 1,
    "usbDeviceSummary": "当前 USB host 只看到 Realtek 802.11ac NIC，未看到 Logitech/C920 或 USB Video Class 设备。",
    "usbDeviceSummaries": [
      "Realtek 802.11ac NIC / vendor=3034 product=51232 / Wireless/Bluetooth, Misc/composite, class=224/239"
    ],
    "usbLogitechC920Detected": false,
    "usbVideoDeviceDetected": false,
    "usbAudioDeviceDetected": false,
    "usbRealtekOnly": true,
    "usbVideoHintCount": 0,
    "usbAudioHintCount": 0,
    "nativeCapabilities": {
      "cameraCount": 0,
      "externalCameraCount": 0,
      "usbVideoDeviceCount": 0,
      "audioInputDeviceCount": 2,
      "usbAudioInputDeviceCount": 0
    }
  },
  "fieldResults": {
    "cameraPreview": "fail",
    "audioInput": "fail",
    "usbHotplug": "fail"
  },
  "baselineComparison": {
    "status": "compared",
    "summary": "相对基线没有看到新增 USB 视频、Camera2 或 USB 音频变化",
    "signals": {
      "usbVideoIncreased": false,
      "camera2Increased": false,
      "usbAudioIncreased": false,
      "audioInputChanged": false
    }
  }
}
JSON

(
  cd "$ROOT_DIR"
  REPORT_DIR="$REALTEK_REPORT_DIR" \
  TV_BOX_C920_ACCEPTANCE_JSON="$TMP_ROOT/realtek-acceptance.json" \
  C920_PHYSICAL_STATUS=已插入 \
  node ./scripts/tv-box-c920-arrival-card.js >/dev/null
)

node - "$REALTEK_REPORT_DIR" <<'NODE'
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const reportDir = process.argv[2]
const card = JSON.parse(fs.readFileSync(path.join(reportDir, 'tv-box-c920-arrival-card-latest.json'), 'utf8'))
const cardMarkdown = fs.readFileSync(path.join(reportDir, 'tv-box-c920-arrival-card-latest.md'), 'utf8')

assert.equal(card.title, '已插入 C920，但 USB Host 只看到 Realtek 网卡')
assert.match(card.summary, /Realtek 802\.11ac NIC/)
assert.equal(card.hardwareEvidence.usbLogitechC920Detected, false)
assert.equal(card.hardwareEvidence.usbRealtekOnly, true)
assert.match(cardMarkdown, /未看到 Logitech\/C920/)
assert.match(cardMarkdown, /USB Host 清单/)
assert.match(cardMarkdown, /C920_PREVIEW_TV_SCREEN/)
NODE

cat >"$TMP_ROOT/c920-procurement.json" <<'JSON'
{
  "purchaseChannel": "京东自营",
  "expectedArrivalDate": "2026-05-30",
  "physicalStatus": "purchased_pending_arrival",
  "note": "self-test procurement"
}
JSON

(
  cd "$ROOT_DIR"
  TV_BOX_C920_PROCUREMENT_JSON="$TMP_ROOT/c920-procurement.json" \
  C920_ARRIVED_CURRENT_DATE=2026-05-29 \
  ./scripts/tv-box-c920-arrived.sh >"$TMP_ROOT/c920-arrived-wait.log" 2>&1
)

grep -q "预计 2026-05-30 到货" "$TMP_ROOT/c920-arrived-wait.log"
grep -q "本次不执行实体摄像头验收" "$TMP_ROOT/c920-arrived-wait.log"
if grep -q "Logitech C920 PRO TV-box acceptance" "$TMP_ROOT/c920-arrived-wait.log"; then
  echo "c920-arrived ran acceptance before the expected arrival date" >&2
  exit 1
fi

EARLY_REPORT_DIR="$TMP_ROOT/arrived-early-reports"
mkdir -p "$EARLY_REPORT_DIR"
FAKE_PREP_READY=$'List of devices attached\n192.0.2.10:5555        offline transport_id:1\n192.168.10.122:5555    device product:frozen model:MiTV_AZFP0 device:frozen transport_id:2\n'
(
  cd "$ROOT_DIR"
  TV_BOX_TOOL_PATH="$FAKE_BIN" \
  REPORT_DIR="$EARLY_REPORT_DIR" \
  BOX_IP=192.168.10.122 \
  DEVICE_SERIAL=192.168.10.122:5555 \
  TV_BOX_C920_PROCUREMENT_JSON="$TMP_ROOT/c920-procurement.json" \
  TV_BOX_C920_PREP_FAKE_ADB_DEVICES="$FAKE_PREP_READY" \
  C920_ARRIVED_CURRENT_DATE=2026-05-29 \
  C920_ARRIVED_ALLOW_EARLY=true \
  INTERACTIVE=false \
  FIELD_APPEND_MATRIX=false \
  ./scripts/tv-box-c920-arrived.sh >"$TMP_ROOT/c920-arrived-early.log" 2>&1
)

node - "$EARLY_REPORT_DIR" "$TMP_ROOT/c920-arrived-early.log" <<'NODE'
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const reportDir = process.argv[2]
const logPath = process.argv[3]
const report = JSON.parse(fs.readFileSync(path.join(reportDir, 'tv-box-c920-pro-acceptance-latest.json'), 'utf8'))
const log = fs.readFileSync(logPath, 'utf8')

assert.match(log, /Current date: 2026-05-29/)
assert.match(log, /C920 arrival preflight status: ready_to_plug_and_run_with_adb_noise/)
assert.match(log, /Logitech C920 PRO TV-box acceptance/)
assert.equal(report.physicalStatus.status, 'inserted')
assert.equal(report.procurement.purchaseChannel, '京东自营')
assert.equal(report.procurement.expectedArrivalDate, '2026-05-30')
assert.equal(report.fieldDecision.level, 'usb_seen_camera_hal_missing')
NODE

UNREADY_REPORT_DIR="$TMP_ROOT/arrived-unready-reports"
mkdir -p "$UNREADY_REPORT_DIR"
FAKE_PREP_NO_TARGET=$'List of devices attached\n192.0.2.10:5555        offline transport_id:1\n'
(
  cd "$ROOT_DIR"
  REPORT_DIR="$UNREADY_REPORT_DIR" \
  BOX_IP=192.168.10.122 \
  DEVICE_SERIAL=192.168.10.122:5555 \
  TV_BOX_C920_PROCUREMENT_JSON="$TMP_ROOT/c920-procurement.json" \
  TV_BOX_C920_PREP_FAKE_ADB_DEVICES="$FAKE_PREP_NO_TARGET" \
  C920_ARRIVED_CURRENT_DATE=2026-05-30 \
  INTERACTIVE=false \
  ./scripts/tv-box-c920-arrived.sh >"$TMP_ROOT/c920-arrived-unready.log" 2>&1
)

grep -q "C920 arrival preflight status: needs_box_connection" "$TMP_ROOT/c920-arrived-unready.log"
grep -q "当前还不适合进入实体 C920 验收" "$TMP_ROOT/c920-arrived-unready.log"
if grep -q "Logitech C920 PRO TV-box acceptance" "$TMP_ROOT/c920-arrived-unready.log"; then
  echo "c920-arrived ran acceptance while C920 preflight was not ready" >&2
  exit 1
fi

PENDING_REPORT_DIR="$TMP_ROOT/pending-reports"
mkdir -p "$PENDING_REPORT_DIR"
cat >"$PENDING_REPORT_DIR/tv-box-c920-pro-acceptance-latest.json" <<'JSON'
{
  "generatedAtUtc": "2026-05-29T10:00:00.000Z",
  "boxIp": "192.168.10.122",
  "deviceSerial": "192.168.10.122:5555",
  "cameraModel": "Logitech C920 PRO / C920 Pro HD",
  "fieldDecision": {
    "level": "waiting_for_camera_or_usb_not_detected",
    "title": "未看到 C920 视频设备",
    "summary": "no signal",
    "primaryAction": "check cable",
    "checklist": {
      "usbVideoDetected": false,
      "camera2Enumerated": false,
      "previewActivityOpened": true,
      "realPreviewConfirmed": false,
      "usbAudioDetected": false,
      "audioConfirmed": false,
      "hotplugConfirmed": false
    }
  },
  "cameraService": {
    "cameraCount": "0",
    "normalCameraCount": "0"
  },
  "hardwareEvidence": {
    "usbVideoHintCount": 0,
    "usbAudioHintCount": 0,
    "nativeCapabilities": {
      "cameraCount": 0,
      "externalCameraCount": 0,
      "usbVideoDeviceCount": 0,
      "audioInputDeviceCount": 2,
      "usbAudioInputDeviceCount": 0
    }
  },
  "fieldResults": {
    "cameraPreview": "unknown",
    "audioInput": "unknown",
    "usbHotplug": "unknown"
  },
  "baselineComparison": {
    "status": "compared",
    "summary": "相对基线没有看到新增 USB 视频、Camera2 或 USB 音频变化",
    "signals": {
      "usbVideoIncreased": false,
      "camera2Increased": false,
      "usbAudioIncreased": false,
      "audioInputChanged": false
    }
  }
}
JSON

(
  cd "$ROOT_DIR"
  REPORT_DIR="$PENDING_REPORT_DIR" node ./scripts/tv-box-c920-arrival-card.js >/dev/null
  C920_PHYSICAL_STATUS=已采购待到货 C920_PURCHASE_CHANNEL="京东自营" C920_EXPECTED_ARRIVAL_DATE=2026-05-30 REPORT_DIR="$PENDING_REPORT_DIR" node ./scripts/tv-box-c920-arrival-card.js >/dev/null
)

node - "$PENDING_REPORT_DIR" <<'NODE'
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const reportDir = process.argv[2]
const card = JSON.parse(fs.readFileSync(path.join(reportDir, 'tv-box-c920-arrival-card-latest.json'), 'utf8'))
const cardMarkdown = fs.readFileSync(path.join(reportDir, 'tv-box-c920-arrival-card-latest.md'), 'utf8')

assert.equal(card.status, 'c920_purchased_pending_arrival')
assert.equal(card.sourceStatus, 'waiting_for_camera_or_usb_not_detected')
assert.equal(card.physicalStatus, 'purchased_pending_arrival')
assert.equal(card.fieldResults.cameraPreview, 'unknown')
assert.equal(card.fieldResults.audioInput, 'unknown')
assert.equal(card.fieldResults.usbHotplug, 'unknown')
assert.deepEqual(card.physicalStatusInputHints.inserted, ['inserted', '已插入', '已接入'])
assert.equal(card.procurement.purchaseChannel, '京东自营')
assert.equal(card.procurement.expectedArrivalDate, '2026-05-30')
assert.match(card.command, /tv-box:c920-arrived/)
assert.match(card.title, /已购买/)
assert.match(card.summary, /不能判定为盒子不兼容/)
assert.match(cardMarkdown, /物理状态: 已采购，待到货\/接入/)
assert.match(cardMarkdown, /C920_PHYSICAL_STATUS=已采购待到货/)
assert.match(cardMarkdown, /C920_PHYSICAL_STATUS=已插入/)
assert.match(cardMarkdown, /采购渠道: 京东自营/)
assert.match(cardMarkdown, /预计到货: 2026-05-30/)
assert.match(cardMarkdown, /C920_PHYSICAL_STATUS=已插入/)
assert.match(cardMarkdown, /新增 USB 视频: `no`/)
assert.ok(cardMarkdown.includes('| FIELD_CAMERA_PREVIEW | 未确认 |'))
assert.match(cardMarkdown, /C920 回传证据文件名/)
assert.match(cardMarkdown, /SUPPORT_CODE_C920/)
assert.ok(!cardMarkdown.includes('| FIELD_CAMERA_PREVIEW | 失败 |'))
NODE

(
  cd "$ROOT_DIR"
  C920_PHYSICAL_STATUS=已到货未插入 REPORT_DIR="$PENDING_REPORT_DIR" node ./scripts/tv-box-c920-arrival-card.js >/dev/null
)

node - "$PENDING_REPORT_DIR" <<'NODE'
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const reportDir = process.argv[2]
const card = JSON.parse(fs.readFileSync(path.join(reportDir, 'tv-box-c920-arrival-card-latest.json'), 'utf8'))
const cardMarkdown = fs.readFileSync(path.join(reportDir, 'tv-box-c920-arrival-card-latest.md'), 'utf8')

assert.equal(card.status, 'c920_not_inserted_baseline')
assert.equal(card.physicalStatus, 'not_inserted')
assert.equal(card.fieldResults.cameraPreview, 'unknown')
assert.match(card.physicalStatusLabel, /未插入/)
assert.match(cardMarkdown, /C920_PHYSICAL_STATUS=已到货未插入/)
assert.match(cardMarkdown, /未插入摄像头时看到 USB 视频和 Camera2 为 0 是正常基线/)
assert.ok(cardMarkdown.includes('| FIELD_CAMERA_PREVIEW | 未确认 |'))
NODE

echo "C920 PRO acceptance failure self-test passed."
