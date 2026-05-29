#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/tv-box-c920-prep-test.XXXXXX")"

cleanup() {
  rm -rf "$TMP_ROOT"
}
trap cleanup EXIT

PROCUREMENT_JSON="$TMP_ROOT/c920-procurement.json"
cat >"$PROCUREMENT_JSON" <<'JSON'
{
  "cameraModel": "Logitech C920 PRO",
  "physicalStatus": "purchased_pending_arrival",
  "purchaseChannel": "京东自营",
  "expectedArrivalDate": "2026-05-31",
  "note": "synthetic prep test"
}
JSON

FAKE_DEVICES=$'List of devices attached\n192.0.2.10:5555        offline transport_id:1\n192.168.10.122:5555    device product:frozen model:MiTV_AZFP0 device:frozen transport_id:2\n'
FAKE_NO_TARGET=$'List of devices attached\n192.0.2.10:5555        offline transport_id:1\n'

run_case() {
  local id="$1"
  local current_date="$2"
  local fake_devices="$3"
  local expected_status="$4"
  local report_dir="$TMP_ROOT/$id"

  mkdir -p "$report_dir"
  REPORT_DIR="$report_dir" \
  TV_BOX_C920_PROCUREMENT_JSON="$PROCUREMENT_JSON" \
  TV_BOX_C920_PREP_FAKE_ADB_DEVICES="$fake_devices" \
  C920_PREP_CURRENT_DATE="$current_date" \
  node "$ROOT_DIR/scripts/tv-box-c920-onsite-prep.js" >/dev/null

	  node - "$report_dir/tv-box-c920-onsite-prep-latest.json" "$expected_status" <<'NODE'
const fs = require('fs')
const report = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const expected = process.argv[3]
if (report.result.status !== expected) {
  console.error(`expected ${expected}, got ${report.result.status}`)
  process.exit(1)
}
if (!report.commands.main.includes('tv-box:c920-arrived')) {
  console.error('missing c920 arrived command')
  process.exit(1)
}
if (report.inputs.currentDateSource !== 'C920_PREP_CURRENT_DATE' || report.inputs.currentDateOverride !== true) {
  console.error('prep report must record synthetic date source and override flag')
  process.exit(1)
}
if (report.singleUsbPlan?.status !== 'use_c920_builtin_microphone_first') {
  console.error('missing single-USB C920 built-in microphone plan')
  process.exit(1)
}
if (!report.singleUsbPlan?.fallback?.includes('独立供电 USB Hub')) {
  console.error('single-USB fallback must mention powered USB Hub')
  process.exit(1)
}
NODE

	  grep -q "C920 PRO 到货现场预备卡" "$report_dir/tv-box-c920-onsite-prep-latest.md"
	  grep -q "日期来源" "$report_dir/tv-box-c920-onsite-prep-latest.md"
	  grep -q "单 USB 口接线策略" "$report_dir/tv-box-c920-onsite-prep-latest.md"
	}

run_case "before-arrival" "2026-05-30" "$FAKE_DEVICES" "waiting_for_delivery"
run_case "arrival-day-online-with-noise" "2026-05-31" "$FAKE_DEVICES" "ready_to_plug_and_run_with_adb_noise"
run_case "arrival-day-no-target" "2026-05-31" "$FAKE_NO_TARGET" "needs_box_connection"

echo "C920 onsite prep self-test passed."
