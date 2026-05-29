#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

REPORT_DIR="${REPORT_DIR:-$ROOT_DIR/reports}"
REPORT_PATH="${REPORT_PATH:-$REPORT_DIR/tv-box-acceptance-latest.md}"
INSPECTION_PATH="${TV_BOX_INSPECTION_JSON:-$REPORT_DIR/tv-box-inspection-latest.json}"
PACKAGE_NAME="${PACKAGE_NAME:-com.quicktvui.hellotv}"
BOX_IP="${BOX_IP:-}"
DEVICE_SERIAL="${DEVICE_SERIAL:-}"

source "$ROOT_DIR/scripts/android-env.sh"

mkdir -p "$REPORT_DIR"

run_section() {
  local title="$1"
  shift

  {
    echo
    echo "## $title"
    echo
    echo '```text'
    "$@" 2>&1 || true
    echo '```'
  } >> "$REPORT_PATH"
}

latest_apk() {
  ls -t "$ROOT_DIR"/android/app/build/outputs/apk/debug/*_debug.apk 2>/dev/null | head -n 1 || true
}

write_manifest_summary() {
  local apk_path="$1"
  local apkanalyzer="${ANDROID_HOME:-}/cmdline-tools/latest/bin/apkanalyzer"
  local java17_home=""

  if [[ -d "/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home" ]]; then
    java17_home="/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home"
  elif [[ -d "/usr/local/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home" ]]; then
    java17_home="/usr/local/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home"
  fi

  if [[ -z "$apk_path" ]]; then
    echo "No debug APK found. Run: npm run build-apk-debug"
    return
  fi

  echo "APK: $apk_path"
  ls -lh "$apk_path" | awk '{ print "Size: " $5 }'
  echo

  if [[ -x "$apkanalyzer" ]]; then
    if [[ -n "$java17_home" ]]; then
      JAVA_HOME="$java17_home" "$apkanalyzer" manifest print "$apk_path" \
        | tr -d '\r' \
        | grep -E 'package="|android:banner=|android:name="(android.permission.CAMERA|android.permission.RECORD_AUDIO|android.software.leanback|android.hardware.camera|android.hardware.camera.any|android.hardware.camera.external|android.hardware.microphone|android.hardware.usb.host|android.hardware.touchscreen|com.quicktvui.hellotv.MainActivity|com.quicktvui.hellotv.tvbox.CameraPreviewActivity|android.intent.category.LEANBACK_LAUNCHER)"|android:required="false"' || true
    else
      "$apkanalyzer" manifest print "$apk_path" \
      | tr -d '\r' \
      | grep -E 'package="|android:banner=|android:name="(android.permission.CAMERA|android.permission.RECORD_AUDIO|android.software.leanback|android.hardware.camera|android.hardware.camera.any|android.hardware.camera.external|android.hardware.microphone|android.hardware.usb.host|android.hardware.touchscreen|com.quicktvui.hellotv.MainActivity|com.quicktvui.hellotv.tvbox.CameraPreviewActivity|android.intent.category.LEANBACK_LAUNCHER)"|android:required="false"' || true
    fi
    return
  fi

  echo "apkanalyzer missing; manifest summary skipped."
}

write_device_summary() {
  local adb_args=()
  local box_target=""

  if ! command -v adb >/dev/null 2>&1; then
    echo "adb missing; device checks skipped."
    return
  fi

  if [[ -n "$BOX_IP" ]]; then
    box_target="$BOX_IP"
    if [[ "$box_target" != *":"* ]]; then
      box_target="$box_target:5555"
    fi
    adb connect "$box_target" || true
  fi

  echo "Connected devices:"
  adb devices -l
  echo

  local devices
  devices="$(adb devices | awk 'NR > 1 && $2 == "device" { print $1 }')"
  local device_count
  device_count="$(printf '%s\n' "$devices" | sed '/^$/d' | wc -l | tr -d ' ')"

  if [[ "$device_count" -eq 0 ]]; then
    echo "No authorized TV box connected."
    if adb devices | awk 'NR > 1 && ($2 == "unauthorized" || $2 == "offline") { found = 1 } END { exit found ? 0 : 1 }'; then
      echo "A TV box is visible but not authorized/online. Confirm the RSA dialog on the TV box, or restart network debugging."
    fi
    return
  fi

  if [[ -z "$DEVICE_SERIAL" ]]; then
    if [[ -n "$box_target" ]] && printf '%s\n' "$devices" | grep -Fxq "$box_target"; then
      DEVICE_SERIAL="$box_target"
    elif [[ -n "$box_target" ]]; then
      echo "Target TV box is not authorized or online: $box_target"
      echo "Confirm the RSA dialog on the TV box, or restart network debugging."
      return
    fi
  fi

  if [[ -z "$DEVICE_SERIAL" ]]; then
    if [[ "$device_count" -gt 1 ]]; then
      echo "Multiple devices connected; set DEVICE_SERIAL=<serial> for precise checks."
      return
    fi
    DEVICE_SERIAL="$(printf '%s\n' "$devices" | sed '/^$/d' | sed -n '1p')"
  fi

  adb_args=(-s "$DEVICE_SERIAL")
  echo "Selected device: $DEVICE_SERIAL"
  echo "Model: $(adb "${adb_args[@]}" shell getprop ro.product.model | tr -d '\r')"
  echo "Android SDK: $(adb "${adb_args[@]}" shell getprop ro.build.version.sdk | tr -d '\r')"
  echo
  echo "TV/camera features:"
  adb "${adb_args[@]}" shell pm list features | tr -d '\r' | grep -E 'leanback|camera|microphone|audio|television|usb.host' || true
  echo
  echo "USB snapshot:"
  adb "${adb_args[@]}" shell dumpsys usb \
    | tr -d '\r' \
    | grep -Ei 'Device|Class|class|interface|video|camera|uvc|webcam|audio|microphone|host|accessory' \
    | head -120 || true
  echo
  echo "App install state:"
  if adb "${adb_args[@]}" shell pm path "$PACKAGE_NAME" >/dev/null; then
    echo "$PACKAGE_NAME installed"
    adb "${adb_args[@]}" shell dumpsys package "$PACKAGE_NAME" | tr -d '\r' | grep -E 'android.permission.CAMERA|android.permission.RECORD_AUDIO|android.hardware.camera|android.hardware.microphone|android.hardware.usb.host|android.software.leanback' || true
    echo
    echo "Camera appops:"
    adb "${adb_args[@]}" shell appops get "$PACKAGE_NAME" CAMERA 2>/dev/null | tr -d '\r' || true
    echo
    echo "Record audio appops:"
    adb "${adb_args[@]}" shell appops get "$PACKAGE_NAME" RECORD_AUDIO 2>/dev/null | tr -d '\r' || true
  else
    echo "$PACKAGE_NAME not installed"
  fi
  echo
  echo "Current focus:"
  adb "${adb_args[@]}" shell dumpsys window windows \
    | tr -d '\r' \
    | grep -E 'mCurrentFocus|mFocusedApp|mFocusedWindow' \
    | head -30 || true
  echo
  echo "Resumed activity:"
  adb "${adb_args[@]}" shell dumpsys activity activities \
    | tr -d '\r' \
    | grep -E 'mResumedActivity|ResumedActivity|topResumedActivity' \
    | head -30 || true
}

write_inspection_summary() {
  if [[ ! -f "$INSPECTION_PATH" ]]; then
    echo "Machine inspection JSON missing."
    return
  fi

  echo "JSON: $INSPECTION_PATH"
  node -e "
const fs = require('fs')
const report = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'))
console.log(JSON.stringify({
  generatedAtUtc: report.generatedAtUtc,
  apkSha256: report.apk && report.apk.sha256,
  remoteSelfTestOk: report.remoteSelfTest && report.remoteSelfTest.ok,
  readiness: report.readiness,
  deviceStatus: report.deviceEvidence && report.deviceEvidence.status,
  currentFocusLines: report.deviceEvidence && report.deviceEvidence.currentFocusLines,
	  cameraAppOpsLines: report.deviceEvidence && report.deviceEvidence.cameraAppOpsLines,
	  recordAudioAppOpsLines: report.deviceEvidence && report.deviceEvidence.recordAudioAppOpsLines,
	  nextActions: report.deviceEvidence && report.deviceEvidence.nextActions
}, null, 2))
" "$INSPECTION_PATH"
}

write_manual_acceptance_checklist() {
  cat <<'CHECKLIST'
- [ ] 打开 App 后默认进入“电视盒子简易模式”。
- [ ] 遥控器方向键能在“看电视 / 找节目 / 继续看 / 摄像头 / 全部内容 / 帮助自检”六个入口之间移动焦点。
- [ ] 简易首页上/下/左/右键能移动黄色选中态，OK/Enter/确认键能执行当前选中入口。
- [ ] OK/Enter/确认键进入“看电视”，直播页 OK/Enter/确认键/左/右能打开频道列表。
- [ ] 直播页上/下或频道 +/- 能切台，返回先收起频道列表，再按返回回简易首页。
- [ ] 直播页数字键 1-9 能直达对应频道，0 不抢频道、改为打开“帮助/自检”。
- [ ] 打开直播频道列表后，按 7 能收藏/取消收藏当前频道，按 8 能在“只看收藏”和“全部频道”间切换。
- [ ] 进入“摄像头”页后能看到摄像头、权限、设备三项状态。
- [ ] 摄像头页上/下/左/右键能在“重新检测 / 一键授权 / 测试摄像头 / 打开权限设置 / 返回首页”之间移动黄色选中态。
- [ ] 摄像头页 OK 能执行当前选中按钮，返回键回到简易首页。
- [ ] 首页、直播页和摄像头页按 0、菜单、信息、指南、设置或帮助键能进入“帮助/自检”，返回键回到简易首页；首页和摄像头页按 6 也能进入帮助。
- [ ] 全部内容页按 0、6、菜单、信息、指南、设置或帮助键能进入“帮助/自检”，按返回最终回到简易首页。
- [ ] 搜索页和继续看页按 0、菜单、信息、指南、设置或帮助键能进入“帮助/自检”，按返回最终回到简易首页。
- [ ] 帮助页按 3 能进入“遥控器练习”；方向键和 OK 会在练习页给出大字反馈，显示中文按键名和 `keyCode`，返回键回到简易首页。
- [ ] 首页按返回进入大字退出确认，默认 OK/返回都继续看；只有选“退出应用”才关闭。
- [ ] 摄像头页“测试摄像头”能打开 App 内置 Camera2 预览；没有 Camera HAL 摄像头时给出清晰提示且不崩溃。
- [ ] 连接盒子后执行 `BOX_IP=<盒子IP> npm run tv-box:camera-smoke`，脚本确认 `CameraPreviewActivity` 成为前台 Activity、返回键可退出，且日志中没有 E AndroidRuntime/FATAL EXCEPTION。
- [ ] 无摄像头盒子不阻塞看片；盒子支持 USB Host 时，插入 USB 摄像头后“重新检测”能显示系统摄像头数量或 USB 视频设备数量。
- [ ] 如果摄像头页显示“USB 摄像头已接入/待适配”，现场能理解为硬件已插入但系统暂未开放摄像头，并能按操作卡更换 UVC 摄像头或检查盒子固件。
- [ ] 摄像头页能显示麦克风/音频输入状态；没有麦克风或录音权限未允许不影响看电视。
- [ ] 未授权时“一键授权”能触发系统权限弹窗，失败时“打开权限设置”可进入系统设置。
- [ ] 连续按 6、返回、0、返回、OK、0、返回、OK、右键、返回、返回，以及下键、OK、6、返回、0、返回、右键、下键、上键、左键、返回没有 E AndroidRuntime/FATAL EXCEPTION。
CHECKLIST
}

APK_PATH="$(latest_apk)"
NOW="$(date '+%Y-%m-%d %H:%M:%S %Z')"

(cd "$ROOT_DIR" && TV_BOX_INSPECTION_JSON="$INSPECTION_PATH" PACKAGE_NAME="$PACKAGE_NAME" BOX_IP="$BOX_IP" DEVICE_SERIAL="$DEVICE_SERIAL" npm run -s tv-box:inspect >/dev/null) || true

cat > "$REPORT_PATH" <<REPORT
# HelloTV 电视盒子验收报告

- 生成时间：$NOW
- 项目目录：$ROOT_DIR
- 包名：$PACKAGE_NAME
- 盒子 IP：${BOX_IP:-未提供}
- 设备序列号：${DEVICE_SERIAL:-未指定}

## 结论

当前报告自动覆盖电脑工具链、APK Manifest、ADB 连接与设备安装证据。真实遥控器焦点、摄像头授权弹窗、USB 摄像头热插拔仍需要在电视盒子前按下方清单人工确认。
REPORT

run_section "Host Toolchain" bash -lc "cd '$ROOT_DIR' && npm -v && node -v && echo JAVA_HOME=\${JAVA_HOME:-missing} && echo ANDROID_HOME=\${ANDROID_HOME:-missing} && command -v adb || true"
run_section "Git Worktree" git -C "$ROOT_DIR" status --short --branch
run_section "Remote Navigation Self-Test" bash -lc "cd '$ROOT_DIR' && npm run -s tv-box:remote-test"
run_section "Debug APK Manifest" write_manifest_summary "$APK_PATH"
run_section "TV Box Device Evidence" write_device_summary
run_section "Machine Inspection JSON" write_inspection_summary
run_section "Manual Acceptance Checklist" write_manual_acceptance_checklist

echo "TV-box acceptance report written to:"
echo "$REPORT_PATH"
