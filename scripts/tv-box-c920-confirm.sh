#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROCUREMENT_JSON="${TV_BOX_C920_PROCUREMENT_JSON:-$ROOT_DIR/tv-box-field-state/c920-procurement.json}"
REPORT_DIR="${REPORT_DIR:-$ROOT_DIR/reports}"
LATEST_JSON="$REPORT_DIR/tv-box-c920-confirm-latest.json"
LATEST_MD="$REPORT_DIR/tv-box-c920-confirm-latest.md"

BOX_IP="${BOX_IP:-192.168.10.122}"
DEVICE_SERIAL="${DEVICE_SERIAL:-}"
CONFIRM_ALL_PASS="${C920_CONFIRM_ALL_PASS:-false}"
CONFIRM_DRY_RUN="${C920_CONFIRM_DRY_RUN:-false}"
CONFIRM_ALLOW_PARTIAL="${C920_CONFIRM_ALLOW_PARTIAL:-false}"
VIDEO_RESULT="${C920_CONFIRM_VIDEO:-${C920_VIDEO:-}}"
MIC_RESULT="${C920_CONFIRM_MIC:-${C920_MIC:-}}"
HOTPLUG_RESULT="${C920_CONFIRM_HOTPLUG:-${C920_HOTPLUG:-}}"
SUPPORT_CODE_RESULT="${C920_CONFIRM_SUPPORT_CODE:-${C920_SUPPORT_CODE:-}}"

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

C920_PURCHASE_CHANNEL="${C920_PURCHASE_CHANNEL:-$(json_value_or_empty "$PROCUREMENT_JSON" "purchaseChannel")}"
C920_EXPECTED_ARRIVAL_DATE="${C920_EXPECTED_ARRIVAL_DATE:-$(json_value_or_empty "$PROCUREMENT_JSON" "expectedArrivalDate")}"
C920_PURCHASE_NOTE="${C920_PURCHASE_NOTE:-$(json_value_or_empty "$PROCUREMENT_JSON" "note")}"

usage() {
  cat <<'EOF'
Usage:
  npm run tv-box:c920-confirm
  C920_CONFIRM_ALL_PASS=true npm run tv-box:c920-confirm
  C920_CONFIRM_VIDEO=pass C920_CONFIRM_MIC=fail C920_CONFIRM_HOTPLUG=pass C920_CONFIRM_SUPPORT_CODE=pass npm run tv-box:c920-confirm

Options:
  --all-pass              Mark preview, microphone, hotplug, and support-code as pass.
  --video <result>        pass / fail / na / skip / unknown.
  --mic <result>          pass / fail / na / skip / unknown.
  --hotplug <result>      pass / fail / na / skip / unknown.
  --support-code <result> pass / fail / na / skip / unknown.
  --allow-partial         Run even if some fields are unknown.
  --dry-run               Write the confirmation card without running acceptance.
EOF
}

is_truthy() {
  case "$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]')" in
    true|1|yes|y|pass|ok|force) return 0 ;;
    *) return 1 ;;
  esac
}

normalize_result() {
  local value
  value="$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]' | xargs)"
  case "$value" in
    y|yes|p|pass|ok|true|1|通过) printf 'pass' ;;
    n|no|f|fail|failed|false|0|失败) printf 'fail' ;;
    s|skip|跳过) printf 'skip' ;;
    na|n/a|none|not_applicable|not-applicable|不适用) printf 'na' ;;
    u|unknown|unk|未确认|'') printf 'unknown' ;;
    *) printf 'unknown' ;;
  esac
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --all-pass)
      CONFIRM_ALL_PASS=true
      shift
      ;;
    --video)
      VIDEO_RESULT="${2:-}"
      shift 2
      ;;
    --video=*)
      VIDEO_RESULT="${1#*=}"
      shift
      ;;
    --mic|--microphone)
      MIC_RESULT="${2:-}"
      shift 2
      ;;
    --mic=*|--microphone=*)
      MIC_RESULT="${1#*=}"
      shift
      ;;
    --hotplug)
      HOTPLUG_RESULT="${2:-}"
      shift 2
      ;;
    --hotplug=*)
      HOTPLUG_RESULT="${1#*=}"
      shift
      ;;
    --support-code)
      SUPPORT_CODE_RESULT="${2:-}"
      shift 2
      ;;
    --support-code=*)
      SUPPORT_CODE_RESULT="${1#*=}"
      shift
      ;;
    --allow-partial)
      CONFIRM_ALLOW_PARTIAL=true
      shift
      ;;
    --dry-run|--no-run)
      CONFIRM_DRY_RUN=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "ERROR: Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if is_truthy "$CONFIRM_ALL_PASS"; then
  VIDEO_RESULT=pass
  MIC_RESULT=pass
  HOTPLUG_RESULT=pass
  SUPPORT_CODE_RESULT=pass
fi

VIDEO_RESULT="$(normalize_result "$VIDEO_RESULT")"
MIC_RESULT="$(normalize_result "$MIC_RESULT")"
HOTPLUG_RESULT="$(normalize_result "$HOTPLUG_RESULT")"
SUPPORT_CODE_RESULT="$(normalize_result "$SUPPORT_CODE_RESULT")"

missing=()
[[ "$VIDEO_RESULT" == "unknown" ]] && missing+=("电视真实画面")
[[ "$MIC_RESULT" == "unknown" ]] && missing+=("C920 麦克风/业务音频")
[[ "$HOTPLUG_RESULT" == "unknown" ]] && missing+=("USB 热插拔")
[[ "$SUPPORT_CODE_RESULT" == "unknown" ]] && missing+=("维护码照片/可读性")

status="ready_to_write"
if [[ ${#missing[@]} -gt 0 ]] && ! is_truthy "$CONFIRM_ALLOW_PARTIAL"; then
  status="needs_confirmation"
elif is_truthy "$CONFIRM_DRY_RUN"; then
  status="dry_run_ready_to_write"
fi

write_report() {
  local report_status="$1"
  local missing_json
  missing_json="[]"
  if [[ ${#missing[@]} -gt 0 ]]; then
    missing_json="$(node -e 'process.stdout.write(JSON.stringify(process.argv.slice(1)))' "${missing[@]}")"
  fi
  node - "$LATEST_JSON" "$LATEST_MD" "$ROOT_DIR" "$REPORT_DIR" "$report_status" "$BOX_IP" "$DEVICE_SERIAL" "$VIDEO_RESULT" "$MIC_RESULT" "$HOTPLUG_RESULT" "$SUPPORT_CODE_RESULT" "$C920_PURCHASE_CHANNEL" "$C920_EXPECTED_ARRIVAL_DATE" "$C920_PURCHASE_NOTE" "$missing_json" <<'NODE'
const fs = require('fs')
const path = require('path')

const [
  latestJsonPath,
  latestMarkdownPath,
  rootDir,
  reportDir,
  status,
  boxIp,
  deviceSerial,
  videoResult,
  micResult,
  hotplugResult,
  supportCodeResult,
  purchaseChannel,
  expectedArrivalDate,
  purchaseNote,
  missingJson
] = process.argv.slice(2)

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

function resultLabel(value) {
  if (value === 'pass') return '通过'
  if (value === 'fail') return '失败'
  if (value === 'na') return '不适用'
  if (value === 'skip') return '跳过'
  return '未确认'
}

function markdownList(items) {
  return items.length ? items.map((item) => `- ${item}`).join('\n') : '- 无'
}

const acceptancePath = path.join(reportDir, 'tv-box-c920-pro-acceptance-latest.json')
const fieldRecordPath = path.join(reportDir, 'tv-box-field-record-latest.json')
const acceptance = readJson(acceptancePath)
const fieldRecord = readJson(fieldRecordPath)
let missing = []
try {
  missing = JSON.parse(missingJson || '[]')
} catch {
  missing = []
}
const generatedAtUtc = new Date().toISOString()
const allPassCommand = `BOX_IP=${boxIp || '192.168.10.122'} C920_CONFIRM_ALL_PASS=true npm run tv-box:c920-confirm`
const mixedCommand = `BOX_IP=${boxIp || '192.168.10.122'} C920_CONFIRM_VIDEO=pass C920_CONFIRM_MIC=fail C920_CONFIRM_HOTPLUG=pass C920_CONFIRM_SUPPORT_CODE=pass npm run tv-box:c920-confirm`

const report = {
  generatedAtUtc,
  projectRoot: rootDir,
  status,
  boxIp,
  deviceSerial,
  procurement: {
    purchaseChannel,
    expectedArrivalDate,
    note: purchaseNote
  },
  fieldInputs: {
    cameraPreview: videoResult,
    audioInput: micResult,
    usbHotplug: hotplugResult,
    supportCode: supportCodeResult
  },
  missingConfirmations: missing,
  commands: {
    allPass: allPassCommand,
    mixedExample: mixedCommand,
    customTemplate: `BOX_IP=${boxIp || '192.168.10.122'} C920_CONFIRM_VIDEO=<pass|fail|na> C920_CONFIRM_MIC=<pass|fail|na> C920_CONFIRM_HOTPLUG=<pass|fail|na> C920_CONFIRM_SUPPORT_CODE=<pass|fail|na> npm run tv-box:c920-confirm`
  },
  latestAcceptance: acceptance ? {
    generatedAtUtc: acceptance.generatedAtUtc,
    fieldDecision: acceptance.fieldDecision?.level || '',
    status: acceptance.status || '',
    fieldResults: acceptance.fieldResults || {},
    nextActions: acceptance.nextActions || []
  } : null,
  latestFieldRecord: fieldRecord ? {
    recordId: fieldRecord.recordId,
    verdict: fieldRecord.verdict,
    checks: fieldRecord.checks
  } : null,
  closeGuards: [
    '只有电视上看到 C920 PRO 真实实时画面，C920_CONFIRM_VIDEO 才能填 pass。',
    '只有录音/互动课/业务链路确认声音进入系统，C920_CONFIRM_MIC 才能填 pass。',
    '只有拔插 C920 后还能重新识别并预览，C920_CONFIRM_HOTPLUG 才能填 pass。',
    '维护码可读或已拍照回传，C920_CONFIRM_SUPPORT_CODE 才能填 pass。'
  ]
}

fs.mkdirSync(reportDir, { recursive: true })
fs.writeFileSync(latestJsonPath, `${JSON.stringify(report, null, 2)}\n`)

const md = `# C920 PRO 人工确认写入卡

- 生成时间 UTC: \`${generatedAtUtc}\`
- 状态: \`${status}\`
- 盒子 IP: \`${boxIp || '未填写'}\`
- 采购/预计到货: \`${purchaseChannel || '未记录'} / ${expectedArrivalDate || '未记录'}\`

## 当前确认结果

| 项目 | 结果 |
| --- | --- |
| 电视真实画面 | \`${videoResult}\` / ${resultLabel(videoResult)} |
| C920 麦克风/业务音频 | \`${micResult}\` / ${resultLabel(micResult)} |
| USB 热插拔 | \`${hotplugResult}\` / ${resultLabel(hotplugResult)} |
| 维护码可读/已拍照 | \`${supportCodeResult}\` / ${resultLabel(supportCodeResult)} |

## 现在该怎么做

${status === 'needs_confirmation'
  ? `先看电视和现场证据，补齐这些确认项：${missing.join('、') || '无'}。\n\n全部确认通过时运行：\n\n\`\`\`bash\n${allPassCommand}\n\`\`\`\n\n如果有失败或不适用，用逐项命令：\n\n\`\`\`bash\n${report.commands.customTemplate}\n\`\`\``
  : status === 'dry_run_ready_to_write'
    ? `这是 dry-run，没有写入真实验收。确认命令可用后去掉 \`C920_CONFIRM_DRY_RUN=true\` 或 \`--dry-run\` 再运行。`
    : `已把确认结果交给 C920 验收链路写入兼容性记录、硬件画像、完成度审计和到货卡。`}

## 不能误填 pass 的边界

${markdownList(report.closeGuards)}

## 最近一次 C920 验收

- 验收报告: \`${path.relative(rootDir, acceptancePath)}\`
- 到货判定: \`${report.latestAcceptance?.fieldDecision || '未生成'}\`
- 验收状态: \`${report.latestAcceptance?.status || '未生成'}\`
- 最新现场记录: \`${report.latestFieldRecord?.recordId || '未生成'}\`
- 最新记录结论: \`${report.latestFieldRecord?.verdict || '未生成'}\`

## 相关文件

- \`${path.relative(rootDir, latestJsonPath)}\`
- \`reports/tv-box-c920-pro-acceptance-latest.md\`
- \`reports/tv-box-c920-arrival-card-latest.md\`
- \`reports/tv-box-completion-audit-latest.md\`
`

fs.writeFileSync(latestMarkdownPath, md)
NODE
}

if [[ "$status" == "needs_confirmation" ]]; then
  write_report "$status"
  echo "C920 confirmation card: $LATEST_MD"
  echo "Status: $status"
  echo "Missing: ${missing[*]:-none}"
  exit 0
fi

if [[ "$status" == "dry_run_ready_to_write" ]]; then
  write_report "$status"
  echo "C920 confirmation dry-run card: $LATEST_MD"
  echo "Status: $status"
  exit 0
fi

echo "== C920 PRO 人工确认写入 =="
echo "Box IP: $BOX_IP"
echo "Video: $VIDEO_RESULT"
echo "Microphone: $MIC_RESULT"
echo "Hotplug: $HOTPLUG_RESULT"
echo "Support code: $SUPPORT_CODE_RESULT"

env \
  BOX_IP="$BOX_IP" \
  DEVICE_SERIAL="$DEVICE_SERIAL" \
  C920_PHYSICAL_STATUS="${C920_PHYSICAL_STATUS:-inserted}" \
  C920_PURCHASE_CHANNEL="$C920_PURCHASE_CHANNEL" \
  C920_EXPECTED_ARRIVAL_DATE="$C920_EXPECTED_ARRIVAL_DATE" \
  C920_PURCHASE_NOTE="$C920_PURCHASE_NOTE" \
  FIELD_CAMERA_PREVIEW="$VIDEO_RESULT" \
  FIELD_AUDIO_INPUT="$MIC_RESULT" \
  FIELD_USB_HOTPLUG="$HOTPLUG_RESULT" \
  FIELD_SUPPORT_CODE="$SUPPORT_CODE_RESULT" \
  FIELD_APPEND_MATRIX="${FIELD_APPEND_MATRIX:-true}" \
  INTERACTIVE=false \
  "$ROOT_DIR/scripts/tv-box-c920-pro-acceptance.sh"

write_report "acceptance_written"

echo
echo "C920 confirmation report: $LATEST_MD"
echo "Machine-readable confirmation: $LATEST_JSON"
