#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPORT_DIR="${REPORT_DIR:-$ROOT_DIR/reports}"
OUTPUT_JSON="${TV_BOX_NEXT_SCENARIOS_JSON:-$REPORT_DIR/tv-box-next-scenarios-test-latest.json}"
OUTPUT_MD="${TV_BOX_NEXT_SCENARIOS_MD:-$REPORT_DIR/tv-box-next-scenarios-test-latest.md}"

TMP_ROOT="$(mktemp -d)"
FAKE_BIN="$TMP_ROOT/bin"
RESULTS_JSONL="$TMP_ROOT/results.jsonl"

cleanup() {
  rm -rf "$TMP_ROOT"
}

fail() {
  local message="$1"
  echo "ERROR: $message" >&2
  if [[ -n "${CURRENT_SCENARIO_OUTPUT:-}" && -f "$CURRENT_SCENARIO_OUTPUT" ]]; then
    echo >&2
    echo "== Captured tv-box:next output ==" >&2
    sed -n '1,220p' "$CURRENT_SCENARIO_OUTPUT" >&2 || true
  fi
  exit 1
}

json_value() {
  local file_path="$1"
  local key_path="$2"
  node -e '
const fs = require("fs")
const data = JSON.parse(fs.readFileSync(process.argv[1], "utf8"))
const value = process.argv[2].split(".").reduce((current, key) => current && current[key], data)
if (value === undefined || value === null) process.exit(1)
if (typeof value === "object") process.stdout.write(JSON.stringify(value))
else process.stdout.write(String(value))
' "$file_path" "$key_path"
}

write_fake_npm() {
  mkdir -p "$FAKE_BIN"
  cat > "$FAKE_BIN/npm" <<'FAKENPM'
#!/usr/bin/env bash
set -euo pipefail

REPORT_DIR="${REPORT_DIR:?REPORT_DIR is required for fake npm}"
mkdir -p "$REPORT_DIR"

script_name=""
for arg in "$@"; do
  case "$arg" in
    tv-box:*) script_name="$arg" ;;
  esac
done

if [[ -z "$script_name" ]]; then
  echo "fake npm only supports npm run -s tv-box:*" >&2
  exit 2
fi

printf '%s\n' "$script_name" >> "$REPORT_DIR/fake-npm-calls.txt"

write_handoff_markers() {
  local handoff="$REPORT_DIR/fake-handoff.zip"
  local support="$REPORT_DIR/fake-support.zip"
  printf 'fake handoff archive\n' > "$handoff"
  printf 'fake support archive\n' > "$support"
  printf '%s\n' "$handoff" > "$REPORT_DIR/tv-box-handoff-latest-archive.txt"
  printf '%s\n' "$support" > "$REPORT_DIR/tv-box-support-latest-archive.txt"
}

write_authorization() {
  local status="${TV_BOX_FAKE_AUTH_STATUS:-no_box_target}"
  local ready="false"
  local authorized_count="0"
  local unready_count="1"
  local selected=""
  if [[ "$status" == "ready_for_install" ]]; then
    ready="true"
    authorized_count="1"
    unready_count="0"
    selected="${DEVICE_SERIAL:-192.0.2.10:5555}"
  fi
  cat > "$REPORT_DIR/tv-box-authorization-latest.json" <<JSON
{
  "generatedAtUtc": "2026-01-01T00:00:00Z",
  "status": "$status",
  "readyForInstall": $ready,
  "inputs": {
    "boxIp": "${BOX_IP:-}",
    "deviceSerial": "${DEVICE_SERIAL:-}"
  },
  "adb": {
    "selectedDevice": "$selected",
    "authorizedCount": $authorized_count,
    "unreadyCount": $unready_count
  },
  "nextActions": [
    "synthetic authorization next action for $status"
  ]
}
JSON
  cat > "$REPORT_DIR/tv-box-authorization-latest.md" <<MD
# Fake authorization report

- status: \`$status\`
MD
}

write_preflight() {
  local verdict="${TV_BOX_FAKE_PREFLIGHT_VERDICT:-handoff_ready_needs_box}"
  cat > "$REPORT_DIR/tv-box-preflight-latest.json" <<JSON
{
  "generatedAtUtc": "2026-01-01T00:00:00Z",
  "verdict": "$verdict",
  "device": {
    "status": "${TV_BOX_FAKE_DEVICE_STATUS:-no_device}",
    "selected": "${DEVICE_SERIAL:-}"
  },
  "nextActions": [
    "synthetic preflight next action for $verdict"
  ]
}
JSON
  cat > "$REPORT_DIR/tv-box-preflight-latest.md" <<MD
# Fake preflight report

- verdict: \`$verdict\`
MD
}

write_command_center() {
  local status="${TV_BOX_FAKE_COMMAND_STATUS:-needs_engineering_fix}"
  cat > "$REPORT_DIR/tv-box-command-center-latest.json" <<JSON
{
  "generatedAtUtc": "2026-01-01T00:00:00Z",
  "primaryNextAction": {
    "status": "$status",
    "reason": "synthetic command center reason for $status",
    "projectOwner": "synthetic owner action",
    "siteInstaller": "synthetic site action",
    "engineer": "synthetic engineer action"
  }
}
JSON
  cat > "$REPORT_DIR/tv-box-command-center-latest.md" <<MD
# Fake command center

- status: \`$status\`
MD
}

write_site_readiness() {
  local status="${TV_BOX_FAKE_SITE_STATUS:-needs_preflight}"
  cat > "$REPORT_DIR/tv-box-site-readiness-latest.json" <<JSON
{
  "generatedAtUtc": "2026-01-01T00:00:00Z",
  "stage": {
    "status": "$status",
    "title": "synthetic site readiness",
    "summary": "synthetic site readiness summary for $status"
  }
}
JSON
  cat > "$REPORT_DIR/tv-box-site-readiness-latest.md" <<MD
# Fake site readiness

- status: \`$status\`
MD
  cat > "$REPORT_DIR/tv-box-site-readiness-card.html" <<HTML
<!doctype html><title>Fake site readiness</title><h1>$status</h1>
HTML
}

write_c920_arrival_card() {
  local status="${TV_BOX_FAKE_C920_STATUS:-not_run_yet}"
  cat > "$REPORT_DIR/tv-box-c920-arrival-card-latest.json" <<JSON
{
  "status": "$status",
  "primaryAction": "到货后先直插小米盒子 USB 口，再执行 BOX_IP=192.0.2.10 npm run tv-box:c920-arrived。",
  "command": "BOX_IP=192.0.2.10 npm run tv-box:c920-arrived",
  "procurement": {
    "purchaseChannel": "京东自营",
    "expectedArrivalDate": "2026-05-30"
  }
}
JSON
  cat > "$REPORT_DIR/tv-box-c920-arrival-card-latest.md" <<MD
# Fake C920 arrival card

- status: \`$status\`
MD
}

case "$script_name" in
  tv-box:authorize)
    write_authorization
    ;;
  tv-box:preflight)
    write_preflight
    ;;
  tv-box:command-center)
    write_command_center
    ;;
  tv-box:site-readiness)
    write_site_readiness
    ;;
  tv-box:c920-arrival-card)
    write_c920_arrival_card
    ;;
  tv-box:easy)
    write_handoff_markers
    printf '{"status":"fake_easy_success"}\n' > "$REPORT_DIR/tv-box-easy-run-latest.json"
    printf '# Fake easy summary\n' > "$REPORT_DIR/tv-box-easy-run-latest.md"
    ;;
  tv-box:check)
    write_handoff_markers
    printf '{"status":"fake_check_success"}\n' > "$REPORT_DIR/tv-box-completion-audit-latest.json"
    ;;
  *)
    echo "fake npm does not implement $script_name" >&2
    exit 3
    ;;
esac
FAKENPM
  chmod +x "$FAKE_BIN/npm"
}

record_result() {
  local scenario_id="$1"
  local title="$2"
  local expected_status="$3"
  local actual_status="$4"
  local auth_status="$5"
  local preflight_verdict="$6"
  local command_status="$7"
  local site_status="$8"
  local allow_install="$9"
  local build_delivery="${10}"
  local called_easy="${11}"
  local called_check="${12}"
  local commands_json="${13}"
  local output_path="${14}"
  local result_json_path="${15}"

  node - "$RESULTS_JSONL" "$scenario_id" "$title" "$expected_status" "$actual_status" "$auth_status" "$preflight_verdict" "$command_status" "$site_status" "$allow_install" "$build_delivery" "$called_easy" "$called_check" "$commands_json" "$output_path" "$result_json_path" <<'NODE'
const fs = require('fs')
const [
  jsonlPath,
  id,
  title,
  expectedStatus,
  actualStatus,
  authStatus,
  preflightVerdict,
  commandStatus,
  siteStatus,
  allowInstall,
  buildDelivery,
  calledEasy,
  calledCheck,
  commandsJson,
  outputPath,
  resultJsonPath
] = process.argv.slice(2)

const row = {
  id,
  title,
  status: actualStatus === expectedStatus ? 'pass' : 'fail',
  expectedStatus,
  actualStatus,
  inputs: {
    authStatus,
    preflightVerdict,
    commandStatus,
    siteStatus,
    allowInstall: allowInstall === 'true',
    buildDelivery: buildDelivery === 'true'
  },
  called: {
    easy: calledEasy === 'true',
    check: calledCheck === 'true'
  },
  commands: JSON.parse(commandsJson),
  outputPath,
  resultJsonPath
}

fs.appendFileSync(jsonlPath, `${JSON.stringify(row)}\n`)
NODE
}

run_scenario() {
  local scenario_id="$1"
  local title="$2"
  local auth_status="$3"
  local preflight_verdict="$4"
  local command_status="$5"
  local site_status="$6"
  local allow_install="$7"
  local build_delivery="$8"
  local expected_status="$9"
  local should_call_easy="${10}"
  local should_call_check="${11}"
  local c920_status="${12:-}"

  local scenario_dir="$TMP_ROOT/$scenario_id"
  local scenario_report_dir="$scenario_dir/reports"
  local output_path="$scenario_dir/output.txt"
  local result_json="$scenario_report_dir/tv-box-next-latest.json"
  local calls_path="$scenario_report_dir/fake-npm-calls.txt"
  CURRENT_SCENARIO_OUTPUT="$output_path"

  mkdir -p "$scenario_report_dir"
  printf 'fake handoff archive\n' > "$scenario_report_dir/fake-handoff.zip"
  printf 'fake support archive\n' > "$scenario_report_dir/fake-support.zip"
  printf '%s\n' "$scenario_report_dir/fake-handoff.zip" > "$scenario_report_dir/tv-box-handoff-latest-archive.txt"
  printf '%s\n' "$scenario_report_dir/fake-support.zip" > "$scenario_report_dir/tv-box-support-latest-archive.txt"
  set +e
  PATH="$FAKE_BIN:$PATH" \
  REPORT_DIR="$scenario_report_dir" \
  BOX_IP="192.0.2.10" \
  DEVICE_SERIAL="192.0.2.10:5555" \
  NEXT_ALLOW_INSTALL="$allow_install" \
  NEXT_BUILD_DELIVERY="$build_delivery" \
  RUN_CAMERA_SMOKE=true \
  TV_BOX_FAKE_C920_STATUS="$c920_status" \
  TV_BOX_FAKE_AUTH_STATUS="$auth_status" \
  TV_BOX_FAKE_PREFLIGHT_VERDICT="$preflight_verdict" \
  TV_BOX_FAKE_COMMAND_STATUS="$command_status" \
  TV_BOX_FAKE_SITE_STATUS="$site_status" \
  "$ROOT_DIR/scripts/tv-box-next.sh" > "$output_path" 2>&1 < /dev/null
  local exit_code=$?
  set -e

  [[ "$exit_code" -eq 0 ]] || fail "$scenario_id exited with $exit_code"
  [[ -f "$result_json" ]] || fail "$scenario_id did not write tv-box-next-latest.json"
  [[ -f "$calls_path" ]] || fail "$scenario_id did not record fake npm calls"

  local actual_status
  actual_status="$(json_value "$result_json" "result.status")"
  [[ "$actual_status" == "$expected_status" ]] || fail "$scenario_id expected result.status=$expected_status, got $actual_status"

  local called_easy="false"
  local called_check="false"
  if grep -Fxq "tv-box:easy" "$calls_path"; then called_easy="true"; fi
  if grep -Fxq "tv-box:check" "$calls_path"; then called_check="true"; fi

  [[ "$called_easy" == "$should_call_easy" ]] || fail "$scenario_id expected tv-box:easy called=$should_call_easy, got $called_easy"
  [[ "$called_check" == "$should_call_check" ]] || fail "$scenario_id expected tv-box:check called=$should_call_check, got $called_check"

  local commands_json
  commands_json="$(node -e 'const fs=require("fs"); console.log(JSON.stringify(fs.readFileSync(process.argv[1],"utf8").trim().split(/\n/).filter(Boolean)))' "$calls_path")"
  record_result "$scenario_id" "$title" "$expected_status" "$actual_status" "$auth_status" "$preflight_verdict" "$command_status" "$site_status" "$allow_install" "$build_delivery" "$called_easy" "$called_check" "$commands_json" "$output_path" "$result_json"
}

write_summary() {
  mkdir -p "$REPORT_DIR"
  node - "$RESULTS_JSONL" "$OUTPUT_JSON" "$OUTPUT_MD" <<'NODE'
const fs = require('fs')
const [jsonlPath, outputJson, outputMarkdown] = process.argv.slice(2)
const scenarios = fs.readFileSync(jsonlPath, 'utf8')
  .trim()
  .split(/\n/)
  .filter(Boolean)
  .map((line) => JSON.parse(line))

const failed = scenarios.filter((scenario) => scenario.status !== 'pass')
const report = {
  generatedAtUtc: new Date().toISOString(),
  status: failed.length === 0 ? 'pass' : 'fail',
  summary: {
    scenarioCount: scenarios.length,
    pass: scenarios.length - failed.length,
    fail: failed.length
  },
  scenarios
}

fs.writeFileSync(outputJson, `${JSON.stringify(report, null, 2)}\n`)

const rows = scenarios.map((scenario) => `| ${scenario.id} | \`${scenario.status}\` | \`${scenario.expectedStatus}\` | \`${scenario.actualStatus}\` | ${scenario.called.easy ? 'yes' : 'no'} | ${scenario.called.check ? 'yes' : 'no'} | ${scenario.commands.join('<br>')} |`).join('\n')
const markdown = `# HelloTV 唯一下一步场景回归

- 生成时间 UTC: \`${report.generatedAtUtc}\`
- 状态: \`${report.status}\`
- 场景数: \`${report.summary.scenarioCount}\`
- 通过: \`${report.summary.pass}\`
- 失败: \`${report.summary.fail}\`

| 场景 | 状态 | 期望结果 | 实际结果 | 调用 easy | 调用 check | 子命令 |
| --- | --- | --- | --- | --- | --- | --- |
${rows}

## 覆盖边界

- 未授权时只能生成授权/预检/总控/开工报告，不能误触发安装。
- 已授权但禁用安装时只能报告 \`ready_for_install\`，不能自动安装。
- 已授权且 C920 到货卡待接入时，唯一下一步必须切到 C920 专用验收，不能只停留在安装提示。
- 已授权且允许安装时必须调用 \`tv-box:easy\`。
- 交付包缺失且允许自动补齐时必须调用 \`tv-box:check\`。
- 工具链阻断时必须保留为工程修复状态。
`

fs.writeFileSync(outputMarkdown, markdown)
NODE
}

trap cleanup EXIT

cd "$ROOT_DIR"
mkdir -p "$REPORT_DIR"
write_fake_npm

run_scenario \
  "needs_authorization" \
  "未授权/offline：只生成下一步，不安装" \
  "needs_rsa_authorization" \
  "needs_box_authorization" \
  "needs_authorization" \
  "needs_box_authorization" \
  "false" \
  "false" \
  "needs_authorization" \
  "false" \
  "false"

run_scenario \
  "ready_install_disabled" \
  "已授权但禁用自动安装：只提示可安装" \
  "ready_for_install" \
  "handoff_ready_needs_box" \
  "ready_for_install" \
  "ready_for_install" \
  "false" \
  "false" \
  "ready_for_install" \
  "false" \
  "false"

run_scenario \
  "ready_install_disabled_c920_pending" \
  "已授权且 C920 待到货：唯一下一步转为 C920 专用验收" \
  "ready_for_install" \
  "handoff_ready_needs_box" \
  "c920_purchased_pending_arrival" \
  "ready_for_install" \
  "false" \
  "false" \
  "c920_purchased_pending_arrival" \
  "false" \
  "false" \
  "c920_purchased_pending_arrival"

run_scenario \
  "ready_auto_install" \
  "已授权且允许安装：进入 easy 安装验收链" \
  "ready_for_install" \
  "handoff_ready_needs_box" \
  "ready_for_install" \
  "ready_for_install" \
  "true" \
  "false" \
  "installed_and_reported" \
  "true" \
  "false"

run_scenario \
  "delivery_missing_no_build" \
  "交付包缺失但禁用自动补齐：只提示先跑 check" \
  "no_box_target" \
  "needs_build_or_handoff" \
  "needs_engineering_fix" \
  "needs_preflight" \
  "false" \
  "false" \
  "needs_delivery_build" \
  "false" \
  "false"

run_scenario \
  "delivery_missing_auto_build" \
  "交付包缺失且允许自动补齐：调用 check 刷新交付包" \
  "no_box_target" \
  "needs_build_or_handoff" \
  "can_handoff_needs_box" \
  "handoff_ready_needs_box" \
  "false" \
  "true" \
  "handoff_refreshed_needs_box" \
  "false" \
  "true"

run_scenario \
  "toolchain_blocker" \
  "工具链阻断：保留工程修复状态" \
  "no_box_target" \
  "needs_toolchain" \
  "needs_engineering_fix" \
  "needs_toolchain" \
  "false" \
  "true" \
  "needs_toolchain" \
  "false" \
  "false"

write_summary

echo "TV-box next-step scenario regression passed: $OUTPUT_MD"
echo "Machine-readable next-step scenario report: $OUTPUT_JSON"
