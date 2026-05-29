#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

source "$ROOT_DIR/scripts/android-env.sh"

PACKAGE_NAME="${PACKAGE_NAME:-com.quicktvui.hellotv}"
REPORT_DIR="${REPORT_DIR:-$ROOT_DIR/reports}"
BOX_IP="${BOX_IP:-}"
SKIP_BUILD="${SKIP_BUILD:-false}"
RUN_SMOKE="${RUN_SMOKE:-true}"
RUN_CAMERA_SMOKE="${RUN_CAMERA_SMOKE:-false}"
SUPPORT_ON_ERROR="${SUPPORT_ON_ERROR:-true}"
HANDLING_ERROR=false

print_step() {
  echo
  echo "== $1 =="
}

has_authorized_device() {
  adb devices | awk 'NR > 1 && $2 == "device" { found = 1 } END { exit found ? 0 : 1 }'
}

support_on_error_enabled() {
  case "$SUPPORT_ON_ERROR" in
    true|TRUE|1|yes|YES|y|Y) return 0 ;;
    *) return 1 ;;
  esac
}

generate_support_bundle_after_failure() {
  support_on_error_enabled || return 0

  print_step "自动生成排障包"
  echo "安装或验收中断，正在收集工具链、ADB、交付清单和最近日志，方便维护人员远程定位。"

  set +e
  BOX_IP="$BOX_IP" \
  DEVICE_SERIAL="${DEVICE_SERIAL:-}" \
  PACKAGE_NAME="$PACKAGE_NAME" \
  EASY_RUN_RESULT="failed" \
  EASY_RUN_CAMERA_SMOKE="$RUN_CAMERA_SMOKE" \
  REPORT_DIR="$REPORT_DIR" \
  "$ROOT_DIR/scripts/tv-box-support-bundle.sh"
  local support_status=$?
  set -e

  if [[ "$support_status" -eq 0 ]]; then
    echo
    echo "排障包已生成："
    if [[ -f "$REPORT_DIR/tv-box-support-latest-archive.txt" ]]; then
      sed -n '1p' "$REPORT_DIR/tv-box-support-latest-archive.txt"
    else
      echo "$REPORT_DIR/tv-box-support"
    fi
    echo "把这个压缩包、电视盒子型号和屏幕照片发给维护人员。"
  else
    echo
    echo "排障包生成失败。请保留当前终端输出，并重新执行："
    echo "      BOX_IP=<盒子IP> npm run tv-box:support"
  fi
}

on_error() {
  local status=$?
  trap - ERR
  if [[ "$HANDLING_ERROR" == "true" ]]; then
    exit "$status"
  fi
  HANDLING_ERROR=true
  generate_support_bundle_after_failure
  exit "$status"
}

fail() {
  echo
  echo "错误：$1" >&2
  return 1
}

prompt_for_box_ip_if_needed() {
  if [[ -n "$BOX_IP" ]] || has_authorized_device; then
    return
  fi

  print_step "电视盒子连接"
  echo "还没有找到已授权的电视盒子。"
  echo "请在电视盒子上打开“开发者选项 / 网络调试”，然后查看盒子 IP 地址。"

  if [[ -t 0 ]]; then
    read -r -p "请输入电视盒子 IP；直接回车则暂停： " BOX_IP
    export BOX_IP
  fi

  if [[ -z "$BOX_IP" ]]; then
    echo
    echo "下一步：拿到盒子 IP 后重新执行："
    echo "      BOX_IP=<box-ip> npm run tv-box:easy"
    fail "没有输入电视盒子 IP。"
  fi
}

trap on_error ERR

print_step "HelloTV easy TV-box installer"
echo "这条命令会自动构建 APK、连接电视盒子、安装、启动、跑遥控器冒烟，并生成交付报告；失败时会自动生成排障包。"
echo "包名：$PACKAGE_NAME"

if ! command -v adb >/dev/null 2>&1; then
  echo "macOS 可执行：brew install android-platform-tools"
  fail "没有找到 adb。"
fi

print_step "当前 ADB 设备"
adb devices -l

prompt_for_box_ip_if_needed

print_step "安装并自动冒烟"
BOX_IP="$BOX_IP" \
PACKAGE_NAME="$PACKAGE_NAME" \
SKIP_BUILD="$SKIP_BUILD" \
RUN_SMOKE="$RUN_SMOKE" \
"$ROOT_DIR/scripts/tv-box-install-debug.sh"

if [[ "$RUN_CAMERA_SMOKE" == "true" ]]; then
  print_step "摄像头冒烟"
  BOX_IP="$BOX_IP" PACKAGE_NAME="$PACKAGE_NAME" "$ROOT_DIR/scripts/tv-box-camera-smoke.sh"
fi

print_step "生成验收报告和交付包"
BOX_IP="$BOX_IP" PACKAGE_NAME="$PACKAGE_NAME" "$ROOT_DIR/scripts/tv-box-report.sh"
BOX_IP="$BOX_IP" \
PACKAGE_NAME="$PACKAGE_NAME" \
EASY_RUN_RESULT="success" \
EASY_RUN_CAMERA_SMOKE="$RUN_CAMERA_SMOKE" \
"$ROOT_DIR/scripts/tv-box-handoff.sh"

print_step "自动沉淀摘要"
(
  cd "$ROOT_DIR"
  BOX_IP="$BOX_IP" \
  PACKAGE_NAME="$PACKAGE_NAME" \
  EASY_RUN_RESULT="success" \
  EASY_RUN_CAMERA_SMOKE="$RUN_CAMERA_SMOKE" \
  npm run -s tv-box:easy-summary
)

if [[ -f "$REPORT_DIR/tv-box-easy-run-latest.md" ]]; then
  sed -n '1,18p' "$REPORT_DIR/tv-box-easy-run-latest.md"
fi

echo
echo "完成。交付目录："
echo "$ROOT_DIR/reports/tv-box-handoff"
if [[ -f "$REPORT_DIR/tv-box-handoff-latest-archive.txt" ]]; then
  echo "交付压缩包："
  sed -n '1p' "$REPORT_DIR/tv-box-handoff-latest-archive.txt"
fi
