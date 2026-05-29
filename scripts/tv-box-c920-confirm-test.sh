#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/quicktv-c920-confirm-test.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT

REPORT_DIR="$TMP_DIR/reports"
PROCUREMENT_JSON="$TMP_DIR/c920-procurement.json"
mkdir -p "$REPORT_DIR"

cat > "$PROCUREMENT_JSON" <<'JSON'
{
  "cameraModel": "Logitech C920 PRO",
  "purchaseChannel": "京东自营",
  "expectedArrivalDate": "2026-05-31",
  "physicalStatus": "purchased_pending_arrival"
}
JSON

run_confirm() {
  env \
    REPORT_DIR="$REPORT_DIR" \
    TV_BOX_C920_PROCUREMENT_JSON="$PROCUREMENT_JSON" \
    BOX_IP=192.168.10.122 \
    "$ROOT_DIR/scripts/tv-box-c920-confirm.sh" "$@"
}

read_json() {
  local expression="$1"
  node -e "const fs=require('fs'); const j=JSON.parse(fs.readFileSync('$REPORT_DIR/tv-box-c920-confirm-latest.json','utf8')); $expression"
}

run_confirm >/dev/null
[[ "$(read_json "process.stdout.write(j.status)")" == "needs_confirmation" ]]
read_json "if (!j.commands.allPass.includes('C920_CONFIRM_ALL_PASS=true')) process.exit(1)"

run_confirm --all-pass --dry-run >/dev/null
[[ "$(read_json "process.stdout.write(j.status)")" == "dry_run_ready_to_write" ]]
[[ "$(read_json "process.stdout.write(j.fieldInputs.cameraPreview)")" == "pass" ]]
[[ "$(read_json "process.stdout.write(j.fieldInputs.audioInput)")" == "pass" ]]
[[ "$(read_json "process.stdout.write(j.fieldInputs.usbHotplug)")" == "pass" ]]
[[ "$(read_json "process.stdout.write(j.fieldInputs.supportCode)")" == "pass" ]]

run_confirm --video pass --mic fail --hotplug pass --support-code na --dry-run >/dev/null
[[ "$(read_json "process.stdout.write(j.fieldInputs.audioInput)")" == "fail" ]]
[[ "$(read_json "process.stdout.write(j.fieldInputs.supportCode)")" == "na" ]]

C920_CONFIRM_CURRENT_DATE=2026-05-30 run_confirm --all-pass >/dev/null
[[ "$(read_json "process.stdout.write(j.status)")" == "blocked_before_expected_arrival" ]]
read_json "if (j.preflight.status !== 'waiting_for_delivery') process.exit(1)"
read_json "if (!j.preflight.reason.includes('2026-05-31')) process.exit(1)"

fake_offline_adb=$'List of devices attached\n192.168.10.122:5555\toffline product:frozen\n'
C920_CONFIRM_CURRENT_DATE=2026-05-31 TV_BOX_C920_PREP_FAKE_ADB_DEVICES="$fake_offline_adb" run_confirm --all-pass >/dev/null
[[ "$(read_json "process.stdout.write(j.status)")" == "blocked_by_preflight" ]]
read_json "if (j.preflight.status !== 'needs_box_connection') process.exit(1)"

run_confirm --video pass --mic pass --hotplug pass --dry-run >/dev/null
[[ "$(read_json "process.stdout.write(j.status)")" == "needs_confirmation" ]]
read_json "if (!j.missingConfirmations.includes('维护码照片/可读性')) process.exit(1)"

echo "C920 confirmation self-test passed."
