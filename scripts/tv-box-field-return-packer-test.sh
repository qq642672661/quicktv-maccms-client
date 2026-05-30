#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPORT_DIR="${REPORT_DIR:-$ROOT_DIR/reports}"
ARCHIVE_MARKER="${HANDOFF_LATEST_ARCHIVE_FILE:-$REPORT_DIR/tv-box-handoff-latest-archive.txt}"
ARCHIVE_PATH="${HANDOFF_ARCHIVE_PATH:-}"
OUTPUT_DIR="${TV_BOX_FIELD_RETURN_PACKER_TEST_DIR:-$REPORT_DIR/tv-box-field-return-packer-test}"
OUTPUT_JSON="${TV_BOX_FIELD_RETURN_PACKER_TEST_JSON:-$REPORT_DIR/tv-box-field-return-packer-test-latest.json}"
OUTPUT_MD="${TV_BOX_FIELD_RETURN_PACKER_TEST_MD:-$REPORT_DIR/tv-box-field-return-packer-test-latest.md}"

TMP_ROOT="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_ROOT"
}

fail() {
  echo "ERROR: $1" >&2
  exit 1
}

require_file() {
  local file_path="$1"
  local label="$2"
  [[ -f "$file_path" ]] || fail "$label is missing: $file_path"
}

require_text() {
  local file_path="$1"
  local needle="$2"
  local label="$3"
  grep -Fq -- "$needle" "$file_path" || fail "$label not found in $file_path"
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

trap cleanup EXIT

cd "$ROOT_DIR"
mkdir -p "$REPORT_DIR" "$OUTPUT_DIR"

if [[ -z "$ARCHIVE_PATH" ]]; then
  require_file "$ARCHIVE_MARKER" "handoff archive marker"
  ARCHIVE_PATH="$(sed -n '1p' "$ARCHIVE_MARKER")"
fi

[[ -n "$ARCHIVE_PATH" ]] || fail "handoff archive path is empty"
require_file "$ARCHIVE_PATH" "handoff archive"

case "$ARCHIVE_PATH" in
  *.zip)
    command -v unzip >/dev/null 2>&1 || fail "unzip is required to test the handoff zip"
    unzip -q "$ARCHIVE_PATH" -d "$TMP_ROOT"
    ;;
  *.tar.gz)
    tar -xzf "$ARCHIVE_PATH" -C "$TMP_ROOT"
    ;;
  *)
    fail "unsupported handoff archive type: $ARCHIVE_PATH"
    ;;
esac

HANDOFF_DIR="$TMP_ROOT/tv-box-handoff"
RETURN_DIR="$HANDOFF_DIR/FIELD_RETURN"
RETURN_PACKER="$HANDOFF_DIR/PACK_FIELD_RETURN_ON_MAC.command"
WINDOWS_RETURN_PACKER="$HANDOFF_DIR/PACK_FIELD_RETURN_ON_WINDOWS.bat"

[[ -d "$HANDOFF_DIR" ]] || fail "handoff archive must contain top-level tv-box-handoff directory"
require_file "$RETURN_PACKER" "macOS field return packer"
[[ -x "$RETURN_PACKER" ]] || fail "macOS field return packer is not executable"
require_file "$WINDOWS_RETURN_PACKER" "Windows field return packer"
require_text "$WINDOWS_RETURN_PACKER" "powershell -NoProfile" "Windows return packer invokes PowerShell"
require_text "$WINDOWS_RETURN_PACKER" "Compress-Archive" "Windows return packer creates zip archive"
require_text "$WINDOWS_RETURN_PACKER" "FIELD_RETURN" "Windows return packer reads FIELD_RETURN folder"
require_text "$WINDOWS_RETURN_PACKER" "INSTALL_LOG.txt" "Windows return packer includes install log"
require_text "$WINDOWS_RETURN_PACKER" "tv-box-support-latest.zip" "Windows return packer includes support bundle"
require_text "$WINDOWS_RETURN_PACKER" "HelloTV-field-return-%STAMP%.zip" "Windows return packer uses standard archive name"
require_text "$WINDOWS_RETURN_PACKER" "FIELD_RETURN_PACK_LOG.txt" "Windows return packer writes pack log"
require_text "$WINDOWS_RETURN_PACKER" "C920_PREVIEW_TV_SCREEN" "Windows return packer writes C920 evidence note"
require_text "$WINDOWS_RETURN_PACKER" "C920 预览证据数" "Windows return packer counts C920 preview evidence"
require_text "$WINDOWS_RETURN_PACKER" "tv-box-c920-pro-acceptance-latest.md/json" "Windows return packer warns about paired C920 acceptance report"

rm -rf "$RETURN_DIR"
mkdir -p "$RETURN_DIR"

node - "$ROOT_DIR" "$RETURN_DIR/field-wizard-all-pass.json" <<'NODE'
const fs = require('fs')
const path = require('path')

const rootDir = process.argv[2]
const outputPath = process.argv[3]
const {
  textPrompts,
  resultPrompts,
  schemaVersion
} = require(path.join(rootDir, 'scripts/tv-box-field-wizard-schema'))

const textDefaults = {
  BOX_IP: '192.0.2.10',
  DEVICE_SERIAL: '192.0.2.10:5555',
  FIELD_OPERATOR: 'field-return-packer-self-test',
  FIELD_LOCATION: 'automation-lab',
  FIELD_BOX_BRAND: 'HelloTV Synthetic Box',
  FIELD_BOX_MODEL: 'Return Packer Self Test',
  FIELD_ANDROID_SDK: '31',
  FIELD_REMOTE_MODEL: 'Synthetic Remote',
  FIELD_CAMERA_MODEL: 'Synthetic UVC Camera',
  FIELD_CAMERA_CONNECTION: 'usb',
  FIELD_MICROPHONE_MODEL: 'Synthetic USB Microphone',
  FIELD_MICROPHONE_CONNECTION: 'usb',
  FIELD_NOTES: 'Synthetic all-pass record used only to verify FIELD_RETURN packing and return-inbox QA.',
  FIELD_APPEND_MATRIX: 'false'
}

const env = {}
for (const [key] of textPrompts) {
  env[key] = textDefaults[key] || ''
}
for (const [key] of resultPrompts) {
  env[key] = 'pass'
}
env.FIELD_NOTES = textDefaults.FIELD_NOTES
env.FIELD_APPEND_MATRIX = textDefaults.FIELD_APPEND_MATRIX

const record = {
  generatedAtUtc: new Date().toISOString(),
  schemaVersion,
  tool: 'FIELD_WIZARD_OFFLINE.html',
  projectRoot: 'field-return-packer-self-test',
  dryRun: false,
  appendMatrix: false,
  env
}

fs.writeFileSync(outputPath, `${JSON.stringify(record, null, 2)}\n`)
NODE

cat > "$RETURN_DIR/support-code-photo.png" <<'SUPPORTPHOTO'
synthetic support-code photo placeholder for return-inbox filename classification
SUPPORTPHOTO

cat > "$RETURN_DIR/INSTALL_LOG.txt" <<'INSTALLLOG'
HelloTV synthetic install log
result: pass
purpose: field return packer self-test
INSTALLLOG

"$RETURN_PACKER" >/tmp/hellotv-field-return-packer-test.out 2>/tmp/hellotv-field-return-packer-test.err || {
  cat /tmp/hellotv-field-return-packer-test.out >&2 || true
  cat /tmp/hellotv-field-return-packer-test.err >&2 || true
  fail "macOS field return packer failed"
}

RETURN_ZIP="$(ls -t "$HANDOFF_DIR"/HelloTV-field-return-*.zip 2>/dev/null | head -n 1 || true)"
[[ -n "$RETURN_ZIP" ]] || fail "field return packer did not create HelloTV-field-return-*.zip"

if command -v unzip >/dev/null 2>&1; then
  ZIP_LISTING="$(unzip -l "$RETURN_ZIP")"
  grep -Fq "HelloTV-field-return/RETURN_NOTE.txt" <<< "$ZIP_LISTING" || fail "return zip is missing RETURN_NOTE.txt"
  grep -Fq "HelloTV-field-return/INSTALL_LOG.txt" <<< "$ZIP_LISTING" || fail "return zip is missing INSTALL_LOG.txt"
  PACKED_RETURN_DIR="$TMP_ROOT/packed-return"
  mkdir -p "$PACKED_RETURN_DIR"
  unzip -q "$RETURN_ZIP" -d "$PACKED_RETURN_DIR"
  require_text "$PACKED_RETURN_DIR/HelloTV-field-return/RETURN_NOTE.txt" "C920_PREVIEW_TV_SCREEN" "return note includes C920 preview evidence filename"
  require_text "$PACKED_RETURN_DIR/HelloTV-field-return/RETURN_NOTE.txt" "C920_MIC_BUSINESS_INPUT" "return note includes C920 microphone evidence filename"
  require_text "$PACKED_RETURN_DIR/HelloTV-field-return/RETURN_NOTE.txt" "C920_HOTPLUG_RETEST" "return note includes C920 hotplug evidence filename"
  require_text "$PACKED_RETURN_DIR/HelloTV-field-return/RETURN_NOTE.txt" "SUPPORT_CODE_C920" "return note includes C920 support-code evidence filename"
fi

require_text "$HANDOFF_DIR/FIELD_RETURN_PACK_LOG.txt" "C920 证据线索数" "macOS return packer logs C920 evidence context"
require_text "$HANDOFF_DIR/FIELD_RETURN_PACK_LOG.txt" "C920 预览证据数" "macOS return packer logs C920 preview evidence count"

SELFTEST_REPORT_DIR="$TMP_ROOT/reports"
REPORT_DIR="$SELFTEST_REPORT_DIR" npm run -s tv-box:return-inbox -- "$RETURN_ZIP" >/tmp/hellotv-return-inbox-test.out 2>/tmp/hellotv-return-inbox-test.err || {
  cat /tmp/hellotv-return-inbox-test.out >&2 || true
  cat /tmp/hellotv-return-inbox-test.err >&2 || true
  fail "return-inbox failed to accept the packed return zip"
}

RETURN_INBOX_JSON="$SELFTEST_REPORT_DIR/tv-box-return-inbox-latest.json"
require_file "$RETURN_INBOX_JSON" "return inbox self-test JSON"

READINESS_LEVEL="$(json_value "$RETURN_INBOX_JSON" "readiness.level")"
CLOSURE_STATUS="$(json_value "$RETURN_INBOX_JSON" "closure.status")"
FIELD_JSON_COUNT="$(json_value "$RETURN_INBOX_JSON" "evidence.fieldJsons.length")"
SUPPORT_PHOTO_COUNT="$(json_value "$RETURN_INBOX_JSON" "evidence.supportCodePhotos.length")"
INSTALL_LOG_COUNT="$(json_value "$RETURN_INBOX_JSON" "evidence.installLogs.length")"
FIELD_INBOX_SKIPPED="$(json_value "$RETURN_INBOX_JSON" "fieldInboxRun.skipped")"
FIELD_INBOX_EXIT_CODE="$(json_value "$RETURN_INBOX_JSON" "fieldInboxRun.exitCode")"

[[ "$READINESS_LEVEL" == "ready_for_engineering_import" ]] || fail "return inbox readiness must be ready_for_engineering_import, got $READINESS_LEVEL"
[[ "$CLOSURE_STATUS" == "ready_to_close" ]] || fail "return inbox closure status must be ready_to_close, got $CLOSURE_STATUS"
[[ "$FIELD_JSON_COUNT" != "0" ]] || fail "return inbox did not find field JSON"
[[ "$SUPPORT_PHOTO_COUNT" != "0" ]] || fail "return inbox did not classify support-code photo"
[[ "$INSTALL_LOG_COUNT" != "0" ]] || fail "return inbox did not find INSTALL_LOG.txt"
[[ "$FIELD_INBOX_SKIPPED" == "false" ]] || fail "return inbox should dry-run field-inbox instead of skipping it"
[[ "$FIELD_INBOX_EXIT_CODE" == "0" ]] || fail "field-inbox dry-run exit code must be 0, got $FIELD_INBOX_EXIT_CODE"

STAMP="$(date -u '+%Y%m%dT%H%M%SZ')"
OUTPUT_ZIP="$OUTPUT_DIR/HelloTV-field-return-self-test-$STAMP.zip"
cp "$RETURN_ZIP" "$OUTPUT_ZIP"
cp "$RETURN_INBOX_JSON" "$OUTPUT_DIR/tv-box-return-inbox-self-test-$STAMP.json"

rm -rf "$RETURN_DIR"
mkdir -p "$RETURN_DIR"
cat > "$RETURN_DIR/tv-box-c920-pro-acceptance-latest.json" <<'C920PARTIAL'
{
  "status": "needs_camera_follow_up",
  "fieldDecision": {
    "level": "preview_opened_needs_visual_confirmation"
  }
}
C920PARTIAL

"$RETURN_PACKER" >/tmp/hellotv-field-return-packer-c920-partial.out 2>/tmp/hellotv-field-return-packer-c920-partial.err || {
  cat /tmp/hellotv-field-return-packer-c920-partial.out >&2 || true
  cat /tmp/hellotv-field-return-packer-c920-partial.err >&2 || true
  fail "macOS field return packer failed on partial C920 evidence"
}

require_text "$HANDOFF_DIR/FIELD_RETURN_PACK_LOG.txt" "C920 证据线索数: 1" "macOS return packer detects partial C920 context"
require_text "$HANDOFF_DIR/FIELD_RETURN_PACK_LOG.txt" "提醒: C920 回传缺少 C920_PREVIEW_TV_SCREEN.jpg/mp4。" "macOS return packer warns about missing C920 preview"
require_text "$HANDOFF_DIR/FIELD_RETURN_PACK_LOG.txt" "提醒: C920 回传缺少 C920_MIC_BUSINESS_INPUT.mp4/txt。" "macOS return packer warns about missing C920 microphone"
require_text "$HANDOFF_DIR/FIELD_RETURN_PACK_LOG.txt" "提醒: C920 回传缺少 C920_HOTPLUG_RETEST.jpg/txt。" "macOS return packer warns about missing C920 hotplug"
require_text "$HANDOFF_DIR/FIELD_RETURN_PACK_LOG.txt" "提醒: C920 回传缺少 SUPPORT_CODE_C920.jpg。" "macOS return packer warns about missing C920 support-code photo"
require_text "$HANDOFF_DIR/FIELD_RETURN_PACK_LOG.txt" "提醒: C920 回传缺少 tv-box-c920-pro-acceptance-latest.md/json 成对报告。" "macOS return packer warns about missing paired C920 report"

GENERATED_AT_UTC="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
node - "$OUTPUT_JSON" "$GENERATED_AT_UTC" "$ARCHIVE_PATH" "$OUTPUT_ZIP" "$READINESS_LEVEL" "$CLOSURE_STATUS" "$FIELD_JSON_COUNT" "$SUPPORT_PHOTO_COUNT" "$INSTALL_LOG_COUNT" "$FIELD_INBOX_EXIT_CODE" <<'NODE'
const fs = require('fs')
const [
  outputJson,
  generatedAtUtc,
  handoffArchive,
  returnArchive,
  readinessLevel,
  closureStatus,
  fieldJsonCount,
  supportPhotoCount,
  installLogCount,
  returnInboxExitCode
] = process.argv.slice(2)

const report = {
  generatedAtUtc,
  status: 'pass',
  readinessLevel,
  closureStatus,
  handoffArchive,
  returnArchive,
  evidence: {
    fieldJsonCount: Number(fieldJsonCount),
    supportPhotoCount: Number(supportPhotoCount),
    installLogCount: Number(installLogCount),
    windowsPackerStaticChecks: 10
  },
  returnInboxExitCode: Number(returnInboxExitCode),
  checks: [
    'extracted latest handoff archive',
    'validated Windows return packer static safeguards',
    'populated FIELD_RETURN with all-pass JSON, support-code photo, and INSTALL_LOG.txt',
    'ran PACK_FIELD_RETURN_ON_MAC.command from the extracted handoff package',
    'validated the generated zip with tv-box:return-inbox',
    'confirmed return-inbox readiness ready_for_engineering_import and closure ready_to_close'
  ]
}

fs.writeFileSync(outputJson, `${JSON.stringify(report, null, 2)}\n`)
NODE

cat > "$OUTPUT_MD" <<MARKDOWN
# HelloTV 现场回传打包器自测

- 生成时间 UTC: \`$GENERATED_AT_UTC\`
- 状态: \`pass\`
- readiness: \`$READINESS_LEVEL\`
- 关闭判定: \`$CLOSURE_STATUS\`
- 交付包: \`$ARCHIVE_PATH\`
- 自测回传 zip: \`$OUTPUT_ZIP\`
- 有效现场 JSON: \`$FIELD_JSON_COUNT\`
- 维护码照片: \`$SUPPORT_PHOTO_COUNT\`
- 安装日志: \`$INSTALL_LOG_COUNT\`
- Windows 打包器静态保护项: \`10\`
- field-inbox dry-run exitCode: \`$FIELD_INBOX_EXIT_CODE\`

## 结论

已从最新交付包解压，先静态验证 Windows 回传打包器包含 PowerShell 压缩、标准 zip 命名、FIELD_RETURN、INSTALL_LOG、support zip 和打包日志保护项；再模拟现场把 JSON、维护码照片和 INSTALL_LOG.txt 放入 \`FIELD_RETURN\`，执行 \`PACK_FIELD_RETURN_ON_MAC.command\` 生成 \`HelloTV-field-return-*.zip\`，最后用 \`tv-box:return-inbox\` 质检到 \`ready_for_engineering_import\` 和 \`ready_to_close\`。
MARKDOWN

echo "TV-box field return packer self-test passed."
echo "Report: $OUTPUT_MD"
echo "Archive: $OUTPUT_ZIP"
