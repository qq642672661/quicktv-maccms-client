#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPORT_DIR="${REPORT_DIR:-$ROOT_DIR/reports}"
HANDOFF_DIR="${HANDOFF_DIR:-$REPORT_DIR/tv-box-handoff}"
FIELD_RETURN_DIR="$HANDOFF_DIR/FIELD_RETURN"
PACKAGE_NAME="${PACKAGE_NAME:-com.quicktvui.hellotv}"
HANDOFF_LATEST_PATH_FILE="${HANDOFF_LATEST_PATH_FILE:-$REPORT_DIR/tv-box-handoff-latest-path.txt}"
HANDOFF_LATEST_ARCHIVE_FILE="${HANDOFF_LATEST_ARCHIVE_FILE:-$REPORT_DIR/tv-box-handoff-latest-archive.txt}"

latest_apk() {
  ls -t "$ROOT_DIR"/android/app/build/outputs/apk/debug/*_debug.apk 2>/dev/null | head -n 1 || true
}

cleanup_archive_checksums() {
  rm -f "$REPORT_DIR"/tv-box-handoff-latest.zip.sha256 "$REPORT_DIR"/tv-box-handoff-latest.tar.gz.sha256
}

write_archive_checksum() {
  local archive_path="$1"
  local archive_dir
  local archive_name
  local checksum_path

  archive_dir="$(dirname "$archive_path")"
  archive_name="$(basename "$archive_path")"
  checksum_path="$archive_path.sha256"

  if command -v shasum >/dev/null 2>&1; then
    (cd "$archive_dir" && shasum -a 256 "$archive_name") > "$checksum_path"
  elif command -v sha256sum >/dev/null 2>&1; then
    (cd "$archive_dir" && sha256sum "$archive_name") > "$checksum_path"
  else
    rm -f "$checksum_path"
  fi
}

APK_PATH="$(latest_apk)"
REPORT_PATH="$REPORT_DIR/tv-box-acceptance-latest.md"
INSPECTION_PATH="$REPORT_DIR/tv-box-inspection-latest.json"
FIELD_RECORD_JSON="$REPORT_DIR/tv-box-field-record-latest.json"
FIELD_RECORD_MD="$REPORT_DIR/tv-box-field-record-latest.md"
FIELD_MATRIX_CSV="$REPORT_DIR/tv-box-field-matrix.csv"
COMPATIBILITY_SUMMARY_JSON="$REPORT_DIR/tv-box-compatibility-summary-latest.json"
COMPATIBILITY_SUMMARY_MD="$REPORT_DIR/tv-box-compatibility-summary-latest.md"
HARDWARE_PROFILE_JSON="$REPORT_DIR/tv-box-hardware-profile-latest.json"
HARDWARE_PROFILE_MD="$REPORT_DIR/tv-box-hardware-profile-latest.md"
AV_TEST_HARDWARE_PLAN_MD="$ROOT_DIR/docs/TV_BOX_AV_TEST_HARDWARE.zh-CN.md"
PHONE_CAMERA_CONTRACT_SOURCE_MD="$ROOT_DIR/docs/TV_BOX_PHONE_CAMERA_CONTRACT.zh-CN.md"
PHONE_CAMERA_CONTRACT_JSON="$REPORT_DIR/tv-box-phone-camera-contract-latest.json"
PHONE_CAMERA_CONTRACT_MD="$REPORT_DIR/tv-box-phone-camera-contract-latest.md"
EASY_SUMMARY_JSON="$REPORT_DIR/tv-box-easy-run-latest.json"
EASY_SUMMARY_MD="$REPORT_DIR/tv-box-easy-run-latest.md"
COMPLETION_AUDIT_JSON="$REPORT_DIR/tv-box-completion-audit-latest.json"
COMPLETION_AUDIT_MD="$REPORT_DIR/tv-box-completion-audit-latest.md"
HANDOFF_HTML_SMOKE_JSON="$REPORT_DIR/tv-box-handoff-html-smoke-latest.json"
HANDOFF_HTML_SMOKE_MD="$REPORT_DIR/tv-box-handoff-html-smoke-latest.md"
PREFLIGHT_JSON="$REPORT_DIR/tv-box-preflight-latest.json"
PREFLIGHT_MD="$REPORT_DIR/tv-box-preflight-latest.md"
AUTHORIZATION_JSON="$REPORT_DIR/tv-box-authorization-latest.json"
AUTHORIZATION_MD="$REPORT_DIR/tv-box-authorization-latest.md"
SITE_READINESS_JSON="$REPORT_DIR/tv-box-site-readiness-latest.json"
SITE_READINESS_MD="$REPORT_DIR/tv-box-site-readiness-latest.md"
SITE_READINESS_HTML="$REPORT_DIR/tv-box-site-readiness-card.html"
UX_AUDIT_JSON="$REPORT_DIR/tv-box-ux-audit-latest.json"
UX_AUDIT_MD="$REPORT_DIR/tv-box-ux-audit-latest.md"
COMMAND_CENTER_JSON="$REPORT_DIR/tv-box-command-center-latest.json"
COMMAND_CENTER_MD="$REPORT_DIR/tv-box-command-center-latest.md"
FIELD_WIZARD_ENV="$REPORT_DIR/tv-box-field-wizard-latest.env"
FIELD_WIZARD_JSON="$REPORT_DIR/tv-box-field-wizard-latest.json"
FIELD_WIZARD_MD="$REPORT_DIR/tv-box-field-wizard-latest.md"
FIELD_WIZARD_HTML="$REPORT_DIR/tv-box-field-wizard-offline.html"
FIELD_IMPORT_ENV="$REPORT_DIR/tv-box-field-import-latest.env"
FIELD_IMPORT_JSON="$REPORT_DIR/tv-box-field-import-latest.json"
FIELD_IMPORT_MD="$REPORT_DIR/tv-box-field-import-latest.md"
FIELD_INBOX_JSON="$REPORT_DIR/tv-box-field-inbox-latest.json"
FIELD_INBOX_MD="$REPORT_DIR/tv-box-field-inbox-latest.md"
FIELD_INBOX_IMPORTS="$REPORT_DIR/tv-box-field-inbox-imports"
FIELD_SCENARIOS_JSON="$REPORT_DIR/tv-box-field-scenarios-test-latest.json"
FIELD_SCENARIOS_MD="$REPORT_DIR/tv-box-field-scenarios-test-latest.md"
RETURN_INBOX_SCENARIOS_JSON="$REPORT_DIR/tv-box-return-inbox-scenarios-test-latest.json"
RETURN_INBOX_SCENARIOS_MD="$REPORT_DIR/tv-box-return-inbox-scenarios-test-latest.md"

if [[ -z "$APK_PATH" ]]; then
  echo "ERROR: No debug APK found. Run: npm run build-apk-debug" >&2
  exit 1
fi

mkdir -p "$HANDOFF_DIR" "$FIELD_RETURN_DIR"

cp "$APK_PATH" "$HANDOFF_DIR/HelloTV-debug.apk"

(cd "$ROOT_DIR" && PACKAGE_NAME="$PACKAGE_NAME" TV_BOX_INSPECTION_JSON="$INSPECTION_PATH" npm run -s tv-box:inspect >/dev/null)

(cd "$ROOT_DIR" && BOX_IP="${BOX_IP:-}" DEVICE_SERIAL="${DEVICE_SERIAL:-}" npm run -s tv-box:authorize >/dev/null)

(cd "$ROOT_DIR" && PACKAGE_NAME="$PACKAGE_NAME" TV_BOX_INSPECTION_JSON="$INSPECTION_PATH" REPORT_PATH="$REPORT_PATH" npm run -s tv-box:report >/dev/null)

(cd "$ROOT_DIR" && PACKAGE_NAME="$PACKAGE_NAME" TV_BOX_INSPECTION_JSON="$INSPECTION_PATH" npm run -s tv-box:field-record >/dev/null)

(cd "$ROOT_DIR" && TV_BOX_INSPECTION_JSON="$INSPECTION_PATH" TV_BOX_FIELD_RECORD_JSON="$FIELD_RECORD_JSON" npm run -s tv-box:compatibility-summary >/dev/null)

(cd "$ROOT_DIR" && npm run -s tv-box:field-wizard -- --defaults --dry-run >/dev/null)

(cd "$ROOT_DIR" && npm run -s tv-box:field-wizard-html >/dev/null)

(cd "$ROOT_DIR" && npm run -s tv-box:field-import -- "$FIELD_WIZARD_JSON" --dry-run --no-append >/dev/null)

(cd "$ROOT_DIR" && npm run -s tv-box:field-inbox -- "$FIELD_WIZARD_JSON" --dry-run --no-append >/dev/null)

(cd "$ROOT_DIR" && npm run -s tv-box:field-scenarios-test >/dev/null)

(cd "$ROOT_DIR" && npm run -s tv-box:return-inbox-scenarios-test >/dev/null)

(cd "$ROOT_DIR" && \
  TV_BOX_INSPECTION_JSON="$INSPECTION_PATH" \
  TV_BOX_FIELD_RECORD_JSON="$FIELD_RECORD_JSON" \
  TV_BOX_COMPATIBILITY_SUMMARY_JSON="$COMPATIBILITY_SUMMARY_JSON" \
  npm run -s tv-box:hardware-profile >/dev/null)

(cd "$ROOT_DIR" && npm run -s tv-box:phone-camera-contract >/dev/null)

HANDOFF_ARCHIVE_PATH=""
if command -v zip >/dev/null 2>&1; then
  HANDOFF_ARCHIVE_PATH="$REPORT_DIR/tv-box-handoff-latest.zip"
elif command -v tar >/dev/null 2>&1; then
  HANDOFF_ARCHIVE_PATH="$REPORT_DIR/tv-box-handoff-latest.tar.gz"
fi

(cd "$ROOT_DIR" && \
  PACKAGE_NAME="$PACKAGE_NAME" \
  BOX_IP="${BOX_IP:-}" \
  EASY_RUN_RESULT="${EASY_RUN_RESULT:-handoff_refresh}" \
  EASY_RUN_CAMERA_SMOKE="${EASY_RUN_CAMERA_SMOKE:-${RUN_CAMERA_SMOKE:-false}}" \
  HANDOFF_DIR="$HANDOFF_DIR" \
  HANDOFF_ARCHIVE_PATH="$HANDOFF_ARCHIVE_PATH" \
  TV_BOX_INSPECTION_JSON="$INSPECTION_PATH" \
  TV_BOX_FIELD_RECORD_JSON="$FIELD_RECORD_JSON" \
  TV_BOX_COMPATIBILITY_SUMMARY_JSON="$COMPATIBILITY_SUMMARY_JSON" \
  npm run -s tv-box:easy-summary >/dev/null)

if [[ -f "$REPORT_PATH" ]]; then
  cp "$REPORT_PATH" "$HANDOFF_DIR/tv-box-acceptance-latest.md"
fi

if [[ -f "$INSPECTION_PATH" ]]; then
  cp "$INSPECTION_PATH" "$HANDOFF_DIR/tv-box-inspection-latest.json"
fi

if [[ -f "$FIELD_RECORD_JSON" ]]; then
  cp "$FIELD_RECORD_JSON" "$HANDOFF_DIR/tv-box-field-record-latest.json"
fi

if [[ -f "$FIELD_RECORD_MD" ]]; then
  cp "$FIELD_RECORD_MD" "$HANDOFF_DIR/tv-box-field-record-latest.md"
fi

if [[ -f "$FIELD_MATRIX_CSV" ]]; then
  cp "$FIELD_MATRIX_CSV" "$HANDOFF_DIR/tv-box-field-matrix.csv"
fi

if [[ -f "$COMPATIBILITY_SUMMARY_JSON" ]]; then
  cp "$COMPATIBILITY_SUMMARY_JSON" "$HANDOFF_DIR/tv-box-compatibility-summary-latest.json"
fi

if [[ -f "$COMPATIBILITY_SUMMARY_MD" ]]; then
  cp "$COMPATIBILITY_SUMMARY_MD" "$HANDOFF_DIR/tv-box-compatibility-summary-latest.md"
fi

if [[ -f "$HARDWARE_PROFILE_JSON" ]]; then
  cp "$HARDWARE_PROFILE_JSON" "$HANDOFF_DIR/tv-box-hardware-profile-latest.json"
fi

if [[ -f "$HARDWARE_PROFILE_MD" ]]; then
  cp "$HARDWARE_PROFILE_MD" "$HANDOFF_DIR/tv-box-hardware-profile-latest.md"
fi

if [[ -f "$AV_TEST_HARDWARE_PLAN_MD" ]]; then
  cp "$AV_TEST_HARDWARE_PLAN_MD" "$HANDOFF_DIR/TV_BOX_AV_TEST_HARDWARE.zh-CN.md"
fi

if [[ -f "$PHONE_CAMERA_CONTRACT_SOURCE_MD" ]]; then
  cp "$PHONE_CAMERA_CONTRACT_SOURCE_MD" "$HANDOFF_DIR/TV_BOX_PHONE_CAMERA_CONTRACT.zh-CN.md"
fi

if [[ -f "$PHONE_CAMERA_CONTRACT_JSON" ]]; then
  cp "$PHONE_CAMERA_CONTRACT_JSON" "$HANDOFF_DIR/tv-box-phone-camera-contract-latest.json"
fi

if [[ -f "$PHONE_CAMERA_CONTRACT_MD" ]]; then
  cp "$PHONE_CAMERA_CONTRACT_MD" "$HANDOFF_DIR/tv-box-phone-camera-contract-latest.md"
fi

if [[ -f "$EASY_SUMMARY_JSON" ]]; then
  cp "$EASY_SUMMARY_JSON" "$HANDOFF_DIR/tv-box-easy-run-latest.json"
fi

if [[ -f "$EASY_SUMMARY_MD" ]]; then
  cp "$EASY_SUMMARY_MD" "$HANDOFF_DIR/tv-box-easy-run-latest.md"
fi

if [[ -f "$AUTHORIZATION_JSON" ]]; then
  cp "$AUTHORIZATION_JSON" "$HANDOFF_DIR/tv-box-authorization-latest.json"
fi

if [[ -f "$AUTHORIZATION_MD" ]]; then
  cp "$AUTHORIZATION_MD" "$HANDOFF_DIR/tv-box-authorization-latest.md"
fi

if [[ -f "$FIELD_WIZARD_ENV" ]]; then
  cp "$FIELD_WIZARD_ENV" "$HANDOFF_DIR/tv-box-field-wizard-latest.env"
fi

if [[ -f "$FIELD_WIZARD_JSON" ]]; then
  cp "$FIELD_WIZARD_JSON" "$HANDOFF_DIR/tv-box-field-wizard-latest.json"
fi

if [[ -f "$FIELD_WIZARD_MD" ]]; then
  cp "$FIELD_WIZARD_MD" "$HANDOFF_DIR/tv-box-field-wizard-latest.md"
fi

if [[ -f "$FIELD_WIZARD_HTML" ]]; then
  cp "$FIELD_WIZARD_HTML" "$HANDOFF_DIR/FIELD_WIZARD_OFFLINE.html"
fi

if [[ -f "$FIELD_IMPORT_ENV" ]]; then
  cp "$FIELD_IMPORT_ENV" "$HANDOFF_DIR/tv-box-field-import-latest.env"
fi

if [[ -f "$FIELD_IMPORT_JSON" ]]; then
  cp "$FIELD_IMPORT_JSON" "$HANDOFF_DIR/tv-box-field-import-latest.json"
fi

if [[ -f "$FIELD_IMPORT_MD" ]]; then
  cp "$FIELD_IMPORT_MD" "$HANDOFF_DIR/tv-box-field-import-latest.md"
fi

if [[ -f "$FIELD_INBOX_JSON" ]]; then
  cp "$FIELD_INBOX_JSON" "$HANDOFF_DIR/tv-box-field-inbox-latest.json"
fi

if [[ -f "$FIELD_INBOX_MD" ]]; then
  cp "$FIELD_INBOX_MD" "$HANDOFF_DIR/tv-box-field-inbox-latest.md"
fi

if [[ -f "$FIELD_SCENARIOS_JSON" ]]; then
  cp "$FIELD_SCENARIOS_JSON" "$HANDOFF_DIR/tv-box-field-scenarios-test-latest.json"
fi

if [[ -f "$FIELD_SCENARIOS_MD" ]]; then
  cp "$FIELD_SCENARIOS_MD" "$HANDOFF_DIR/tv-box-field-scenarios-test-latest.md"
fi

if [[ -f "$RETURN_INBOX_SCENARIOS_JSON" ]]; then
  cp "$RETURN_INBOX_SCENARIOS_JSON" "$HANDOFF_DIR/tv-box-return-inbox-scenarios-test-latest.json"
fi

if [[ -f "$RETURN_INBOX_SCENARIOS_MD" ]]; then
  cp "$RETURN_INBOX_SCENARIOS_MD" "$HANDOFF_DIR/tv-box-return-inbox-scenarios-test-latest.md"
fi

APK_SHA256=""
if command -v shasum >/dev/null 2>&1; then
  APK_SHA256="$(cd "$HANDOFF_DIR" && shasum -a 256 HelloTV-debug.apk | awk '{ print $1 }')"
  printf '%s  HelloTV-debug.apk\n' "$APK_SHA256" > "$HANDOFF_DIR/SHA256SUMS"
fi

APK_SIZE_BYTES="$(wc -c < "$HANDOFF_DIR/HelloTV-debug.apk" | tr -d ' ')"
SOURCE_BRANCH="$(git -C "$ROOT_DIR" branch --show-current 2>/dev/null || true)"
SOURCE_COMMIT="$(git -C "$ROOT_DIR" rev-parse --short HEAD 2>/dev/null || true)"
WORKTREE_CHANGES="$(git -C "$ROOT_DIR" status --short 2>/dev/null | wc -l | tr -d ' ')"
GENERATED_AT_UTC="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

cat > "$HANDOFF_DIR/MANIFEST.json" <<MANIFEST
{
  "name": "HelloTV TV-box handoff",
  "generatedAtUtc": "$GENERATED_AT_UTC",
  "packageName": "$PACKAGE_NAME",
  "apk": {
    "file": "HelloTV-debug.apk",
    "sourcePath": "$APK_PATH",
    "sizeBytes": $APK_SIZE_BYTES,
    "sha256": "$APK_SHA256"
  },
  "source": {
    "branch": "$SOURCE_BRANCH",
    "commit": "$SOURCE_COMMIT",
    "worktreeChangeCount": $WORKTREE_CHANGES
  },
  "reports": {
    "startHereHtml": "START_HERE.html",
    "readmeFirst": "README_FIRST.txt",
    "quickStart": "QUICK_START.zh-CN.md",
    "preInstallChecklist": "PRE_INSTALL_CHECKLIST.zh-CN.md",
    "acceptance": "tv-box-acceptance-latest.md",
    "inspection": "tv-box-inspection-latest.json",
    "installGuide": "INSTALL.zh-CN.md",
    "installSupportGuide": "INSTALL_SUPPORT.zh-CN.md",
    "operationCard": "OPERATION_CARD.zh-CN.md",
    "operationCardHtml": "OPERATION_CARD.html",
    "hardwareSelectionCard": "HARDWARE_SELECTION_CARD.zh-CN.md",
    "hardwareSelectionCardHtml": "HARDWARE_SELECTION_CARD.html",
    "avTestHardwarePlan": "TV_BOX_AV_TEST_HARDWARE.zh-CN.md",
    "phoneCameraContract": "TV_BOX_PHONE_CAMERA_CONTRACT.zh-CN.md",
    "phoneCameraContractMarkdown": "tv-box-phone-camera-contract-latest.md",
    "phoneCameraContractJson": "tv-box-phone-camera-contract-latest.json",
    "fieldAcceptanceChecklist": "FIELD_ACCEPTANCE_CHECKLIST.zh-CN.md",
    "fieldReturnCard": "FIELD_RETURN_CARD.zh-CN.md",
    "fieldReturnCardHtml": "FIELD_RETURN_CARD.html",
    "fieldReturnFolderReadme": "FIELD_RETURN/README.zh-CN.txt",
    "fieldReturnPackMac": "PACK_FIELD_RETURN_ON_MAC.command",
    "fieldReturnPackWindows": "PACK_FIELD_RETURN_ON_WINDOWS.bat",
    "fieldCompatibilityMatrix": "FIELD_COMPATIBILITY_MATRIX.zh-CN.md",
    "latestFieldRecordMarkdown": "tv-box-field-record-latest.md",
    "latestFieldRecordJson": "tv-box-field-record-latest.json",
    "fieldMatrixCsv": "tv-box-field-matrix.csv",
    "compatibilitySummaryMarkdown": "tv-box-compatibility-summary-latest.md",
    "compatibilitySummaryJson": "tv-box-compatibility-summary-latest.json",
    "hardwareProfileMarkdown": "tv-box-hardware-profile-latest.md",
    "hardwareProfileJson": "tv-box-hardware-profile-latest.json",
    "easyRunSummaryMarkdown": "tv-box-easy-run-latest.md",
    "easyRunSummaryJson": "tv-box-easy-run-latest.json",
    "authorizationMarkdown": "tv-box-authorization-latest.md",
    "authorizationJson": "tv-box-authorization-latest.json",
    "completionAuditMarkdown": "tv-box-completion-audit-latest.md",
    "completionAuditJson": "tv-box-completion-audit-latest.json",
    "handoffHtmlSmokeMarkdown": "tv-box-handoff-html-smoke-latest.md",
    "handoffHtmlSmokeJson": "tv-box-handoff-html-smoke-latest.json",
    "uxAuditMarkdown": "tv-box-ux-audit-latest.md",
    "uxAuditJson": "tv-box-ux-audit-latest.json",
    "commandCenterMarkdown": "tv-box-command-center-latest.md",
    "commandCenterJson": "tv-box-command-center-latest.json",
    "siteReadinessMarkdown": "tv-box-site-readiness-latest.md",
    "siteReadinessJson": "tv-box-site-readiness-latest.json",
    "siteReadinessHtml": "SITE_READINESS_CARD.html",
    "fieldWizardMarkdown": "tv-box-field-wizard-latest.md",
    "fieldWizardJson": "tv-box-field-wizard-latest.json",
    "fieldWizardEnv": "tv-box-field-wizard-latest.env",
    "fieldWizardOfflineHtml": "FIELD_WIZARD_OFFLINE.html",
    "fieldImportMarkdown": "tv-box-field-import-latest.md",
    "fieldImportJson": "tv-box-field-import-latest.json",
    "fieldImportEnv": "tv-box-field-import-latest.env",
    "fieldInboxMarkdown": "tv-box-field-inbox-latest.md",
    "fieldInboxJson": "tv-box-field-inbox-latest.json",
    "fieldScenariosRegressionMarkdown": "tv-box-field-scenarios-test-latest.md",
    "fieldScenariosRegressionJson": "tv-box-field-scenarios-test-latest.json",
    "returnInboxScenariosRegressionMarkdown": "tv-box-return-inbox-scenarios-test-latest.md",
    "returnInboxScenariosRegressionJson": "tv-box-return-inbox-scenarios-test-latest.json",
    "macInstallHelper": "INSTALL_ON_MAC.command",
    "windowsInstallHelper": "INSTALL_ON_WINDOWS.bat",
    "windowsTroubleshooting": "WINDOWS_HELP.zh-CN.md",
    "checksums": "SHA256SUMS"
  },
  "commands": {
    "authorize": "BOX_IP=<box-ip> npm run tv-box:authorize",
    "easyInstall": "BOX_IP=<box-ip> npm run tv-box:easy",
    "easyFailureSelfTest": "npm run tv-box:easy-failure-test",
    "handoffStandaloneSelfTest": "npm run tv-box:handoff-standalone-test",
    "inspection": "BOX_IP=<box-ip> npm run tv-box:inspect",
    "fieldWizard": "npm run tv-box:field-wizard",
    "fieldWizardOfflineHtml": "npm run tv-box:field-wizard-html",
    "fieldImport": "npm run tv-box:field-import -- <offline-json>",
    "fieldInbox": "npm run tv-box:field-inbox",
    "fieldScenariosRegression": "npm run tv-box:field-scenarios-test",
    "returnInbox": "npm run tv-box:return-inbox -- <field-return-folder-or-zip>",
    "returnInboxScenariosRegression": "npm run tv-box:return-inbox-scenarios-test",
    "compatibilitySummary": "npm run tv-box:compatibility-summary",
    "hardwareProfile": "npm run tv-box:hardware-profile",
    "phoneCameraContract": "npm run tv-box:phone-camera-contract",
    "easySummary": "npm run tv-box:easy-summary",
    "completionAudit": "npm run tv-box:completion-audit",
    "handoffHtmlSmoke": "npm run tv-box:handoff-html-smoke",
    "uxAudit": "npm run tv-box:ux-audit",
    "commandCenter": "npm run tv-box:command-center",
    "siteReadiness": "npm run tv-box:site-readiness",
    "cameraSmoke": "BOX_IP=<box-ip> npm run tv-box:camera-smoke",
    "fullCheck": "npm run tv-box:check"
  }
}
MANIFEST

cat > "$HANDOFF_DIR/README_FIRST.txt" <<READMEFIRST
HelloTV 电视盒子交付包 - 先看这里

这个文件夹已经包含 APK、安装脚本和排障说明。不要改文件名。

1. 如果能打开网页文件，先双击 START_HERE.html。
2. 如果只想教家人怎么用，双击 OPERATION_CARD.html，直接打印或贴在电视旁。
3. 不知道该买哪种盒子、遥控器、USB 摄像头或麦克风时，双击 HARDWARE_SELECTION_CARD.html 打印选型卡。
4. 手机当电视摄像头还在开发/验收时，先打开 TV_BOX_PHONE_CAMERA_CONTRACT.zh-CN.md，看 WebRTC 房间码、信令、隐私和现场验收边界。
5. 安装前双击 SITE_READINESS_CARD.html，看当前应先发包、授权、安装还是补证据。
6. 测完真实盒子后，双击 FIELD_RETURN_CARD.html，按卡片把 JSON、照片、日志和排障包发给工程人员。
7. 回传证据不要散发：把 JSON、维护码照片、INSTALL_LOG.txt 或排障包、异常照片放进 FIELD_RETURN 文件夹，再双击 PACK_FIELD_RETURN_ON_WINDOWS.bat 或 PACK_FIELD_RETURN_ON_MAC.command 生成 zip。
8. 安装前打开 PRE_INSTALL_CHECKLIST.zh-CN.md，确认电脑、电视盒子、IP 和 RSA 授权都准备好。
9. 工程人员可先执行 BOX_IP=<盒子IP> npm run tv-box:authorize，只看 tv-box-authorization-latest.md 里的下一步，不要反复安装。
10. Windows 电脑：双击 INSTALL_ON_WINDOWS.bat，按提示输入电视盒子 IP。
11. macOS 电脑：双击 INSTALL_ON_MAC.command，按提示输入电视盒子 IP。
12. 电视盒子需要先打开“开发者选项 / 网络调试”，电脑和电视盒子要在同一个网络。
13. 电视上弹出 RSA 授权时，选择“允许”。

装好后只记遥控器：
- 方向键移动，OK 进入，返回键回上一步；首页再按返回会先问要不要退出。
- 1 看电视，4 摄像头检查，5 全部内容，6 或 0 帮助/自检。
- 直播里按数字键 1-9 可直接切到对应频道；打开频道列表后按 7 收藏/取消收藏，按 8 只看收藏/全部频道。
- 直播里按播放/暂停键会暂停或继续播放；没有这个键不影响使用，可在验收表里记为不适用。
- 直播里按 0、菜单/信息/帮助键也能进帮助/自检。
- 误进“全部内容”后，按 0、6 或菜单/信息/帮助键能进帮助/自检；按返回回简易首页。

安装脚本会在本目录写入 INSTALL_LOG.txt。失败时看黑色窗口里的 E10-E99 错误代码，再打开 INSTALL_SUPPORT.zh-CN.md；Windows 电脑也可打开 WINDOWS_HELP.zh-CN.md。
如果 App 里遇到问题，按 0 或菜单/信息/帮助键打开帮助/自检；首页和摄像头页也可以按 6，把屏幕上的“维护码”读给维护人员。
安装完成后，打开 FIELD_ACCEPTANCE_CHECKLIST.zh-CN.md，按清单打勾再交付。
不知道该选哪种盒子、遥控器、USB 摄像头或麦克风时，先打开 HARDWARE_SELECTION_CARD.html 给采购/现场看，再打开 tv-box-hardware-profile-latest.md 查看机器生成的当前风险标记和下一步。
如果要用手机当电视摄像头，先打开 TV_BOX_PHONE_CAMERA_CONTRACT.zh-CN.md；当前默认路线是手机采集 + 局域网 WebSocket 信令 + 电视盒子原生 WebRTC 接收端，不把手机伪装成系统 Camera2 摄像头。
测过真实盒子后，现场人员可先双击 FIELD_WIZARD_OFFLINE.html 离线填写并下载 JSON/Markdown/env；表单里可先点“只验收看电视通过”“摄像头/麦克风通过”“没有摄像头/麦克风”或“全部通过”模板，再修改少数不符合的项目。单份 JSON 用 tv-box:field-import 导入，多份 JSON 放进 reports/tv-box-field-inbox/ 后用 tv-box:field-inbox 批量导入，把盒子/遥控器/摄像头/麦克风结果沉淀到 FIELD_COMPATIBILITY_MATRIX.zh-CN.md、tv-box-field-matrix.csv 和兼容性自动汇总。
现场发回资料前，先打开 FIELD_RETURN_CARD.html，对照“必须发回 4 样”和“不要留 unknown”逐项核对。
如果要一次性发回证据，把所有材料放进 FIELD_RETURN 文件夹，再双击 PACK_FIELD_RETURN_ON_WINDOWS.bat 或 PACK_FIELD_RETURN_ON_MAC.command；生成的 HelloTV-field-return-*.zip 直接发给工程人员。
工程人员可打开 tv-box-easy-run-latest.md，快速确认本次一键安装沉淀了哪些报告、交付包、排障包和下一步动作。

工程人员命令：
BOX_IP=<盒子IP> npm run tv-box:easy
BOX_IP=<盒子IP> npm run tv-box:authorize
BOX_IP=<盒子IP> RUN_CAMERA_SMOKE=true npm run tv-box:easy
BOX_IP=<盒子IP> npm run tv-box:field-wizard
npm run tv-box:field-wizard-html
npm run tv-box:return-inbox -- <现场回传目录或zip>
看 tv-box-return-inbox-latest.md 里的 closure.status：ready_to_close 才能进入关闭复核，needs_site_follow_up 要现场补发/补测，needs_fix 要工程修复。
npm run tv-box:field-import -- <现场下载的JSON>
npm run tv-box:field-inbox
READMEFIRST

cat > "$HANDOFF_DIR/START_HERE.html" <<STARTHERE
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>HelloTV 电视盒子安装首页</title>
  <style>
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
      background: #f6f7fb;
      color: #172033;
      font-size: 20px;
      line-height: 1.55;
    }
    main {
      max-width: 980px;
      margin: 0 auto;
      padding: 32px 24px 48px;
    }
    h1 {
      margin: 0 0 12px;
      font-size: 36px;
      line-height: 1.2;
    }
    h2 {
      margin: 32px 0 12px;
      font-size: 26px;
    }
    .lead {
      margin: 0 0 24px;
      font-size: 22px;
    }
    .panel {
      background: #ffffff;
      border: 2px solid #d9dfeb;
      border-radius: 8px;
      padding: 22px;
      margin: 18px 0;
    }
    .actions {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 12px;
      margin-top: 16px;
    }
    a.button {
      display: block;
      padding: 16px 18px;
      border-radius: 6px;
      background: #1457d9;
      color: #ffffff;
      font-weight: 700;
      text-align: center;
      text-decoration: none;
    }
    .button.secondary {
      background: #24415f;
    }
    code {
      background: #edf1f7;
      border-radius: 4px;
      padding: 2px 6px;
      font-size: 18px;
    }
    ol, ul {
      padding-left: 28px;
    }
    li {
      margin: 8px 0;
    }
    .remote {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
      gap: 10px;
    }
    .key {
      background: #eef5e8;
      border: 1px solid #bfd9a9;
      border-radius: 6px;
      padding: 14px;
      font-weight: 700;
    }
  </style>
</head>
<body>
  <main>
    <h1>HelloTV 电视盒子安装首页</h1>
    <p class="lead">这个交付包已经包含 APK、安装脚本、操作卡和排障说明。现场人员从这里开始即可。</p>

    <section class="panel">
      <h2>第 1 步：先准备电视盒子</h2>
      <ol>
        <li>让电视盒子和电脑连同一个 Wi-Fi 或网线网络。</li>
        <li>在电视盒子打开“开发者选项 / 网络调试”。</li>
        <li>记下电视盒子 IP，例如 <code>192.168.1.23</code>。</li>
        <li>电视上弹出 RSA 授权时，选择“允许”。</li>
      </ol>
    </section>

    <section class="panel">
      <h2>第 2 步：按电脑选择安装</h2>
      <p>解压后不要移动单个文件，安装脚本必须和 <code>HelloTV-debug.apk</code> 放在同一个目录。</p>
      <p>安装前先打开 <a href="PRE_INSTALL_CHECKLIST.zh-CN.md">PRE_INSTALL_CHECKLIST.zh-CN.md</a>，确认电脑、盒子 IP、网络调试和 RSA 授权都准备好。</p>
      <p>工程人员先执行 <code>BOX_IP=&lt;盒子IP&gt; npm run tv-box:authorize</code>，再打开 <a href="tv-box-authorization-latest.md">ADB/RSA 授权助手报告</a>；报告未显示 <code>ready_for_install</code> 前不要反复安装。</p>
      <div class="actions">
        <a class="button secondary" href="SITE_READINESS_CARD.html">先看：现场开工判定卡</a>
        <a class="button" href="INSTALL_ON_WINDOWS.bat">Windows：双击安装脚本</a>
        <a class="button secondary" href="INSTALL_ON_MAC.command">macOS：双击安装脚本</a>
        <a class="button secondary" href="OPERATION_CARD.html">打印：电视旁操作卡</a>
        <a class="button secondary" href="HARDWARE_SELECTION_CARD.html">打印：硬件选型卡</a>
        <a class="button secondary" href="TV_BOX_PHONE_CAMERA_CONTRACT.zh-CN.md">手机摄像头：信令与验收合同</a>
        <a class="button secondary" href="FIELD_RETURN_CARD.html">打印：现场回传卡</a>
        <a class="button secondary" href="FIELD_RETURN/README.zh-CN.txt">现场：回传文件夹说明</a>
        <a class="button secondary" href="PACK_FIELD_RETURN_ON_WINDOWS.bat">Windows：打包回传证据</a>
        <a class="button secondary" href="PACK_FIELD_RETURN_ON_MAC.command">macOS：打包回传证据</a>
      </div>
      <p>如果浏览器不允许直接打开脚本，就回到这个文件夹，手动双击同名文件。</p>
    </section>

    <section class="panel">
      <h2>第 3 步：只记遥控器</h2>
      <div class="remote">
        <div class="key">方向键：移动</div>
        <div class="key">OK：进入</div>
        <div class="key">返回：首页会先问是否退出</div>
        <div class="key">1：看电视</div>
        <div class="key">直播 1-9：直达频道</div>
        <div class="key">播放/暂停：暂停或继续直播</div>
        <div class="key">频道列表 7/8：收藏/只看收藏</div>
        <div class="key">4：摄像头检查</div>
        <div class="key">5：全部内容</div>
        <div class="key">帮助页 3：遥控练习</div>
        <div class="key">6：帮助/自检</div>
        <div class="key">0：帮助/自检</div>
        <div class="key">菜单/信息/帮助键：帮助/自检</div>
      </div>
    </section>

    <section class="panel">
      <h2>失败时发什么给维护人员</h2>
      <ul>
        <li>安装完成后：打开 <a href="FIELD_ACCEPTANCE_CHECKLIST.zh-CN.md">FIELD_ACCEPTANCE_CHECKLIST.zh-CN.md</a>，按清单打勾。</li>
        <li>安装前不确定有没有准备好：打开 <a href="PRE_INSTALL_CHECKLIST.zh-CN.md">安装前自检卡</a>。</li>
        <li>测过真实盒子后：现场人员打开 <a href="FIELD_WIZARD_OFFLINE.html">离线现场验收表</a>，先点一键模板再修正不符合项，填写并下载记录；单份 JSON 用 <code>npm run tv-box:field-import -- &lt;现场下载的JSON&gt;</code> 导入，多份 JSON 放进 <code>reports/tv-box-field-inbox/</code> 后用 <code>npm run tv-box:field-inbox</code> 批量导入；同时可打开 <a href="tv-box-field-inbox-latest.md">现场 JSON 收件箱</a>、<a href="tv-box-field-import-latest.md">离线导入记录</a>、<a href="tv-box-field-wizard-latest.md">现场验收向导记录</a> 和 <a href="FIELD_COMPATIBILITY_MATRIX.zh-CN.md">兼容性矩阵说明</a>。</li>
        <li>发回现场证据前：打开 <a href="FIELD_RETURN_CARD.html">现场回传卡</a>，确认 JSON、维护码照片、安装日志/排障包和异常键值照片都齐了；把这些文件放进 <a href="FIELD_RETURN/README.zh-CN.txt">FIELD_RETURN</a> 后双击打包脚本，工程人员收到 zip 后先跑 <code>npm run tv-box:return-inbox -- &lt;现场回传目录或zip&gt;</code> 质检。</li>
        <li>不知道盒子/遥控器/摄像头/麦克风怎么选：先打开 <a href="HARDWARE_SELECTION_CARD.html">硬件选型卡</a> 给采购/现场看，再打开 <a href="tv-box-hardware-profile-latest.md">硬件兼容性画像</a>，按推荐规格和风险标记处理。</li>
        <li>要用手机当电视摄像头：先打开 <a href="TV_BOX_PHONE_CAMERA_CONTRACT.zh-CN.md">手机摄像头信令与验收合同</a>，按 WebRTC 房间码、信令、隐私和现场证据边界开发/验收。</li>
        <li>工程人员看本次自动沉淀：打开 <a href="tv-box-easy-run-latest.md">一键安装自动沉淀摘要</a>，确认交付包、排障包、readiness 和下一步。</li>
        <li>安装失败：把 <code>INSTALL_LOG.txt</code> 发给维护人员，再打开 <a href="INSTALL_SUPPORT.zh-CN.md">INSTALL_SUPPORT.zh-CN.md</a>。</li>
        <li>Windows 安装失败：看窗口里的 <code>E10-E99</code> 错误代码，再打开 <a href="WINDOWS_HELP.zh-CN.md">WINDOWS_HELP.zh-CN.md</a>。</li>
        <li>App 里不会操作：按遥控器 <code>0</code>，或按菜单/信息/帮助键；首页和摄像头页也可以按 <code>6</code>。帮助页按 <code>3</code> 可进入“遥控器练习”，按 <code>5</code> 可打开电视端“现场验收”大字指引，也可以把屏幕上的“维护码”读给维护人员。</li>
        <li>工程人员远程排障：让工程人员收集 <code>tv-box-support-latest.zip</code>。</li>
      </ul>
    </section>

    <section class="panel">
      <h2>工程人员命令</h2>
      <p><code>BOX_IP=&lt;盒子IP&gt; npm run tv-box:easy</code></p>
      <p><code>BOX_IP=&lt;盒子IP&gt; npm run tv-box:authorize</code></p>
      <p><code>BOX_IP=&lt;盒子IP&gt; RUN_CAMERA_SMOKE=true npm run tv-box:easy</code></p>
      <p>包名：<code>$PACKAGE_NAME</code>；生成时间：<code>$(date '+%Y-%m-%d %H:%M:%S %Z')</code></p>
    </section>
  </main>
</body>
</html>
STARTHERE

cat > "$HANDOFF_DIR/QUICK_START.zh-CN.md" <<QUICKSTART
# 先看这里：HelloTV 电视盒子 3 步安装

这个目录已经是完整交付包。不要改文件名，按下面做即可。

如果不习惯看 Markdown，直接双击 \`START_HERE.html\`；只想教家人怎么用时双击 \`OPERATION_CARD.html\` 打印；需要采购/复核硬件时双击 \`HARDWARE_SELECTION_CARD.html\` 打印；要做手机当电视摄像头时先打开 \`TV_BOX_PHONE_CAMERA_CONTRACT.zh-CN.md\`；测完真实盒子准备发回证据时双击 \`FIELD_RETURN_CARD.html\`，再把文件放进 \`FIELD_RETURN\` 文件夹并双击 \`PACK_FIELD_RETURN_ON_WINDOWS.bat\` 或 \`PACK_FIELD_RETURN_ON_MAC.command\` 打包；如果电脑打不开网页文件，就打开 \`README_FIRST.txt\`。

安装前先打开 \`PRE_INSTALL_CHECKLIST.zh-CN.md\`，按 6 项确认电脑、电视盒子、IP、网络调试、RSA 授权和交付文件都准备好，再双击安装脚本。

## 第 1 步：准备电视盒子

1. 让电视盒子和电脑连同一个 Wi-Fi 或网线网络。
2. 在电视盒子打开“开发者选项 / 网络调试”。
3. 记下电视盒子 IP，例如 \`192.168.1.23\`。
4. 如果电视上弹出 RSA 授权，选“允许”。

## 第 2 步：按电脑选择安装方式

- macOS：双击 \`INSTALL_ON_MAC.command\`。
- Windows：双击 \`INSTALL_ON_WINDOWS.bat\`。
- 工程人员先查授权：在源码工程执行 \`BOX_IP=<盒子IP> npm run tv-box:authorize\`，报告变成 \`ready_for_install\` 后再安装。
- 工程人员：在源码工程执行 \`BOX_IP=<盒子IP> npm run tv-box:easy\`。

按提示输入电视盒子 IP。安装完成后电视上应显示“电视盒子简易模式”。
安装脚本会在当前目录写入 \`INSTALL_LOG.txt\`。如果失败，先打开 \`INSTALL_SUPPORT.zh-CN.md\`；Windows 再看窗口里的 \`E10-E99\` 错误代码并打开 \`WINDOWS_HELP.zh-CN.md\` 按代码处理。

## 第 3 步：只记这几个遥控器按键

- 方向键：移动黄色选中框。
- OK：进入当前按钮。
- 返回：回上一步；首页会先问是否退出。
- 1：看电视。
- 直播里 1-9：直达对应频道。
- 直播里播放/暂停键：暂停或继续播放。
- 打开频道列表后 7：收藏/取消收藏；8：只看收藏/全部频道。
- 4：摄像头检查。
- 5：全部内容；误进复杂首页时，按 0/6/菜单/信息/帮助进自检，按返回回简易首页。
- 6：帮助/自检。
- 0：帮助/自检。
- 菜单/信息/帮助键：帮助/自检。

安装完成后打开 \`FIELD_ACCEPTANCE_CHECKLIST.zh-CN.md\`，按清单打勾再交付；不知道盒子、遥控器、USB 摄像头或麦克风该怎么选时，先打开 \`HARDWARE_SELECTION_CARD.html\` 给采购/现场看，再打开 \`tv-box-hardware-profile-latest.md\` 看机器生成的风险标记。
如果现场要试“手机当电视摄像头”，先打开 \`TV_BOX_PHONE_CAMERA_CONTRACT.zh-CN.md\`；这条路线按手机采集、局域网 WebSocket 信令、电视盒子原生 WebRTC 接收端验收，不把手机误当系统 Camera2 摄像头。
测过真实盒子后，现场人员可先打开 \`FIELD_WIZARD_OFFLINE.html\`，不用 npm 也能先套用一键模板、修正不符合项，再下载 JSON/Markdown/env 记录；工程人员单份 JSON 用 \`npm run tv-box:field-import -- <现场下载的JSON>\` 自动导入，多份 JSON 放入 \`reports/tv-box-field-inbox/\` 后用 \`npm run tv-box:field-inbox\` 批量导入，也可拿到 env 后运行 \`BOX_IP=<盒子IP> npm run tv-box:field-record\`，把盒子、遥控器、摄像头和麦克风结果写入 \`tv-box-field-record-latest.md\` 与 \`tv-box-field-matrix.csv\`；再运行或查看自动生成的 \`tv-box-compatibility-summary-latest.md\`，快速区分推荐组合、核心可用组合、待修复组合和待补测组合。多人多盒复测时打开 \`FIELD_COMPATIBILITY_MATRIX.zh-CN.md\` 按模板统一记录。
发回现场证据前，先打开 \`FIELD_RETURN_CARD.html\`，按“必须发回 4 样”检查 JSON、维护码照片、INSTALL_LOG/support zip 和异常按键照片，避免工程人员拿到不完整证据。工程人员收到整个目录或 zip 后先运行 \`npm run tv-box:return-inbox -- <现场回传目录或zip>\`，确认齐全后再加 \`--append\` 写入兼容性矩阵。
现场人员不会压缩文件时，把所有证据放进 \`FIELD_RETURN\` 文件夹，Windows 双击 \`PACK_FIELD_RETURN_ON_WINDOWS.bat\`，macOS 双击 \`PACK_FIELD_RETURN_ON_MAC.command\`；生成的 \`HelloTV-field-return-*.zip\` 直接发给工程人员。
遇到问题时，先按 0 或菜单/信息/帮助键打开帮助/自检；首页和摄像头页也可以按 6，把屏幕上的“维护码”读给维护人员；工程人员再收 \`tv-box-support-latest.zip\`。
QUICKSTART

cat > "$HANDOFF_DIR/PRE_INSTALL_CHECKLIST.zh-CN.md" <<'PREINSTALL'
# 安装前自检卡

这张卡给现场人员用。先按下面 6 项确认，再双击安装脚本；不确定时直接拍照发给维护人员。

## 6 项准备

- [ ] 电脑和电视盒子在同一个 Wi-Fi 或同一条网线网络里。
- [ ] 电视盒子已经打开“开发者选项 / 网络调试”。
- [ ] 已经在电视盒子系统设置里看到 IP 地址，例如 `192.168.1.23`。
- [ ] 交付目录没有被拆散：`HelloTV-debug.apk`、`SHA256SUMS`、`INSTALL_ON_WINDOWS.bat`、`INSTALL_ON_MAC.command` 都在同一个文件夹。
- [ ] Windows 电脑双击 `INSTALL_ON_WINDOWS.bat`；macOS 电脑双击 `INSTALL_ON_MAC.command`。
- [ ] 电视上弹出 RSA 授权时，选择“允许”。

## 如果卡住

- 找不到 IP：先看电视盒子“网络 / 关于本机 / 开发者选项”页面。
- 没有 RSA 弹窗：关闭再打开网络调试，或重启电视盒子后重新双击安装脚本。
- Windows 出现 `E10-E99`：打开 `WINDOWS_HELP.zh-CN.md`，按同一个错误代码处理。
- 安装脚本失败：把 `INSTALL_LOG.txt`、电视盒子型号、盒子 IP、电视屏幕照片发给维护人员。

## 工程人员自动预检

源码工程里可执行：

```bash
BOX_IP=<盒子IP> npm run tv-box:authorize
BOX_IP=<盒子IP> npm run tv-box:preflight
```

授权助手会生成 `reports/tv-box-authorization-latest.md/json`，只告诉现场“缺 adb / 没给 IP / 要点 RSA / 要选设备 / 可安装”的下一步；预检会生成 `reports/tv-box-preflight-latest.md/json`，自动判断电脑工具链、交付包 SHA256、ADB 授权、实机连接和下一步动作。
PREINSTALL

cat > "$HANDOFF_DIR/INSTALL.zh-CN.md" <<HANDOFF
# HelloTV 电视盒子安装包

- APK: \`HelloTV-debug.apk\`
- 包名: \`$PACKAGE_NAME\`
- 先看这里: \`START_HERE.html\` / \`README_FIRST.txt\` / \`QUICK_START.zh-CN.md\`
- 安装前自检: \`PRE_INSTALL_CHECKLIST.zh-CN.md\`
- 交付清单: \`MANIFEST.json\`
- 机器检查: \`tv-box-inspection-latest.json\`
- Windows 排障: \`WINDOWS_HELP.zh-CN.md\`
- 安装失败发给维护人员: \`INSTALL_SUPPORT.zh-CN.md\`
- 可打印操作卡: \`OPERATION_CARD.html\`
- Markdown 操作卡: \`OPERATION_CARD.zh-CN.md\`
- 硬件选型卡: \`HARDWARE_SELECTION_CARD.html\` / \`HARDWARE_SELECTION_CARD.zh-CN.md\`
- 音视频测试硬件方案: \`TV_BOX_AV_TEST_HARDWARE.zh-CN.md\`
- 手机摄像头信令与验收合同: \`TV_BOX_PHONE_CAMERA_CONTRACT.zh-CN.md\`
- 现场验收清单: \`FIELD_ACCEPTANCE_CHECKLIST.zh-CN.md\`
- 现场回传卡: \`FIELD_RETURN_CARD.html\` / \`FIELD_RETURN_CARD.zh-CN.md\`
- 现场回传文件夹: \`FIELD_RETURN/README.zh-CN.txt\`
- 现场回传一键打包: \`PACK_FIELD_RETURN_ON_MAC.command\` / \`PACK_FIELD_RETURN_ON_WINDOWS.bat\`
- 离线现场验收表: \`FIELD_WIZARD_OFFLINE.html\`
- 离线验收导入记录: \`tv-box-field-import-latest.md\`
- 现场验收向导记录: \`tv-box-field-wizard-latest.md\`
- 实机兼容性矩阵: \`FIELD_COMPATIBILITY_MATRIX.zh-CN.md\`
- 现场 JSON 收件箱: \`tv-box-field-inbox-latest.md\`
- 硬件兼容性画像: \`tv-box-hardware-profile-latest.md\`
- 兼容性自动汇总: \`tv-box-compatibility-summary-latest.md\`
- 生成时间: $(date '+%Y-%m-%d %H:%M:%S %Z')

## 给现场人员

如果你只想安装，不想看完整说明，优先打开 \`START_HERE.html\`；打不开网页时打开 \`README_FIRST.txt\` 或 \`QUICK_START.zh-CN.md\`。
\`tv-box-inspection-latest.json\` 里的 \`readiness\` 字段会写明当前交付是否可用、是否还缺真实盒子验收，以及下一步该做什么。

## 最省事安装

让电视盒子打开“开发者选项 / 网络调试”，找到盒子 IP，然后在项目目录执行：

\`\`\`bash
BOX_IP=<盒子IP> npm run tv-box:authorize
BOX_IP=<盒子IP> npm run tv-box:easy
\`\`\`

先看授权助手报告是否已经是 \`ready_for_install\`；通过后，一键安装命令会自动构建、连接、安装、启动，执行一轮遥控器冒烟，并重新生成验收报告。

## 只拿到交付目录时

在 macOS 上可以直接双击本目录里的 \`INSTALL_ON_MAC.command\`，在 Windows 上可以直接双击 \`INSTALL_ON_WINDOWS.bat\`，按提示输入电视盒子 IP。它们会安装本目录里的 \`HelloTV-debug.apk\` 并启动 App，不需要打开源码工程。

macOS/Windows 双击脚本都会在本目录写入 \`INSTALL_LOG.txt\`。失败时先打开 \`INSTALL_SUPPORT.zh-CN.md\`，把日志、盒子型号、盒子 IP 和电视屏幕照片发给维护人员。Windows 双击脚本还会显示 \`E10-E99\` 错误代码；现场人员不用理解命令行，打开 \`WINDOWS_HELP.zh-CN.md\` 找到同一个代码处理即可。

安装完成后打开 \`FIELD_ACCEPTANCE_CHECKLIST.zh-CN.md\`，逐项确认遥控器、直播、帮助/自检、摄像头、麦克风和排障证据；不满足清单时不要标记交付完成。

如果要验证“手机当电视摄像头”，先打开 \`TV_BOX_PHONE_CAMERA_CONTRACT.zh-CN.md\`，按合同里的房间码、WebRTC 信令、电视盒子原生接收端、手机权限、隐私停止按钮和现场证据清单推进；这条路线不是系统 Camera2 摄像头，微信小程序 \`live-pusher\` 也必须等主体资质和接口权限通过后再作为入口。

如果要沉淀多款盒子/摄像头/麦克风兼容性，现场人员优先打开 \`FIELD_WIZARD_OFFLINE.html\`，先用一键模板降低填写成本，再修正不符合项并下载记录；工程人员单份 JSON 用 \`npm run tv-box:field-import -- <现场下载的JSON>\` 导入，多份 JSON 放进 \`reports/tv-box-field-inbox/\` 后用 \`npm run tv-box:field-inbox\` 批量导入，也可按 \`FIELD_COMPATIBILITY_MATRIX.zh-CN.md\` 的字段执行 \`BOX_IP=<盒子IP> npm run tv-box:field-record\`。脚本会生成 \`tv-box-field-inbox-latest.md\`、\`tv-box-field-record-latest.md\`、\`tv-box-field-record-latest.json\` 和 \`tv-box-field-matrix.csv\`，再由 \`npm run tv-box:compatibility-summary\` 生成 \`tv-box-compatibility-summary-latest.md/json\`，由 \`npm run tv-box:hardware-profile\` 生成 \`tv-box-hardware-profile-latest.md/json\`，后续复测同一套字段即可横向比较。

现场人员准备发回资料前，先打开 \`FIELD_RETURN_CARD.html\`，按卡片确认 4 样证据齐全；不会手动压缩时，把 JSON、照片、\`INSTALL_LOG.txt\` 或 \`tv-box-support-latest.zip\` 放进 \`FIELD_RETURN\` 文件夹，再双击 \`PACK_FIELD_RETURN_ON_WINDOWS.bat\` 或 \`PACK_FIELD_RETURN_ON_MAC.command\` 生成 \`HelloTV-field-return-*.zip\`。工程人员收到后先执行 \`npm run tv-box:return-inbox -- <现场回传目录或zip>\` 做证据质检，确认是真实盒子验收后再加 \`--append\`；看到 \`unknown\` 时不要关闭，只能要求补测或明确标成 \`pass/fail/skip/na\`。

如果你已经熟悉 ADB，也可以直接执行：

\`\`\`bash
BOX_IP=<盒子IP> npm run tv-box:install-debug
\`\`\`

## 已经拿到 APK 时

如果只想手动安装本目录里的 \`HelloTV-debug.apk\`：

\`\`\`bash
adb connect <盒子IP>:5555
adb install -r HelloTV-debug.apk
adb shell am start -n $PACKAGE_NAME/.MainActivity
\`\`\`

## 装好后检查

\`\`\`bash
BOX_IP=<盒子IP> npm run tv-box:doctor
BOX_IP=<盒子IP> npm run tv-box:inspect
BOX_IP=<盒子IP> npm run tv-box:report
\`\`\`

## 摄像头专门验收

\`\`\`bash
BOX_IP=<盒子IP> npm run tv-box:camera-smoke
BOX_IP=<盒子IP> RUN_CAMERA_SMOKE=true npm run tv-box:easy
\`\`\`

## 远程排障包

如果现场安装或摄像头验收失败，在源码工程里执行：

\`\`\`bash
BOX_IP=<盒子IP> npm run tv-box:support
\`\`\`

然后把 \`reports/tv-box-support-latest.zip\` 发给维护人员。

报告文件：\`tv-box-acceptance-latest.md\`
HANDOFF

cat > "$HANDOFF_DIR/INSTALL_SUPPORT.zh-CN.md" <<'INSTALLSUPPORT'
# 安装失败时发给维护人员

这份说明给现场人员用。不要重新打字描述问题，按下面收集即可。

## 先发 5 样

1. `INSTALL_LOG.txt`：双击 `INSTALL_ON_MAC.command` 或 `INSTALL_ON_WINDOWS.bat` 后自动生成，里面包含安装后包路径、当前前台窗口、当前 Activity 和最近 HelloTV/崩溃日志。
2. 电视盒子型号。
3. 电视盒子 IP。
4. 电视屏幕照片，尤其是 RSA 授权弹窗、黑屏、权限弹窗或错误提示。
5. 如果 App 已经能打开，按遥控器 `6` 或 `0`，或按菜单/信息/帮助键进入帮助/自检，把屏幕上的“维护码”也发给维护人员。

## 现场先确认

- 电视盒子和电脑在同一个网络。
- 电视盒子已经打开“开发者选项 / 网络调试”。
- 电视上弹出 RSA 授权时选择了“允许”。
- 交付目录没有被拆散：`HelloTV-debug.apk`、`SHA256SUMS`、安装脚本必须在同一个目录。
- Windows 如果出现 `E10-E99`，继续打开 `WINDOWS_HELP.zh-CN.md` 按错误代码处理。

## 工程人员继续排障

拿到源码工程时执行：

```bash
BOX_IP=<盒子IP> npm run tv-box:support
```

然后把 `reports/tv-box-support-latest.zip` 和现场的 `INSTALL_LOG.txt` 一起归档。
INSTALLSUPPORT

cat > "$FIELD_RETURN_DIR/README.zh-CN.txt" <<'FIELDRETURNREADME'
HelloTV 现场回传文件夹

测完真实电视盒子后，把下面 4 类文件放进这个 FIELD_RETURN 文件夹：

1. FIELD_WIZARD_OFFLINE.html 下载的 JSON。
2. 电视帮助/自检页或摄像头页的“维护码”照片。
3. INSTALL_LOG.txt；如果失败，同时放入 tv-box-support-latest.zip。
4. 如果有失败、unknown、黑屏、权限或摄像头问题，再放入异常照片、日志或 keyCode 照片。

放好后：

- Windows：回到上一层目录，双击 PACK_FIELD_RETURN_ON_WINDOWS.bat。
- macOS：回到上一层目录，双击 PACK_FIELD_RETURN_ON_MAC.command。

脚本会生成 HelloTV-field-return-*.zip。把这个 zip 发给工程人员即可，不要再分开发散件。
FIELDRETURNREADME

cat > "$HANDOFF_DIR/PACK_FIELD_RETURN_ON_MAC.command" <<'MAC_RETURN_PACKER'
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RETURN_DIR="$SCRIPT_DIR/FIELD_RETURN"
STAMP="$(date '+%Y%m%d-%H%M%S')"
OUT_PATH="$SCRIPT_DIR/HelloTV-field-return-$STAMP.zip"
LOG_PATH="$SCRIPT_DIR/FIELD_RETURN_PACK_LOG.txt"
STAGING_DIR="$(mktemp -d "${TMPDIR:-/tmp}/hellotv-field-return.XXXXXX")"
PAYLOAD_DIR="$STAGING_DIR/HelloTV-field-return"

cleanup() {
  rm -rf "$STAGING_DIR"
}
trap cleanup EXIT

{
  echo "HelloTV 现场回传打包"
  echo "生成时间: $(date '+%Y-%m-%d %H:%M:%S %Z')"
  echo "交付目录: $SCRIPT_DIR"
  echo "回传目录: $RETURN_DIR"
  echo
} > "$LOG_PATH"

mkdir -p "$RETURN_DIR" "$PAYLOAD_DIR"
cp -R "$RETURN_DIR"/. "$PAYLOAD_DIR"/ 2>/dev/null || true

if [[ -f "$SCRIPT_DIR/INSTALL_LOG.txt" && ! -f "$PAYLOAD_DIR/INSTALL_LOG.txt" ]]; then
  cp "$SCRIPT_DIR/INSTALL_LOG.txt" "$PAYLOAD_DIR/INSTALL_LOG.txt"
fi

if [[ -f "$SCRIPT_DIR/tv-box-support-latest.zip" && ! -f "$PAYLOAD_DIR/tv-box-support-latest.zip" ]]; then
  cp "$SCRIPT_DIR/tv-box-support-latest.zip" "$PAYLOAD_DIR/tv-box-support-latest.zip"
fi

cat > "$PAYLOAD_DIR/RETURN_NOTE.txt" <<NOTE
HelloTV field return package
Generated at: $(date '+%Y-%m-%d %H:%M:%S %Z')

Required evidence:
1. FIELD_WIZARD_OFFLINE.html JSON
2. Support-code photo
3. INSTALL_LOG.txt or tv-box-support-latest.zip
4. Issue photo/log/keyCode when any item failed or stayed unknown
NOTE

json_count="$(find "$PAYLOAD_DIR" -type f -iname '*.json' | wc -l | tr -d ' ')"
photo_count="$(find "$PAYLOAD_DIR" -type f \( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' -o -iname '*.heic' -o -iname '*.webp' \) | wc -l | tr -d ' ')"
log_count="$(find "$PAYLOAD_DIR" -type f \( -iname 'INSTALL_LOG.txt' -o -iname '*.log' -o -iname '*.txt' \) | wc -l | tr -d ' ')"
support_count="$(find "$PAYLOAD_DIR" -type f \( -iname 'tv-box-support*.zip' -o -iname 'tv-box-support*.tar.gz' \) | wc -l | tr -d ' ')"

{
  echo "JSON 文件数: $json_count"
  echo "照片文件数: $photo_count"
  echo "日志文件数: $log_count"
  echo "排障包数: $support_count"
  if [[ "$json_count" -eq 0 ]]; then echo "提醒: 没看到现场验收 JSON。"; fi
  if [[ "$photo_count" -eq 0 ]]; then echo "提醒: 没看到维护码或异常照片。"; fi
  if [[ "$log_count" -eq 0 && "$support_count" -eq 0 ]]; then echo "提醒: 没看到 INSTALL_LOG.txt 或排障包。"; fi
} >> "$LOG_PATH"

if command -v zip >/dev/null 2>&1; then
  (cd "$STAGING_DIR" && zip -qr "$OUT_PATH" "HelloTV-field-return")
else
  ditto -c -k --sequesterRsrc --keepParent "$PAYLOAD_DIR" "$OUT_PATH"
fi

{
  echo
  echo "已生成: $OUT_PATH"
  echo "请把这个 zip 发给工程人员。"
} | tee -a "$LOG_PATH"

if command -v open >/dev/null 2>&1; then
  open -R "$OUT_PATH" >/dev/null 2>&1 || true
fi
MAC_RETURN_PACKER
chmod +x "$HANDOFF_DIR/PACK_FIELD_RETURN_ON_MAC.command"

cat > "$HANDOFF_DIR/PACK_FIELD_RETURN_ON_WINDOWS.bat" <<'WINDOWS_RETURN_PACKER'
@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul

set "SCRIPT_DIR=%~dp0"
set "RETURN_DIR=%SCRIPT_DIR%FIELD_RETURN"
set "LOG_PATH=%SCRIPT_DIR%FIELD_RETURN_PACK_LOG.txt"

if not exist "%RETURN_DIR%" mkdir "%RETURN_DIR%"

for /f %%T in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set "STAMP=%%T"
set "OUT_PATH=%SCRIPT_DIR%HelloTV-field-return-%STAMP%.zip"

> "%LOG_PATH%" echo HelloTV 现场回传打包
>> "%LOG_PATH%" echo 交付目录: %SCRIPT_DIR%
>> "%LOG_PATH%" echo 回传目录: %RETURN_DIR%
>> "%LOG_PATH%" echo 输出文件: %OUT_PATH%

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop';" ^
  "$script=[IO.Path]::GetFullPath('%SCRIPT_DIR%');" ^
  "$return=Join-Path $script 'FIELD_RETURN';" ^
  "$out=Join-Path $script 'HelloTV-field-return-%STAMP%.zip';" ^
  "$stage=Join-Path $env:TEMP ('HelloTV-field-return-' + [guid]::NewGuid().ToString('N'));" ^
  "$payload=Join-Path $stage 'HelloTV-field-return';" ^
  "New-Item -ItemType Directory -Force -Path $payload | Out-Null;" ^
  "if (Test-Path $return) { Get-ChildItem -LiteralPath $return -Force | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $payload -Recurse -Force } };" ^
  "foreach ($name in @('INSTALL_LOG.txt','tv-box-support-latest.zip')) { $p=Join-Path $script $name; if ((Test-Path $p) -and -not (Test-Path (Join-Path $payload $name))) { Copy-Item -LiteralPath $p -Destination $payload -Force } };" ^
  "$note=@('HelloTV field return package','Generated at: ' + (Get-Date),'Required evidence:','1. FIELD_WIZARD_OFFLINE.html JSON','2. Support-code photo','3. INSTALL_LOG.txt or tv-box-support-latest.zip','4. Issue photo/log/keyCode when any item failed or stayed unknown');" ^
  "Set-Content -LiteralPath (Join-Path $payload 'RETURN_NOTE.txt') -Encoding UTF8 -Value $note;" ^
  "$json=(Get-ChildItem -LiteralPath $payload -Recurse -File -Filter *.json).Count;" ^
  "$photo=(Get-ChildItem -LiteralPath $payload -Recurse -File | Where-Object { $_.Extension -match '^\.(jpg|jpeg|png|heic|webp)$' }).Count;" ^
  "$logs=(Get-ChildItem -LiteralPath $payload -Recurse -File | Where-Object { $_.Name -ieq 'INSTALL_LOG.txt' -or $_.Extension -match '^\.(log|txt)$' }).Count;" ^
  "$support=(Get-ChildItem -LiteralPath $payload -Recurse -File | Where-Object { $_.Name -like 'tv-box-support*.zip' -or $_.Name -like 'tv-box-support*.tar.gz' }).Count;" ^
  "Add-Content -LiteralPath (Join-Path $script 'FIELD_RETURN_PACK_LOG.txt') -Value ('JSON 文件数: ' + $json);" ^
  "Add-Content -LiteralPath (Join-Path $script 'FIELD_RETURN_PACK_LOG.txt') -Value ('照片文件数: ' + $photo);" ^
  "Add-Content -LiteralPath (Join-Path $script 'FIELD_RETURN_PACK_LOG.txt') -Value ('日志文件数: ' + $logs);" ^
  "Add-Content -LiteralPath (Join-Path $script 'FIELD_RETURN_PACK_LOG.txt') -Value ('排障包数: ' + $support);" ^
  "if (Test-Path $out) { Remove-Item -LiteralPath $out -Force };" ^
  "Compress-Archive -LiteralPath $payload -DestinationPath $out -Force;" ^
  "Remove-Item -LiteralPath $stage -Recurse -Force;" ^
  "Write-Host ('已生成: ' + $out);"

if errorlevel 1 (
  echo.
  echo 打包失败。请把 FIELD_RETURN_PACK_LOG.txt 和屏幕截图发给工程人员。
  pause
  exit /b 1
)

echo.
echo 已生成: %OUT_PATH%
echo 请把这个 zip 发给工程人员。
echo 日志: %LOG_PATH%
pause
WINDOWS_RETURN_PACKER

cat > "$HANDOFF_DIR/INSTALL_ON_MAC.command" <<INSTALLER
#!/usr/bin/env bash
set -euo pipefail

PACKAGE_NAME="$PACKAGE_NAME"
MAIN_ACTIVITY="$PACKAGE_NAME/.MainActivity"
BOX_IP="\${BOX_IP:-}"
DEVICE_SERIAL="\${DEVICE_SERIAL:-}"
BOX_TARGET=""
ADB=""

SCRIPT_DIR="\$(cd "\$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
APK_PATH="\$SCRIPT_DIR/HelloTV-debug.apk"
CHECKSUM_FILE="\$SCRIPT_DIR/SHA256SUMS"
LOG_PATH="\$SCRIPT_DIR/INSTALL_LOG.txt"
SUPPORT_GUIDE="\$SCRIPT_DIR/INSTALL_SUPPORT.zh-CN.md"

start_log() {
  : > "\$LOG_PATH"
  exec > >(tee -a "\$LOG_PATH") 2>&1
  echo "HelloTV macOS installer log"
  echo "startedAt: \$(date '+%Y-%m-%d %H:%M:%S %Z')"
  echo "scriptDir: \$SCRIPT_DIR"
  echo "packageName: \$PACKAGE_NAME"
  echo "boxIp: \${BOX_IP:-not provided}"
  echo "deviceSerial: \${DEVICE_SERIAL:-not provided}"
  echo
  sw_vers 2>/dev/null || true
  echo
}

print_step() {
  echo
  echo "== \$1 =="
}

pause_if_interactive() {
  if [[ -t 0 ]]; then
    echo
    read -r -p "按回车关闭窗口。" _
  fi
}

fail() {
  echo
  echo "错误：\$1" >&2
  echo "安装日志：\$LOG_PATH" >&2
  if [[ -f "\$SUPPORT_GUIDE" ]]; then
    echo "排障说明：\$SUPPORT_GUIDE" >&2
  fi
  echo "把 INSTALL_LOG.txt、电视盒子型号、盒子 IP 和电视屏幕照片发给维护人员即可排查。" >&2
  pause_if_interactive
  exit 1
}

normalize_box_target() {
  local target="\$1"
  if [[ "\$target" == *":"* ]]; then
    printf '%s' "\$target"
  else
    printf '%s:5555' "\$target"
  fi
}

find_adb() {
  local candidate
  if command -v adb >/dev/null 2>&1; then
    command -v adb
    return
  fi

  for candidate in \
    "/opt/homebrew/bin/adb" \
    "/usr/local/bin/adb" \
    "\$HOME/Library/Android/sdk/platform-tools/adb" \
    "/opt/homebrew/share/android-commandlinetools/platform-tools/adb" \
    "/usr/local/share/android-commandlinetools/platform-tools/adb"; do
    if [[ -x "\$candidate" ]]; then
      printf '%s\n' "\$candidate"
      return
    fi
  done
}

verify_apk_checksum() {
  local expected_sha
  local actual_sha

  [[ -f "\$CHECKSUM_FILE" ]] || fail "没有找到 SHA256SUMS。请确认交付目录完整，不要单独移动安装脚本。"

  expected_sha="\$(awk '\$2 == "HelloTV-debug.apk" { print \$1 }' "\$CHECKSUM_FILE" | sed -n '1p')"
  [[ -n "\$expected_sha" ]] || fail "SHA256SUMS 里没有 HelloTV-debug.apk 的校验值。请重新获取交付包。"

  if command -v shasum >/dev/null 2>&1; then
    actual_sha="\$(shasum -a 256 "\$APK_PATH" | awk '{ print \$1 }')"
  elif command -v openssl >/dev/null 2>&1; then
    actual_sha="\$(openssl dgst -sha256 -r "\$APK_PATH" | awk '{ print \$1 }')"
  else
    fail "这台电脑缺少 shasum/openssl，无法在安装前校验 APK。"
  fi

  if [[ "\$actual_sha" != "\$expected_sha" ]]; then
    fail "APK SHA256 校验失败。文件可能传输损坏或拿错版本，请重新解压 tv-box-handoff-latest.zip。"
  fi

  echo "APK SHA256 校验通过：\$actual_sha"
}

select_device() {
  local devices
  local device_count

  if [[ -n "\$BOX_IP" ]]; then
    BOX_TARGET="\$(normalize_box_target "\$BOX_IP")"
    print_step "连接电视盒子"
    "\$ADB" connect "\$BOX_TARGET" || true
  fi

  print_step "当前设备"
  "\$ADB" devices -l

  devices="\$("\$ADB" devices | awk 'NR > 1 && \$2 == "device" { print \$1 }')"
  device_count="\$(printf '%s\n' "\$devices" | sed '/^$/d' | wc -l | tr -d ' ')"

  if [[ "\$device_count" -eq 0 ]]; then
    if [[ -z "\$BOX_IP" && -t 0 ]]; then
      echo
      echo "没有找到已授权的电视盒子。"
      echo "请在电视盒子打开：设置 -> 开发者选项 -> 网络调试，然后查看盒子 IP。"
      read -r -p "请输入电视盒子 IP；直接回车退出： " BOX_IP
      if [[ -n "\$BOX_IP" ]]; then
        BOX_TARGET="\$(normalize_box_target "\$BOX_IP")"
        "\$ADB" connect "\$BOX_TARGET" || true
        devices="\$("\$ADB" devices | awk 'NR > 1 && \$2 == "device" { print \$1 }')"
        device_count="\$(printf '%s\n' "\$devices" | sed '/^$/d' | wc -l | tr -d ' ')"
      fi
    fi
  fi

  if [[ "\$device_count" -eq 0 ]]; then
    "\$ADB" devices -l >&2
    if "\$ADB" devices | awk 'NR > 1 && (\$2 == "unauthorized" || \$2 == "offline") { found = 1 } END { exit found ? 0 : 1 }'; then
      fail "电视盒子已出现但未授权。请看电视屏幕，确认 RSA 授权弹窗，再重新运行。"
    fi
    fail "没有找到电视盒子。确认网络调试已开启，并让电脑和电视盒子在同一个局域网。"
  fi

  if [[ -z "\$DEVICE_SERIAL" && -n "\$BOX_TARGET" ]] && grep -Fxq "\$BOX_TARGET" <<< "\$devices"; then
    DEVICE_SERIAL="\$BOX_TARGET"
  fi

  if [[ -z "\$DEVICE_SERIAL" ]]; then
    if [[ "\$device_count" -eq 1 ]]; then
      DEVICE_SERIAL="\$(printf '%s\n' "\$devices" | sed '/^$/d' | sed -n '1p')"
    elif [[ -t 0 ]]; then
      echo
      echo "检测到多个设备，请从上面的列表复制一个 serial。"
      read -r -p "请输入 DEVICE_SERIAL；直接回车退出： " DEVICE_SERIAL
    fi
  fi

  [[ -n "\$DEVICE_SERIAL" ]] || fail "检测到多个设备，但没有指定 DEVICE_SERIAL。"
}

verify_installed_package() {
  local package_path
  package_path="\$("\$ADB" -s "\$DEVICE_SERIAL" shell "pm path \$PACKAGE_NAME" 2>/dev/null | tr -d '\r' || true)"
  if [[ -z "\$package_path" || "\$package_path" != *"\$PACKAGE_NAME"* ]]; then
    fail "APK 安装后未能读取到包路径。请重启盒子后重新安装；仍失败就发送 INSTALL_LOG.txt。"
  fi
  echo "安装后包路径：\$package_path"
}

capture_post_install_snapshot() {
  print_step "安装后自检"
  echo "Device: \$DEVICE_SERIAL"
  echo
  echo "Package path:"
  "\$ADB" -s "\$DEVICE_SERIAL" shell "pm path \$PACKAGE_NAME" 2>/dev/null | tr -d '\r' || true
  echo
  echo "Current focus:"
  "\$ADB" -s "\$DEVICE_SERIAL" shell "dumpsys window windows | grep -E 'mCurrentFocus|mFocusedApp|mFocusedWindow' | head -20" 2>/dev/null | tr -d '\r' || true
  echo
  echo "Resumed activity:"
  "\$ADB" -s "\$DEVICE_SERIAL" shell "dumpsys activity activities | grep -E 'mResumedActivity|ResumedActivity|topResumedActivity' | head -20" 2>/dev/null | tr -d '\r' || true
  echo
  echo "Recent HelloTV logs:"
  "\$ADB" -s "\$DEVICE_SERIAL" logcat -d -t 240 2>/dev/null | grep -E 'HelloTV|TvBoxModule|CameraPreviewActivity|AndroidRuntime|FATAL EXCEPTION|ActivityNotFound|Permission|Camera' || true
}

echo "HelloTV 电视盒子一键安装"
echo "只会安装本目录里的 APK：\$APK_PATH"
echo "包名：\$PACKAGE_NAME"
start_log

[[ -f "\$APK_PATH" ]] || fail "没有找到 HelloTV-debug.apk。请确认脚本和 APK 在同一个交付目录。"
verify_apk_checksum
ADB="\$(find_adb)"
[[ -n "\$ADB" ]] || fail "没有找到 adb。macOS 可先执行：brew install android-platform-tools"
echo "ADB：\$ADB"

select_device

print_step "安装 APK"
echo "Device: \$DEVICE_SERIAL"
"\$ADB" -s "\$DEVICE_SERIAL" install -r "\$APK_PATH"
verify_installed_package

print_step "启动 HelloTV"
"\$ADB" -s "\$DEVICE_SERIAL" shell am force-stop "\$PACKAGE_NAME" || true
"\$ADB" -s "\$DEVICE_SERIAL" shell am start -n "\$MAIN_ACTIVITY"
sleep 3
capture_post_install_snapshot

echo
echo "完成。电视上应显示“电视盒子简易模式”。"
echo "遥控器：方向键移动，OK 进入，0 打开帮助/自检。"
echo "安装日志：\$LOG_PATH"
pause_if_interactive
INSTALLER
chmod +x "$HANDOFF_DIR/INSTALL_ON_MAC.command"

cat > "$HANDOFF_DIR/INSTALL_ON_WINDOWS.bat" <<'WINDOWS_INSTALLER'
@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul

set "PACKAGE_NAME=com.quicktvui.hellotv"
set "MAIN_ACTIVITY=com.quicktvui.hellotv/.MainActivity"
set "SCRIPT_DIR=%~dp0"
set "APK_PATH=%SCRIPT_DIR%HelloTV-debug.apk"
set "CHECKSUM_PATH=%SCRIPT_DIR%SHA256SUMS"
set "LOG_PATH=%SCRIPT_DIR%INSTALL_LOG.txt"
set "SUPPORT_GUIDE=%SCRIPT_DIR%INSTALL_SUPPORT.zh-CN.md"
set "BOX_IP=%BOX_IP%"
set "DEVICE_SERIAL=%DEVICE_SERIAL%"
set "BOX_TARGET="
set "MULTIPLE_DEVICES=false"
set "ADB="
set "HELP_FILE=%SCRIPT_DIR%WINDOWS_HELP.zh-CN.md"
set "FAIL_CODE="
set "FAIL_REASON="

call :init_log

echo HelloTV 电视盒子一键安装
echo 只会安装本目录里的 APK: %APK_PATH%
echo 包名: %PACKAGE_NAME%
echo 安装日志: %LOG_PATH%
echo.

if not exist "%APK_PATH%" (
  set "FAIL_CODE=E10"
  set "FAIL_REASON=没有找到 HelloTV-debug.apk。请确认脚本和 APK 在同一个交付目录。"
  echo 错误: !FAIL_REASON!
  goto fail
)

call :verify_apk_checksum

call :find_adb
if "%ADB%"=="" (
  set "FAIL_CODE=E20"
  set "FAIL_REASON=没有找到 adb。请先安装 Android Platform Tools，或把 platform-tools 放到本目录旁边。"
  echo 错误: !FAIL_REASON!
  echo 下载地址: https://developer.android.com/tools/releases/platform-tools
  goto fail
)
echo ADB: %ADB%

echo == 当前设备 ==
"%ADB%" devices -l
echo.

call :select_device
if not "%DEVICE_SERIAL%"=="" goto install_app
if "!MULTIPLE_DEVICES!"=="true" (
  set "FAIL_CODE=E50"
  set "FAIL_REASON=检测到多个设备，但没有指定 DEVICE_SERIAL。"
  echo 错误: !FAIL_REASON!
  goto fail
)

if "%BOX_IP%"=="" (
  echo 没有找到已授权的电视盒子。
  echo 请在电视盒子打开: 设置 - 开发者选项 - 网络调试，然后查看盒子 IP。
  set /p "BOX_IP=请输入电视盒子 IP；直接回车退出: "
)

if "%BOX_IP%"=="" (
  set "FAIL_CODE=E30"
  set "FAIL_REASON=没有输入电视盒子 IP。"
  echo 错误: !FAIL_REASON!
  goto fail
)

call :normalize_box_target
echo.
echo == 连接电视盒子 ==
"%ADB%" connect "%BOX_TARGET%"
echo.

call :select_device
if "%DEVICE_SERIAL%"=="" call :wait_for_rsa
if "%DEVICE_SERIAL%"=="" (
  set "FAIL_CODE=E40"
  set "FAIL_REASON=没有找到已授权的电视盒子。请确认网络调试已开启，并在电视屏幕允许 RSA 授权。"
  echo 错误: !FAIL_REASON!
  "%ADB%" devices -l
  goto fail
)

:install_app
echo.
echo == 安装 APK ==
echo Device: %DEVICE_SERIAL%
"%ADB%" -s "%DEVICE_SERIAL%" install -r "%APK_PATH%"
if errorlevel 1 (
  set "FAIL_CODE=E60"
  set "FAIL_REASON=APK 安装失败。常见原因是盒子空间不足、旧包签名不一致、或 ADB 连接断开。"
  goto fail
)
call :verify_installed_package
if errorlevel 1 goto fail

echo.
echo == 启动 HelloTV ==
"%ADB%" -s "%DEVICE_SERIAL%" shell am force-stop "%PACKAGE_NAME%" >nul 2>nul
"%ADB%" -s "%DEVICE_SERIAL%" shell am start -n "%MAIN_ACTIVITY%"
if errorlevel 1 (
  set "FAIL_CODE=E70"
  set "FAIL_REASON=安装成功但启动失败。请把窗口文字发给维护人员检查 Activity 或系统限制。"
  goto fail
)
timeout /t 3 /nobreak >nul
call :capture_post_install_snapshot

echo.
echo 完成。电视上应显示“电视盒子简易模式”。
echo 遥控器: 方向键移动，OK 进入，0 打开帮助/自检。
>> "%LOG_PATH%" echo successAt: %DATE% %TIME%
>> "%LOG_PATH%" echo deviceSerial: %DEVICE_SERIAL%
echo 安装日志: %LOG_PATH%
echo.
pause
exit /b 0

:verify_installed_package
set "PACKAGE_PATH="
for /f "delims=" %%P in ('"%ADB%" -s "%DEVICE_SERIAL%" shell pm path "%PACKAGE_NAME%" 2^>nul') do (
  if "!PACKAGE_PATH!"=="" set "PACKAGE_PATH=%%P"
)
>> "%LOG_PATH%" echo.
>> "%LOG_PATH%" echo == pm path after install ==
>> "%LOG_PATH%" echo !PACKAGE_PATH!
if "!PACKAGE_PATH!"=="" (
  set "FAIL_CODE=E61"
  set "FAIL_REASON=APK 安装后未能读取到包路径。请重启盒子后重新安装。"
  echo 错误: !FAIL_REASON!
  exit /b 1
)
echo !PACKAGE_PATH! | findstr /C:"%PACKAGE_NAME%" >nul
if errorlevel 1 (
  set "FAIL_CODE=E61"
  set "FAIL_REASON=APK 安装后包路径异常。请把 INSTALL_LOG.txt 发给维护人员。"
  echo 错误: !FAIL_REASON!
  exit /b 1
)
echo 安装后包路径: !PACKAGE_PATH!
exit /b 0

:capture_post_install_snapshot
echo.
echo == 安装后自检 ==
echo 正在把包路径、前台窗口和最近 HelloTV 日志写入 INSTALL_LOG.txt
>> "%LOG_PATH%" echo.
>> "%LOG_PATH%" echo == post install snapshot ==
>> "%LOG_PATH%" echo deviceSerial: %DEVICE_SERIAL%
>> "%LOG_PATH%" echo.
>> "%LOG_PATH%" echo -- package path --
"%ADB%" -s "%DEVICE_SERIAL%" shell pm path "%PACKAGE_NAME%" >> "%LOG_PATH%" 2>&1
>> "%LOG_PATH%" echo.
>> "%LOG_PATH%" echo -- current focus --
"%ADB%" -s "%DEVICE_SERIAL%" shell dumpsys window windows | findstr /R /C:"mCurrentFocus" /C:"mFocusedApp" /C:"mFocusedWindow" >> "%LOG_PATH%" 2>&1
if errorlevel 1 >> "%LOG_PATH%" echo no current focus lines
>> "%LOG_PATH%" echo.
>> "%LOG_PATH%" echo -- resumed activity --
"%ADB%" -s "%DEVICE_SERIAL%" shell dumpsys activity activities | findstr /R /C:"mResumedActivity" /C:"ResumedActivity" /C:"topResumedActivity" >> "%LOG_PATH%" 2>&1
if errorlevel 1 >> "%LOG_PATH%" echo no resumed activity lines
>> "%LOG_PATH%" echo.
>> "%LOG_PATH%" echo -- recent HelloTV logs --
"%ADB%" -s "%DEVICE_SERIAL%" logcat -d -t 240 | findstr /I /C:"HelloTV" /C:"TvBoxModule" /C:"CameraPreviewActivity" /C:"AndroidRuntime" /C:"FATAL EXCEPTION" /C:"ActivityNotFound" /C:"Permission" /C:"Camera" >> "%LOG_PATH%" 2>&1
if errorlevel 1 >> "%LOG_PATH%" echo no matching recent logcat lines
exit /b 0

:init_log
> "%LOG_PATH%" echo HelloTV Windows installer log
>> "%LOG_PATH%" echo startedAt: %DATE% %TIME%
>> "%LOG_PATH%" echo scriptDir: %SCRIPT_DIR%
>> "%LOG_PATH%" echo packageName: %PACKAGE_NAME%
>> "%LOG_PATH%" echo boxIp: %BOX_IP%
>> "%LOG_PATH%" echo deviceSerial: %DEVICE_SERIAL%
>> "%LOG_PATH%" ver
>> "%LOG_PATH%" echo.
exit /b 0

:normalize_box_target
echo %BOX_IP% | findstr ":" >nul
if errorlevel 1 (
  set "BOX_TARGET=%BOX_IP%:5555"
) else (
  set "BOX_TARGET=%BOX_IP%"
)
exit /b 0

:find_adb
where adb >nul 2>nul
if not errorlevel 1 (
  for /f "delims=" %%I in ('where adb 2^>nul') do (
    set "ADB=%%I"
    exit /b 0
  )
)

for %%I in (
  "%SCRIPT_DIR%adb.exe"
  "%SCRIPT_DIR%platform-tools\adb.exe"
  "%ANDROID_HOME%\platform-tools\adb.exe"
  "%ANDROID_SDK_ROOT%\platform-tools\adb.exe"
  "%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe"
  "%USERPROFILE%\AppData\Local\Android\Sdk\platform-tools\adb.exe"
) do (
  if exist "%%~I" (
    set "ADB=%%~I"
    exit /b 0
  )
)
exit /b 0

:verify_apk_checksum
if not exist "%CHECKSUM_PATH%" (
  set "FAIL_CODE=E11"
  set "FAIL_REASON=没有找到 SHA256SUMS。请确认交付目录完整，不要单独移动安装脚本。"
  echo 错误: !FAIL_REASON!
  goto fail
)

set "EXPECTED_SHA="
for /f "tokens=1,2" %%A in ('type "%CHECKSUM_PATH%"') do (
  if /I "%%B"=="HelloTV-debug.apk" set "EXPECTED_SHA=%%A"
)

if "!EXPECTED_SHA!"=="" (
  set "FAIL_CODE=E11"
  set "FAIL_REASON=SHA256SUMS 里没有 HelloTV-debug.apk 的校验值。请重新获取交付包。"
  echo 错误: !FAIL_REASON!
  goto fail
)

where certutil >nul 2>nul
if errorlevel 1 (
  set "FAIL_CODE=E11"
  set "FAIL_REASON=这台 Windows 没有找到 certutil，无法在安装前校验 APK。"
  echo 错误: !FAIL_REASON!
  goto fail
)

set "ACTUAL_SHA="
for /f "tokens=1" %%A in ('certutil -hashfile "%APK_PATH%" SHA256 ^| findstr /R "^[0-9A-Fa-f][0-9A-Fa-f]"') do (
  if "!ACTUAL_SHA!"=="" set "ACTUAL_SHA=%%A"
)

if "!ACTUAL_SHA!"=="" (
  set "FAIL_CODE=E11"
  set "FAIL_REASON=无法读取 HelloTV-debug.apk 的 SHA256。请重新获取交付包。"
  echo 错误: !FAIL_REASON!
  goto fail
)

if /I not "!ACTUAL_SHA!"=="!EXPECTED_SHA!" (
  set "FAIL_CODE=E12"
  set "FAIL_REASON=APK SHA256 校验失败。文件可能传输损坏或拿错版本，请重新解压 tv-box-handoff-latest.zip。"
  echo 错误: !FAIL_REASON!
  goto fail
)

echo APK SHA256 校验通过: !ACTUAL_SHA!
exit /b 0

:select_device
set "DEVICE_COUNT=0"
set "FIRST_DEVICE="
set "MULTIPLE_DEVICES=false"
for /f "skip=1 tokens=1,2" %%A in ('"%ADB%" devices') do (
  if "%%B"=="device" (
    set /a DEVICE_COUNT+=1
    if "!FIRST_DEVICE!"=="" (
      set "FIRST_DEVICE=%%A"
    ) else (
      set "MULTIPLE_DEVICES=true"
    )
  )
)

if not "%DEVICE_SERIAL%"=="" exit /b 0

if "!DEVICE_COUNT!"=="1" (
  set "DEVICE_SERIAL=!FIRST_DEVICE!"
  exit /b 0
)

if "!MULTIPLE_DEVICES!"=="true" (
  echo 检测到多个设备，请从上面的列表复制一个 serial。
  set /p "DEVICE_SERIAL=请输入 DEVICE_SERIAL；直接回车退出: "
)
exit /b 0

:wait_for_rsa
set "BLOCKED_DEVICE=false"
for /f "skip=1 tokens=1,2" %%A in ('"%ADB%" devices') do (
  if "%%B"=="unauthorized" set "BLOCKED_DEVICE=true"
  if "%%B"=="offline" set "BLOCKED_DEVICE=true"
)

if "!BLOCKED_DEVICE!"=="true" (
  echo 已看到电视盒子，但它还没有授权或暂时离线。
  echo 请看电视屏幕，选择“允许 USB 调试 / 允许网络调试”，然后回到这个窗口。
  pause
  "%ADB%" devices -l
  call :select_device
)
exit /b 0

:fail
echo.
if "%FAIL_CODE%"=="" set "FAIL_CODE=E99"
if "%FAIL_REASON%"=="" set "FAIL_REASON=未知错误。"
>> "%LOG_PATH%" echo failedAt: %DATE% %TIME%
>> "%LOG_PATH%" echo failCode: %FAIL_CODE%
>> "%LOG_PATH%" echo failReason: %FAIL_REASON%
>> "%LOG_PATH%" echo adb: %ADB%
>> "%LOG_PATH%" echo deviceSerial: %DEVICE_SERIAL%
if not "%ADB%"=="" (
  >> "%LOG_PATH%" echo.
  >> "%LOG_PATH%" echo == adb devices -l ==
  "%ADB%" devices -l >> "%LOG_PATH%" 2>&1
)
echo 错误代码: %FAIL_CODE%
echo 原因: %FAIL_REASON%
echo 安装日志: %LOG_PATH%
if exist "%SUPPORT_GUIDE%" (
  echo 安装失败发给维护人员: %SUPPORT_GUIDE%
)
if exist "%HELP_FILE%" (
  echo Windows 排障说明: %HELP_FILE%
)
echo.
echo 现场先做三件事:
echo 1. 确认电视盒子和电脑在同一个网络。
echo 2. 确认电视盒子已打开“开发者选项 / 网络调试”。
echo 3. 如果电视上弹出 RSA 授权，选择“允许”。
echo.
echo 把 INSTALL_LOG.txt、电视盒子型号、盒子 IP 和电视屏幕照片发给维护人员即可排查。
echo.
pause
exit /b 1
WINDOWS_INSTALLER

cat > "$HANDOFF_DIR/WINDOWS_HELP.zh-CN.md" <<'WINDOWS_HELP'
# Windows 双击安装排障卡

这份说明给现场人员用。不要改文件名，先双击 `INSTALL_ON_WINDOWS.bat`；失败时看黑色窗口里的错误代码，再按下面处理。

## 先确认 4 件事

1. 电视盒子和 Windows 电脑在同一个 Wi-Fi 或网线网络。
2. 电视盒子已经打开“开发者选项 / 网络调试”。
3. 已经记下盒子 IP，例如 `192.168.1.23`。
4. 电视上弹出“允许 USB 调试 / 允许网络调试”时，选择“允许”。

## 错误代码怎么处理

| 代码 | 现场处理 |
| --- | --- |
| E10 | 交付目录不完整。确认 `INSTALL_ON_WINDOWS.bat` 和 `HelloTV-debug.apk` 在同一个目录，不要单独移动脚本。 |
| E11 | 交付目录缺少 `SHA256SUMS`，或这台电脑无法读取 APK SHA256。重新解压完整交付包；仍失败就把窗口文字发给维护人员。 |
| E12 | APK SHA256 校验失败。文件可能传输损坏或拿错版本，重新下载/解压 `tv-box-handoff-latest.zip` 后再运行。 |
| E20 | 电脑没找到 `adb.exe`。安装 Android Platform Tools，或把 `platform-tools` 文件夹复制到交付目录旁边。 |
| E30 | 没有输入盒子 IP。重新双击脚本，输入电视盒子系统设置里显示的 IP。 |
| E40 | 没有找到已授权盒子。确认盒子和电脑同网，网络调试已开启，并在电视屏幕允许 RSA 授权。 |
| E50 | 电脑连了多个 Android 设备。复制窗口列表里的目标 `serial`，重新运行前设置 `DEVICE_SERIAL`，或先拔掉其他设备。 |
| E60 | APK 安装失败。优先重启盒子、确认存储空间，再重新运行；仍失败就把窗口文字发给维护人员。 |
| E61 | APK 安装后没有读到包路径。重启盒子后重新运行；仍失败就发 `INSTALL_LOG.txt` 给维护人员。 |
| E70 | APK 装好了但启动失败。把窗口文字、盒子型号和 IP 发给维护人员。 |
| E99 | 未分类错误。把窗口文字完整发给维护人员。 |

## ADB 放在哪里最省事

脚本会自动搜索这些位置：

- Windows `PATH` 里的 `adb.exe`
- 当前交付目录里的 `adb.exe`
- 当前交付目录里的 `platform-tools\adb.exe`
- `ANDROID_HOME\platform-tools\adb.exe`
- `ANDROID_SDK_ROOT\platform-tools\adb.exe`
- `%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe`
- `%USERPROFILE%\AppData\Local\Android\Sdk\platform-tools\adb.exe`

如果现场电脑没有 Android Studio，最简单的做法是下载 Android Platform Tools，把解压后的 `platform-tools` 文件夹放到 `INSTALL_ON_WINDOWS.bat` 同一个目录。

## 成功后怎么看

电视上应显示“电视盒子简易模式”。遥控器只记三件事：

- 方向键移动黄色选中框。
- OK 进入当前按钮。
- 返回回上一步；首页再按返回会先问是否退出。
- 0 打开帮助/自检；首页和摄像头页也可以按 6。
- 菜单/信息/帮助键也能打开帮助/自检。

摄像头要验收时，把 USB 摄像头插到盒子，在首页按 4 进入“摄像头检查”，再选“测试摄像头”。

## 发给维护人员的信息

如果仍失败，发这 5 样即可：

1. `INSTALL_LOG.txt`。
2. 黑色安装窗口的完整截图。
3. 电视盒子型号。
4. 电视盒子 IP。
5. 电视屏幕当前显示内容，特别是是否有 RSA 授权弹窗。
WINDOWS_HELP

cat > "$HANDOFF_DIR/OPERATION_CARD.zh-CN.md" <<CARD
# HelloTV 电视盒子操作卡

适合贴在电视旁或发给家人。只需要记住：方向键移动，OK 进入，返回键回上一步；首页再按返回会先问是否退出，默认 OK 是继续看。首页按钮左上角会显示 1-6，有数字键的遥控器也可以直接按数字进入；按 0 或菜单/信息/帮助键打开帮助/自检，首页、全部内容页和摄像头页也可以按 6；误进“全部内容”复杂首页时按返回会回简易首页；帮助页会显示“现在下一步”，直接告诉你按 2、3、4 或 5 做什么；帮助页按 3 可进入“遥控器练习”，帮助页按 5 可打开电视端“现场验收”大字指引。

## 日常看电视

1. 打开电视盒子，进入 HelloTV。
2. 看到“电视盒子简易模式”后，默认停在“看电视”。
3. 按 OK 进入直播；有数字键时也可以直接按按钮上的 1。
4. 直播里按数字键 1-9，直接切到对应频道；例如按 3 就切到第 3 个频道。
5. 直播里按上/下或频道 +/- 换台。
6. 直播里按播放/暂停键，可暂停或继续播放；没有这个键不影响看电视。
7. 按左/右或 OK 打开频道列表，再按 OK 播放选中的频道。
8. 在频道列表里按 7 收藏/取消收藏当前频道；按 8 在“只看收藏”和“全部频道”之间切换。
9. 按 0 或菜单/信息/帮助键打开帮助/自检。
10. 按返回先收起频道列表，再按返回回首页。

## 退出确认

1. 在首页按返回键，会看到“要不要继续看？”。
2. 默认停在“继续看”，按 OK 或返回键都会回首页。
3. 只有选“退出应用”或按数字键 2，才会关闭。

## 找节目

1. 在首页按右键到“找节目”。
2. 按 OK 进入搜索；有数字键时也可以直接按按钮上的 2。
3. 用遥控器选择关键词或输入片名。
4. 按 0 或菜单/信息/帮助键打开帮助/自检。
5. 按返回回首页。

## 继续看

1. 在首页按右键到“继续看”。
2. 按 OK 打开最近观看记录；有数字键时也可以直接按按钮上的 3。
3. 选中想看的内容后按 OK。
4. 按 0 或菜单/信息/帮助键打开帮助/自检；按返回最终回首页。

## 全部内容

1. 这个入口给熟悉电视盒子的人使用，长辈小孩日常优先用“看电视 / 找节目 / 继续看”。
2. 如果误进“全部内容”复杂首页，按 0、6 或菜单/信息/帮助键打开帮助/自检。
3. 按返回会回到“电视盒子简易模式”首页，不会弹复杂退出页。

## 摄像头检查

1. 把 USB 摄像头插到电视盒子。
2. 在首页按下键到“摄像头”，按 OK；有数字键时也可以直接按按钮上的 4。
3. 看到摄像头、权限、麦克风、设备四项状态。
4. 如果摄像头或录音权限显示“未允许”，选“一键授权”，按 OK。
5. 如果没有弹窗，选“打开权限设置”，在系统设置里允许摄像头。
6. 选“测试摄像头”，按 OK；能看到 App 内置摄像头预览就说明基础通路正常。
7. 如果显示“USB 摄像头已接入/待适配”，说明硬件插到了盒子，但系统暂未开放成摄像头；可换支持 Android UVC 的摄像头，或检查盒子固件。
8. 没有摄像头或麦克风也可以正常看电视，不影响直播和点播。

## 遥控器练习

1. 不会按遥控器时，按 0 或菜单/信息/帮助键进入帮助/自检；在首页也可以按 6。
2. 在帮助页按 3 进入“遥控器练习”。
3. 跟着屏幕先按方向键，再按 OK；屏幕会显示中文按键名和 \`keyCode\`。
4. 如果某个键显示“未知键”或不符合预期，拍下这页发给维护人员。
5. 按返回键回到首页。

## 现场排障

- 不知道怎么操作：按 0 或菜单/信息/帮助键进入帮助/自检；在首页和摄像头页也可以按 6。在帮助页按 2 可直接去摄像头检查，帮助页按 3 可练习遥控器，帮助页按 5 可打开电视端“现场验收”大字指引。
- 电话排障：帮助页和摄像头页都会显示“维护码”，里面有 App 版本、型号、摄像头、音频输入和权限状态，直接读给维护人员。
- 看不到盒子 IP：在电视盒子系统设置里打开开发者选项/网络调试。
- ADB 提示 unauthorized：看电视屏幕，确认 RSA 授权弹窗。
- 摄像头没反应：重新插 USB 摄像头，再进“摄像头”页按“重新检测”。
- 摄像头显示待适配：优先换一只 Android TV 常用 UVC 摄像头复测。
- App 卡住或黑屏：拔电重启盒子，再打开 HelloTV。
- 仍有问题：执行 \`BOX_IP=<盒子IP> npm run tv-box:support\`，把 \`tv-box-support-latest.zip\` 和盒子型号发给维护人员。
CARD

cat > "$HANDOFF_DIR/OPERATION_CARD.html" <<'CARDHTML'
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>HelloTV 电视盒子操作卡</title>
  <style>
    :root {
      color-scheme: light;
      --ink: #142033;
      --muted: #4e5d73;
      --paper: #ffffff;
      --line: #d6deea;
      --blue: #1457d9;
      --green: #176a3a;
      --warm: #fff5d6;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      background: #f4f6fa;
      color: var(--ink);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
      font-size: 22px;
      line-height: 1.45;
    }

    main {
      max-width: 1100px;
      margin: 0 auto;
      padding: 28px 24px 42px;
    }

    h1 {
      margin: 0;
      font-size: 42px;
      line-height: 1.15;
    }

    h2 {
      margin: 0 0 12px;
      font-size: 28px;
      line-height: 1.2;
    }

    p {
      margin: 0 0 12px;
    }

    a {
      color: var(--blue);
      font-weight: 700;
    }

    .hero {
      background: var(--paper);
      border: 2px solid var(--line);
      border-radius: 8px;
      padding: 22px;
      margin-bottom: 18px;
    }

    .hero-row {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 16px;
      align-items: center;
    }

    .subtitle {
      color: var(--muted);
      font-size: 24px;
      margin-top: 10px;
    }

    .print-button {
      appearance: none;
      border: 0;
      border-radius: 6px;
      background: var(--blue);
      color: #ffffff;
      cursor: pointer;
      font: inherit;
      font-weight: 800;
      padding: 14px 20px;
      white-space: nowrap;
    }

    .keys {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin-top: 18px;
    }

    .key {
      min-height: 92px;
      border: 2px solid #bcd1f6;
      border-radius: 8px;
      background: #eef4ff;
      padding: 14px;
      font-weight: 800;
    }

    .key small {
      display: block;
      color: var(--muted);
      font-size: 18px;
      font-weight: 700;
      margin-top: 6px;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
    }

    .panel {
      background: var(--paper);
      border: 2px solid var(--line);
      border-radius: 8px;
      padding: 18px;
    }

    .panel.important {
      background: var(--warm);
      border-color: #e7c762;
    }

    ol, ul {
      margin: 0;
      padding-left: 28px;
    }

    li {
      margin: 8px 0;
    }

    .flow {
      display: grid;
      gap: 10px;
    }

    .step {
      display: grid;
      grid-template-columns: 74px 1fr;
      gap: 12px;
      align-items: start;
    }

    .badge {
      display: inline-block;
      border-radius: 6px;
      background: #14365d;
      color: #ffffff;
      font-weight: 900;
      min-width: 52px;
      padding: 8px 10px;
      text-align: center;
    }

    .ok {
      background: var(--green);
    }

    code {
      background: #eef1f6;
      border-radius: 4px;
      font-size: 20px;
      padding: 2px 6px;
    }

    .footer {
      color: var(--muted);
      font-size: 18px;
      margin-top: 18px;
    }

    @media (max-width: 820px) {
      body {
        font-size: 20px;
      }

      main {
        padding: 20px 14px 32px;
      }

      h1 {
        font-size: 34px;
      }

      .hero-row,
      .grid {
        grid-template-columns: 1fr;
      }

      .keys {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    @media print {
      body {
        background: #ffffff;
        color: #000000;
        font-size: 18px;
      }

      main {
        max-width: none;
        padding: 0;
      }

      .print-button {
        display: none;
      }

      .hero,
      .panel {
        break-inside: avoid;
        border-color: #999999;
      }

      .grid {
        grid-template-columns: repeat(2, 1fr);
      }

      .keys {
        grid-template-columns: repeat(4, 1fr);
      }

      a {
        color: #000000;
        text-decoration: none;
      }
    }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <div class="hero-row">
        <div>
          <h1>HelloTV 电视盒子操作卡</h1>
          <p class="subtitle">贴在电视旁也能看懂。方向键移动，OK 进入，返回键回上一步；按 0 或菜单/信息/帮助键打开帮助/自检。</p>
        </div>
        <button class="print-button" type="button" onclick="window.print()">打印操作卡</button>
      </div>
      <div class="keys" aria-label="遥控器快捷键">
        <div class="key">方向键<small>移动黄色选中框</small></div>
        <div class="key">OK<small>进入当前按钮</small></div>
        <div class="key">返回<small>回上一步，首页会先问是否退出</small></div>
        <div class="key">0 / 菜单 / 信息 / 帮助<small>打开帮助/自检</small></div>
        <div class="key">1<small>看电视</small></div>
        <div class="key">2<small>找节目</small></div>
        <div class="key">3<small>继续看</small></div>
        <div class="key">4<small>摄像头检查</small></div>
        <div class="key">5<small>全部内容，误进按返回回首页</small></div>
      </div>
    </section>

    <section class="grid">
      <div class="panel important">
        <h2>只记 4 句话</h2>
        <ol>
          <li>首页按钮左上角会显示 1-6，有数字键的遥控器可以直接按数字进入。</li>
          <li>直播里按数字键 1-9，直接切到对应频道。</li>
          <li>频道列表里按 7 收藏/取消收藏，按 8 只看收藏/全部频道。</li>
          <li>不会操作就按 0、菜单/信息/帮助键；首页、全部内容页和摄像头页也可以按 6。</li>
        </ol>
      </div>

      <div class="panel">
        <h2>日常看电视</h2>
        <div class="flow">
          <div class="step"><span class="badge">1</span><span>打开 HelloTV，看到“电视盒子简易模式”。</span></div>
          <div class="step"><span class="badge ok">OK</span><span>默认停在“看电视”，按 OK 进入直播；也可以直接按数字 1。</span></div>
          <div class="step"><span class="badge">1-9</span><span>直播里按数字键直达频道，上/下或频道 +/- 也能换台。</span></div>
          <div class="step"><span class="badge">播放</span><span>有播放/暂停键的遥控器，直播里可直接暂停或继续播放。</span></div>
          <div class="step"><span class="badge">返回</span><span>先收起频道列表，再回首页。</span></div>
        </div>
      </div>

      <div class="panel">
        <h2>找节目</h2>
        <ol>
          <li>首页按右键到“找节目”，按 OK；也可以按数字 2。</li>
          <li>用遥控器选择关键词或输入片名。</li>
          <li>卡住时按 0 或菜单/信息/帮助键打开帮助/自检。</li>
          <li>按返回最终回到首页。</li>
        </ol>
      </div>

      <div class="panel">
        <h2>继续看</h2>
        <ol>
          <li>首页按右键到“继续看”，按 OK；也可以按数字 3。</li>
          <li>选中最近看过的节目后按 OK。</li>
          <li>卡住时按 0 或菜单/信息/帮助键打开帮助/自检。</li>
          <li>按返回最终回到首页。</li>
        </ol>
      </div>

      <div class="panel">
        <h2>全部内容</h2>
        <ol>
          <li>这是给熟悉电视盒子的人使用的完整首页。</li>
          <li>误进后按 0、6 或菜单/信息/帮助键打开帮助/自检。</li>
          <li>按返回直接回到“电视盒子简易模式”首页。</li>
        </ol>
      </div>

      <div class="panel">
        <h2>摄像头检查</h2>
        <ol>
          <li>把 USB 摄像头插到电视盒子。</li>
          <li>首页按数字 4，或移动到“摄像头”后按 OK。</li>
          <li>看到摄像头、权限、麦克风、设备四项状态。</li>
          <li>权限未允许时选“一键授权”；再选“测试摄像头”。</li>
          <li>没有摄像头或麦克风也可以正常看电视，不影响直播和点播。</li>
        </ol>
      </div>

      <div class="panel">
        <h2>退出和练习</h2>
        <ol>
          <li>首页按返回，会出现“要不要继续看？”。默认 OK 是继续看。</li>
          <li>只有选择“退出应用”或按数字 2，才会关闭 App。</li>
          <li>帮助页会显示“现在下一步”，直接告诉你按 2、3、4 或 5 做什么。</li>
          <li>帮助页按 2 去摄像头检查；帮助页按 3 进入“遥控器练习”；帮助页按 5 打开电视端“现场验收”大字指引。</li>
          <li>遥控器练习页会显示中文按键名和 <code>keyCode</code>；未知键或异常键值直接拍照发给维护人员。</li>
        </ol>
      </div>

      <div class="panel">
        <h2>电话排障</h2>
        <ul>
          <li>按 0 或菜单/信息/帮助键进入帮助/自检，把“维护码”读给维护人员。</li>
          <li>维护码包含 App 版本、型号、摄像头、音频输入和权限状态。</li>
          <li>安装失败时发 <code>INSTALL_LOG.txt</code>、盒子型号、盒子 IP、电视屏幕照片。</li>
          <li>仍有问题：工程人员执行 <code>BOX_IP=&lt;盒子IP&gt; npm run tv-box:support</code>，保存 <code>tv-box-support-latest.zip</code>。</li>
        </ul>
      </div>

      <div class="panel">
        <h2>随包文件</h2>
        <ul>
          <li><a href="START_HERE.html">START_HERE.html</a>：安装首页。</li>
          <li><a href="PRE_INSTALL_CHECKLIST.zh-CN.md">PRE_INSTALL_CHECKLIST.zh-CN.md</a>：安装前自检。</li>
          <li><a href="FIELD_ACCEPTANCE_CHECKLIST.zh-CN.md">FIELD_ACCEPTANCE_CHECKLIST.zh-CN.md</a>：现场验收清单。</li>
          <li><a href="FIELD_WIZARD_OFFLINE.html">FIELD_WIZARD_OFFLINE.html</a>：离线实机验收表。</li>
          <li><a href="INSTALL_SUPPORT.zh-CN.md">INSTALL_SUPPORT.zh-CN.md</a>：安装失败时发什么。</li>
        </ul>
      </div>
    </section>

    <p class="footer">建议把本页打印一份贴在电视旁。真实电视盒子验收仍以现场清单和离线验收表为准。</p>
  </main>
</body>
</html>
CARDHTML

cat > "$HANDOFF_DIR/HARDWARE_SELECTION_CARD.zh-CN.md" <<'HARDWARECARD'
# HelloTV 电视盒子硬件选型卡

这张卡给采购、现场安装和维护人员用。目标是先选一套更稳的硬件组合，再用真实盒子验收表证明它能用。

## 采购优先级

1. 电视盒子优先选 Android TV / Google TV / 明确带 Leanback Launcher 的型号。
2. 外接摄像头场景必须确认盒子支持 USB Host / OTG；供电不稳时加带独立供电的 USB Hub。
3. 遥控器必须有方向键、OK/确认、返回键；强烈建议有 0、菜单、信息或帮助键之一。
4. USB 摄像头优先选常见 UVC 摄像头；插上 USB 只能证明硬件接入，必须能被 Android Camera2 枚举并打开预览才算可用。
5. 麦克风可来自盒子内置、遥控器、USB 摄像头内置麦或单独 USB 麦；需要语音/通话时，必须确认音频输入和录音权限。

## 建议测试套装

- 主摄像头：Logitech C920s / C920 Pro HD，用来测 1080p UVC、Camera2 枚举、真实预览和扫码/互动课画面。
- 兼容性备机：Logitech C270，用来测 720p 低带宽场景；C920s 不稳定时用它判断是否是带宽、供电或固件问题。
- 音频输入：Jabra Speak 510 UC / Speak2 40/55 或同类免驱 USB Audio Class 会议麦克风，用来单独验证 AudioManager 和 RECORD_AUDIO；如果 510 缺货，优先买 Speak2 40/55 或同级 USB 会议麦。
- 供电与扩展：带独立供电 USB Hub；摄像头和 USB 麦克风同时插入时优先用 Hub，避免盒子 USB 口供电不足。
- 接线顺序：先摄像头直插盒子 USB 口，再测试“摄像头 -> 带供电 Hub -> 盒子”，最后测试“摄像头 + USB 麦克风 -> 带供电 Hub -> 盒子”。

## 不建议组合

- 不能开启开发者选项或网络调试的盒子。
- 没有返回键、OK 键或方向键的遥控器。
- 只写“支持摄像头”但不能确认 UVC / Camera2 兼容的摄像头。
- USB 口供电弱、接摄像头会掉线的盒子；这种情况优先加独立供电 Hub。
- 需要摄像头/麦克风业务却无法授权 CAMERA 或 RECORD_AUDIO 的系统版本。

## 到现场先测 6 件事

- [ ] 盒子能打开网络调试，电视屏幕能确认 RSA 授权。
- [ ] 安装后首屏能进入“电视盒子简易模式”。
- [ ] 遥控器方向键、OK、返回键都能用。
- [ ] 0、菜单、信息或帮助键能打开帮助/自检；首页和摄像头页 6 键也能打开帮助。
- [ ] USB 摄像头接入后，摄像头页能显示清晰状态；能打开内置 Camera2 预览则标记为通过，不能打开也要记录原因。
- [ ] 麦克风/音频输入状态可读；没有麦克风时标记 `na`，不能留 `unknown`。

## 最终判定

- 可以推荐：遥控器核心、直播、帮助救援、退出确认、维护码通过；摄像头/麦克风通过或明确 `na`；无 `fail`。
- 仅电视核心可用：遥控器和看电视通过，但摄像头/麦克风还要继续补测。
- 待修复：任何核心项 `fail`，必须保存 `tv-box-support-latest.zip`、维护码照片和现场备注。
- 不能关闭：没有真实盒子授权和验收记录时，只能是 `handoff_ready_needs_box`。

## 关联文件

- `tv-box-hardware-profile-latest.md`: 机器生成的硬件兼容性画像和风险标记。
- `TV_BOX_AV_TEST_HARDWARE.zh-CN.md`: 具体采购、接线、验收命令和故障分流方案。
- `FIELD_WIZARD_OFFLINE.html`: 不用 npm 的离线现场验收表。
- `FIELD_ACCEPTANCE_CHECKLIST.zh-CN.md`: 安装完成后的逐项验收清单。
- `FIELD_COMPATIBILITY_MATRIX.zh-CN.md`: 多款盒子/遥控器/摄像头/麦克风长期复测字段。
HARDWARECARD

cat > "$HANDOFF_DIR/HARDWARE_SELECTION_CARD.html" <<'HARDWAREHTML'
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>HelloTV 电视盒子硬件选型卡</title>
  <style>
    body {
      margin: 0;
      background: #f5f7fb;
      color: #152238;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
      font-size: 21px;
      line-height: 1.45;
    }
    main {
      max-width: 1080px;
      margin: 0 auto;
      padding: 28px 22px 42px;
    }
    h1 {
      margin: 0 0 8px;
      font-size: 40px;
      line-height: 1.15;
    }
    h2 {
      margin: 0 0 12px;
      font-size: 27px;
    }
    .hero,
    .panel {
      background: #ffffff;
      border: 2px solid #d8e0eb;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 14px;
    }
    .hero-row {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 16px;
      align-items: center;
    }
    .lead {
      color: #4a5b72;
      font-size: 23px;
      margin: 0;
    }
    .print-button {
      appearance: none;
      border: 0;
      border-radius: 6px;
      background: #1457d9;
      color: #ffffff;
      cursor: pointer;
      font: inherit;
      font-weight: 800;
      padding: 14px 20px;
      white-space: nowrap;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
    }
    ul,
    ol {
      margin: 0;
      padding-left: 28px;
    }
    li {
      margin: 8px 0;
    }
    .must {
      background: #eef4ff;
      border-color: #b8cdf6;
    }
    .avoid {
      background: #fff3ed;
      border-color: #efc0a8;
    }
    .check {
      background: #eef8f0;
      border-color: #b6d8bd;
    }
    code {
      background: #eef1f6;
      border-radius: 4px;
      padding: 2px 6px;
      font-size: 19px;
    }
    a {
      color: #1457d9;
      font-weight: 800;
    }
    @media (max-width: 820px) {
      body {
        font-size: 19px;
      }
      main {
        padding: 20px 14px 32px;
      }
      h1 {
        font-size: 32px;
      }
      .hero-row,
      .grid {
        grid-template-columns: 1fr;
      }
    }
    @media print {
      body {
        background: #ffffff;
        color: #000000;
        font-size: 17px;
      }
      main {
        max-width: none;
        padding: 0;
      }
      .print-button {
        display: none;
      }
      .hero,
      .panel {
        break-inside: avoid;
        border-color: #888888;
      }
      .grid {
        grid-template-columns: repeat(2, 1fr);
      }
      a {
        color: #000000;
        text-decoration: none;
      }
    }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <div class="hero-row">
        <div>
          <h1>HelloTV 电视盒子硬件选型卡</h1>
          <p class="lead">给采购、现场安装和维护人员看。先选稳，再用真实盒子验收表证明。</p>
        </div>
        <button class="print-button" type="button" onclick="window.print()">打印选型卡</button>
      </div>
    </section>

    <section class="grid">
      <div class="panel must">
        <h2>优先购买</h2>
        <ol>
          <li>Android TV / Google TV / 明确带 Leanback Launcher 的盒子。</li>
          <li>明确支持 USB Host / OTG；外接摄像头时优先配独立供电 USB Hub。</li>
          <li>遥控器必须有方向键、OK/确认、返回键。</li>
          <li>强烈建议遥控器有 0、菜单、信息或帮助键之一。</li>
          <li>USB 摄像头优先选常见 UVC 型号；能被 Camera2 打开预览才算通过。</li>
          <li>需要语音/通话时，麦克风必须能被音频输入识别并授权录音。</li>
          <li>测试主摄像头建议 Logitech C920s / C920 Pro HD；低规格备机建议 Logitech C270。</li>
          <li>音频测试建议 Jabra Speak 510 UC / Speak2 40/55 或同类免驱 USB Audio Class 会议麦克风。</li>
          <li>摄像头 + USB 麦克风组合测试时，优先使用带独立供电 USB Hub。</li>
        </ol>
      </div>

      <div class="panel avoid">
        <h2>谨慎或避免</h2>
        <ul>
          <li>不能开启开发者选项或网络调试的盒子。</li>
          <li>没有返回键、OK 键或方向键的遥控器。</li>
          <li>只写“支持摄像头”但不能确认 UVC / Camera2 兼容的摄像头。</li>
          <li>USB 口供电弱、接摄像头会掉线的盒子。</li>
          <li>需要摄像头/麦克风业务却无法授权 CAMERA 或 RECORD_AUDIO 的系统版本。</li>
        </ul>
      </div>

      <div class="panel check">
        <h2>现场 6 项快测</h2>
        <ul>
          <li>网络调试已打开，电视屏幕能确认 RSA 授权。</li>
          <li>安装后首屏进入“电视盒子简易模式”。</li>
          <li>方向键、OK、返回键都能用。</li>
          <li>0、菜单、信息或帮助键能进入帮助/自检；首页和摄像头页 6 键也能进入。</li>
          <li>USB 摄像头接入后，摄像头页能显示清晰状态；能打开内置 Camera2 预览才标通过。</li>
          <li>麦克风/音频输入状态可读；没有麦克风时标记 <code>na</code>，不能留 <code>unknown</code>。</li>
        </ul>
      </div>

      <div class="panel">
        <h2>判定规则</h2>
        <ul>
          <li>推荐：遥控器核心、直播、帮助救援、退出确认、维护码通过；摄像头/麦克风通过或明确 <code>na</code>；无 <code>fail</code>。</li>
          <li>电视核心可用：遥控器和看电视通过，但摄像头/麦克风仍需补测。</li>
          <li>待修复：任何核心项 <code>fail</code>，必须保存排障包、维护码照片和现场备注。</li>
          <li>不能关闭：没有真实盒子授权和验收记录时，只能是 <code>handoff_ready_needs_box</code>。</li>
        </ul>
      </div>

      <div class="panel">
        <h2>随包文件</h2>
        <ul>
          <li><a href="tv-box-hardware-profile-latest.md">tv-box-hardware-profile-latest.md</a>：机器生成的硬件风险画像。</li>
          <li><a href="TV_BOX_AV_TEST_HARDWARE.zh-CN.md">TV_BOX_AV_TEST_HARDWARE.zh-CN.md</a>：具体采购、接线、验收命令和故障分流方案。</li>
          <li><a href="FIELD_WIZARD_OFFLINE.html">FIELD_WIZARD_OFFLINE.html</a>：不用 npm 的离线现场验收表。</li>
          <li><a href="FIELD_ACCEPTANCE_CHECKLIST.zh-CN.md">FIELD_ACCEPTANCE_CHECKLIST.zh-CN.md</a>：安装后逐项验收清单。</li>
          <li><a href="FIELD_COMPATIBILITY_MATRIX.zh-CN.md">FIELD_COMPATIBILITY_MATRIX.zh-CN.md</a>：长期复测字段。</li>
        </ul>
      </div>

      <div class="panel">
        <h2>给现场人员的一句话</h2>
        <p>先按这张卡选硬件，再按离线验收表填结果；如果 App 能看电视但摄像头没有外设，就把摄像头/麦克风相关项填 <code>na</code>，不要空着。</p>
      </div>
    </section>
  </main>
</body>
</html>
HARDWAREHTML

cat > "$HANDOFF_DIR/FIELD_ACCEPTANCE_CHECKLIST.zh-CN.md" <<'CHECKLIST'
# HelloTV 电视盒子现场验收清单

这份清单给安装人员和维护人员一起用。每一项都通过后，才把本次安装标记为完成。

## 现场信息

- [ ] 电视盒子型号：________________
- [ ] 盒子 IP：________________
- [ ] 安装人员：________________
- [ ] 验收时间：________________
- [ ] 交付包文件名：`tv-box-handoff-latest.zip`
- [ ] 已核对 `tv-box-handoff-latest.zip.sha256`，确认压缩包未损坏。

## 安装前

- [ ] 电视盒子和电脑在同一个 Wi-Fi 或网线网络。
- [ ] 已打开电视盒子的“开发者选项 / 网络调试”。
- [ ] 电视上出现 RSA 授权弹窗时已选择“允许”。
- [ ] Windows 电脑能双击 `INSTALL_ON_WINDOWS.bat`，macOS 电脑能双击 `INSTALL_ON_MAC.command`。

## 安装结果

- [ ] 安装脚本显示完成，没有停在 `E10-E99` 错误代码。
- [ ] 电视上能打开 HelloTV。
- [ ] 首屏显示“电视盒子简易模式”。
- [ ] 可以看到“看电视 / 找节目 / 继续看 / 摄像头 / 全部内容 / 帮助自检”六个大入口。

## 遥控器

- [ ] 方向键能移动黄色选中框。
- [ ] OK 能进入当前选中的入口。
- [ ] 返回键能回到上一页或回到简易首页。
- [ ] 首页按返回会进入大字退出确认，默认 OK 继续看，只有选“退出应用”才关闭。
- [ ] 数字键 1 能进入“看电视”。
- [ ] 数字键 4 能进入“摄像头检查”。
- [ ] 数字键 6 能进入“帮助/自检”。
- [ ] 数字键 0 能进入“帮助/自检”。
- [ ] 菜单/信息/帮助键能进入“帮助/自检”，无数字键遥控器也能找到自检页。
- [ ] 帮助页能显示“现在下一步”，并用大字提示下一步按几号键。
- [ ] 帮助页按 3 能进入“遥控器练习”，方向键和 OK 会在练习页给出大字反馈。
- [ ] 遥控器练习页能显示中文按键名和 `keyCode`；未知键或异常键值要拍照留存。
- [ ] 帮助页按 5 能进入电视端“现场验收”大字指引，并能看到遥控器、直播、找节目、摄像头和留证据 5 步。
- [ ] “全部内容”页按 0、6、菜单/信息/帮助键能进入“帮助/自检”，按返回能回简易首页。
- [ ] 搜索页按 0、菜单/信息/帮助键能进入“帮助/自检”，按返回能回简易首页。
- [ ] 继续看页按 0、菜单/信息/帮助键能进入“帮助/自检”，按返回能回简易首页。

## 看电视

- [ ] 进入直播后能看到画面或频道列表。
- [ ] 上/下键或频道 +/- 能换台。
- [ ] 直播页数字键 1-9 能切换到对应频道。
- [ ] 直播页播放/暂停物理键能暂停或继续播放；遥控器没有这个键可记 `na`。
- [ ] 直播页按 0、菜单/信息/帮助键能进入“帮助/自检”。
- [ ] OK、左键或右键能打开频道列表。
- [ ] 频道列表里按 7 能收藏/取消收藏频道，按 8 能切换“只看收藏/全部频道”。
- [ ] 返回键能先收起频道列表，再回首页。

## 帮助/自检

- [ ] 帮助页能显示“维护码”。
- [ ] 维护码里能看到 App 版本、盒子型号、Android SDK、摄像头、音频输入和权限状态。
- [ ] 现场人员能把维护码读给维护人员。

## 摄像头

- [ ] 没接摄像头时，App 不崩溃，仍可正常看电视。
- [ ] 接入 USB 摄像头后，进入“摄像头检查”并点击“重新检测”。
- [ ] 权限未允许时，能看到清晰提示或进入系统权限设置。
- [ ] 点击“测试摄像头”后，能打开 App 内置摄像头预览；如果盒子系统不支持 Camera HAL，页面要给出清晰提示且不崩溃。
- [ ] 麦克风/音频输入状态可读；没有麦克风或录音权限未允许时，页面明确不影响看电视。
- [ ] 摄像头页返回键能回到简易首页。

## 失败时必须发给维护人员

- [ ] 黑色安装窗口完整截图，或 App 帮助页维护码照片。
- [ ] 电视盒子型号和盒子 IP。
- [ ] `tv-box-support-latest.zip`。
- [ ] 如果是交付包传输问题，同时发送 `tv-box-handoff-latest.zip.sha256`。

## 验收结论

- [ ] 通过：长辈或小孩只用遥控器即可看电视、返回、打开帮助。
- [ ] 通过：摄像头或麦克风不存在、不可用时不影响核心看电视功能。
- [ ] 通过：出现问题时现场能按 0 或菜单/信息/帮助键读维护码；首页和摄像头页也可按 6，工程人员能拿到排障包。

验收人签字：________________
CHECKLIST

cat > "$HANDOFF_DIR/FIELD_RETURN_CARD.zh-CN.md" <<'RETURNCARD'
# HelloTV 电视盒子现场回传卡

这张卡给现场安装人员用。测完真实电视盒子后，不要凭口头说“好了”，按下面 4 样发回给工程人员；少一样都不能关闭项目。

## 必须发回 4 样

1. `FIELD_WIZARD_OFFLINE.html` 下载的 JSON 文件。
2. 电视帮助/自检页或摄像头页的“维护码”照片。
3. `INSTALL_LOG.txt`；如果失败，同时发 `tv-box-support-latest.zip`。
4. 异常照片：未知遥控器 `keyCode`、黑屏、权限弹窗、摄像头预览失败、USB/麦克风状态异常。

不会压缩文件时，把这 4 类文件放进 `FIELD_RETURN` 文件夹，Windows 双击 `PACK_FIELD_RETURN_ON_WINDOWS.bat`，macOS 双击 `PACK_FIELD_RETURN_ON_MAC.command`；只发生成的 `HelloTV-field-return-*.zip`。

## 现场先自己核对

- [ ] 电视上能打开 HelloTV，并看到“电视盒子简易模式”。
- [ ] 遥控器方向键、OK、返回、0 或菜单/信息/帮助键都测过。
- [ ] 帮助页按 3 进过“遥控器练习”，未知键值已拍照。
- [ ] 帮助页按 5 看过电视端“现场验收”大字指引。
- [ ] 直播、全部内容、搜索、继续看都能返回帮助/自检或简易首页。
- [ ] 摄像头/麦克风没有外设时，相关项填 `na`，不要留空。
- [ ] 有摄像头/麦克风时，权限、预览、音频输入和 USB 热插拔都已记录。
- [ ] 离线表单里没有应该补测的 `unknown`。

## JSON 怎么填

打开 `FIELD_WIZARD_OFFLINE.html`，先点一个模板：

- 只验收看电视通过。
- 摄像头/麦克风通过。
- 没有摄像头/麦克风。
- 全部通过。

再把少数不符合的项目改成失败、跳过、不适用或未知，最后点“下载 JSON”。

## 工程人员收到后

先对整个现场回传目录或 zip 做证据质检：

```bash
npm run tv-box:return-inbox -- <现场回传目录或zip>
```

确认是真实盒子验收、四样证据齐全后再追加矩阵：

```bash
npm run tv-box:return-inbox -- <现场回传目录或zip> --append
```

只收到单份 JSON：

```bash
npm run tv-box:field-import -- <现场下载的JSON>
```

多份 JSON：

```bash
npm run tv-box:field-inbox
```

导入后查看 `tv-box-return-inbox-latest.md` 和 `tv-box-compatibility-summary-latest.md`。`closure.status=ready_to_close` 且写入兼容性矩阵后才能进入关闭复核；`needs_site_follow_up` 代表要现场补发/补测；`needs_fix` 代表证据齐全但要工程修复。如果遥控器、直播、全部内容救援、搜索/继续看救援、维护码、摄像头/麦克风关键字段仍是 `unknown`，不能关闭，只能补测或明确标成 `pass/fail/skip/na`。
RETURNCARD

cat > "$HANDOFF_DIR/FIELD_RETURN_CARD.html" <<'RETURNCARDHTML'
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>HelloTV 电视盒子现场回传卡</title>
  <style>
    :root {
      color-scheme: light;
      --ink: #172033;
      --muted: #4b5b70;
      --paper: #ffffff;
      --line: #d8e0ec;
      --blue: #1457d9;
      --green: #176a3a;
      --red: #a12828;
      --warm: #fff7df;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      background: #f5f7fb;
      color: var(--ink);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
      font-size: 22px;
      line-height: 1.48;
    }

    main {
      max-width: 1080px;
      margin: 0 auto;
      padding: 28px 24px 44px;
    }

    h1 {
      margin: 0 0 10px;
      font-size: 42px;
      line-height: 1.15;
    }

    h2 {
      margin: 0 0 12px;
      font-size: 28px;
    }

    p {
      margin: 0 0 12px;
    }

    a {
      color: var(--blue);
      font-weight: 700;
    }

    code {
      background: #eef2f8;
      border-radius: 4px;
      padding: 2px 7px;
      font-size: 20px;
    }

    .hero,
    .panel {
      background: var(--paper);
      border: 2px solid var(--line);
      border-radius: 8px;
      padding: 22px;
      margin-bottom: 16px;
    }

    .hero {
      border-color: #b7c8e8;
    }

    .subtitle {
      color: var(--muted);
      font-size: 24px;
    }

    .print {
      display: inline-block;
      padding: 14px 18px;
      border-radius: 6px;
      border: 0;
      background: var(--blue);
      color: #ffffff;
      font-size: 20px;
      font-weight: 800;
      cursor: pointer;
    }

    .must {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      margin-top: 12px;
    }

    .item {
      border: 2px solid #c7d5e8;
      border-radius: 8px;
      padding: 16px;
      background: #f8fbff;
      min-height: 138px;
    }

    .item strong {
      display: block;
      margin-bottom: 8px;
      color: var(--blue);
      font-size: 24px;
    }

    .warning {
      background: var(--warm);
      border-color: #ebc869;
    }

    .danger {
      color: var(--red);
      font-weight: 800;
    }

    ul,
    ol {
      margin: 0;
      padding-left: 28px;
    }

    li {
      margin: 8px 0;
    }

    .checks li {
      list-style: none;
      position: relative;
      padding-left: 34px;
    }

    .checks li::before {
      content: "□";
      position: absolute;
      left: 0;
      top: 0;
      color: var(--green);
      font-weight: 800;
    }

    @media (max-width: 760px) {
      body {
        font-size: 20px;
      }

      main {
        padding: 20px 16px 34px;
      }

      h1 {
        font-size: 34px;
      }

      .must {
        grid-template-columns: 1fr;
      }
    }

    @media print {
      body {
        background: #ffffff;
      }

      main {
        padding: 0;
      }

      .print {
        display: none;
      }

      .hero,
      .panel,
      .item {
        break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <h1>HelloTV 电视盒子现场回传卡</h1>
      <p class="subtitle">测完真实盒子后，按这张卡发回证据；少一样都不能关闭项目。</p>
      <button class="print" onclick="window.print()">打印回传卡</button>
    </section>

    <section class="panel">
      <h2>必须发回 4 样</h2>
      <div class="must">
        <div class="item">
          <strong>1. 现场 JSON</strong>
          <p><a href="FIELD_WIZARD_OFFLINE.html">FIELD_WIZARD_OFFLINE.html</a> 下载的 JSON 文件。</p>
        </div>
        <div class="item">
          <strong>2. 维护码照片</strong>
          <p>电视帮助/自检页或摄像头页的“维护码”照片。</p>
        </div>
        <div class="item">
          <strong>3. 日志或排障包</strong>
          <p><code>INSTALL_LOG.txt</code>；如果失败，同时发 <code>tv-box-support-latest.zip</code>。</p>
        </div>
        <div class="item">
          <strong>4. 异常照片</strong>
          <p>未知遥控器 <code>keyCode</code>、黑屏、权限弹窗、摄像头预览失败、USB/麦克风异常。</p>
        </div>
      </div>
      <p class="danger">不会压缩文件时，把这 4 类文件放进 <code>FIELD_RETURN</code> 文件夹，Windows 双击 <code>PACK_FIELD_RETURN_ON_WINDOWS.bat</code>，macOS 双击 <code>PACK_FIELD_RETURN_ON_MAC.command</code>，只发生成的 <code>HelloTV-field-return-*.zip</code>。</p>
    </section>

    <section class="panel warning">
      <h2>不要留 unknown</h2>
      <p>没有摄像头或麦克风时填 <code>na</code>；没测填 <code>skip</code>；失败填 <code>fail</code> 并拍照。该补测却还是 <code>unknown</code>，工程人员不能关闭。</p>
    </section>

    <section class="panel">
      <h2>现场先自己核对</h2>
      <ul class="checks">
        <li>电视上能打开 HelloTV，并看到“电视盒子简易模式”。</li>
        <li>遥控器方向键、OK、返回、0 或菜单/信息/帮助键都测过。</li>
        <li>帮助页按 3 进过“遥控器练习”，未知键值已拍照。</li>
        <li>帮助页按 5 看过电视端“现场验收”大字指引。</li>
        <li>直播、全部内容、搜索、继续看都能返回帮助/自检或简易首页。</li>
        <li>有摄像头/麦克风时，权限、预览、音频输入和 USB 热插拔都已记录。</li>
      </ul>
    </section>

    <section class="panel">
      <h2>JSON 怎么填</h2>
      <ol>
        <li>打开 <a href="FIELD_WIZARD_OFFLINE.html">FIELD_WIZARD_OFFLINE.html</a>。</li>
        <li>先点一个模板：只验收看电视通过、摄像头/麦克风通过、没有摄像头/麦克风、全部通过。</li>
        <li>把少数不符合的项目改成失败、跳过、不适用或未知。</li>
        <li>点“下载 JSON”，把文件发给工程人员。</li>
      </ol>
    </section>

    <section class="panel">
      <h2>工程人员收到后</h2>
      <p>先质检整个回传目录或 zip：<code>npm run tv-box:return-inbox -- &lt;现场回传目录或zip&gt;</code></p>
      <p>确认是真实盒子验收且证据齐全后：<code>npm run tv-box:return-inbox -- &lt;现场回传目录或zip&gt; --append</code></p>
      <p>只收到单份 JSON：<code>npm run tv-box:field-import -- &lt;现场下载的JSON&gt;</code></p>
      <p>多份 JSON：<code>npm run tv-box:field-inbox</code></p>
      <p class="danger">先看 <code>closure.status</code>：<code>ready_to_close</code> 才能进入关闭复核，<code>needs_site_follow_up</code> 要现场补发/补测，<code>needs_fix</code> 要工程修复。</p>
      <p class="danger">遥控器、直播、全部内容救援、搜索/继续看救援、维护码、摄像头/麦克风关键字段仍是 unknown 时，不要关闭。</p>
    </section>
  </main>
</body>
</html>
RETURNCARDHTML

cat > "$HANDOFF_DIR/FIELD_COMPATIBILITY_MATRIX.zh-CN.md" <<'MATRIX'
# HelloTV 电视盒子实机兼容性矩阵

这份表给工程人员和维护人员用。每测一款电视盒子、遥控器、摄像头或麦克风，都要留下同一套字段，后面才能科学判断“哪些盒子稳定、哪些遥控器适合长辈小孩、哪些摄像头待适配、哪些音频输入可用、哪些问题只出现在某个系统版本”。

## 推荐命令

连接真实电视盒子并按验收清单测完后，优先打开交付包里的离线表单：

- `FIELD_WIZARD_OFFLINE.html`: 不用 npm、不用联网，现场人员可双击填写，支持一键模板，下载 JSON/Markdown/env 后发给工程人员。

在源码工程里也可以运行中文问答向导：

```bash
BOX_IP=<盒子IP> npm run tv-box:field-wizard
```

向导会生成 `reports/tv-box-field-wizard-latest.md/json/env`，并可按你的确认把结果追加到累计矩阵。离线表单下载的 JSON 可直接导入：

```bash
npm run tv-box:field-import -- <现场下载的JSON>
npm run tv-box:field-import -- <现场下载的JSON> --append
```

离线表单下载的 env 也可 `source` 后复用。熟悉环境变量时，也可以用下面的环境变量记录一次实机结果：

```bash
FIELD_OPERATOR=张三 \
FIELD_LOCATION=客厅A \
FIELD_BOX_BRAND=小米 \
FIELD_BOX_MODEL="Mi Box 4S" \
FIELD_REMOTE_MODEL=原装蓝牙遥控器 \
FIELD_CAMERA_MODEL="Logitech C270" \
FIELD_CAMERA_CONNECTION=usb \
FIELD_MICROPHONE_MODEL="Logitech C270 Mic" \
FIELD_MICROPHONE_CONNECTION=usb \
FIELD_REMOTE_FOCUS=pass \
FIELD_NUMERIC_SHORTCUTS=pass \
FIELD_ZERO_KEY_HELP=pass \
FIELD_HELP_KEY_SHORTCUTS=pass \
FIELD_REMOTE_PRACTICE=pass \
FIELD_EXIT_CONFIRM=pass \
FIELD_LIVE_PLAYBACK=pass \
FIELD_LIVE_NUMERIC_CHANNELS=pass \
FIELD_LIVE_MEDIA_KEYS=pass \
FIELD_LIVE_FAVORITES=pass \
FIELD_CLASSIC_HOME_RESCUE=pass \
FIELD_SEARCH_RESCUE=pass \
FIELD_HISTORY_RESCUE=pass \
FIELD_CAMERA_PERMISSION=pass \
FIELD_CAMERA_PREVIEW=pass \
FIELD_AUDIO_INPUT=pass \
FIELD_RECORD_AUDIO_PERMISSION=skip \
FIELD_USB_HOTPLUG=pass \
FIELD_SUPPORT_CODE=pass \
FIELD_NOTES="USB 摄像头重插后可识别" \
BOX_IP=<盒子IP> npm run tv-box:field-record
```

结果值统一使用：

- `pass`: 通过。
- `fail`: 失败，需要修复或记录兼容性风险。
- `skip`: 本轮未测。
- `na`: 不适用，例如本轮没有摄像头或麦克风。
- `unknown`: 还未填写。

脚本会生成：

- `reports/tv-box-field-record-latest.md`: 本次人可读记录。
- `reports/tv-box-field-record-latest.json`: 本次机器可读记录。
- `reports/tv-box-field-matrix.csv`: 多次实机记录追加表，可用 Excel/Numbers 打开。
- `reports/tv-box-compatibility-summary-latest.md/json`: 自动汇总推荐组合、风险组合和待补测字段。

本地或 CI 没接盒子、也没填写现场字段时，脚本只刷新 latest 记录，不会把空白 `needs_box` 行追加进累计 CSV。需要强制追加时设置 `FIELD_APPEND_MATRIX=true`；需要重建 CSV 表头时设置 `FIELD_RESET_MATRIX=true`。

## 人工表格模板

| 日期 | 盒子品牌/型号 | Android SDK | 遥控器 | 摄像头 | 麦克风 | 遥控器焦点 | 首页数字键 | 0 键自检 | 菜单/信息/帮助键自检 | 遥控器练习 | 首页退出确认 | 直播 | 直播数字键 | 播放/暂停键 | 直播收藏 | 全部内容救援 | 搜索救援 | 继续看救援 | 摄像头权限 | 摄像头预览 | 音频输入 | 录音权限 | USB 热插拔 | 维护码 | 结论 | support zip |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ____ | ____ | ____ | ____ | ____ | ____ | pass/fail | pass/fail | pass/fail | pass/fail | pass/fail | pass/fail | pass/fail | pass/fail/na | pass/fail/na | pass/fail/na | pass/fail | pass/fail | pass/fail | pass/fail/na | pass/fail/na | pass/fail/skip/na | pass/fail/na | pass/fail | pass/needs_fix | ____ |

## 判定规则

- 长辈/小孩可用：遥控器焦点、OK、返回、数字键或菜单/信息/帮助键自检、帮助页遥控器练习、首页退出确认、全部内容救援、搜索页救援、继续看页救援必须通过。
- 电视核心可用：直播进入、换台、返回首页必须通过；有数字键遥控器时还要记录直播 1-9 直达频道和频道列表 7/8 收藏结果，有播放/暂停键时记录暂停/继续结果，遥控器没有对应键可标 `na`。
- 摄像头/麦克风兼容：无摄像头或麦克风不阻塞看电视；有 USB/UVC 摄像头时，至少要记录系统是否识别 USB 视频设备、摄像头/录音权限是否可授权、Camera2 预览是否能打开；需要语音或通话时，再把音频输入和 `RECORD_AUDIO` 权限作为强验收项。
- 自动汇总：每次现场记录后查看 `tv-box-compatibility-summary-latest.md`，优先修复 `needs_fix`，样本足够后再对外推荐 `recommended` 组合。
- 失败必须留证据：同时保存 `tv-box-support-latest.zip`、维护码照片或安装窗口截图。
MATRIX

(cd "$ROOT_DIR" && \
  REPORT_DIR="$REPORT_DIR" \
  TV_BOX_SITE_READINESS_JSON="$SITE_READINESS_JSON" \
  TV_BOX_SITE_READINESS_MD="$SITE_READINESS_MD" \
  TV_BOX_SITE_READINESS_HTML="$SITE_READINESS_HTML" \
  npm run -s tv-box:site-readiness >/dev/null)

if [[ -f "$SITE_READINESS_JSON" ]]; then
  cp "$SITE_READINESS_JSON" "$HANDOFF_DIR/tv-box-site-readiness-latest.json"
fi

if [[ -f "$SITE_READINESS_MD" ]]; then
  cp "$SITE_READINESS_MD" "$HANDOFF_DIR/tv-box-site-readiness-latest.md"
fi

if [[ -f "$SITE_READINESS_HTML" ]]; then
  cp "$SITE_READINESS_HTML" "$HANDOFF_DIR/SITE_READINESS_CARD.html"
fi

(cd "$ROOT_DIR" && \
  REPORT_DIR="$REPORT_DIR" \
  HANDOFF_DIR="$HANDOFF_DIR" \
  TV_BOX_HANDOFF_HTML_SMOKE_JSON="$HANDOFF_HTML_SMOKE_JSON" \
  TV_BOX_HANDOFF_HTML_SMOKE_MD="$HANDOFF_HTML_SMOKE_MD" \
  npm run -s tv-box:handoff-html-smoke >/dev/null)

(cd "$ROOT_DIR" && \
  REPORT_DIR="$REPORT_DIR" \
  HANDOFF_DIR="$HANDOFF_DIR" \
  TV_BOX_INSPECTION_JSON="$INSPECTION_PATH" \
  TV_BOX_UX_AUDIT_JSON="$UX_AUDIT_JSON" \
  TV_BOX_UX_AUDIT_MD="$UX_AUDIT_MD" \
  npm run -s tv-box:ux-audit >/dev/null)

(cd "$ROOT_DIR" && \
  PACKAGE_NAME="$PACKAGE_NAME" \
  BOX_IP="${BOX_IP:-}" \
  EASY_RUN_RESULT="${EASY_RUN_RESULT:-handoff_refresh}" \
  EASY_RUN_CAMERA_SMOKE="${EASY_RUN_CAMERA_SMOKE:-${RUN_CAMERA_SMOKE:-false}}" \
  HANDOFF_DIR="$HANDOFF_DIR" \
  HANDOFF_ARCHIVE_PATH="$HANDOFF_ARCHIVE_PATH" \
  TV_BOX_INSPECTION_JSON="$INSPECTION_PATH" \
  TV_BOX_FIELD_RECORD_JSON="$FIELD_RECORD_JSON" \
  TV_BOX_COMPATIBILITY_SUMMARY_JSON="$COMPATIBILITY_SUMMARY_JSON" \
  TV_BOX_HANDOFF_HTML_SMOKE_JSON="$HANDOFF_HTML_SMOKE_JSON" \
  npm run -s tv-box:easy-summary >/dev/null)

if [[ -f "$EASY_SUMMARY_JSON" ]]; then
  cp "$EASY_SUMMARY_JSON" "$HANDOFF_DIR/tv-box-easy-run-latest.json"
fi

if [[ -f "$EASY_SUMMARY_MD" ]]; then
  cp "$EASY_SUMMARY_MD" "$HANDOFF_DIR/tv-box-easy-run-latest.md"
fi

if [[ -f "$HANDOFF_HTML_SMOKE_JSON" ]]; then
  cp "$HANDOFF_HTML_SMOKE_JSON" "$HANDOFF_DIR/tv-box-handoff-html-smoke-latest.json"
fi

if [[ -f "$HANDOFF_HTML_SMOKE_MD" ]]; then
  cp "$HANDOFF_HTML_SMOKE_MD" "$HANDOFF_DIR/tv-box-handoff-html-smoke-latest.md"
fi

if [[ -f "$UX_AUDIT_JSON" ]]; then
  cp "$UX_AUDIT_JSON" "$HANDOFF_DIR/tv-box-ux-audit-latest.json"
fi

if [[ -f "$UX_AUDIT_MD" ]]; then
  cp "$UX_AUDIT_MD" "$HANDOFF_DIR/tv-box-ux-audit-latest.md"
fi

(cd "$ROOT_DIR" && \
  TV_BOX_COMPLETION_AUDIT_SCOPE="handoff_package" \
  TV_BOX_INSPECTION_JSON="$INSPECTION_PATH" \
  TV_BOX_FIELD_RECORD_JSON="$FIELD_RECORD_JSON" \
  TV_BOX_COMPATIBILITY_SUMMARY_JSON="$COMPATIBILITY_SUMMARY_JSON" \
  TV_BOX_EASY_SUMMARY_JSON="$EASY_SUMMARY_JSON" \
  TV_BOX_COMPLETION_AUDIT_JSON="$COMPLETION_AUDIT_JSON" \
  TV_BOX_COMPLETION_AUDIT_MD="$COMPLETION_AUDIT_MD" \
  HANDOFF_DIR="$HANDOFF_DIR" \
  HANDOFF_ARCHIVE_PATH="$HANDOFF_ARCHIVE_PATH" \
  npm run -s tv-box:completion-audit >/dev/null)

if [[ -f "$COMPLETION_AUDIT_JSON" ]]; then
  cp "$COMPLETION_AUDIT_JSON" "$HANDOFF_DIR/tv-box-completion-audit-latest.json"
fi

if [[ -f "$COMPLETION_AUDIT_MD" ]]; then
  cp "$COMPLETION_AUDIT_MD" "$HANDOFF_DIR/tv-box-completion-audit-latest.md"
fi

(cd "$ROOT_DIR" && \
  TV_BOX_COMMAND_CENTER_SCOPE="handoff_package" \
  TV_BOX_COMMAND_CENTER_JSON="$COMMAND_CENTER_JSON" \
  TV_BOX_COMMAND_CENTER_MD="$COMMAND_CENTER_MD" \
  npm run -s tv-box:command-center >/dev/null)

if [[ -f "$COMMAND_CENTER_JSON" ]]; then
  cp "$COMMAND_CENTER_JSON" "$HANDOFF_DIR/tv-box-command-center-latest.json"
fi

if [[ -f "$COMMAND_CENTER_MD" ]]; then
  cp "$COMMAND_CENTER_MD" "$HANDOFF_DIR/tv-box-command-center-latest.md"
fi

(cd "$ROOT_DIR" && \
  BOX_IP="${BOX_IP:-}" \
  DEVICE_SERIAL="${DEVICE_SERIAL:-}" \
  PACKAGE_NAME="$PACKAGE_NAME" \
  REPORT_DIR="$REPORT_DIR" \
  TV_BOX_PREFLIGHT_JSON="$PREFLIGHT_JSON" \
  TV_BOX_PREFLIGHT_MD="$PREFLIGHT_MD" \
  npm run -s tv-box:preflight >/dev/null) || true

(cd "$ROOT_DIR" && \
  REPORT_DIR="$REPORT_DIR" \
  TV_BOX_SITE_READINESS_JSON="$SITE_READINESS_JSON" \
  TV_BOX_SITE_READINESS_MD="$SITE_READINESS_MD" \
  TV_BOX_SITE_READINESS_HTML="$SITE_READINESS_HTML" \
  npm run -s tv-box:site-readiness >/dev/null)

if [[ -f "$SITE_READINESS_JSON" ]]; then
  cp "$SITE_READINESS_JSON" "$HANDOFF_DIR/tv-box-site-readiness-latest.json"
fi

if [[ -f "$SITE_READINESS_MD" ]]; then
  cp "$SITE_READINESS_MD" "$HANDOFF_DIR/tv-box-site-readiness-latest.md"
fi

if [[ -f "$SITE_READINESS_HTML" ]]; then
  cp "$SITE_READINESS_HTML" "$HANDOFF_DIR/SITE_READINESS_CARD.html"
fi

cleanup_archive_checksums
printf '%s\n' "$HANDOFF_DIR" > "$HANDOFF_LATEST_PATH_FILE"
if [[ -n "$HANDOFF_ARCHIVE_PATH" && "$(basename "$HANDOFF_ARCHIVE_PATH")" == *.zip ]]; then
  rm -f "$HANDOFF_ARCHIVE_PATH"
  (cd "$REPORT_DIR" && zip -qr "$HANDOFF_ARCHIVE_PATH" "$(basename "$HANDOFF_DIR")")
  write_archive_checksum "$HANDOFF_ARCHIVE_PATH"
  printf '%s\n' "$HANDOFF_ARCHIVE_PATH" > "$HANDOFF_LATEST_ARCHIVE_FILE"
elif [[ -n "$HANDOFF_ARCHIVE_PATH" ]]; then
  rm -f "$HANDOFF_ARCHIVE_PATH"
  tar -czf "$HANDOFF_ARCHIVE_PATH" -C "$REPORT_DIR" "$(basename "$HANDOFF_DIR")"
  write_archive_checksum "$HANDOFF_ARCHIVE_PATH"
  printf '%s\n' "$HANDOFF_ARCHIVE_PATH" > "$HANDOFF_LATEST_ARCHIVE_FILE"
else
  rm -f "$HANDOFF_LATEST_ARCHIVE_FILE"
fi

echo "TV-box handoff package written to:"
echo "$HANDOFF_DIR"
if [[ -n "$HANDOFF_ARCHIVE_PATH" ]]; then
  echo "Archive:"
  echo "$HANDOFF_ARCHIVE_PATH"
fi
