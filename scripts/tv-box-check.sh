#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"

run_step() {
  echo
  echo "== $1 =="
  shift
  "$@"
}

check_ts_syntax() {
  local source_path="$1"
  local target_path

  target_path="${TMPDIR:-/tmp}/tv-box-check-$(basename "$source_path").js"
  npx esbuild "$source_path" --platform=node --format=cjs --outfile="$target_path" --log-level=warning >/dev/null
  rm -f "$target_path"
}

run_step "Shell script syntax" bash -n scripts/*.sh
run_step "APK builder syntax" check_ts_syntax scripts/build-apk.ts
run_step "TV-box inspector syntax" check_ts_syntax scripts/tv-box-inspect.ts
run_step "TV-box command center syntax" node --check scripts/tv-box-command-center.js
run_step "TV-box completion audit syntax" node --check scripts/tv-box-completion-audit.js
run_step "TV-box compatibility summary syntax" check_ts_syntax scripts/tv-box-compatibility-summary.ts
run_step "TV-box easy summary syntax" node --check scripts/tv-box-easy-summary.js
run_step "TV-box field import syntax" node --check scripts/tv-box-field-import.js
run_step "TV-box field inbox syntax" node --check scripts/tv-box-field-inbox.js
run_step "TV-box return inbox syntax" node --check scripts/tv-box-return-inbox.js
run_step "TV-box field return packer self-test syntax" bash -n scripts/tv-box-field-return-packer-test.sh
run_step "TV-box field scenarios regression syntax" node --check scripts/tv-box-field-scenarios-test.js
run_step "TV-box field wizard schema syntax" node --check scripts/tv-box-field-wizard-schema.js
run_step "TV-box field wizard syntax" node --check scripts/tv-box-field-wizard.js
run_step "TV-box field wizard offline HTML syntax" node --check scripts/tv-box-field-wizard-html.js
run_step "TV-box handoff HTML smoke syntax" node --check scripts/tv-box-handoff-html-smoke.js
run_step "TV-box hardware profile syntax" node --check scripts/tv-box-hardware-profile.js
run_step "C920 acceptance failure self-test syntax" bash -n scripts/tv-box-c920-pro-acceptance-test.sh
run_step "TV-box next-step scenarios regression syntax" bash -n scripts/tv-box-next-scenarios-test.sh
run_step "TV-box phone camera contract syntax" node --check scripts/tv-box-phone-camera-contract.js
run_step "TV-box release ledger syntax" node --check scripts/tv-box-release-ledger.js
run_step "TV-box site readiness syntax" node --check scripts/tv-box-site-readiness.js
run_step "TV-box UX audit syntax" node --check scripts/tv-box-ux-audit.js
run_step "Remote navigation self-test" npm run -s tv-box:remote-test
run_step "Easy installer failure self-test" ./scripts/tv-box-easy-failure-test.sh
run_step "C920 acceptance failure self-test" npm run -s tv-box:c920-acceptance-test
run_step "ESLint" npm run lint
run_step "Android Java verification" ./scripts/android-verify.sh
run_step "Debug APK build" npm run build-apk-debug
run_step "Machine-readable TV-box inspection" npm run tv-box:inspect
run_step "TV-box doctor" npm run tv-box:doctor
run_step "ADB/RSA authorization helper" npm run tv-box:authorize
run_step "Acceptance report" npm run tv-box:report
run_step "Field compatibility record" npm run tv-box:field-record
run_step "Field compatibility wizard dry-run" npm run tv-box:field-wizard -- --defaults --dry-run
run_step "Field compatibility offline HTML" npm run tv-box:field-wizard-html
run_step "Field compatibility offline import" npm run tv-box:field-import -- reports/tv-box-field-wizard-latest.json --no-append
run_step "Field compatibility inbox dry-run" npm run tv-box:field-inbox -- reports/tv-box-field-wizard-latest.json --dry-run --no-append
run_step "Field return inbox dry-run" npm run tv-box:return-inbox -- reports/tv-box-field-wizard-latest.json --no-field-inbox
run_step "Field return inbox scenarios regression" npm run tv-box:return-inbox-scenarios-test
run_step "Next-step autopilot scenarios regression" npm run tv-box:next-scenarios-test
run_step "Compatibility summary" npm run tv-box:compatibility-summary
run_step "Hardware compatibility profile" npm run tv-box:hardware-profile
run_step "Phone camera contract" npm run tv-box:phone-camera-contract
run_step "Easy install summary" npm run tv-box:easy-summary
run_step "Handoff package" npm run tv-box:handoff
run_step "Handoff HTML smoke test" npm run tv-box:handoff-html-smoke
run_step "Elder/child remote UX audit" npm run tv-box:ux-audit
run_step "Standalone handoff archive self-test" npm run tv-box:handoff-standalone-test
run_step "Field return packer self-test" npm run tv-box:field-return-packer-test
run_step "Field acceptance scenarios regression" npm run tv-box:field-scenarios-test
run_step "Preflight summary" npm run tv-box:preflight
run_step "Site readiness card" npm run tv-box:site-readiness
run_step "Elder/child remote UX audit final refresh" npm run tv-box:ux-audit
run_step "Completion evidence audit" npm run tv-box:completion-audit
run_step "Support bundle" npm run tv-box:support
run_step "Easy install summary final refresh" npm run tv-box:easy-summary
run_step "Completion evidence audit final refresh" npm run tv-box:completion-audit
run_step "Release ledger" npm run tv-box:release-ledger
run_step "Command center" npm run tv-box:command-center
run_step "Next-step autopilot report" env NEXT_ALLOW_INSTALL=false NEXT_BUILD_DELIVERY=false npm run tv-box:next
run_step "Site readiness card final refresh" npm run tv-box:site-readiness
run_step "Delivery audit" npm run tv-box:audit

echo
echo "TV-box local delivery check finished."
