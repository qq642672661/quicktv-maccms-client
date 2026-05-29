#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

source "$ROOT_DIR/scripts/android-env.sh"

BOX_IP="${BOX_IP:-}"
DEVICE_SERIAL="${DEVICE_SERIAL:-}"
REPORT_DIR="${REPORT_DIR:-$ROOT_DIR/reports}"
OUTPUT_MD="${TV_BOX_AUTHORIZATION_MD:-$REPORT_DIR/tv-box-authorization-latest.md}"
OUTPUT_JSON="${TV_BOX_AUTHORIZATION_JSON:-$REPORT_DIR/tv-box-authorization-latest.json}"
REQUIRE_AUTHORIZED="${REQUIRE_AUTHORIZED:-false}"

mkdir -p "$REPORT_DIR"
export TV_BOX_AUTHORIZATION_MD="$OUTPUT_MD"
export TV_BOX_AUTHORIZATION_JSON="$OUTPUT_JSON"

normalize_box_target() {
  local target="$1"
  if [[ "$target" == *":"* ]]; then
    printf '%s' "$target"
  else
    printf '%s:5555' "$target"
  fi
}

command_path() {
  command -v "$1" 2>/dev/null || true
}

append_action() {
  if [[ -z "$NEXT_ACTIONS_TEXT" ]]; then
    NEXT_ACTIONS_TEXT="$1"
  else
    NEXT_ACTIONS_TEXT="$NEXT_ACTIONS_TEXT"$'\n'"$1"
  fi
}

GENERATED_AT_UTC="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
ADB_PATH_VALUE="$(command_path adb)"
BOX_TARGET=""
ADB_CONNECT_OUTPUT=""
ADB_DEVICES_TEXT=""
AUTHORIZED_DEVICES=""
UNREADY_DEVICES=""
AUTHORIZED_DEVICE_COUNT="0"
UNREADY_DEVICE_COUNT="0"
DEVICE_STATUS="adb_missing"
SELECTED_DEVICE=""
NEXT_ACTIONS_TEXT=""

if [[ -z "$ADB_PATH_VALUE" ]]; then
  append_action "电脑缺少 adb；macOS 可先安装 Android Platform Tools，或安装 Android command-line tools。"
  append_action "安装完成后重新执行：BOX_IP=<盒子IP> npm run tv-box:authorize。"
else
  if [[ -n "$BOX_IP" ]]; then
    BOX_TARGET="$(normalize_box_target "$BOX_IP")"
    ADB_CONNECT_OUTPUT="$(adb connect "$BOX_TARGET" 2>&1 || true)"
  fi

  ADB_DEVICES_TEXT="$(adb devices -l 2>&1 || true)"
  AUTHORIZED_DEVICES="$(adb devices | awk 'NR > 1 && $2 == "device" { print $1 }')"
  UNREADY_DEVICES="$(adb devices | awk 'NR > 1 && ($2 == "unauthorized" || $2 == "offline") { print $1 ":" $2 }')"
  AUTHORIZED_DEVICE_COUNT="$(printf '%s\n' "$AUTHORIZED_DEVICES" | sed '/^$/d' | wc -l | tr -d ' ')"
  UNREADY_DEVICE_COUNT="$(printf '%s\n' "$UNREADY_DEVICES" | sed '/^$/d' | wc -l | tr -d ' ')"

  if [[ -n "$DEVICE_SERIAL" ]] && printf '%s\n' "$AUTHORIZED_DEVICES" | grep -Fxq "$DEVICE_SERIAL"; then
    DEVICE_STATUS="ready_for_install"
    SELECTED_DEVICE="$DEVICE_SERIAL"
  elif [[ -n "$DEVICE_SERIAL" ]]; then
    DEVICE_STATUS="target_not_authorized"
  elif [[ -n "$BOX_TARGET" ]] && printf '%s\n' "$AUTHORIZED_DEVICES" | grep -Fxq "$BOX_TARGET"; then
    DEVICE_STATUS="ready_for_install"
    SELECTED_DEVICE="$BOX_TARGET"
  elif [[ -n "$BOX_TARGET" ]] && printf '%s\n' "$UNREADY_DEVICES" | grep -Eq "^${BOX_TARGET//./\\.}:"; then
    DEVICE_STATUS="needs_rsa_authorization"
  elif [[ "$AUTHORIZED_DEVICE_COUNT" -eq 1 ]]; then
    DEVICE_STATUS="ready_for_install"
    SELECTED_DEVICE="$(printf '%s\n' "$AUTHORIZED_DEVICES" | sed '/^$/d' | sed -n '1p')"
  elif [[ "$AUTHORIZED_DEVICE_COUNT" -gt 1 ]]; then
    DEVICE_STATUS="needs_device_selection"
  elif [[ "$UNREADY_DEVICE_COUNT" -gt 0 ]]; then
    DEVICE_STATUS="needs_rsa_authorization"
  elif [[ -n "$BOX_TARGET" ]]; then
    DEVICE_STATUS="target_not_visible"
  else
    DEVICE_STATUS="no_box_target"
  fi

  case "$DEVICE_STATUS" in
    ready_for_install)
      append_action "授权已完成。下一步执行：BOX_IP=${BOX_IP:-<盒子IP>} RUN_CAMERA_SMOKE=true npm run tv-box:easy。"
      append_action "如果不是按 IP 连接，执行：DEVICE_SERIAL=$SELECTED_DEVICE RUN_CAMERA_SMOKE=true npm run tv-box:easy。"
      ;;
    needs_device_selection)
      append_action "电脑看到了多台已授权 Android 设备；先设置 DEVICE_SERIAL=<目标序列号>，避免装错电视盒子。"
      append_action "确认目标后执行：DEVICE_SERIAL=<目标序列号> npm run tv-box:authorize。"
      ;;
    needs_rsa_authorization|target_not_authorized)
      append_action "看电视屏幕是否出现“允许 USB 调试/网络调试/RSA”弹窗；选择允许，最好勾选始终允许。"
      append_action "没有弹窗时，在电视盒子里关闭再打开网络调试，或重启盒子后重新执行：BOX_IP=<盒子IP> npm run tv-box:authorize。"
      append_action "如果 adb 一直显示 offline，执行 adb disconnect 后重新执行本命令；仍失败就让现场拍网络调试页面和电视弹窗。"
      ;;
    target_not_visible)
      append_action "电脑没有看到目标盒子；确认 BOX_IP 是否就是电视盒子网络调试页面显示的 IP，电脑和盒子必须同网。"
      append_action "确认后执行：BOX_IP=$BOX_IP npm run tv-box:authorize。"
      ;;
    no_box_target)
      append_action "先在电视盒子打开开发者选项/网络调试，记下 IP，再执行：BOX_IP=<盒子IP> npm run tv-box:authorize。"
      append_action "没有真实盒子时可以先发交付包，但不能关闭实机验收。"
      ;;
  esac
fi

export GENERATED_AT_UTC ROOT_DIR BOX_IP DEVICE_SERIAL BOX_TARGET ADB_PATH_VALUE
export ADB_CONNECT_OUTPUT ADB_DEVICES_TEXT AUTHORIZED_DEVICES UNREADY_DEVICES
export AUTHORIZED_DEVICE_COUNT UNREADY_DEVICE_COUNT DEVICE_STATUS SELECTED_DEVICE NEXT_ACTIONS_TEXT

node <<'NODE' > "$OUTPUT_JSON"
const env = process.env
const lines = (value) => (value || '').split(/\n/).map((line) => line.trim()).filter(Boolean)
const emptyToNull = (value) => value ? value : null
const data = {
  generatedAtUtc: env.GENERATED_AT_UTC,
  projectRoot: env.ROOT_DIR,
  status: env.DEVICE_STATUS,
  readyForInstall: env.DEVICE_STATUS === 'ready_for_install',
  inputs: {
    boxIp: emptyToNull(env.BOX_IP),
    deviceSerial: emptyToNull(env.DEVICE_SERIAL),
    target: emptyToNull(env.BOX_TARGET)
  },
  adb: {
    path: emptyToNull(env.ADB_PATH_VALUE),
    connectOutput: emptyToNull(env.ADB_CONNECT_OUTPUT),
    devicesText: emptyToNull(env.ADB_DEVICES_TEXT),
    authorizedDevices: lines(env.AUTHORIZED_DEVICES),
    unreadyDevices: lines(env.UNREADY_DEVICES),
    authorizedCount: Number(env.AUTHORIZED_DEVICE_COUNT || 0),
    unreadyCount: Number(env.UNREADY_DEVICE_COUNT || 0),
    selectedDevice: emptyToNull(env.SELECTED_DEVICE)
  },
  nextActions: lines(env.NEXT_ACTIONS_TEXT)
}
process.stdout.write(JSON.stringify(data, null, 2) + '\n')
NODE

node <<'NODE' > "$OUTPUT_MD"
const fs = require('fs')
const data = JSON.parse(fs.readFileSync(process.env.TV_BOX_AUTHORIZATION_JSON, 'utf8'))
const list = (items) => items.length ? items.map((item) => `- ${item}`).join('\n') : '- 暂无'
const statusText = {
  ready_for_install: '已授权，可安装验收',
  needs_rsa_authorization: '盒子已出现，但需要在电视屏幕允许 RSA',
  needs_device_selection: '多台设备，需要指定目标',
  target_not_authorized: '指定设备未授权',
  target_not_visible: '没有看到目标盒子',
  no_box_target: '还没有提供盒子 IP',
  adb_missing: '电脑缺少 adb'
}[data.status] || data.status
const md = `# HelloTV 电视盒子 ADB/RSA 授权助手

- 生成时间 UTC: \`${data.generatedAtUtc}\`
- 状态: \`${data.status}\` / ${statusText}
- BOX_IP: \`${data.inputs.boxIp || '未提供'}\`
- DEVICE_SERIAL: \`${data.inputs.deviceSerial || '未提供'}\`
- 目标: \`${data.inputs.target || '未提供'}\`
- 已授权设备数: \`${data.adb.authorizedCount}\`
- 未授权/offline 设备数: \`${data.adb.unreadyCount}\`
- 选中设备: \`${data.adb.selectedDevice || '无'}\`

## 现场只做这些

1. 电视盒子和电脑连同一个网络。
2. 电视盒子打开“开发者选项 / 网络调试”，记下 IP。
3. 工程人员执行 \`BOX_IP=<盒子IP> npm run tv-box:authorize\`。
4. 电视屏幕出现“允许 USB 调试/网络调试/RSA”时选择允许。
5. 看到状态变成 \`ready_for_install\` 后，再安装和验收。

## 下一步

${list(data.nextActions)}

## ADB 设备列表

\`\`\`
${data.adb.devicesText || 'adb unavailable'}
\`\`\`
`
process.stdout.write(md)
NODE

echo "TV-box authorization report written to: $OUTPUT_MD"
echo "Machine-readable authorization report: $OUTPUT_JSON"

if [[ "$REQUIRE_AUTHORIZED" == "true" && "$DEVICE_STATUS" != "ready_for_install" ]]; then
  exit 1
fi
