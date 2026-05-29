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
EOF
  exit 0
fi

if [[ "$args" == *"dumpsys usb"* ]]; then
  cat <<'EOF'
  host_manager={
    devices={
      class=239
      subclass=2
        interfaces=[
            class=224
            subclass=1
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
    echo "fake remote smoke"
    ;;
  *"tv-box:camera-smoke"*)
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

(
  cd "$ROOT_DIR"
  TV_BOX_TOOL_PATH="$FAKE_BIN" \
  REPORT_DIR="$REPORT_DIR" \
  BOX_IP=192.168.10.122 \
  DEVICE_SERIAL=192.168.10.122:5555 \
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

assert.equal(report.status, 'needs_camera_follow_up')
assert.equal(report.cameraSmokeExitCode, 42)
assert.equal(report.cameraService.cameraCount, '0')
assert.equal(report.fieldResults.cameraPreview, 'fail')
assert.equal(record.checks.cameraPreview, 'fail')
assert.equal(record.checks.cameraPermission, 'pass')
assert.equal(record.checks.recordAudioPermission, 'pass')
assert.equal(record.matrix.appendRow, false)
assert.match(record.notes, /CameraService Number of camera devices=0/)
NODE

echo "C920 PRO acceptance failure self-test passed."
