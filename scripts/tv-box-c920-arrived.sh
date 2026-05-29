#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROCUREMENT_JSON="${TV_BOX_C920_PROCUREMENT_JSON:-$ROOT_DIR/tv-box-field-state/c920-procurement.json}"
REPORT_DIR="${REPORT_DIR:-$ROOT_DIR/reports}"
PREP_JSON="${TV_BOX_C920_PREP_JSON:-$REPORT_DIR/tv-box-c920-onsite-prep-latest.json}"

json_value_or_empty() {
  local file_path="$1"
  local key_path="$2"
  [[ -f "$file_path" ]] || return 0
  node -e '
const fs = require("fs")
try {
  const data = JSON.parse(fs.readFileSync(process.argv[1], "utf8"))
  const value = process.argv[2].split(".").reduce((current, key) => {
    if (current === undefined || current === null) return undefined
    return current[key]
  }, data)
  if (value !== undefined && value !== null) process.stdout.write(String(value))
} catch {}
' "$file_path" "$key_path"
}

BOX_IP="${BOX_IP:-192.168.10.122}"
C920_PHYSICAL_STATUS="${C920_PHYSICAL_STATUS:-inserted}"
C920_PURCHASE_CHANNEL="${C920_PURCHASE_CHANNEL:-$(json_value_or_empty "$PROCUREMENT_JSON" "purchaseChannel")}"
C920_EXPECTED_ARRIVAL_DATE="${C920_EXPECTED_ARRIVAL_DATE:-$(json_value_or_empty "$PROCUREMENT_JSON" "expectedArrivalDate")}"
C920_PURCHASE_NOTE="${C920_PURCHASE_NOTE:-$(json_value_or_empty "$PROCUREMENT_JSON" "note")}"
C920_ARRIVED_CURRENT_DATE="${C920_ARRIVED_CURRENT_DATE:-$(date +%F)}"

export BOX_IP C920_PHYSICAL_STATUS C920_PURCHASE_CHANNEL C920_EXPECTED_ARRIVAL_DATE C920_PURCHASE_NOTE C920_ARRIVED_CURRENT_DATE
export REPORT_DIR

is_truthy() {
  case "$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]')" in
    true|1|yes|y|force) return 0 ;;
    *) return 1 ;;
  esac
}

is_iso_date() {
  [[ "${1:-}" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]
}

echo "== C920 PRO 到货一键验收 =="
echo "BOX_IP: $BOX_IP"
echo "Physical status: $C920_PHYSICAL_STATUS"
echo "Purchase: ${C920_PURCHASE_CHANNEL:-unknown}; expected arrival: ${C920_EXPECTED_ARRIVAL_DATE:-unknown}"
echo "Current date: $C920_ARRIVED_CURRENT_DATE"
echo "底层验收脚本：npm run tv-box:c920-acceptance"

if is_iso_date "$C920_EXPECTED_ARRIVAL_DATE" \
  && is_iso_date "$C920_ARRIVED_CURRENT_DATE" \
  && [[ "$C920_ARRIVED_CURRENT_DATE" < "$C920_EXPECTED_ARRIVAL_DATE" ]] \
  && ! is_truthy "${C920_ARRIVED_ALLOW_EARLY:-false}"; then
  echo
  echo "C920 PRO 预计 ${C920_EXPECTED_ARRIVAL_DATE} 到货，当前还是 ${C920_ARRIVED_CURRENT_DATE}。"
  echo "为避免把“未到货/未插入”误判为 USB 或 Camera2 故障，本次不执行实体摄像头验收。"
  echo "到货并插入小米盒子 USB 口后，重新运行：npm run tv-box:c920-arrived"
  echo "如果它已经提前到货且确认插好，可运行：C920_ARRIVED_ALLOW_EARLY=true npm run tv-box:c920-arrived"
  exit 0
fi

if ! is_truthy "${C920_ARRIVED_SKIP_PREP:-false}"; then
  echo
  echo "== C920 到货前置检查 =="

  if is_truthy "${C920_ARRIVED_ALLOW_EARLY:-false}" \
    && is_iso_date "$C920_EXPECTED_ARRIVAL_DATE" \
    && [[ -z "${C920_PREP_CURRENT_DATE:-}" ]]; then
    export C920_PREP_CURRENT_DATE="$C920_EXPECTED_ARRIVAL_DATE"
  fi

  node "$ROOT_DIR/scripts/tv-box-c920-onsite-prep.js"

  prep_status="$(node -e '
const fs = require("fs")
try {
  const data = JSON.parse(fs.readFileSync(process.argv[1], "utf8"))
  process.stdout.write(data.result?.status || "")
} catch {}
' "$PREP_JSON")"

  prep_reason="$(node -e '
const fs = require("fs")
try {
  const data = JSON.parse(fs.readFileSync(process.argv[1], "utf8"))
  process.stdout.write(data.result?.reason || "")
} catch {}
' "$PREP_JSON")"

  prep_cleanup="$(node -e '
const fs = require("fs")
try {
  const data = JSON.parse(fs.readFileSync(process.argv[1], "utf8"))
  process.stdout.write((data.commands?.cleanupAdbNoise || []).join(" && "))
} catch {}
' "$PREP_JSON")"

  echo "C920 arrival preflight status: ${prep_status:-unknown}"
  [[ -z "$prep_reason" ]] || echo "Reason: $prep_reason"

  case "$prep_status" in
    ready_to_plug_and_run|ready_to_plug_and_run_with_adb_noise)
      if [[ -n "$prep_cleanup" ]]; then
        echo "提示：存在离线/未授权 ADB 噪声，可先执行：$prep_cleanup"
      fi
      ;;
    *)
      echo
      echo "当前还不适合进入实体 C920 验收，避免把盒子未在线/ADB 未授权误判成摄像头故障。"
      echo "请先查看：$PREP_JSON"
      echo "准备好后重新运行：npm run tv-box:c920-arrived"
      if ! is_truthy "${C920_ARRIVED_ALLOW_UNREADY:-false}"; then
        exit 0
      fi
      echo "C920_ARRIVED_ALLOW_UNREADY=true 已设置，继续执行底层验收。"
      ;;
  esac
fi

if is_truthy "${C920_ARRIVED_DRY_RUN:-false}"; then
  echo
  echo "Dry run only; date and C920 preflight passed, but acceptance was not executed."
  echo "到货并确认 C920 已插好后，去掉 C920_ARRIVED_DRY_RUN=true 再运行：npm run tv-box:c920-arrived"
  exit 0
fi

exec "$ROOT_DIR/scripts/tv-box-c920-pro-acceptance.sh"
