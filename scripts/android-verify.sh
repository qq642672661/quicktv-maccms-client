#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

source "$ROOT_DIR/scripts/android-env.sh"

echo "== Android verification environment =="
echo "JAVA_HOME=${JAVA_HOME:-missing}"
echo "ANDROID_HOME=${ANDROID_HOME:-missing}"

if [[ -z "${JAVA_HOME:-}" || ! -x "$JAVA_HOME/bin/java" ]]; then
  echo "ERROR: JDK 11 is required. On macOS: brew install openjdk@11" >&2
  exit 1
fi

if [[ -z "${ANDROID_HOME:-}" || ! -d "$ANDROID_HOME/platforms/android-31" ]]; then
  echo "ERROR: Android SDK platform 31 is required." >&2
  echo "Install with JDK 17 sdkmanager if needed:" >&2
  echo "  brew install openjdk@17 android-commandlinetools android-platform-tools" >&2
  echo "  JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home sdkmanager --sdk_root=/opt/homebrew/share/android-commandlinetools 'platforms;android-31' 'build-tools;31.0.0' 'platform-tools'" >&2
  exit 1
fi

"$JAVA_HOME/bin/java" -version

cd "$ROOT_DIR/android"
./gradlew :app:compileDebugJavaWithJavac
