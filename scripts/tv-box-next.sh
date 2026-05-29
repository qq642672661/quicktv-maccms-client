#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

source "$ROOT_DIR/scripts/android-env.sh"

PACKAGE_NAME="${PACKAGE_NAME:-com.quicktvui.hellotv}"
BOX_IP="${BOX_IP:-}"
DEVICE_SERIAL="${DEVICE_SERIAL:-}"
REPORT_DIR="${REPORT_DIR:-$ROOT_DIR/reports}"
RUN_CAMERA_SMOKE="${RUN_CAMERA_SMOKE:-true}"
NEXT_ALLOW_INSTALL="${NEXT_ALLOW_INSTALL:-true}"
NEXT_BUILD_DELIVERY="${NEXT_BUILD_DELIVERY:-true}"
REQUIRE_NEXT_READY="${REQUIRE_NEXT_READY:-false}"
OUTPUT_MD="${TV_BOX_NEXT_MD:-$REPORT_DIR/tv-box-next-latest.md}"
OUTPUT_JSON="${TV_BOX_NEXT_JSON:-$REPORT_DIR/tv-box-next-latest.json}"

mkdir -p "$REPORT_DIR"

STARTED_AT_UTC="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
RESULT_STATUS="running"
RESULT_REASON="正在判断电视盒子现场下一步。"
COMMANDS_TEXT=""
NEXT_ACTIONS_TEXT=""
AUTH_STATUS=""
PREFLIGHT_VERDICT=""
COMMAND_CENTER_STATUS=""
SITE_READINESS_STATUS=""

print_step() {
  echo
  echo "== $1 =="
}

append_command() {
  if [[ -z "$COMMANDS_TEXT" ]]; then
    COMMANDS_TEXT="$1"
  else
    COMMANDS_TEXT="$COMMANDS_TEXT"$'\n'"$1"
  fi
}

append_action() {
  if [[ -z "$NEXT_ACTIONS_TEXT" ]]; then
    NEXT_ACTIONS_TEXT="$1"
  else
    NEXT_ACTIONS_TEXT="$NEXT_ACTIONS_TEXT"$'\n'"$1"
  fi
}

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

run_npm_step() {
  local label="$1"
  local script_name="$2"
  shift 2

  print_step "$label"
  append_command "PASS? $label: npm run -s $script_name"

  set +e
  BOX_IP="$BOX_IP" \
  DEVICE_SERIAL="$DEVICE_SERIAL" \
  PACKAGE_NAME="$PACKAGE_NAME" \
  RUN_CAMERA_SMOKE="$RUN_CAMERA_SMOKE" \
  npm run -s "$script_name"
  local status=$?
  set -e

  if [[ "$status" -ne 0 ]]; then
    COMMANDS_TEXT="${COMMANDS_TEXT/PASS? $label/FAIL $status $label}"
    RESULT_STATUS="failed"
    RESULT_REASON="$label 失败，已停止自动下一步。"
    append_action "保留当前终端输出；需要远程排障时执行 BOX_IP=${BOX_IP:-<盒子IP>} npm run tv-box:support。"
    write_report
    exit "$status"
  fi

  COMMANDS_TEXT="${COMMANDS_TEXT/PASS? $label/OK $label}"
}

write_report() {
  local finished_at_utc
  finished_at_utc="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  local auth_json="$REPORT_DIR/tv-box-authorization-latest.json"
  local preflight_json="$REPORT_DIR/tv-box-preflight-latest.json"
  local command_center_json="$REPORT_DIR/tv-box-command-center-latest.json"
  local site_readiness_json="$REPORT_DIR/tv-box-site-readiness-latest.json"
  local handoff_archive_txt="$REPORT_DIR/tv-box-handoff-latest-archive.txt"
  local support_archive_txt="$REPORT_DIR/tv-box-support-latest-archive.txt"
  local handoff_archive=""
  local support_archive=""

  [[ -f "$handoff_archive_txt" ]] && handoff_archive="$(sed -n '1p' "$handoff_archive_txt")"
  [[ -f "$support_archive_txt" ]] && support_archive="$(sed -n '1p' "$support_archive_txt")"

  AUTH_STATUS="${AUTH_STATUS:-$(json_value_or_empty "$auth_json" "status")}"
  PREFLIGHT_VERDICT="${PREFLIGHT_VERDICT:-$(json_value_or_empty "$preflight_json" "verdict")}"
  COMMAND_CENTER_STATUS="${COMMAND_CENTER_STATUS:-$(json_value_or_empty "$command_center_json" "primaryNextAction.status")}"
  SITE_READINESS_STATUS="${SITE_READINESS_STATUS:-$(json_value_or_empty "$site_readiness_json" "stage.status")}"

  export STARTED_AT_UTC finished_at_utc ROOT_DIR PACKAGE_NAME BOX_IP DEVICE_SERIAL REPORT_DIR
  export RUN_CAMERA_SMOKE NEXT_ALLOW_INSTALL NEXT_BUILD_DELIVERY REQUIRE_NEXT_READY
  export RESULT_STATUS RESULT_REASON COMMANDS_TEXT NEXT_ACTIONS_TEXT
  export AUTH_STATUS PREFLIGHT_VERDICT COMMAND_CENTER_STATUS SITE_READINESS_STATUS
  export OUTPUT_MD OUTPUT_JSON handoff_archive support_archive

  node <<'NODE' > "$OUTPUT_JSON"
const env = process.env
const lines = (value) => (value || '').split(/\n/).map((line) => line.trim()).filter(Boolean)
const emptyToNull = (value) => value ? value : null
const fileState = (filePath) => {
  if (!filePath) return { path: '', exists: false }
  const fs = require('fs')
  try {
    const stat = fs.statSync(filePath)
    return { path: filePath, exists: true, sizeBytes: stat.size }
  } catch {
    return { path: filePath, exists: false }
  }
}
const data = {
  generatedAtUtc: env.finished_at_utc,
  startedAtUtc: env.STARTED_AT_UTC,
  projectRoot: env.ROOT_DIR,
  packageName: env.PACKAGE_NAME,
  inputs: {
    boxIp: emptyToNull(env.BOX_IP),
    deviceSerial: emptyToNull(env.DEVICE_SERIAL),
    runCameraSmoke: env.RUN_CAMERA_SMOKE === 'true',
    allowInstall: env.NEXT_ALLOW_INSTALL !== 'false',
    buildDelivery: env.NEXT_BUILD_DELIVERY !== 'false',
    requireReady: env.REQUIRE_NEXT_READY === 'true'
  },
  result: {
    status: env.RESULT_STATUS,
    reason: env.RESULT_REASON
  },
  observed: {
    authorizationStatus: emptyToNull(env.AUTH_STATUS),
    preflightVerdict: emptyToNull(env.PREFLIGHT_VERDICT),
    commandCenterStatus: emptyToNull(env.COMMAND_CENTER_STATUS),
    siteReadinessStatus: emptyToNull(env.SITE_READINESS_STATUS)
  },
  commands: lines(env.COMMANDS_TEXT),
  nextActions: lines(env.NEXT_ACTIONS_TEXT),
  artifacts: {
    handoffArchive: fileState(env.handoff_archive),
    supportArchive: fileState(env.support_archive),
    nextMarkdown: { path: env.OUTPUT_MD, exists: true },
    nextJson: { path: env.OUTPUT_JSON, exists: true }
  }
}
process.stdout.write(JSON.stringify(data, null, 2) + '\n')
NODE

  node <<'NODE' > "$OUTPUT_MD"
const fs = require('fs')
const data = JSON.parse(fs.readFileSync(process.env.OUTPUT_JSON, 'utf8'))
const list = (items) => items.length ? items.map((item) => `- ${item}`).join('\n') : '- 暂无'
const md = `# HelloTV 电视盒子唯一下一步

- 生成时间 UTC: \`${data.generatedAtUtc}\`
- 结果: \`${data.result.status}\`
- 判断依据: ${data.result.reason}
- BOX_IP: \`${data.inputs.boxIp || '未提供'}\`
- DEVICE_SERIAL: \`${data.inputs.deviceSerial || '未提供'}\`
- 摄像头/麦克风冒烟: \`${data.inputs.runCameraSmoke ? '开启' : '关闭'}\`
- 自动安装: \`${data.inputs.allowInstall ? '允许' : '禁用'}\`
- 自动补交付包: \`${data.inputs.buildDelivery ? '允许' : '禁用'}\`

## 当前判定

- ADB/RSA 授权: \`${data.observed.authorizationStatus || 'unknown'}\`
- preflight: \`${data.observed.preflightVerdict || 'unknown'}\`
- 交付总控: \`${data.observed.commandCenterStatus || 'unknown'}\`
- 现场开工卡: \`${data.observed.siteReadinessStatus || 'unknown'}\`

## 已执行命令

${list(data.commands)}

## 下一步只做这些

${list(data.nextActions)}

## 关键产物

- 交付包: \`${data.artifacts.handoffArchive.path || '未生成'}\` / \`${data.artifacts.handoffArchive.exists ? '已生成' : '缺失'}\`
- 排障包: \`${data.artifacts.supportArchive.path || '未生成'}\` / \`${data.artifacts.supportArchive.exists ? '已生成' : '缺失'}\`
- 本报告 JSON: \`${data.artifacts.nextJson.path}\`

## 边界

- 真实盒子未授权、未安装、未跑遥控器焦点和摄像头/麦克风现场验收时，不允许把项目标记为完成。
- 没有摄像头或麦克风的盒子可以继续看电视，但现场验收表必须把对应项填成 \`na\`，不能留成 \`unknown\`。
`
process.stdout.write(md)
NODE

  echo
  echo "唯一下一步报告：$OUTPUT_MD"
  echo "机器可读报告：$OUTPUT_JSON"
}

require_ready_if_needed() {
  if [[ "$REQUIRE_NEXT_READY" == "true" && "$RESULT_STATUS" != "installed_and_reported" && "$RESULT_STATUS" != "ready_for_install" ]]; then
    exit 1
  fi
}

if ! command -v npm >/dev/null 2>&1; then
  RESULT_STATUS="failed"
  RESULT_REASON="电脑缺少 npm，无法运行电视盒子交付脚本。"
  append_action "先安装 Node.js/npm，再重新执行 npm run tv-box:next。"
  write_report
  exit 1
fi

print_step "HelloTV 电视盒子唯一下一步"
echo "这条命令会先判断 ADB/RSA 授权；已授权就安装验收，未授权就生成现场应做的一页报告。"
echo "包名：$PACKAGE_NAME"

run_npm_step "ADB/RSA 授权助手" "tv-box:authorize"
AUTH_STATUS="$(json_value_or_empty "$REPORT_DIR/tv-box-authorization-latest.json" "status")"

if [[ "$AUTH_STATUS" == "ready_for_install" ]]; then
  if [[ "$NEXT_ALLOW_INSTALL" == "false" ]]; then
    RESULT_STATUS="ready_for_install"
    RESULT_REASON="盒子已授权；当前禁用了自动安装。"
    append_action "执行 BOX_IP=${BOX_IP:-<盒子IP>} RUN_CAMERA_SMOKE=$RUN_CAMERA_SMOKE npm run tv-box:easy。"
  else
    run_npm_step "一键安装、遥控器和摄像头/麦克风验收" "tv-box:easy"
    RESULT_STATUS="installed_and_reported"
    RESULT_REASON="盒子已授权，并已执行一键安装验收链路。"
    append_action "查看电视屏幕是否停在 HelloTV 简易首页。"
    append_action "现场打开 FIELD_WIZARD_OFFLINE.html，填写遥控器、直播、摄像头、麦克风和维护码结果后下载 JSON。"
    append_action "工程人员收到现场回传 zip 后先执行 npm run tv-box:return-inbox -- <zip>。"
  fi
else
  run_npm_step "安装前预检" "tv-box:preflight"
  PREFLIGHT_VERDICT="$(json_value_or_empty "$REPORT_DIR/tv-box-preflight-latest.json" "verdict")"

  if [[ "$PREFLIGHT_VERDICT" == "needs_build_or_handoff" || "$PREFLIGHT_VERDICT" == "needs_handoff_regeneration" ]]; then
    if [[ "$NEXT_BUILD_DELIVERY" == "false" ]]; then
      RESULT_STATUS="needs_delivery_build"
      RESULT_REASON="交付包缺失或需要重建；当前禁用了自动补交付包。"
      append_action "执行 npm run tv-box:check 生成 APK、交付包、排障包和审计报告。"
    else
      run_npm_step "自动补齐交付包和全量门禁" "tv-box:check"
      RESULT_STATUS="handoff_refreshed_needs_box"
      RESULT_REASON="已自动刷新交付包和门禁；下一步仍需要真实盒子授权和现场验收。"
      append_action "把 reports/tv-box-handoff-latest.zip 发给现场，现场解压后只打开 START_HERE.html。"
      append_action "拿到盒子 IP 后执行 BOX_IP=<盒子IP> npm run tv-box:next。"
    fi
  elif [[ "$PREFLIGHT_VERDICT" == "needs_toolchain" || "$PREFLIGHT_VERDICT" == "needs_code_fix" ]]; then
    RESULT_STATUS="$PREFLIGHT_VERDICT"
    RESULT_REASON="安装前预检发现工具链或代码门禁问题。"
    append_action "打开 reports/tv-box-preflight-latest.md，先修复里面列出的工具链或代码问题。"
  else
    RESULT_STATUS="needs_authorization_or_field_work"
    RESULT_REASON="真实盒子还没有进入可安装状态，或现场证据还没闭环。"
    append_action "先看 reports/tv-box-authorization-latest.md 和 reports/tv-box-site-readiness-card.html。"
    append_action "如果电视屏幕出现 RSA/网络调试弹窗，选择允许后重新执行 BOX_IP=<盒子IP> npm run tv-box:next。"
    append_action "没有实机时可以先发送交付包，但不能关闭真实盒子验收。"
  fi
fi

run_npm_step "交付总控" "tv-box:command-center"
run_npm_step "现场开工判定卡" "tv-box:site-readiness"

COMMAND_CENTER_STATUS="$(json_value_or_empty "$REPORT_DIR/tv-box-command-center-latest.json" "primaryNextAction.status")"
SITE_READINESS_STATUS="$(json_value_or_empty "$REPORT_DIR/tv-box-site-readiness-latest.json" "stage.status")"

if [[ "$RESULT_STATUS" == "needs_authorization_or_field_work" && "$COMMAND_CENTER_STATUS" == "needs_authorization" ]]; then
  RESULT_STATUS="needs_authorization"
  RESULT_REASON="交付总控判断当前唯一下一步是处理电视盒子 ADB/RSA 授权。"
fi

write_report
require_ready_if_needed
