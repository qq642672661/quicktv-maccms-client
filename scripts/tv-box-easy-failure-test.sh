#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"

TMP_ROOT="$(mktemp -d)"
OUTPUT_PATH="$TMP_ROOT/easy-install-output.txt"
REPORT_DIR="$TMP_ROOT/reports"
BOX_IP_FOR_TEST="${TV_BOX_EASY_FAILURE_BOX_IP:-127.0.0.1:1}"

cleanup() {
  rm -rf "$TMP_ROOT"
}

fail() {
  echo "ERROR: $1" >&2
  echo >&2
  echo "== Captured easy installer output ==" >&2
  sed -n '1,220p' "$OUTPUT_PATH" >&2 || true
  exit 1
}

trap cleanup EXIT

set +e
REPORT_DIR="$REPORT_DIR" \
SUPPORT_ON_ERROR=true \
SKIP_BUILD=true \
RUN_SMOKE=false \
RUN_CAMERA_SMOKE=false \
BOX_IP="$BOX_IP_FOR_TEST" \
"$ROOT_DIR/scripts/tv-box-easy-install.sh" > "$OUTPUT_PATH" 2>&1 < /dev/null
status=$?
set -e

[[ "$status" -ne 0 ]] || fail "easy installer unexpectedly succeeded during failure self-test"
[[ -f "$REPORT_DIR/tv-box-support-latest-archive.txt" ]] || fail "support archive marker was not written"

SUPPORT_ARCHIVE="$(sed -n '1p' "$REPORT_DIR/tv-box-support-latest-archive.txt")"

[[ -n "$SUPPORT_ARCHIVE" ]] || fail "support archive marker is empty"
[[ -f "$SUPPORT_ARCHIVE" ]] || fail "support archive does not exist: $SUPPORT_ARCHIVE"

grep -Fq "自动生成排障包" "$OUTPUT_PATH" || fail "easy installer did not announce automatic support bundle generation"
grep -Fq "$SUPPORT_ARCHIVE" "$OUTPUT_PATH" || fail "easy installer did not print the generated support archive path"

echo "TV-box easy installer failure self-test passed."
