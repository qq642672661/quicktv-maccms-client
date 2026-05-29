#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

source "$ROOT_DIR/scripts/android-env.sh"

PACKAGE_NAME="${PACKAGE_NAME:-com.quicktvui.hellotv}"
BOX_IP="${BOX_IP:-}"
DEVICE_SERIAL="${DEVICE_SERIAL:-}"
REPORT_DIR="${REPORT_DIR:-$ROOT_DIR/reports}"
STAMP="$(date -u '+%Y%m%dT%H%M%SZ')"
SUPPORT_ROOT="${SUPPORT_ROOT:-$REPORT_DIR/tv-box-support}"
BUNDLE_DIR="${SUPPORT_BUNDLE_DIR:-$SUPPORT_ROOT/$STAMP}"
LATEST_PATH_FILE="$REPORT_DIR/tv-box-support-latest-path.txt"
LATEST_ARCHIVE_FILE="$REPORT_DIR/tv-box-support-latest-archive.txt"
SUPPORT_EASY_SUMMARY_MD="$BUNDLE_DIR/tv-box-easy-run-support.md"
SUPPORT_EASY_SUMMARY_JSON="$BUNDLE_DIR/tv-box-easy-run-support.json"
SUPPORT_COMPLETION_AUDIT_MD="$BUNDLE_DIR/tv-box-completion-audit-latest.md"
SUPPORT_COMPLETION_AUDIT_JSON="$BUNDLE_DIR/tv-box-completion-audit-latest.json"
SUPPORT_UX_AUDIT_MD="$BUNDLE_DIR/tv-box-ux-audit-latest.md"
SUPPORT_UX_AUDIT_JSON="$BUNDLE_DIR/tv-box-ux-audit-latest.json"
SUPPORT_COMMAND_CENTER_MD="$BUNDLE_DIR/tv-box-command-center-support.md"
SUPPORT_COMMAND_CENTER_JSON="$BUNDLE_DIR/tv-box-command-center-support.json"
SUPPORT_AUTHORIZATION_MD="$BUNDLE_DIR/tv-box-authorization-latest.md"
SUPPORT_AUTHORIZATION_JSON="$BUNDLE_DIR/tv-box-authorization-latest.json"
SUPPORT_SITE_READINESS_MD="$BUNDLE_DIR/tv-box-site-readiness-support.md"
SUPPORT_SITE_READINESS_JSON="$BUNDLE_DIR/tv-box-site-readiness-support.json"
SUPPORT_SITE_READINESS_HTML="$BUNDLE_DIR/tv-box-site-readiness-card.html"
BOX_TARGET=""

mkdir -p "$BUNDLE_DIR"

normalize_box_target() {
  local target="$1"
  if [[ "$target" == *":"* ]]; then
    printf '%s' "$target"
  else
    printf '%s:5555' "$target"
  fi
}

run_and_capture() {
  local title="$1"
  local output_path="$2"
  shift 2

  {
    echo "== $title =="
    echo "cwd: $ROOT_DIR"
    echo "command: $*"
    echo "startedAtUtc: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
    echo
    set +e
    "$@"
    local status=$?
    set -e
    echo
    echo "exitCode: $status"
    echo "finishedAtUtc: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  } > "$output_path" 2>&1
}

copy_if_exists() {
  local source_path="$1"
  local target_name="$2"
  if [[ -f "$source_path" ]]; then
    cp "$source_path" "$BUNDLE_DIR/$target_name"
  fi
}

cleanup_archive_checksums() {
  rm -f "$REPORT_DIR"/tv-box-support-latest.zip.sha256 "$REPORT_DIR"/tv-box-support-latest.tar.gz.sha256
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

select_device_if_available() {
  if ! command -v adb >/dev/null 2>&1; then
    return
  fi

  if [[ -n "$BOX_IP" ]]; then
    BOX_TARGET="$(normalize_box_target "$BOX_IP")"
    adb connect "$BOX_TARGET" >/dev/null 2>&1 || true
  fi

  local devices
  local device_count
  devices="$(adb devices | awk 'NR > 1 && $2 == "device" { print $1 }')"
  device_count="$(printf '%s\n' "$devices" | sed '/^$/d' | wc -l | tr -d ' ')"

  if [[ -z "$DEVICE_SERIAL" && -n "$BOX_TARGET" ]] && grep -Fxq "$BOX_TARGET" <<< "$devices"; then
    DEVICE_SERIAL="$BOX_TARGET"
  fi

  if [[ -z "$DEVICE_SERIAL" && "$device_count" -eq 1 ]]; then
    DEVICE_SERIAL="$(printf '%s\n' "$devices" | sed '/^$/d' | sed -n '1p')"
  fi
}

write_summary() {
  local archive_path="${1:-}"
  local selected_device="${DEVICE_SERIAL:-未连接}"
  local archive_checksum_path="${archive_path:+$archive_path.sha256}"

  cat > "$BUNDLE_DIR/SUMMARY.zh-CN.md" <<SUMMARY
# HelloTV 电视盒子排障包

- 生成时间 UTC: $(date -u '+%Y-%m-%dT%H:%M:%SZ')
- 项目目录: \`$ROOT_DIR\`
- 包名: \`$PACKAGE_NAME\`
- BOX_IP: \`${BOX_IP:-未提供}\`
- DEVICE_SERIAL: \`$selected_device\`
- 排障目录: \`$BUNDLE_DIR\`
- 压缩包: \`${archive_path:-未生成}\`
- 压缩包校验: \`${archive_checksum_path:-未生成}\`

## 给现场人员

如果电视盒子已经打开网络调试，优先执行：

\`\`\`bash
BOX_IP=<盒子IP> npm run tv-box:support
\`\`\`

然后把本目录或压缩包发给维护人员。里面已经包含工具链、ADB 设备、电视盒子能力、USB/摄像头/麦克风线索、当前前台 Activity、Camera/Record audio appops、最近日志、交付清单、兼容性自动汇总、一键安装自动沉淀摘要、完成度证据审计、交付包离线自检和机器检查 JSON。

## 关键文件

- \`tv-box-doctor.txt\`: 人可读体检输出。
- \`tv-box-authorization.txt\` / \`tv-box-authorization-latest.md/json\`: ADB/RSA 授权助手，给出缺 adb、没给 IP、要点电视 RSA、要指定设备或可安装的下一步。
- \`tv-box-preflight.txt\` / \`tv-box-preflight-latest.md/json\`: 安装前自动预检，区分电脑工具链、交付包、ADB 授权和下一步动作。
- \`tv-box-inspection.json\`: 机器可读检查结果。
- \`handoff-standalone-test.txt\`: 最新交付压缩包解压后的离线完整性自检结果。
- \`handoff-html-smoke.txt\` / \`tv-box-handoff-html-smoke-latest.md/json\`: START_HERE 和 FIELD_WIZARD_OFFLINE 的离线网页可用性自检结果。
- \`tv-box-command-center-support.md/json\`: 排障包视角交付总控，集中列出应发哪个包、SHA、readiness、未闭环项和下一步。
- \`tv-box-site-readiness-support.md/json/html\`: 现场开工判定卡，告诉现场先授权、安装、补证据还是工程修复。
- \`adb-devices.txt\`: ADB 连接状态。
- \`device-facts.txt\`: 已连接盒子的型号、Android 版本、feature、USB 快照、当前前台 Activity、Camera appops 和 Record audio appops。
- \`logcat-tail.txt\`: 最近系统日志，已连接设备时生成。
- \`handoff-START_HERE.html\`: 给现场人员双击打开的离线大字安装首页。
- \`handoff-OPERATION_CARD.html\`: 给家人/长辈/小孩看的可打印大字操作卡。
- \`handoff-HARDWARE_SELECTION_CARD.html\`: 给采购、现场安装和维护人员看的可打印硬件选型卡。
- \`handoff-C920_ARRIVAL_CARD.html\`: C920 PRO 到货接入卡，现场按直插、供电 Hub、真实画面、麦克风和热插拔顺序验收。
- \`tv-box-c920-confirm-latest.md/json\`: C920 人工确认写入卡，现场看见真实画面、确认麦克风和热插拔后，用一条命令把 pass/fail 写回验收链路。
- \`tv-box-c920-onsite-prep-latest.md/json\`: C920 到货前/现场预备卡，说明今天是否该跑、盒子 ADB 是否在线、是否有离线设备噪声。
- \`handoff-TV_BOX_AV_TEST_HARDWARE.zh-CN.md\`: 音视频测试硬件采购、接线、验收和故障分流方案。
- \`handoff-TV_BOX_PHONE_CAMERA_CONTRACT.zh-CN.md\`: 手机当电视摄像头的 WebRTC 信令、状态机、隐私和验收合同。
- \`tv-box-phone-camera-capture-test-latest.md/json\`: 手机采集端页面回归，证明房间码、getUserMedia、RTCPeerConnection、停止按钮和 HTTPS/WSS 安全边界已固化。
- \`tv-box-phone-camera-readiness-latest.md/json\`: 手机当电视摄像头现场准备度，证明 HTTPS/WSS、手机入口、信令健康检查和电视端房间创建参数已准备好；不证明默认 \`quicktv.local\` 已被现场手机解析和信任。
- \`handoff-PHONE_CAMERA_ONSITE_CARD.html\`: 手机当电视摄像头现场操作卡，现场按启动信令、手机 DNS/HTTPS 首开、电视配对、手机扫码、首帧/音频/stats/重连/停止证据闭环处理。
- \`tv-box-phone-camera-signaling-test-latest.md/json\`: 局域网 WebSocket 信令服务回归，证明房间码、单手机配对、offer/answer/ICE、keepalive、stats 和挂断关闭房间可跑通。
- \`tv-box-phone-camera-scenarios-test-latest.md/json\`: 手机当电视摄像头合同场景回归，覆盖扫码首帧、权限失败、弱网降级、断线重连、隐私停止和微信小程序资质门禁。
- \`handoff-FIELD_WIZARD_OFFLINE.html\`: 不用 npm 的离线现场验收表，可下载 JSON/Markdown/env。
- \`handoff-FIELD_RETURN_CARD.html\`: 现场发回证据前的核对卡，要求 JSON、维护码照片、日志/排障包和异常照片齐全。
- \`handoff-FIELD_RETURN-README.zh-CN.txt\`: 现场回传文件夹说明。
- \`handoff-PACK_FIELD_RETURN_ON_MAC.command\` / \`handoff-PACK_FIELD_RETURN_ON_WINDOWS.bat\`: 现场一键打包回传证据。
- \`handoff-README_FIRST.txt\`: 文件管理器里最容易识别的纯文本入口。
- \`handoff-QUICK_START.zh-CN.md\`: 给现场人员的 3 步安装说明。
- \`handoff-PRE_INSTALL_CHECKLIST.zh-CN.md\`: 安装前自检卡，确认网络、IP、RSA 授权和交付文件没拆散。
- \`handoff-FIELD_ACCEPTANCE_CHECKLIST.zh-CN.md\`: 现场安装后逐项打勾的验收清单。
- \`handoff-FIELD_COMPATIBILITY_MATRIX.zh-CN.md\`: 多款盒子、遥控器和摄像头复测时统一记录的兼容性矩阵。
- \`handoff-MANIFEST.json\`: 当前交付包清单，存在交付包时复制。
- \`tv-box-field-record-latest.md/json\`: 最近一次实机兼容性记录。
- \`tv-box-field-wizard-latest.md/json/env\`: 中文现场验收向导记录，可复用字段再次写入矩阵。
- \`tv-box-field-wizard-offline.html\`: 源码报告目录里的离线现场验收表。
- \`tv-box-field-import-latest.md/json/env\`: 离线 JSON 导入记录，确认现场下载文件如何进入累计矩阵。
- \`tv-box-field-inbox-latest.md/json\`: 多份现场 JSON 的收件箱批量导入报告，适合多人多盒复测。
- \`tv-box-return-inbox-latest.md/json\`: 现场回传收件箱质检，检查 JSON、维护码照片、INSTALL_LOG/support zip 和异常证据是否齐全，并输出 ready_to_close / needs_site_follow_up / needs_fix 关闭判定。
- \`tv-box-return-inbox-scenarios-test-latest.md/json\`: 合成现场回传质检场景回归，证明缺维护码照片、照片需人工确认、unknown 未闭环、失败带证据和 ready_to_close 这几类不会误收或误关闭。
- \`tv-box-field-scenarios-test-latest.md/json\`: 合成现场验收场景回归，证明全通过、无摄像头核心可用、遥控失败和 unknown 未闭环这 4 类判定不会漂移。
- \`tv-box-field-matrix.csv\`: 多次实机记录追加表。
- \`tv-box-hardware-profile-latest.md/json\`: 硬件兼容性画像，给出盒子、遥控器、USB 摄像头、麦克风的推荐规格、当前风险和现场下一步。
- \`tv-box-compatibility-summary-latest.md/json\`: 兼容性自动汇总，区分推荐、待修复和待补测组合。
- \`tv-box-easy-run-latest.md/json\`: 收集排障包时已有的一键安装自动沉淀摘要，保持主交付 latest 语义不被覆盖。
- \`tv-box-completion-audit-latest.md/json\`: 完成度证据审计，集中标记哪些能力已由源码/报告/交付包证明，哪些仍需真实盒子验收。
- \`tv-box-ux-audit-latest.md/json\`: 长辈/小孩遥控器 UX 独立审计，证明简易首页、帮助、自检、遥控练习、现场验收、摄像头、直播救援和退出确认没有漂移。
- \`tv-box-easy-run-support.md/json\`: 排障包本次生成的 support 视角摘要，集中列出交付包、readiness 和下一步。
- \`tv-box-site-readiness-support.md/json/html\`: 排障包本次生成的现场开工判定卡。
- \`handoff-WINDOWS_HELP.zh-CN.md\`: Windows 双击安装失败时按错误代码排障。
- \`handoff-INSTALL_SUPPORT.zh-CN.md\`: 只拿到交付包时，现场失败应发给维护人员的信息清单。
- \`handoff-latest-archive.txt\`: 当前可直接发给现场人员的交付压缩包路径。
- \`handoff-latest-archive.sha256\`: 当前交付压缩包的 SHA256，便于确认远程传输没损坏。
SUMMARY
}

cd "$ROOT_DIR"

run_and_capture "Host toolchain" "$BUNDLE_DIR/host-toolchain.txt" bash -lc 'printf "node: "; command -v node || true; node -v 2>/dev/null || true; printf "npm: "; command -v npm || true; npm -v 2>/dev/null || true; printf "adb: "; command -v adb || true; adb version 2>/dev/null || true; printf "java: "; command -v java || true; java -version 2>&1 | head -5 || true; printf "JAVA_HOME=%s\nANDROID_HOME=%s\nANDROID_SDK_ROOT=%s\n" "${JAVA_HOME:-}" "${ANDROID_HOME:-}" "${ANDROID_SDK_ROOT:-}"'
run_and_capture "Git status" "$BUNDLE_DIR/git-status.txt" git -C "$ROOT_DIR" status --short --branch
run_and_capture "Package scripts" "$BUNDLE_DIR/package-scripts.json" node -e 'const p=require("./package.json"); console.log(JSON.stringify(p.scripts || {}, null, 2))'
run_and_capture "Remote navigation self-test" "$BUNDLE_DIR/remote-self-test.txt" npm run -s tv-box:remote-test
run_and_capture "ADB devices" "$BUNDLE_DIR/adb-devices.txt" bash -lc 'if command -v adb >/dev/null 2>&1; then adb devices -l; else echo "adb missing"; fi'
run_and_capture "ADB/RSA authorization helper" "$BUNDLE_DIR/tv-box-authorization.txt" env BOX_IP="$BOX_IP" DEVICE_SERIAL="$DEVICE_SERIAL" PACKAGE_NAME="$PACKAGE_NAME" TV_BOX_AUTHORIZATION_MD="$SUPPORT_AUTHORIZATION_MD" TV_BOX_AUTHORIZATION_JSON="$SUPPORT_AUTHORIZATION_JSON" npm run -s tv-box:authorize
cp "$SUPPORT_AUTHORIZATION_MD" "$REPORT_DIR/tv-box-authorization-latest.md" 2>/dev/null || true
cp "$SUPPORT_AUTHORIZATION_JSON" "$REPORT_DIR/tv-box-authorization-latest.json" 2>/dev/null || true
run_and_capture "TV-box doctor" "$BUNDLE_DIR/tv-box-doctor.txt" env BOX_IP="$BOX_IP" DEVICE_SERIAL="$DEVICE_SERIAL" PACKAGE_NAME="$PACKAGE_NAME" "$ROOT_DIR/scripts/tv-box-doctor.sh"
run_and_capture "Machine inspection" "$BUNDLE_DIR/tv-box-inspect.txt" env BOX_IP="$BOX_IP" DEVICE_SERIAL="$DEVICE_SERIAL" PACKAGE_NAME="$PACKAGE_NAME" TV_BOX_INSPECTION_JSON="$BUNDLE_DIR/tv-box-inspection.json" npm run -s tv-box:inspect
run_and_capture "Field compatibility record" "$BUNDLE_DIR/tv-box-field-record.txt" env BOX_IP="$BOX_IP" DEVICE_SERIAL="$DEVICE_SERIAL" PACKAGE_NAME="$PACKAGE_NAME" TV_BOX_INSPECTION_JSON="$REPORT_DIR/tv-box-inspection-latest.json" npm run -s tv-box:field-record
run_and_capture "Field compatibility wizard dry-run" "$BUNDLE_DIR/tv-box-field-wizard.txt" env BOX_IP="$BOX_IP" DEVICE_SERIAL="$DEVICE_SERIAL" PACKAGE_NAME="$PACKAGE_NAME" npm run -s tv-box:field-wizard -- --defaults --dry-run
run_and_capture "Field compatibility offline HTML" "$BUNDLE_DIR/tv-box-field-wizard-html.txt" npm run -s tv-box:field-wizard-html
run_and_capture "Field compatibility offline import dry-run" "$BUNDLE_DIR/tv-box-field-import.txt" npm run -s tv-box:field-import -- "$REPORT_DIR/tv-box-field-wizard-latest.json" --dry-run --no-append
run_and_capture "Field compatibility inbox dry-run" "$BUNDLE_DIR/tv-box-field-inbox.txt" npm run -s tv-box:field-inbox -- "$REPORT_DIR/tv-box-field-wizard-latest.json" --dry-run --no-append
run_and_capture "Field return inbox dry-run" "$BUNDLE_DIR/tv-box-return-inbox.txt" npm run -s tv-box:return-inbox -- "$REPORT_DIR/tv-box-field-wizard-latest.json" --no-field-inbox
run_and_capture "Field return inbox scenarios regression" "$BUNDLE_DIR/tv-box-return-inbox-scenarios-test.txt" npm run -s tv-box:return-inbox-scenarios-test
run_and_capture "Field acceptance scenarios regression" "$BUNDLE_DIR/tv-box-field-scenarios-test.txt" npm run -s tv-box:field-scenarios-test
run_and_capture "Compatibility summary" "$BUNDLE_DIR/tv-box-compatibility-summary.txt" env TV_BOX_INSPECTION_JSON="$REPORT_DIR/tv-box-inspection-latest.json" npm run -s tv-box:compatibility-summary
run_and_capture "Hardware compatibility profile" "$BUNDLE_DIR/tv-box-hardware-profile.txt" env TV_BOX_INSPECTION_JSON="$REPORT_DIR/tv-box-inspection-latest.json" TV_BOX_FIELD_RECORD_JSON="$REPORT_DIR/tv-box-field-record-latest.json" TV_BOX_COMPATIBILITY_SUMMARY_JSON="$REPORT_DIR/tv-box-compatibility-summary-latest.json" npm run -s tv-box:hardware-profile
run_and_capture "C920 arrival operation card" "$BUNDLE_DIR/tv-box-c920-arrival-card.txt" npm run -s tv-box:c920-arrival-card
run_and_capture "C920 confirmation write-back card" "$BUNDLE_DIR/tv-box-c920-confirm.txt" npm run -s tv-box:c920-confirm
run_and_capture "C920 onsite prep card" "$BUNDLE_DIR/tv-box-c920-onsite-prep.txt" npm run -s tv-box:c920-prep
run_and_capture "Phone camera contract" "$BUNDLE_DIR/tv-box-phone-camera-contract.txt" npm run -s tv-box:phone-camera-contract
run_and_capture "Phone camera capture page regression" "$BUNDLE_DIR/tv-box-phone-camera-capture-test.txt" npm run -s tv-box:phone-camera-capture-test
run_and_capture "Phone camera field readiness" "$BUNDLE_DIR/tv-box-phone-camera-readiness.txt" npm run -s tv-box:phone-camera-readiness
run_and_capture "Phone camera LAN signaling regression" "$BUNDLE_DIR/tv-box-phone-camera-signaling-test.txt" npm run -s tv-box:phone-camera-signaling-test
run_and_capture "Phone camera scenarios regression" "$BUNDLE_DIR/tv-box-phone-camera-scenarios-test.txt" npm run -s tv-box:phone-camera-scenarios-test
run_and_capture "Preflight summary" "$BUNDLE_DIR/tv-box-preflight.txt" env BOX_IP="$BOX_IP" DEVICE_SERIAL="$DEVICE_SERIAL" PACKAGE_NAME="$PACKAGE_NAME" "$ROOT_DIR/scripts/tv-box-preflight.sh"
run_and_capture "Standalone handoff archive self-test" "$BUNDLE_DIR/handoff-standalone-test.txt" env REPORT_DIR="$REPORT_DIR" npm run -s tv-box:handoff-standalone-test
run_and_capture "Handoff HTML smoke test" "$BUNDLE_DIR/handoff-html-smoke.txt" env REPORT_DIR="$REPORT_DIR" npm run -s tv-box:handoff-html-smoke
run_and_capture "Elder/child remote UX audit" "$BUNDLE_DIR/tv-box-ux-audit.txt" env REPORT_DIR="$REPORT_DIR" TV_BOX_UX_AUDIT_MD="$SUPPORT_UX_AUDIT_MD" TV_BOX_UX_AUDIT_JSON="$SUPPORT_UX_AUDIT_JSON" npm run -s tv-box:ux-audit
run_and_capture "Easy install support summary" "$BUNDLE_DIR/tv-box-easy-summary.txt" env BOX_IP="$BOX_IP" DEVICE_SERIAL="$DEVICE_SERIAL" PACKAGE_NAME="$PACKAGE_NAME" EASY_RUN_RESULT="support_bundle" TV_BOX_INSPECTION_JSON="$REPORT_DIR/tv-box-inspection-latest.json" TV_BOX_EASY_SUMMARY_MD="$SUPPORT_EASY_SUMMARY_MD" TV_BOX_EASY_SUMMARY_JSON="$SUPPORT_EASY_SUMMARY_JSON" npm run -s tv-box:easy-summary
run_and_capture "Completion evidence audit" "$BUNDLE_DIR/tv-box-completion-audit.txt" env BOX_IP="$BOX_IP" DEVICE_SERIAL="$DEVICE_SERIAL" PACKAGE_NAME="$PACKAGE_NAME" TV_BOX_COMPLETION_AUDIT_SCOPE="support_bundle" TV_BOX_COMPLETION_AUDIT_MD="$SUPPORT_COMPLETION_AUDIT_MD" TV_BOX_COMPLETION_AUDIT_JSON="$SUPPORT_COMPLETION_AUDIT_JSON" TV_BOX_UX_AUDIT_MD="$SUPPORT_UX_AUDIT_MD" TV_BOX_UX_AUDIT_JSON="$SUPPORT_UX_AUDIT_JSON" SUPPORT_BUNDLE_DIR="$BUNDLE_DIR" npm run -s tv-box:completion-audit
run_and_capture "Command center" "$BUNDLE_DIR/tv-box-command-center.txt" env TV_BOX_COMMAND_CENTER_SCOPE="support_bundle" TV_BOX_COMMAND_CENTER_MD="$SUPPORT_COMMAND_CENTER_MD" TV_BOX_COMMAND_CENTER_JSON="$SUPPORT_COMMAND_CENTER_JSON" npm run -s tv-box:command-center
run_and_capture "Site readiness card" "$BUNDLE_DIR/tv-box-site-readiness.txt" env TV_BOX_SITE_READINESS_MD="$SUPPORT_SITE_READINESS_MD" TV_BOX_SITE_READINESS_JSON="$SUPPORT_SITE_READINESS_JSON" TV_BOX_SITE_READINESS_HTML="$SUPPORT_SITE_READINESS_HTML" npm run -s tv-box:site-readiness

copy_if_exists "$REPORT_DIR/tv-box-acceptance-latest.md" "tv-box-acceptance-latest.md"
copy_if_exists "$REPORT_DIR/tv-box-inspection-latest.json" "tv-box-inspection-latest.json"
copy_if_exists "$REPORT_DIR/tv-box-handoff/MANIFEST.json" "handoff-MANIFEST.json"
copy_if_exists "$REPORT_DIR/tv-box-handoff/SHA256SUMS" "handoff-SHA256SUMS"
copy_if_exists "$REPORT_DIR/tv-box-handoff/START_HERE.html" "handoff-START_HERE.html"
copy_if_exists "$REPORT_DIR/tv-box-handoff/OPERATION_CARD.html" "handoff-OPERATION_CARD.html"
copy_if_exists "$REPORT_DIR/tv-box-handoff/HARDWARE_SELECTION_CARD.html" "handoff-HARDWARE_SELECTION_CARD.html"
copy_if_exists "$REPORT_DIR/tv-box-handoff/HARDWARE_SELECTION_CARD.zh-CN.md" "handoff-HARDWARE_SELECTION_CARD.zh-CN.md"
copy_if_exists "$REPORT_DIR/tv-box-handoff/C920_ARRIVAL_CARD.html" "handoff-C920_ARRIVAL_CARD.html"
copy_if_exists "$REPORT_DIR/tv-box-handoff/tv-box-c920-arrival-card-latest.md" "tv-box-c920-arrival-card-latest.md"
copy_if_exists "$REPORT_DIR/tv-box-handoff/tv-box-c920-arrival-card-latest.json" "tv-box-c920-arrival-card-latest.json"
copy_if_exists "$REPORT_DIR/tv-box-c920-arrival-card.html" "handoff-C920_ARRIVAL_CARD.html"
copy_if_exists "$REPORT_DIR/tv-box-c920-arrival-card-latest.md" "tv-box-c920-arrival-card-latest.md"
copy_if_exists "$REPORT_DIR/tv-box-c920-arrival-card-latest.json" "tv-box-c920-arrival-card-latest.json"
copy_if_exists "$REPORT_DIR/tv-box-c920-confirm-latest.md" "tv-box-c920-confirm-latest.md"
copy_if_exists "$REPORT_DIR/tv-box-c920-confirm-latest.json" "tv-box-c920-confirm-latest.json"
copy_if_exists "$REPORT_DIR/tv-box-c920-onsite-prep-latest.md" "tv-box-c920-onsite-prep-latest.md"
copy_if_exists "$REPORT_DIR/tv-box-c920-onsite-prep-latest.json" "tv-box-c920-onsite-prep-latest.json"
copy_if_exists "$REPORT_DIR/tv-box-handoff/TV_BOX_AV_TEST_HARDWARE.zh-CN.md" "handoff-TV_BOX_AV_TEST_HARDWARE.zh-CN.md"
copy_if_exists "$REPORT_DIR/tv-box-handoff/TV_BOX_PHONE_CAMERA_CONTRACT.zh-CN.md" "handoff-TV_BOX_PHONE_CAMERA_CONTRACT.zh-CN.md"
copy_if_exists "$REPORT_DIR/tv-box-handoff/tv-box-phone-camera-contract-latest.md" "tv-box-phone-camera-contract-latest.md"
copy_if_exists "$REPORT_DIR/tv-box-handoff/tv-box-phone-camera-contract-latest.json" "tv-box-phone-camera-contract-latest.json"
copy_if_exists "$REPORT_DIR/tv-box-handoff/tv-box-phone-camera-capture-test-latest.md" "tv-box-phone-camera-capture-test-latest.md"
copy_if_exists "$REPORT_DIR/tv-box-handoff/tv-box-phone-camera-capture-test-latest.json" "tv-box-phone-camera-capture-test-latest.json"
copy_if_exists "$REPORT_DIR/tv-box-handoff/tv-box-phone-camera-readiness-latest.md" "tv-box-phone-camera-readiness-latest.md"
copy_if_exists "$REPORT_DIR/tv-box-handoff/tv-box-phone-camera-readiness-latest.json" "tv-box-phone-camera-readiness-latest.json"
copy_if_exists "$REPORT_DIR/tv-box-handoff/PHONE_CAMERA_ONSITE_CARD.html" "handoff-PHONE_CAMERA_ONSITE_CARD.html"
copy_if_exists "$REPORT_DIR/tv-box-handoff/tv-box-phone-camera-signaling-test-latest.md" "tv-box-phone-camera-signaling-test-latest.md"
copy_if_exists "$REPORT_DIR/tv-box-handoff/tv-box-phone-camera-signaling-test-latest.json" "tv-box-phone-camera-signaling-test-latest.json"
copy_if_exists "$REPORT_DIR/tv-box-handoff/tv-box-phone-camera-scenarios-test-latest.md" "tv-box-phone-camera-scenarios-test-latest.md"
copy_if_exists "$REPORT_DIR/tv-box-handoff/tv-box-phone-camera-scenarios-test-latest.json" "tv-box-phone-camera-scenarios-test-latest.json"
copy_if_exists "$REPORT_DIR/tv-box-phone-camera-contract-latest.md" "tv-box-phone-camera-contract-latest.md"
copy_if_exists "$REPORT_DIR/tv-box-phone-camera-contract-latest.json" "tv-box-phone-camera-contract-latest.json"
copy_if_exists "$REPORT_DIR/tv-box-phone-camera-capture-test-latest.md" "tv-box-phone-camera-capture-test-latest.md"
copy_if_exists "$REPORT_DIR/tv-box-phone-camera-capture-test-latest.json" "tv-box-phone-camera-capture-test-latest.json"
copy_if_exists "$REPORT_DIR/tv-box-phone-camera-readiness-latest.md" "tv-box-phone-camera-readiness-latest.md"
copy_if_exists "$REPORT_DIR/tv-box-phone-camera-readiness-latest.json" "tv-box-phone-camera-readiness-latest.json"
copy_if_exists "$REPORT_DIR/tv-box-phone-camera-onsite-card.html" "tv-box-phone-camera-onsite-card.html"
copy_if_exists "$REPORT_DIR/tv-box-phone-camera-signaling-test-latest.md" "tv-box-phone-camera-signaling-test-latest.md"
copy_if_exists "$REPORT_DIR/tv-box-phone-camera-signaling-test-latest.json" "tv-box-phone-camera-signaling-test-latest.json"
copy_if_exists "$REPORT_DIR/tv-box-phone-camera-scenarios-test-latest.md" "tv-box-phone-camera-scenarios-test-latest.md"
copy_if_exists "$REPORT_DIR/tv-box-phone-camera-scenarios-test-latest.json" "tv-box-phone-camera-scenarios-test-latest.json"
copy_if_exists "$REPORT_DIR/tv-box-handoff/FIELD_WIZARD_OFFLINE.html" "handoff-FIELD_WIZARD_OFFLINE.html"
copy_if_exists "$REPORT_DIR/tv-box-handoff/README_FIRST.txt" "handoff-README_FIRST.txt"
copy_if_exists "$REPORT_DIR/tv-box-handoff/QUICK_START.zh-CN.md" "handoff-QUICK_START.zh-CN.md"
copy_if_exists "$REPORT_DIR/tv-box-handoff/PRE_INSTALL_CHECKLIST.zh-CN.md" "handoff-PRE_INSTALL_CHECKLIST.zh-CN.md"
copy_if_exists "$REPORT_DIR/tv-box-handoff/FIELD_ACCEPTANCE_CHECKLIST.zh-CN.md" "handoff-FIELD_ACCEPTANCE_CHECKLIST.zh-CN.md"
copy_if_exists "$REPORT_DIR/tv-box-handoff/FIELD_RETURN_CARD.html" "handoff-FIELD_RETURN_CARD.html"
copy_if_exists "$REPORT_DIR/tv-box-handoff/FIELD_RETURN_CARD.zh-CN.md" "handoff-FIELD_RETURN_CARD.zh-CN.md"
copy_if_exists "$REPORT_DIR/tv-box-handoff/FIELD_RETURN/README.zh-CN.txt" "handoff-FIELD_RETURN-README.zh-CN.txt"
copy_if_exists "$REPORT_DIR/tv-box-handoff/PACK_FIELD_RETURN_ON_MAC.command" "handoff-PACK_FIELD_RETURN_ON_MAC.command"
copy_if_exists "$REPORT_DIR/tv-box-handoff/PACK_FIELD_RETURN_ON_WINDOWS.bat" "handoff-PACK_FIELD_RETURN_ON_WINDOWS.bat"
copy_if_exists "$REPORT_DIR/tv-box-handoff/FIELD_COMPATIBILITY_MATRIX.zh-CN.md" "handoff-FIELD_COMPATIBILITY_MATRIX.zh-CN.md"
copy_if_exists "$REPORT_DIR/tv-box-handoff/INSTALL.zh-CN.md" "handoff-INSTALL.zh-CN.md"
copy_if_exists "$REPORT_DIR/tv-box-handoff/INSTALL_SUPPORT.zh-CN.md" "handoff-INSTALL_SUPPORT.zh-CN.md"
copy_if_exists "$REPORT_DIR/tv-box-handoff/INSTALL_ON_MAC.command" "handoff-INSTALL_ON_MAC.command"
copy_if_exists "$REPORT_DIR/tv-box-handoff/INSTALL_ON_WINDOWS.bat" "handoff-INSTALL_ON_WINDOWS.bat"
copy_if_exists "$REPORT_DIR/tv-box-handoff/WINDOWS_HELP.zh-CN.md" "handoff-WINDOWS_HELP.zh-CN.md"
copy_if_exists "$REPORT_DIR/tv-box-handoff/OPERATION_CARD.zh-CN.md" "handoff-OPERATION_CARD.zh-CN.md"
copy_if_exists "$REPORT_DIR/tv-box-field-record-latest.md" "tv-box-field-record-latest.md"
copy_if_exists "$REPORT_DIR/tv-box-field-record-latest.json" "tv-box-field-record-latest.json"
copy_if_exists "$REPORT_DIR/tv-box-field-wizard-latest.md" "tv-box-field-wizard-latest.md"
copy_if_exists "$REPORT_DIR/tv-box-field-wizard-latest.json" "tv-box-field-wizard-latest.json"
copy_if_exists "$REPORT_DIR/tv-box-field-wizard-latest.env" "tv-box-field-wizard-latest.env"
copy_if_exists "$REPORT_DIR/tv-box-field-wizard-offline.html" "tv-box-field-wizard-offline.html"
copy_if_exists "$REPORT_DIR/tv-box-field-import-latest.md" "tv-box-field-import-latest.md"
copy_if_exists "$REPORT_DIR/tv-box-field-import-latest.json" "tv-box-field-import-latest.json"
copy_if_exists "$REPORT_DIR/tv-box-field-import-latest.env" "tv-box-field-import-latest.env"
copy_if_exists "$REPORT_DIR/tv-box-field-inbox-latest.md" "tv-box-field-inbox-latest.md"
copy_if_exists "$REPORT_DIR/tv-box-field-inbox-latest.json" "tv-box-field-inbox-latest.json"
copy_if_exists "$REPORT_DIR/tv-box-return-inbox-latest.md" "tv-box-return-inbox-latest.md"
copy_if_exists "$REPORT_DIR/tv-box-return-inbox-latest.json" "tv-box-return-inbox-latest.json"
copy_if_exists "$REPORT_DIR/tv-box-return-inbox-scenarios-test-latest.md" "tv-box-return-inbox-scenarios-test-latest.md"
copy_if_exists "$REPORT_DIR/tv-box-return-inbox-scenarios-test-latest.json" "tv-box-return-inbox-scenarios-test-latest.json"
copy_if_exists "$REPORT_DIR/tv-box-site-readiness-latest.md" "tv-box-site-readiness-latest.md"
copy_if_exists "$REPORT_DIR/tv-box-site-readiness-latest.json" "tv-box-site-readiness-latest.json"
copy_if_exists "$REPORT_DIR/tv-box-site-readiness-card.html" "tv-box-site-readiness-card.html"
copy_if_exists "$REPORT_DIR/tv-box-field-scenarios-test-latest.md" "tv-box-field-scenarios-test-latest.md"
copy_if_exists "$REPORT_DIR/tv-box-field-scenarios-test-latest.json" "tv-box-field-scenarios-test-latest.json"
copy_if_exists "$REPORT_DIR/tv-box-field-matrix.csv" "tv-box-field-matrix.csv"
copy_if_exists "$REPORT_DIR/tv-box-hardware-profile-latest.md" "tv-box-hardware-profile-latest.md"
copy_if_exists "$REPORT_DIR/tv-box-hardware-profile-latest.json" "tv-box-hardware-profile-latest.json"
copy_if_exists "$REPORT_DIR/tv-box-authorization-latest.md" "tv-box-authorization-root-latest.md"
copy_if_exists "$REPORT_DIR/tv-box-authorization-latest.json" "tv-box-authorization-root-latest.json"
copy_if_exists "$REPORT_DIR/tv-box-compatibility-summary-latest.md" "tv-box-compatibility-summary-latest.md"
copy_if_exists "$REPORT_DIR/tv-box-compatibility-summary-latest.json" "tv-box-compatibility-summary-latest.json"
copy_if_exists "$REPORT_DIR/tv-box-easy-run-latest.md" "tv-box-easy-run-latest.md"
copy_if_exists "$REPORT_DIR/tv-box-easy-run-latest.json" "tv-box-easy-run-latest.json"
copy_if_exists "$REPORT_DIR/tv-box-preflight-latest.md" "tv-box-preflight-latest.md"
copy_if_exists "$REPORT_DIR/tv-box-preflight-latest.json" "tv-box-preflight-latest.json"
copy_if_exists "$REPORT_DIR/tv-box-handoff-html-smoke-latest.md" "tv-box-handoff-html-smoke-latest.md"
copy_if_exists "$REPORT_DIR/tv-box-handoff-html-smoke-latest.json" "tv-box-handoff-html-smoke-latest.json"
copy_if_exists "$REPORT_DIR/tv-box-ux-audit-latest.md" "tv-box-ux-audit-latest.md"
copy_if_exists "$REPORT_DIR/tv-box-ux-audit-latest.json" "tv-box-ux-audit-latest.json"
copy_if_exists "$REPORT_DIR/tv-box-handoff-latest-path.txt" "handoff-latest-path.txt"
copy_if_exists "$REPORT_DIR/tv-box-handoff-latest-archive.txt" "handoff-latest-archive.txt"
if [[ -f "$REPORT_DIR/tv-box-handoff-latest-archive.txt" ]]; then
  HANDOFF_ARCHIVE_FOR_SUPPORT="$(sed -n '1p' "$REPORT_DIR/tv-box-handoff-latest-archive.txt")"
  copy_if_exists "$HANDOFF_ARCHIVE_FOR_SUPPORT.sha256" "handoff-latest-archive.sha256"
fi

select_device_if_available

if [[ -n "$DEVICE_SERIAL" ]] && command -v adb >/dev/null 2>&1; then
  run_and_capture "Device facts" "$BUNDLE_DIR/device-facts.txt" bash -lc "echo 'Model:'; adb -s '$DEVICE_SERIAL' shell getprop ro.product.model; echo 'Android SDK:'; adb -s '$DEVICE_SERIAL' shell getprop ro.build.version.sdk; echo; echo 'TV/camera/audio features:'; adb -s '$DEVICE_SERIAL' shell pm list features | grep -E 'leanback|television|camera|microphone|audio|usb.host' || true; echo; echo 'USB snapshot:'; adb -s '$DEVICE_SERIAL' shell dumpsys usb | grep -Ei 'Device|Class|class|interface|video|camera|uvc|webcam|audio|microphone|host|accessory' | head -160 || true; echo; echo 'Package camera/audio declarations:'; adb -s '$DEVICE_SERIAL' shell dumpsys package '$PACKAGE_NAME' | grep -E 'android.permission.CAMERA|android.permission.RECORD_AUDIO|android.hardware.camera|android.hardware.microphone|android.hardware.usb.host|android.software.leanback' || true; echo; echo 'Camera permission context:'; adb -s '$DEVICE_SERIAL' shell dumpsys package '$PACKAGE_NAME' | grep -A2 -B2 'android.permission.CAMERA' | head -40 || true; echo; echo 'Record audio permission context:'; adb -s '$DEVICE_SERIAL' shell dumpsys package '$PACKAGE_NAME' | grep -A2 -B2 'android.permission.RECORD_AUDIO' | head -40 || true; echo; echo 'Camera appops:'; adb -s '$DEVICE_SERIAL' shell appops get '$PACKAGE_NAME' CAMERA 2>/dev/null || true; echo; echo 'Record audio appops:'; adb -s '$DEVICE_SERIAL' shell appops get '$PACKAGE_NAME' RECORD_AUDIO 2>/dev/null || true; echo; echo 'Current focus:'; adb -s '$DEVICE_SERIAL' shell dumpsys window windows | grep -E 'mCurrentFocus|mFocusedApp|mFocusedWindow' | head -30 || true; echo; echo 'Resumed activity:'; adb -s '$DEVICE_SERIAL' shell dumpsys activity activities | grep -E 'mResumedActivity|ResumedActivity|topResumedActivity' | head -30 || true"
  run_and_capture "Logcat tail" "$BUNDLE_DIR/logcat-tail.txt" bash -lc "adb -s '$DEVICE_SERIAL' logcat -d -t 1200 | grep -E 'HelloTV|TvBoxModule|CameraPreviewActivity|AndroidRuntime|FATAL EXCEPTION|Permission|ActivityNotFound|Camera|camera|Audio|audio|Microphone|microphone' || true"
else
  cat > "$BUNDLE_DIR/device-facts.txt" <<'NO_DEVICE'
No authorized TV box was selected.
Turn on TV-box developer/network debugging, confirm the RSA dialog, then run:
BOX_IP=<box-ip> npm run tv-box:support
NO_DEVICE
  cp "$BUNDLE_DIR/device-facts.txt" "$BUNDLE_DIR/logcat-tail.txt"
fi

ARCHIVE_PATH=""
if command -v zip >/dev/null 2>&1; then
  ARCHIVE_PATH="$REPORT_DIR/tv-box-support-latest.zip"
elif command -v tar >/dev/null 2>&1; then
  ARCHIVE_PATH="$REPORT_DIR/tv-box-support-latest.tar.gz"
fi

write_summary "$ARCHIVE_PATH"

cleanup_archive_checksums
if [[ -n "$ARCHIVE_PATH" && "$(basename "$ARCHIVE_PATH")" == *.zip ]]; then
  rm -f "$ARCHIVE_PATH"
  (cd "$SUPPORT_ROOT" && zip -qr "$ARCHIVE_PATH" "$(basename "$BUNDLE_DIR")")
  write_archive_checksum "$ARCHIVE_PATH"
elif [[ -n "$ARCHIVE_PATH" ]]; then
  rm -f "$ARCHIVE_PATH"
  tar -czf "$ARCHIVE_PATH" -C "$SUPPORT_ROOT" "$(basename "$BUNDLE_DIR")"
  write_archive_checksum "$ARCHIVE_PATH"
fi

printf '%s\n' "$BUNDLE_DIR" > "$LATEST_PATH_FILE"
if [[ -n "$ARCHIVE_PATH" ]]; then
  printf '%s\n' "$ARCHIVE_PATH" > "$LATEST_ARCHIVE_FILE"
else
  rm -f "$LATEST_ARCHIVE_FILE"
fi

echo "TV-box support bundle written to:"
echo "$BUNDLE_DIR"
if [[ -n "$ARCHIVE_PATH" ]]; then
  echo "Archive:"
  echo "$ARCHIVE_PATH"
fi
