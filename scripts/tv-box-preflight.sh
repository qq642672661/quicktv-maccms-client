#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

source "$ROOT_DIR/scripts/android-env.sh"

PACKAGE_NAME="${PACKAGE_NAME:-com.quicktvui.hellotv}"
BOX_IP="${BOX_IP:-}"
DEVICE_SERIAL="${DEVICE_SERIAL:-}"
REPORT_DIR="${REPORT_DIR:-$ROOT_DIR/reports}"
OUTPUT_MD="${TV_BOX_PREFLIGHT_MD:-$REPORT_DIR/tv-box-preflight-latest.md}"
OUTPUT_JSON="${TV_BOX_PREFLIGHT_JSON:-$REPORT_DIR/tv-box-preflight-latest.json}"
INSPECTION_PATH="${TV_BOX_INSPECTION_JSON:-$REPORT_DIR/tv-box-inspection-latest.json}"
HANDOFF_ARCHIVE_MARKER="${HANDOFF_LATEST_ARCHIVE_FILE:-$REPORT_DIR/tv-box-handoff-latest-archive.txt}"

mkdir -p "$REPORT_DIR"

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

sha256_file() {
  local path="$1"
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$path" | awk '{ print $1 }'
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$path" | awk '{ print $1 }'
  else
    return 1
  fi
}

json_value_or_empty() {
  local path="$1"
  local key_path="$2"
  [[ -f "$path" ]] || return 0
  node -e '
const fs = require("fs")
try {
  const data = JSON.parse(fs.readFileSync(process.argv[1], "utf8"))
  const value = process.argv[2].split(".").reduce((current, key) => current && current[key], data)
  if (value !== undefined && value !== null) process.stdout.write(String(value))
} catch {}
' "$path" "$key_path"
}

append_action() {
  if [[ -z "$NEXT_ACTIONS_TEXT" ]]; then
    NEXT_ACTIONS_TEXT="$1"
  else
    NEXT_ACTIONS_TEXT="$NEXT_ACTIONS_TEXT"$'\n'"$1"
  fi
}

NODE_PATH_VALUE="$(command_path node)"
NPM_PATH_VALUE="$(command_path npm)"
ADB_PATH_VALUE="$(command_path adb)"
JAVA_PATH_VALUE="$(command_path java)"
JAVA_HOME_VALUE="${JAVA_HOME:-}"
ANDROID_HOME_VALUE="${ANDROID_HOME:-}"

MISSING_TOOLS=()
[[ -n "$NODE_PATH_VALUE" ]] || MISSING_TOOLS+=("node")
[[ -n "$NPM_PATH_VALUE" ]] || MISSING_TOOLS+=("npm")
[[ -n "$ADB_PATH_VALUE" ]] || MISSING_TOOLS+=("adb")
[[ -n "$JAVA_PATH_VALUE" || -n "$JAVA_HOME_VALUE" ]] || MISSING_TOOLS+=("java/JDK")
[[ -n "$ANDROID_HOME_VALUE" ]] || MISSING_TOOLS+=("ANDROID_HOME")

REMOTE_SELF_TEST_STATUS="skip"
REMOTE_SELF_TEST_NOTE="npm missing"
if [[ -n "$NPM_PATH_VALUE" ]]; then
  if (cd "$ROOT_DIR" && npm run -s tv-box:remote-test >/tmp/hellotv-tv-box-preflight-remote-test.txt 2>&1); then
    REMOTE_SELF_TEST_STATUS="pass"
    REMOTE_SELF_TEST_NOTE="remote navigation logic passed"
  else
    REMOTE_SELF_TEST_STATUS="fail"
    REMOTE_SELF_TEST_NOTE="$(tail -20 /tmp/hellotv-tv-box-preflight-remote-test.txt | tr '\n' ' ' | sed 's/  */ /g')"
  fi
fi

APK_PATH="$(ls -t "$ROOT_DIR"/android/app/build/outputs/apk/debug/*_debug.apk 2>/dev/null | head -n 1 || true)"
APK_STATUS="missing"
APK_SIZE_BYTES=""
APK_SHA256=""
if [[ -n "$APK_PATH" && -f "$APK_PATH" ]]; then
  APK_STATUS="present"
  APK_SIZE_BYTES="$(wc -c < "$APK_PATH" | tr -d ' ')"
  APK_SHA256="$(sha256_file "$APK_PATH" || true)"
fi

HANDOFF_ARCHIVE_PATH=""
if [[ -f "$HANDOFF_ARCHIVE_MARKER" ]]; then
  HANDOFF_ARCHIVE_PATH="$(sed -n '1p' "$HANDOFF_ARCHIVE_MARKER")"
elif [[ -f "$REPORT_DIR/tv-box-handoff-latest.zip" ]]; then
  HANDOFF_ARCHIVE_PATH="$REPORT_DIR/tv-box-handoff-latest.zip"
elif [[ -f "$REPORT_DIR/tv-box-handoff-latest.tar.gz" ]]; then
  HANDOFF_ARCHIVE_PATH="$REPORT_DIR/tv-box-handoff-latest.tar.gz"
fi

HANDOFF_ARCHIVE_STATUS="missing"
HANDOFF_ARCHIVE_SHA256=""
HANDOFF_ARCHIVE_EXPECTED_SHA256=""
if [[ -n "$HANDOFF_ARCHIVE_PATH" && -f "$HANDOFF_ARCHIVE_PATH" ]]; then
  HANDOFF_ARCHIVE_STATUS="present"
  HANDOFF_ARCHIVE_SHA256="$(sha256_file "$HANDOFF_ARCHIVE_PATH" || true)"
  if [[ -f "$HANDOFF_ARCHIVE_PATH.sha256" ]]; then
    HANDOFF_ARCHIVE_EXPECTED_SHA256="$(awk '{ print $1 }' "$HANDOFF_ARCHIVE_PATH.sha256" | sed -n '1p')"
    if [[ -n "$HANDOFF_ARCHIVE_SHA256" && "$HANDOFF_ARCHIVE_SHA256" == "$HANDOFF_ARCHIVE_EXPECTED_SHA256" ]]; then
      HANDOFF_ARCHIVE_STATUS="verified"
    else
      HANDOFF_ARCHIVE_STATUS="checksum_mismatch"
    fi
  else
    HANDOFF_ARCHIVE_STATUS="missing_checksum"
  fi
fi

INSPECTION_REFRESH_STATUS="skip"
if [[ -n "$NPM_PATH_VALUE" && -f "$ROOT_DIR/scripts/tv-box-inspect.ts" ]]; then
  if (cd "$ROOT_DIR" && BOX_IP="$BOX_IP" DEVICE_SERIAL="$DEVICE_SERIAL" PACKAGE_NAME="$PACKAGE_NAME" TV_BOX_INSPECTION_JSON="$INSPECTION_PATH" npm run -s tv-box:inspect >/tmp/hellotv-tv-box-preflight-inspect.txt 2>&1); then
    INSPECTION_REFRESH_STATUS="pass"
  else
    INSPECTION_REFRESH_STATUS="fail"
  fi
fi

READINESS_LEVEL="$(json_value_or_empty "$INSPECTION_PATH" "readiness.level")"
READINESS_SUMMARY="$(json_value_or_empty "$INSPECTION_PATH" "readiness.humanSummary")"

BOX_TARGET=""
ADB_CONNECT_OUTPUT=""
AUTHORIZED_DEVICES=""
UNREADY_DEVICES=""
AUTHORIZED_DEVICE_COUNT="0"
UNREADY_DEVICE_COUNT="0"
DEVICE_STATUS="adb_missing"
SELECTED_DEVICE=""

if [[ -n "$ADB_PATH_VALUE" ]]; then
  if [[ -n "$BOX_IP" ]]; then
    BOX_TARGET="$(normalize_box_target "$BOX_IP")"
    ADB_CONNECT_OUTPUT="$(adb connect "$BOX_TARGET" 2>&1 || true)"
  fi

  AUTHORIZED_DEVICES="$(adb devices | awk 'NR > 1 && $2 == "device" { print $1 }')"
  UNREADY_DEVICES="$(adb devices | awk 'NR > 1 && ($2 == "unauthorized" || $2 == "offline") { print $1 ":" $2 }')"
  AUTHORIZED_DEVICE_COUNT="$(printf '%s\n' "$AUTHORIZED_DEVICES" | sed '/^$/d' | wc -l | tr -d ' ')"
  UNREADY_DEVICE_COUNT="$(printf '%s\n' "$UNREADY_DEVICES" | sed '/^$/d' | wc -l | tr -d ' ')"

  if [[ -n "$DEVICE_SERIAL" ]] && printf '%s\n' "$AUTHORIZED_DEVICES" | grep -Fxq "$DEVICE_SERIAL"; then
    DEVICE_STATUS="authorized"
    SELECTED_DEVICE="$DEVICE_SERIAL"
  elif [[ -n "$BOX_TARGET" ]] && printf '%s\n' "$AUTHORIZED_DEVICES" | grep -Fxq "$BOX_TARGET"; then
    DEVICE_STATUS="authorized"
    SELECTED_DEVICE="$BOX_TARGET"
  elif [[ "$AUTHORIZED_DEVICE_COUNT" -eq 1 ]]; then
    DEVICE_STATUS="authorized"
    SELECTED_DEVICE="$(printf '%s\n' "$AUTHORIZED_DEVICES" | sed '/^$/d' | sed -n '1p')"
  elif [[ "$AUTHORIZED_DEVICE_COUNT" -gt 1 ]]; then
    DEVICE_STATUS="multiple_authorized"
  elif [[ "$UNREADY_DEVICE_COUNT" -gt 0 ]]; then
    DEVICE_STATUS="unauthorized_or_offline"
  elif [[ -n "$BOX_IP" ]]; then
    DEVICE_STATUS="target_not_authorized"
  else
    DEVICE_STATUS="no_device"
  fi
fi

NEXT_ACTIONS_TEXT=""
VERDICT="handoff_ready_needs_box"

if [[ "${#MISSING_TOOLS[@]}" -gt 0 ]]; then
  VERDICT="needs_toolchain"
  append_action "先补齐电脑工具链：${MISSING_TOOLS[*]}。macOS 优先安装 Android Platform Tools、JDK 11 和 Android SDK 31。"
elif [[ "$REMOTE_SELF_TEST_STATUS" != "pass" ]]; then
  VERDICT="needs_code_fix"
  append_action "遥控器核心逻辑自测未通过，先修复 tv-box:remote-test 输出的问题。"
elif [[ "$APK_STATUS" != "present" && "$HANDOFF_ARCHIVE_STATUS" != "verified" ]]; then
  VERDICT="needs_build_or_handoff"
  append_action "还没有可交付 APK/交付压缩包，先执行 npm run tv-box:check。"
elif [[ "$DEVICE_STATUS" == "authorized" ]]; then
  VERDICT="ready_for_box_install"
  if [[ -n "$BOX_IP" ]]; then
    append_action "已找到授权盒子，执行 BOX_IP=$BOX_IP RUN_CAMERA_SMOKE=true npm run tv-box:easy。"
  else
    append_action "已找到授权盒子，执行 DEVICE_SERIAL=$SELECTED_DEVICE RUN_CAMERA_SMOKE=true npm run tv-box:easy。"
  fi
elif [[ "$DEVICE_STATUS" == "multiple_authorized" ]]; then
  VERDICT="needs_device_selection"
  append_action "电脑连接了多台 Android 设备，请设置 DEVICE_SERIAL=<目标序列号> 后再执行 tv-box:easy。"
elif [[ "$DEVICE_STATUS" == "unauthorized_or_offline" || "$DEVICE_STATUS" == "target_not_authorized" ]]; then
  VERDICT="needs_box_authorization"
  append_action "确认电视盒子和电脑同网，盒子已打开网络调试，并在电视屏幕允许 RSA 授权。"
  append_action "确认后重新执行 BOX_IP=<盒子IP> npm run tv-box:preflight。"
elif [[ "$HANDOFF_ARCHIVE_STATUS" == "verified" ]]; then
  VERDICT="handoff_ready_needs_box"
  append_action "把 reports/tv-box-handoff-latest.zip 发给现场人员，解压后先打开 START_HERE.html。"
  append_action "现场开启电视盒子网络调试并允许 RSA 授权后，执行 BOX_IP=<盒子IP> RUN_CAMERA_SMOKE=true npm run tv-box:easy。"
else
  VERDICT="needs_handoff_regeneration"
  append_action "交付压缩包还没有生成或缺少 SHA256 校验，先执行 npm run tv-box:check 后再发送现场。"
fi

if [[ "$HANDOFF_ARCHIVE_STATUS" == "checksum_mismatch" ]]; then
  VERDICT="needs_handoff_regeneration"
  NEXT_ACTIONS_TEXT=""
  append_action "交付压缩包 SHA256 与 sidecar 不一致，重新执行 npm run tv-box:check 后再发送现场。"
fi

GENERATED_AT_UTC="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
MISSING_TOOLS_TEXT="${MISSING_TOOLS[*]:-}"

export GENERATED_AT_UTC ROOT_DIR PACKAGE_NAME BOX_IP DEVICE_SERIAL VERDICT
export NODE_PATH_VALUE NPM_PATH_VALUE ADB_PATH_VALUE JAVA_PATH_VALUE JAVA_HOME_VALUE ANDROID_HOME_VALUE MISSING_TOOLS_TEXT
export REMOTE_SELF_TEST_STATUS REMOTE_SELF_TEST_NOTE APK_PATH APK_STATUS APK_SIZE_BYTES APK_SHA256
export HANDOFF_ARCHIVE_PATH HANDOFF_ARCHIVE_STATUS HANDOFF_ARCHIVE_SHA256 HANDOFF_ARCHIVE_EXPECTED_SHA256
export INSPECTION_PATH INSPECTION_REFRESH_STATUS READINESS_LEVEL READINESS_SUMMARY
export BOX_TARGET ADB_CONNECT_OUTPUT DEVICE_STATUS SELECTED_DEVICE AUTHORIZED_DEVICE_COUNT UNREADY_DEVICE_COUNT AUTHORIZED_DEVICES UNREADY_DEVICES
export NEXT_ACTIONS_TEXT

node <<'NODE' > "$OUTPUT_JSON"
const env = process.env
const splitLines = (value) => (value || '').split(/\n/).map((line) => line.trim()).filter(Boolean)
const splitWords = (value) => (value || '').split(/\s+/).map((line) => line.trim()).filter(Boolean)
const emptyToNull = (value) => value === undefined || value === '' ? null : value
const numberOrNull = (value) => value ? Number(value) : null
const data = {
  generatedAtUtc: env.GENERATED_AT_UTC,
  projectRoot: env.ROOT_DIR,
  packageName: env.PACKAGE_NAME,
  verdict: env.VERDICT,
  inputs: {
    boxIp: emptyToNull(env.BOX_IP),
    deviceSerial: emptyToNull(env.DEVICE_SERIAL),
    inspectionPath: env.INSPECTION_PATH,
  },
  toolchain: {
    node: emptyToNull(env.NODE_PATH_VALUE),
    npm: emptyToNull(env.NPM_PATH_VALUE),
    adb: emptyToNull(env.ADB_PATH_VALUE),
    java: emptyToNull(env.JAVA_PATH_VALUE),
    javaHome: emptyToNull(env.JAVA_HOME_VALUE),
    androidHome: emptyToNull(env.ANDROID_HOME_VALUE),
    missing: splitWords(env.MISSING_TOOLS_TEXT),
  },
  remoteSelfTest: {
    status: env.REMOTE_SELF_TEST_STATUS,
    note: emptyToNull(env.REMOTE_SELF_TEST_NOTE),
  },
  apk: {
    status: env.APK_STATUS,
    path: emptyToNull(env.APK_PATH),
    sizeBytes: numberOrNull(env.APK_SIZE_BYTES),
    sha256: emptyToNull(env.APK_SHA256),
  },
  handoffArchive: {
    status: env.HANDOFF_ARCHIVE_STATUS,
    path: emptyToNull(env.HANDOFF_ARCHIVE_PATH),
    sha256: emptyToNull(env.HANDOFF_ARCHIVE_SHA256),
    expectedSha256: emptyToNull(env.HANDOFF_ARCHIVE_EXPECTED_SHA256),
  },
  inspection: {
    refreshStatus: env.INSPECTION_REFRESH_STATUS,
    readinessLevel: emptyToNull(env.READINESS_LEVEL),
    readinessSummary: emptyToNull(env.READINESS_SUMMARY),
  },
  device: {
    status: env.DEVICE_STATUS,
    target: emptyToNull(env.BOX_TARGET),
    selected: emptyToNull(env.SELECTED_DEVICE),
    authorizedCount: Number(env.AUTHORIZED_DEVICE_COUNT || 0),
    unreadyCount: Number(env.UNREADY_DEVICE_COUNT || 0),
    authorizedDevices: splitLines(env.AUTHORIZED_DEVICES),
    unreadyDevices: splitLines(env.UNREADY_DEVICES),
    adbConnectOutput: emptyToNull(env.ADB_CONNECT_OUTPUT),
  },
  nextActions: splitLines(env.NEXT_ACTIONS_TEXT),
}
console.log(JSON.stringify(data, null, 2))
NODE

cat > "$OUTPUT_MD" <<PREFLIGHT
# HelloTV 电视盒子安装前自动预检

- 生成时间 UTC: \`$GENERATED_AT_UTC\`
- 结论: \`$VERDICT\`
- 项目目录: \`$ROOT_DIR\`
- 包名: \`$PACKAGE_NAME\`
- BOX_IP: \`${BOX_IP:-未提供}\`
- DEVICE_SERIAL: \`${DEVICE_SERIAL:-未提供}\`
- 机器检查 readiness: \`${READINESS_LEVEL:-未生成}\`

## 电脑工具链

| 项目 | 状态 |
| --- | --- |
| node | \`${NODE_PATH_VALUE:-missing}\` |
| npm | \`${NPM_PATH_VALUE:-missing}\` |
| adb | \`${ADB_PATH_VALUE:-missing}\` |
| java | \`${JAVA_PATH_VALUE:-missing}\` |
| JAVA_HOME | \`${JAVA_HOME_VALUE:-missing}\` |
| ANDROID_HOME | \`${ANDROID_HOME_VALUE:-missing}\` |
| 缺失项 | \`${MISSING_TOOLS_TEXT:-无}\` |

## 核心产物

| 项目 | 状态 |
| --- | --- |
| 遥控器逻辑自测 | \`$REMOTE_SELF_TEST_STATUS\` |
| Debug APK | \`$APK_STATUS\` |
| APK 路径 | \`${APK_PATH:-未生成}\` |
| APK SHA256 | \`${APK_SHA256:-未生成}\` |
| 交付压缩包 | \`$HANDOFF_ARCHIVE_STATUS\` |
| 交付压缩包路径 | \`${HANDOFF_ARCHIVE_PATH:-未生成}\` |
| 交付压缩包 SHA256 | \`${HANDOFF_ARCHIVE_SHA256:-未生成}\` |

## 电视盒子连接

| 项目 | 状态 |
| --- | --- |
| ADB 目标 | \`${BOX_TARGET:-未指定}\` |
| 设备状态 | \`$DEVICE_STATUS\` |
| 已授权设备数 | \`$AUTHORIZED_DEVICE_COUNT\` |
| 未授权/离线设备数 | \`$UNREADY_DEVICE_COUNT\` |
| 选中设备 | \`${SELECTED_DEVICE:-未选择}\` |

## 下一步

PREFLIGHT

while IFS= read -r action; do
  [[ -n "$action" ]] && printf -- '- %s\n' "$action" >> "$OUTPUT_MD"
done <<< "$NEXT_ACTIONS_TEXT"

cat >> "$OUTPUT_MD" <<PREFLIGHT

## 说明

- \`ready_for_box_install\`: 已经能连接授权盒子，可以执行一键安装和摄像头冒烟。
- \`handoff_ready_needs_box\`: 本地交付包可发送现场，但还需要真实盒子完成遥控器、摄像头和麦克风验收。
- \`needs_box_authorization\`: 重点看电视屏幕 RSA 授权弹窗、网络调试和盒子 IP。
- \`needs_toolchain\` / \`needs_build_or_handoff\`: 先修电脑环境或重新跑 \`npm run tv-box:check\`。
PREFLIGHT

echo "TV-box preflight written to:"
echo "$OUTPUT_MD"
echo "Machine-readable preflight:"
echo "$OUTPUT_JSON"

case "$VERDICT" in
  needs_toolchain|needs_code_fix|needs_build_or_handoff|needs_handoff_regeneration)
    exit 1
    ;;
esac
