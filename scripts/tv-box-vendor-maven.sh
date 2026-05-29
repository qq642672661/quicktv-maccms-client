#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GRADLE_MODULE_CACHE="${GRADLE_MODULE_CACHE:-$HOME/.gradle/caches/modules-2/files-2.1}"
VENDOR_REPO="${VENDOR_REPO:-$ROOT_DIR/android/vendor-maven}"

modules=(
  "com.extscreen.runtime:official:2.9.5-rc08"
  "com.extscreen.runtime:runtime-api:2.2-beta20"
  "com.extscreen.runtime:runtime-api-ability:1.0.0"
  "com.extscreen.sdk:entry:1.0.2"
  "com.extscreen.sdk:eskit-official:2.9.5-rc08"
  "com.extscreen:hippy4tv-support:1.11.185-beta"
  "com.sunrain:utils:1.3.3"
  "eskit.sdk.support:audio-record:2.2.1-SNAPSHOT"
  "eskit.sdk.support:border-drawable:1.0.2.14-SNAPSHOT"
  "eskit.sdk.support:brightness:1.0.1"
  "eskit.sdk.support:canvas:1.0.7.7-SNAPSHOT"
  "eskit.sdk.support:card:1.0.0.22-SNAPSHOT"
  "eskit.sdk.support:chart:2.1.8-SNAPSHOT"
  "eskit.sdk.support:download:2.2.2-SNAPSHOT"
  "eskit.sdk.support:gif-support:2.0.1"
  "eskit.sdk.support:group-data:1.0.2-SNAPSHOT"
  "eskit.sdk.support:ijk-base:1.0.5"
  "eskit.sdk.support:image-loader-support:2.1.9"
  "eskit.sdk.support:log:1.0.0-SNAPSHOT"
  "eskit.sdk.support:lottie-view-support:1.0.0.5"
  "eskit.sdk.support:network-speed:1.0.0.2-SNAPSHOT"
  "eskit.sdk.support:player-ad-huan:1.1.8-SNAPSHOT"
  "eskit.sdk.support:player-audio-android:2.0.4-SNAPSHOT"
  "eskit.sdk.support:player-audio-ijk-support:3.1.5.12-SNAPSHOT"
  "eskit.sdk.support:player-ijk-support:3.1.14.26"
  "eskit.sdk.support:player-manager:3.1.4-beta3"
  "eskit.sdk.support:player-manager:3.1.4-beta5"
  "eskit.sdk.support:rippleview:2.0.0-SNAPSHOT"
  "eskit.sdk.support:runtime:2.1.3-SNAPSHOT"
  "eskit.sdk.support:shared-data:1.0.0-SNAPSHOT"
  "eskit.sdk.support:small-player-support:1.1.0-SNAPSHOT"
  "eskit.sdk.support:swiper:2.0.0-SNAPSHOT"
  "eskit.sdk.support:ui-support:2.1.85"
  "eskit.sdk.support:upload:2.2.2-SNAPSHOT"
  "eskit.sdk.support:video-cache-support:0.0.3-SNAPSHOT"
  "eskit.sdk.support:video-cache-support:1.0.4-SNAPSHOT"
  "eskit.sdk.support:voice-wave:2.0.0-SNAPSHOT"
  "eskit.sdk.support:webview:2.1.0-SNAPSHOT"
  "eskit.sdk.support:x5webview:2.1.0.6-SNAPSHOT"
  "eskit.sdk.support.so:hp-v1-arm64-v8a:1.0.1"
  "eskit.sdk.support.so:hp-v1-armeabi-v7a:1.0.1"
  "eskit.sdk.support.so:ijk-player-arm64-v8a:1.0.0"
  "eskit.sdk.support.so:ijk-player-armeabi-v7a:1.0.0"
  "tv.huan.app_update:app_update:1.1.8"
)

rm -rf "$VENDOR_REPO"
mkdir -p "$VENDOR_REPO"

for gav in "${modules[@]}"; do
  IFS=: read -r group artifact version <<<"$gav"
  source_dir="$GRADLE_MODULE_CACHE/$group/$artifact/$version"
  target_dir="$VENDOR_REPO/${group//.//}/$artifact/$version"

  if [[ ! -d "$source_dir" ]]; then
    echo "ERROR: missing Gradle cache module: $gav" >&2
    exit 1
  fi

  mkdir -p "$target_dir"
  copied=0
  while IFS= read -r artifact_file; do
    cp "$artifact_file" "$target_dir/"
    copied=$((copied + 1))
  done < <(find "$source_dir" -type f -name "$artifact-$version.*" | sort)

  if [[ "$copied" -eq 0 ]]; then
    echo "ERROR: no Maven artifacts copied for: $gav" >&2
    exit 1
  fi
done

echo "Vendored QuickTV Maven repository written to: $VENDOR_REPO"
