#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPORT_DIR="${REPORT_DIR:-$ROOT_DIR/reports}"
ARCHIVE_MARKER="${HANDOFF_LATEST_ARCHIVE_FILE:-$REPORT_DIR/tv-box-handoff-latest-archive.txt}"
ARCHIVE_PATH="${HANDOFF_ARCHIVE_PATH:-}"

TMP_ROOT="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_ROOT"
}

fail() {
  echo "ERROR: $1" >&2
  exit 1
}

require_file() {
  local path="$1"
  local label="$2"
  [[ -f "$path" ]] || fail "$label is missing: $path"
}

require_text() {
  local path="$1"
  local needle="$2"
  local label="$3"
  grep -Fq "$needle" "$path" || fail "$label not found in $path"
}

json_value() {
  local path="$1"
  local key_path="$2"
  node -e '
const fs = require("fs")
const data = JSON.parse(fs.readFileSync(process.argv[1], "utf8"))
const value = process.argv[2].split(".").reduce((current, key) => current && current[key], data)
if (value === undefined || value === null) process.exit(1)
process.stdout.write(String(value))
' "$path" "$key_path"
}

sha256_file() {
  local path="$1"
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$path" | awk '{ print $1 }'
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$path" | awk '{ print $1 }'
  else
    fail "shasum/sha256sum is required for standalone handoff verification"
  fi
}

trap cleanup EXIT

cd "$ROOT_DIR"

if [[ -z "$ARCHIVE_PATH" ]]; then
  [[ -f "$ARCHIVE_MARKER" ]] || fail "handoff archive marker is missing. Run: npm run tv-box:handoff"
  ARCHIVE_PATH="$(sed -n '1p' "$ARCHIVE_MARKER")"
fi

[[ -n "$ARCHIVE_PATH" ]] || fail "handoff archive path is empty"
require_file "$ARCHIVE_PATH" "handoff archive"

case "$ARCHIVE_PATH" in
  *.zip)
    command -v unzip >/dev/null 2>&1 || fail "unzip is required to inspect handoff zip"
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
[[ -d "$HANDOFF_DIR" ]] || fail "handoff archive must contain top-level tv-box-handoff directory"

require_file "$HANDOFF_DIR/HelloTV-debug.apk" "standalone APK"
require_file "$HANDOFF_DIR/SHA256SUMS" "standalone SHA256SUMS"
require_file "$HANDOFF_DIR/MANIFEST.json" "standalone manifest"
require_file "$HANDOFF_DIR/START_HERE.html" "standalone HTML start"
require_file "$HANDOFF_DIR/OPERATION_CARD.html" "standalone printable operation card"
require_file "$HANDOFF_DIR/HARDWARE_SELECTION_CARD.html" "standalone printable hardware selection card"
require_file "$HANDOFF_DIR/HARDWARE_SELECTION_CARD.zh-CN.md" "standalone hardware selection card markdown"
require_file "$HANDOFF_DIR/FIELD_RETURN_CARD.html" "standalone printable field return card"
require_file "$HANDOFF_DIR/FIELD_RETURN_CARD.zh-CN.md" "standalone field return card markdown"
require_file "$HANDOFF_DIR/FIELD_RETURN/README.zh-CN.txt" "standalone field return folder readme"
require_file "$HANDOFF_DIR/README_FIRST.txt" "standalone plain-text start"
require_file "$HANDOFF_DIR/PRE_INSTALL_CHECKLIST.zh-CN.md" "standalone pre-install checklist"
require_file "$HANDOFF_DIR/INSTALL_SUPPORT.zh-CN.md" "standalone install support guide"
require_file "$HANDOFF_DIR/tv-box-field-wizard-latest.md" "standalone field wizard record"
require_file "$HANDOFF_DIR/tv-box-field-wizard-latest.json" "standalone field wizard JSON"
require_file "$HANDOFF_DIR/tv-box-field-wizard-latest.env" "standalone field wizard env"
require_file "$HANDOFF_DIR/FIELD_WIZARD_OFFLINE.html" "standalone offline field wizard HTML"
require_file "$HANDOFF_DIR/tv-box-field-import-latest.md" "standalone field import record"
require_file "$HANDOFF_DIR/tv-box-field-import-latest.json" "standalone field import JSON"
require_file "$HANDOFF_DIR/tv-box-field-import-latest.env" "standalone field import env"
require_file "$HANDOFF_DIR/tv-box-hardware-profile-latest.md" "standalone hardware profile markdown"
require_file "$HANDOFF_DIR/tv-box-hardware-profile-latest.json" "standalone hardware profile JSON"
require_file "$HANDOFF_DIR/tv-box-easy-run-latest.md" "standalone easy install summary"
require_file "$HANDOFF_DIR/tv-box-easy-run-latest.json" "standalone easy install summary JSON"
require_file "$HANDOFF_DIR/tv-box-completion-audit-latest.md" "standalone completion audit"
require_file "$HANDOFF_DIR/tv-box-completion-audit-latest.json" "standalone completion audit JSON"
require_file "$HANDOFF_DIR/tv-box-return-inbox-scenarios-test-latest.md" "standalone return inbox scenarios markdown"
require_file "$HANDOFF_DIR/tv-box-return-inbox-scenarios-test-latest.json" "standalone return inbox scenarios JSON"
require_file "$HANDOFF_DIR/INSTALL_ON_MAC.command" "standalone macOS installer"
require_file "$HANDOFF_DIR/INSTALL_ON_WINDOWS.bat" "standalone Windows installer"
require_file "$HANDOFF_DIR/PACK_FIELD_RETURN_ON_MAC.command" "standalone macOS field return packer"
require_file "$HANDOFF_DIR/PACK_FIELD_RETURN_ON_WINDOWS.bat" "standalone Windows field return packer"
require_file "$HANDOFF_DIR/WINDOWS_HELP.zh-CN.md" "standalone Windows troubleshooting guide"

MANIFEST_SHA="$(json_value "$HANDOFF_DIR/MANIFEST.json" "apk.sha256")"
MANIFEST_SIZE="$(json_value "$HANDOFF_DIR/MANIFEST.json" "apk.sizeBytes")"
SUMS_SHA="$(awk '$2 == "HelloTV-debug.apk" { print $1 }' "$HANDOFF_DIR/SHA256SUMS" | sed -n '1p')"
ACTUAL_SHA="$(sha256_file "$HANDOFF_DIR/HelloTV-debug.apk")"
ACTUAL_SIZE="$(wc -c < "$HANDOFF_DIR/HelloTV-debug.apk" | tr -d ' ')"

[[ "$MANIFEST_SHA" == "$ACTUAL_SHA" ]] || fail "manifest APK sha256 does not match extracted APK"
[[ "$SUMS_SHA" == "$ACTUAL_SHA" ]] || fail "SHA256SUMS does not match extracted APK"
[[ "$MANIFEST_SIZE" == "$ACTUAL_SIZE" ]] || fail "manifest APK size does not match extracted APK"

bash -n "$HANDOFF_DIR/INSTALL_ON_MAC.command"
[[ -x "$HANDOFF_DIR/INSTALL_ON_MAC.command" ]] || fail "macOS installer executable bit was not preserved in archive"
bash -n "$HANDOFF_DIR/PACK_FIELD_RETURN_ON_MAC.command"
[[ -x "$HANDOFF_DIR/PACK_FIELD_RETURN_ON_MAC.command" ]] || fail "macOS field return packer executable bit was not preserved in archive"

require_text "$HANDOFF_DIR/INSTALL_ON_MAC.command" 'SCRIPT_DIR=' "macOS installer uses standalone script directory"
require_text "$HANDOFF_DIR/INSTALL_ON_MAC.command" 'INSTALL_LOG.txt' "macOS installer writes standalone install log"
require_text "$HANDOFF_DIR/INSTALL_ON_MAC.command" 'INSTALL_SUPPORT.zh-CN.md' "macOS installer points to install support guide"
require_text "$HANDOFF_DIR/INSTALL_ON_MAC.command" 'capture_post_install_snapshot' "macOS installer captures post-install evidence"
require_text "$HANDOFF_DIR/INSTALL_ON_MAC.command" 'pm path $PACKAGE_NAME' "macOS installer verifies package path"
require_text "$HANDOFF_DIR/INSTALL_ON_MAC.command" 'logcat -d -t 240' "macOS installer captures recent logcat"
require_text "$HANDOFF_DIR/INSTALL_ON_MAC.command" 'SHA256SUMS' "macOS installer verifies checksum"
require_text "$HANDOFF_DIR/INSTALL_ON_WINDOWS.bat" 'SCRIPT_DIR=%~dp0' "Windows installer uses standalone script directory"
require_text "$HANDOFF_DIR/INSTALL_ON_WINDOWS.bat" 'INSTALL_LOG.txt' "Windows installer writes standalone install log"
require_text "$HANDOFF_DIR/INSTALL_ON_WINDOWS.bat" 'INSTALL_SUPPORT.zh-CN.md' "Windows installer points to install support guide"
require_text "$HANDOFF_DIR/INSTALL_ON_WINDOWS.bat" ':capture_post_install_snapshot' "Windows installer captures post-install evidence"
require_text "$HANDOFF_DIR/INSTALL_ON_WINDOWS.bat" 'shell pm path "%PACKAGE_NAME%"' "Windows installer verifies package path"
require_text "$HANDOFF_DIR/INSTALL_ON_WINDOWS.bat" 'logcat -d -t 240' "Windows installer captures recent logcat"
require_text "$HANDOFF_DIR/INSTALL_ON_WINDOWS.bat" 'certutil -hashfile' "Windows installer verifies checksum"
require_text "$HANDOFF_DIR/INSTALL_ON_WINDOWS.bat" 'E10' "Windows installer includes field error codes"
require_text "$HANDOFF_DIR/PACK_FIELD_RETURN_ON_MAC.command" 'FIELD_RETURN' "macOS return packer uses FIELD_RETURN folder"
require_text "$HANDOFF_DIR/PACK_FIELD_RETURN_ON_MAC.command" 'HelloTV-field-return' "macOS return packer writes return zip"
require_text "$HANDOFF_DIR/PACK_FIELD_RETURN_ON_WINDOWS.bat" 'FIELD_RETURN' "Windows return packer uses FIELD_RETURN folder"
require_text "$HANDOFF_DIR/PACK_FIELD_RETURN_ON_WINDOWS.bat" 'Compress-Archive' "Windows return packer writes return zip"
require_text "$HANDOFF_DIR/WINDOWS_HELP.zh-CN.md" 'E10' "Windows troubleshooting guide documents error codes"
require_text "$HANDOFF_DIR/WINDOWS_HELP.zh-CN.md" 'E61' "Windows troubleshooting guide documents package-path verification"
require_text "$HANDOFF_DIR/INSTALL_SUPPORT.zh-CN.md" 'INSTALL_LOG.txt' "install support guide requests install log"
require_text "$HANDOFF_DIR/INSTALL_SUPPORT.zh-CN.md" '当前前台窗口' "install support guide explains post-install evidence"
require_text "$HANDOFF_DIR/START_HERE.html" 'INSTALL_ON_WINDOWS.bat' "HTML start links Windows installer"
require_text "$HANDOFF_DIR/START_HERE.html" 'INSTALL_SUPPORT.zh-CN.md' "HTML start links install support guide"
require_text "$HANDOFF_DIR/START_HERE.html" 'PRE_INSTALL_CHECKLIST.zh-CN.md' "HTML start links pre-install checklist"
require_text "$HANDOFF_DIR/START_HERE.html" 'INSTALL_ON_MAC.command' "HTML start links macOS installer"
require_text "$HANDOFF_DIR/START_HERE.html" 'OPERATION_CARD.html' "HTML start links printable operation card"
require_text "$HANDOFF_DIR/START_HERE.html" 'HARDWARE_SELECTION_CARD.html' "HTML start links printable hardware selection card"
require_text "$HANDOFF_DIR/START_HERE.html" 'FIELD_RETURN_CARD.html' "HTML start links printable field return card"
require_text "$HANDOFF_DIR/START_HERE.html" 'PACK_FIELD_RETURN_ON_WINDOWS.bat' "HTML start links Windows field return packer"
require_text "$HANDOFF_DIR/START_HERE.html" 'PACK_FIELD_RETURN_ON_MAC.command' "HTML start links macOS field return packer"
require_text "$HANDOFF_DIR/START_HERE.html" 'FIELD_WIZARD_OFFLINE.html' "HTML start links offline field wizard"
require_text "$HANDOFF_DIR/README_FIRST.txt" 'FIELD_ACCEPTANCE_CHECKLIST.zh-CN.md' "plain-text start points to field checklist"
require_text "$HANDOFF_DIR/README_FIRST.txt" 'OPERATION_CARD.html' "plain-text start points to printable operation card"
require_text "$HANDOFF_DIR/README_FIRST.txt" 'HARDWARE_SELECTION_CARD.html' "plain-text start points to printable hardware selection card"
require_text "$HANDOFF_DIR/README_FIRST.txt" 'FIELD_RETURN_CARD.html' "plain-text start points to field return card"
require_text "$HANDOFF_DIR/OPERATION_CARD.html" 'HelloTV 电视盒子操作卡' "operation card has clear title"
require_text "$HANDOFF_DIR/OPERATION_CARD.html" '打印操作卡' "operation card has print action"
require_text "$HANDOFF_DIR/OPERATION_CARD.html" '方向键移动，OK 进入，返回键回上一步' "operation card explains remote basics"
require_text "$HANDOFF_DIR/OPERATION_CARD.html" '按钮左上角会显示 1-6' "operation card explains numeric shortcut badges"
require_text "$HANDOFF_DIR/OPERATION_CARD.html" 'keyCode' "operation card explains remote keyCode feedback"
require_text "$HANDOFF_DIR/OPERATION_CARD.html" '帮助页按 5' "operation card explains field guide shortcut"
require_text "$HANDOFF_DIR/OPERATION_CARD.html" 'tv-box-support-latest.zip' "operation card explains support bundle handoff"
require_text "$HANDOFF_DIR/HARDWARE_SELECTION_CARD.html" 'HelloTV 电视盒子硬件选型卡' "hardware selection card has clear title"
require_text "$HANDOFF_DIR/HARDWARE_SELECTION_CARD.html" '打印选型卡' "hardware selection card has print action"
require_text "$HANDOFF_DIR/HARDWARE_SELECTION_CARD.html" '现场 6 项快测' "hardware selection card includes field quick test"
require_text "$HANDOFF_DIR/HARDWARE_SELECTION_CARD.zh-CN.md" '不能关闭' "hardware selection card preserves closure boundary"
require_text "$HANDOFF_DIR/FIELD_RETURN_CARD.html" 'HelloTV 电视盒子现场回传卡' "field return card has clear title"
require_text "$HANDOFF_DIR/FIELD_RETURN_CARD.html" '必须发回 4 样' "field return card lists required evidence"
require_text "$HANDOFF_DIR/FIELD_RETURN_CARD.html" 'tv-box:return-inbox' "field return card explains return inbox QA"
require_text "$HANDOFF_DIR/FIELD_RETURN_CARD.html" 'PACK_FIELD_RETURN_ON_WINDOWS.bat' "field return card explains Windows return packer"
require_text "$HANDOFF_DIR/FIELD_RETURN_CARD.html" '不要留 unknown' "field return card prevents unknown closure"
require_text "$HANDOFF_DIR/PRE_INSTALL_CHECKLIST.zh-CN.md" 'tv-box:preflight' "pre-install checklist points to automated preflight"
require_text "$HANDOFF_DIR/MANIFEST.json" '"preInstallChecklist"' "manifest includes pre-install checklist"
require_text "$HANDOFF_DIR/MANIFEST.json" '"operationCardHtml"' "manifest includes printable operation card"
require_text "$HANDOFF_DIR/MANIFEST.json" '"hardwareSelectionCardHtml"' "manifest includes printable hardware selection card"
require_text "$HANDOFF_DIR/MANIFEST.json" '"fieldReturnCardHtml"' "manifest includes printable field return card"
require_text "$HANDOFF_DIR/MANIFEST.json" '"fieldReturnPackWindows"' "manifest includes Windows field return packer"
require_text "$HANDOFF_DIR/MANIFEST.json" '"fieldWizardJson"' "manifest includes field wizard JSON"
require_text "$HANDOFF_DIR/MANIFEST.json" '"fieldWizardOfflineHtml"' "manifest includes offline field wizard HTML"
require_text "$HANDOFF_DIR/MANIFEST.json" '"fieldImportJson"' "manifest includes offline field import JSON"
require_text "$HANDOFF_DIR/MANIFEST.json" '"returnInboxScenariosRegressionJson"' "manifest includes return inbox scenarios JSON"
require_text "$HANDOFF_DIR/MANIFEST.json" '"returnInboxScenariosRegression"' "manifest includes return inbox scenarios command"
require_text "$HANDOFF_DIR/MANIFEST.json" '"hardwareProfileJson"' "manifest includes hardware profile JSON"
require_text "$HANDOFF_DIR/MANIFEST.json" '"easyRunSummaryJson"' "manifest includes easy summary JSON"
require_text "$HANDOFF_DIR/MANIFEST.json" '"easyFailureSelfTest"' "manifest includes failure self-test command"
require_text "$HANDOFF_DIR/tv-box-field-wizard-latest.md" '现场验收向导记录' "field wizard markdown has clear title"
require_text "$HANDOFF_DIR/tv-box-field-wizard-latest.env" 'FIELD_APPEND_MATRIX' "field wizard env includes append decision"
require_text "$HANDOFF_DIR/FIELD_WIZARD_OFFLINE.html" 'HelloTV 电视盒子离线现场验收表' "offline field wizard has clear title"
require_text "$HANDOFF_DIR/FIELD_WIZARD_OFFLINE.html" '下载 JSON' "offline field wizard exports JSON"
require_text "$HANDOFF_DIR/FIELD_WIZARD_OFFLINE.html" 'FIELD_APPEND_MATRIX' "offline field wizard exports append decision"
require_text "$HANDOFF_DIR/tv-box-field-import-latest.md" '离线验收导入记录' "field import markdown has clear title"
require_text "$HANDOFF_DIR/tv-box-field-import-latest.env" 'FIELD_APPEND_MATRIX' "field import env includes append decision"
require_text "$HANDOFF_DIR/tv-box-hardware-profile-latest.md" '电视盒子硬件兼容性画像' "hardware profile markdown has clear title"
require_text "$HANDOFF_DIR/tv-box-hardware-profile-latest.json" '"currentDeviceProfile"' "hardware profile JSON includes current device profile"
require_text "$HANDOFF_DIR/tv-box-hardware-profile-latest.json" '"recommendedSpec"' "hardware profile JSON includes recommended spec"
require_text "$HANDOFF_DIR/tv-box-easy-run-latest.md" '傻瓜化交付结论' "easy summary explains operator outcome"
require_text "$HANDOFF_DIR/tv-box-easy-run-latest.json" '"artifacts"' "easy summary JSON includes artifacts"
require_text "$HANDOFF_DIR/tv-box-return-inbox-scenarios-test-latest.md" '现场回传收件箱场景回归' "return inbox scenarios markdown has clear title"
require_text "$HANDOFF_DIR/tv-box-return-inbox-scenarios-test-latest.json" '"status": "pass"' "return inbox scenarios JSON status"
require_text "$HANDOFF_DIR/tv-box-return-inbox-scenarios-test-latest.json" '"unknown_without_issue_evidence"' "return inbox scenarios keeps unknown open"
require_text "$HANDOFF_DIR/tv-box-completion-audit-latest.md" 'auditScope: `handoff_package`' "completion audit is handoff-package scoped"
require_text "$HANDOFF_DIR/tv-box-completion-audit-latest.json" '"auditScope": "handoff_package"' "completion audit JSON is handoff-package scoped"
require_text "$HANDOFF_DIR/tv-box-completion-audit-latest.json" '"requirements"' "completion audit JSON includes requirements"
require_text "$HANDOFF_DIR/tv-box-completion-audit-latest.json" '"return_inbox_scenarios_regression"' "completion audit includes return inbox scenarios requirement"

if grep -Fq "$ROOT_DIR" "$HANDOFF_DIR/INSTALL_ON_MAC.command" "$HANDOFF_DIR/INSTALL_ON_WINDOWS.bat"; then
  fail "install helpers must not depend on the source checkout path"
fi

echo "TV-box handoff standalone archive self-test passed."
