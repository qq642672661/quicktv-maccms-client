#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROCUREMENT_JSON="${TV_BOX_C920_PROCUREMENT_JSON:-$ROOT_DIR/tv-box-field-state/c920-procurement.json}"

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

export BOX_IP C920_PHYSICAL_STATUS C920_PURCHASE_CHANNEL C920_EXPECTED_ARRIVAL_DATE C920_PURCHASE_NOTE

echo "== C920 PRO 到货一键验收 =="
echo "BOX_IP: $BOX_IP"
echo "Physical status: $C920_PHYSICAL_STATUS"
echo "Purchase: ${C920_PURCHASE_CHANNEL:-unknown}; expected arrival: ${C920_EXPECTED_ARRIVAL_DATE:-unknown}"
echo "底层验收脚本：npm run tv-box:c920-acceptance"

if [[ "${C920_ARRIVED_DRY_RUN:-false}" == "true" ]]; then
  echo "Dry run only; acceptance not executed."
  exit 0
fi

exec "$ROOT_DIR/scripts/tv-box-c920-pro-acceptance.sh"
