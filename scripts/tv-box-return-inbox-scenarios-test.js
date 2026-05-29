#!/usr/bin/env node
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')
const {
  textPrompts,
  resultPrompts,
  schemaVersion
} = require('./tv-box-field-wizard-schema')

const rootDir = path.resolve(__dirname, '..')
const reportDir = process.env.REPORT_DIR || path.join(rootDir, 'reports')
const outputJsonPath = process.env.TV_BOX_RETURN_INBOX_SCENARIOS_JSON || path.join(reportDir, 'tv-box-return-inbox-scenarios-test-latest.json')
const outputMarkdownPath = process.env.TV_BOX_RETURN_INBOX_SCENARIOS_MD || path.join(reportDir, 'tv-box-return-inbox-scenarios-test-latest.md')
const keepTemp = process.env.TV_BOX_RETURN_INBOX_SCENARIOS_KEEP_TEMP === 'true'

function fail(message, details = {}) {
  const error = new Error(message)
  error.details = details
  throw error
}

function markdownCell(value) {
  return String(value ?? '').replace(/\|/g, '/').replace(/\r?\n/g, ' ')
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function textDefaults(overrides = {}) {
  const defaults = {
    BOX_IP: '192.0.2.20',
    DEVICE_SERIAL: '192.0.2.20:5555',
    FIELD_OPERATOR: 'return-inbox-scenarios-test',
    FIELD_LOCATION: 'automation-lab',
    FIELD_BOX_BRAND: 'HelloTV Synthetic',
    FIELD_BOX_MODEL: 'Synthetic Return Inbox Box',
    FIELD_ANDROID_SDK: '31',
    FIELD_REMOTE_MODEL: 'Synthetic Remote',
    FIELD_CAMERA_MODEL: 'Synthetic UVC Camera',
    FIELD_CAMERA_CONNECTION: 'usb',
    FIELD_MICROPHONE_MODEL: 'Synthetic USB Microphone',
    FIELD_MICROPHONE_CONNECTION: 'usb'
  }
  return { ...defaults, ...overrides }
}

function buildEnv(textOverrides = {}, resultOverrides = {}, notes = '') {
  const text = textDefaults(textOverrides)
  const env = {}
  for (const [key, , fallback] of textPrompts) {
    env[key] = text[key] ?? fallback ?? ''
  }
  for (const [key] of resultPrompts) {
    env[key] = resultOverrides[key] || 'pass'
  }
  env.FIELD_NOTES = notes
  env.FIELD_APPEND_MATRIX = 'true'
  return env
}

function writeFieldJson(filePath, env, scenarioId) {
  const record = {
    generatedAtUtc: new Date().toISOString(),
    schemaVersion,
    tool: 'FIELD_WIZARD_OFFLINE.html',
    projectRoot: 'tv-box-return-inbox-scenarios-test',
    dryRun: false,
    appendMatrix: true,
    scenarioId,
    env
  }
  fs.writeFileSync(filePath, `${JSON.stringify(record, null, 2)}\n`)
}

function writeEvidenceFile(filePath, body) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, body)
}

function c920TextDefaults(overrides = {}) {
  return {
    FIELD_BOX_MODEL: 'Xiaomi Box 4S Pro with Logitech C920 PRO',
    FIELD_CAMERA_MODEL: 'Logitech C920 PRO / C920 Pro HD',
    FIELD_CAMERA_CONNECTION: 'usb',
    FIELD_MICROPHONE_MODEL: 'Logitech C920 PRO built-in microphone',
    FIELD_MICROPHONE_CONNECTION: 'usb',
    ...overrides
  }
}

function writeC920Evidence(folder, scenario) {
  const evidence = scenario.c920Evidence
  if (!evidence) return
  if (evidence.preview !== false) {
    writeEvidenceFile(path.join(folder, 'C920_PREVIEW_TV_SCREEN.jpg'), `synthetic C920 TV preview evidence for ${scenario.id}\n`)
  }
  if (evidence.microphone !== false) {
    writeEvidenceFile(path.join(folder, 'C920_MIC_BUSINESS_INPUT.txt'), `synthetic C920 microphone business-input evidence for ${scenario.id}\n`)
  }
  if (evidence.hotplug !== false) {
    writeEvidenceFile(path.join(folder, 'C920_HOTPLUG_RETEST.txt'), `synthetic C920 USB hotplug retest evidence for ${scenario.id}\n`)
  }
  if (evidence.supportCode !== false) {
    writeEvidenceFile(path.join(folder, 'SUPPORT_CODE_C920.jpg'), `synthetic C920 support-code photo for ${scenario.id}\n`)
  }
}

function createReturnFolder(baseDir, scenario) {
  const folder = path.join(baseDir, scenario.id)
  fs.mkdirSync(folder, { recursive: true })
  writeFieldJson(path.join(folder, `${scenario.id}-field-record.json`), scenario.env, scenario.id)
  writeC920Evidence(folder, scenario)

  if (scenario.supportCodePhoto === 'clear') {
    writeEvidenceFile(path.join(folder, 'support-code-photo.jpg'), `synthetic support code photo for ${scenario.id}\n`)
  } else if (scenario.supportCodePhoto === 'ambiguous') {
    writeEvidenceFile(path.join(folder, 'living-room-photo.jpg'), `synthetic ambiguous photo for ${scenario.id}\n`)
  }

  if (scenario.installEvidence !== false) {
    writeEvidenceFile(path.join(folder, 'INSTALL_LOG.txt'), `Synthetic install log for ${scenario.id}\nPackage: com.quicktvui.hellotv\n`)
  }

  if (scenario.issueEvidence) {
    writeEvidenceFile(path.join(folder, 'remote-fail-photo.jpg'), `synthetic issue photo for ${scenario.id}\n`)
  }

  return folder
}

function runReturnInbox(inputPath, tempReportDir, flags = []) {
  const result = spawnSync('node', ['./scripts/tv-box-return-inbox.js', inputPath, ...flags], {
    cwd: rootDir,
    env: {
      ...process.env,
      REPORT_DIR: tempReportDir
    },
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024
  })
  return {
    exitCode: result.status === null ? 1 : result.status,
    signal: result.signal || '',
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    reportJsonPath: path.join(tempReportDir, 'tv-box-return-inbox-latest.json'),
    reportMarkdownPath: path.join(tempReportDir, 'tv-box-return-inbox-latest.md')
  }
}

function checkStatus(report, checkId) {
  const check = (report.evidenceChecks || []).find((item) => item.id === checkId)
  return check ? check.status : 'missing_check'
}

const scenarios = [
  {
    id: 'complete_ready',
    title: '证据齐全：可进入工程导入',
    expectedReadiness: 'ready_for_engineering_import',
    expectedClosureStatus: 'ready_to_close',
    expectedStrictExitCode: 0,
    supportCodePhoto: 'clear',
    env: buildEnv(
      { FIELD_BOX_MODEL: 'Scenario Complete Return Evidence' },
      {},
      'Synthetic complete field return; should be ready for engineering import.'
    ),
    expectedChecks: {
      field_json: 'pass',
      support_code_photo: 'pass',
      install_log_or_support_bundle: 'pass',
      issue_evidence: 'not_required',
      unknown_closure: 'pass'
    }
  },
  {
    id: 'missing_support_code_photo',
    title: '缺维护码照片：必须让现场补发',
    expectedReadiness: 'needs_site_follow_up',
    expectedClosureStatus: 'needs_site_follow_up',
    expectedStrictExitCode: 1,
    supportCodePhoto: 'none',
    env: buildEnv(
      { FIELD_BOX_MODEL: 'Scenario Missing Support Code Photo' },
      {},
      'Synthetic incomplete return; support-code photo is missing.'
    ),
    expectedChecks: {
      field_json: 'pass',
      support_code_photo: 'missing',
      install_log_or_support_bundle: 'pass',
      issue_evidence: 'not_required',
      unknown_closure: 'pass'
    }
  },
  {
    id: 'ambiguous_photo_manual_review',
    title: '照片命名不确定：需要人工确认维护码',
    expectedReadiness: 'needs_manual_photo_review',
    expectedClosureStatus: 'needs_site_follow_up',
    expectedStrictExitCode: 1,
    supportCodePhoto: 'ambiguous',
    env: buildEnv(
      { FIELD_BOX_MODEL: 'Scenario Ambiguous Photo Manual Review' },
      {},
      'Synthetic ambiguous return; photo exists but name does not prove support code.'
    ),
    expectedChecks: {
      field_json: 'pass',
      support_code_photo: 'needs_manual_review',
      install_log_or_support_bundle: 'pass',
      issue_evidence: 'not_required',
      unknown_closure: 'pass'
    }
  },
  {
    id: 'unknown_without_issue_evidence',
    title: 'unknown 未闭环且无异常证据：不能关闭',
    expectedReadiness: 'needs_site_follow_up',
    expectedClosureStatus: 'needs_site_follow_up',
    expectedStrictExitCode: 1,
    supportCodePhoto: 'clear',
    env: buildEnv(
      { FIELD_BOX_MODEL: 'Scenario Unknown Without Issue Evidence' },
      { FIELD_CLASSIC_HOME_RESCUE: 'unknown' },
      'Synthetic return with unknown field and no issue evidence.'
    ),
    expectedChecks: {
      field_json: 'pass',
      support_code_photo: 'pass',
      install_log_or_support_bundle: 'pass',
      issue_evidence: 'missing',
      unknown_closure: 'needs_follow_up'
    }
  },
  {
    id: 'failure_with_issue_evidence',
    title: '失败但证据齐全：允许工程导入为待修复组合',
    expectedReadiness: 'ready_for_engineering_import',
    expectedClosureStatus: 'needs_fix',
    expectedStrictExitCode: 0,
    supportCodePhoto: 'clear',
    issueEvidence: true,
    env: buildEnv(
      { FIELD_BOX_MODEL: 'Scenario Failure With Issue Evidence' },
      { FIELD_REMOTE_FOCUS: 'fail' },
      'Synthetic failed return with keyCode/photo evidence; should import for engineering triage.'
    ),
    expectedChecks: {
      field_json: 'pass',
      support_code_photo: 'pass',
      install_log_or_support_bundle: 'pass',
      issue_evidence: 'pass',
      unknown_closure: 'pass'
    }
  },
  {
    id: 'c920_complete_ready',
    title: 'C920 证据齐全：真实预览、麦克风、热插拔、维护码都闭环',
    expectedReadiness: 'ready_for_engineering_import',
    expectedClosureStatus: 'ready_to_close',
    expectedStrictExitCode: 0,
    c920Evidence: {},
    env: buildEnv(
      c920TextDefaults({ FIELD_BOX_MODEL: 'Scenario C920 Complete Return Evidence' }),
      {},
      'Synthetic C920 return with all named evidence files; should be ready to close.'
    ),
    expectedChecks: {
      field_json: 'pass',
      support_code_photo: 'pass',
      install_log_or_support_bundle: 'pass',
      issue_evidence: 'not_required',
      unknown_closure: 'pass',
      c920_preview_tv_screen: 'pass',
      c920_mic_business_input: 'pass',
      c920_hotplug_retest: 'pass',
      c920_support_code_photo: 'pass'
    }
  },
  {
    id: 'c920_missing_preview_evidence',
    title: 'C920 缺电视真实预览证据：不能关闭',
    expectedReadiness: 'needs_site_follow_up',
    expectedClosureStatus: 'needs_site_follow_up',
    expectedStrictExitCode: 1,
    c920Evidence: { preview: false },
    env: buildEnv(
      c920TextDefaults({ FIELD_BOX_MODEL: 'Scenario C920 Missing Preview Evidence' }),
      {},
      'Synthetic C920 return missing TV preview evidence.'
    ),
    expectedChecks: {
      field_json: 'pass',
      support_code_photo: 'pass',
      install_log_or_support_bundle: 'pass',
      issue_evidence: 'not_required',
      unknown_closure: 'pass',
      c920_preview_tv_screen: 'missing',
      c920_mic_business_input: 'pass',
      c920_hotplug_retest: 'pass',
      c920_support_code_photo: 'pass'
    }
  },
  {
    id: 'c920_missing_microphone_evidence',
    title: 'C920 缺麦克风业务输入证据：不能关闭',
    expectedReadiness: 'needs_site_follow_up',
    expectedClosureStatus: 'needs_site_follow_up',
    expectedStrictExitCode: 1,
    c920Evidence: { microphone: false },
    env: buildEnv(
      c920TextDefaults({ FIELD_BOX_MODEL: 'Scenario C920 Missing Microphone Evidence' }),
      {},
      'Synthetic C920 return missing microphone business-input evidence.'
    ),
    expectedChecks: {
      field_json: 'pass',
      support_code_photo: 'pass',
      install_log_or_support_bundle: 'pass',
      issue_evidence: 'not_required',
      unknown_closure: 'pass',
      c920_preview_tv_screen: 'pass',
      c920_mic_business_input: 'missing',
      c920_hotplug_retest: 'pass',
      c920_support_code_photo: 'pass'
    }
  },
  {
    id: 'c920_missing_hotplug_evidence',
    title: 'C920 缺 USB 热插拔复测证据：不能关闭',
    expectedReadiness: 'needs_site_follow_up',
    expectedClosureStatus: 'needs_site_follow_up',
    expectedStrictExitCode: 1,
    c920Evidence: { hotplug: false },
    env: buildEnv(
      c920TextDefaults({ FIELD_BOX_MODEL: 'Scenario C920 Missing Hotplug Evidence' }),
      {},
      'Synthetic C920 return missing USB hotplug retest evidence.'
    ),
    expectedChecks: {
      field_json: 'pass',
      support_code_photo: 'pass',
      install_log_or_support_bundle: 'pass',
      issue_evidence: 'not_required',
      unknown_closure: 'pass',
      c920_preview_tv_screen: 'pass',
      c920_mic_business_input: 'pass',
      c920_hotplug_retest: 'missing',
      c920_support_code_photo: 'pass'
    }
  },
  {
    id: 'c920_missing_support_code_evidence',
    title: 'C920 缺维护码照片：不能关闭',
    expectedReadiness: 'needs_site_follow_up',
    expectedClosureStatus: 'needs_site_follow_up',
    expectedStrictExitCode: 1,
    c920Evidence: { supportCode: false },
    env: buildEnv(
      c920TextDefaults({ FIELD_BOX_MODEL: 'Scenario C920 Missing Support Code Evidence' }),
      {},
      'Synthetic C920 return missing SUPPORT_CODE_C920 photo.'
    ),
    expectedChecks: {
      field_json: 'pass',
      support_code_photo: 'needs_manual_review',
      install_log_or_support_bundle: 'pass',
      issue_evidence: 'not_required',
      unknown_closure: 'pass',
      c920_preview_tv_screen: 'pass',
      c920_mic_business_input: 'pass',
      c920_hotplug_retest: 'pass',
      c920_support_code_photo: 'missing'
    }
  }
]

function validateScenario(scenario, run, strictRun) {
  if (run.exitCode !== 0) {
    fail(`return inbox dry-run failed for ${scenario.id}`, {
      exitCode: run.exitCode,
      stdout: run.stdout,
      stderr: run.stderr
    })
  }

  const report = readJson(run.reportJsonPath)
  const readiness = report.readiness?.level || 'missing'
  const closureStatus = report.closure?.status || 'missing'
  if (readiness !== scenario.expectedReadiness) {
    fail(`readiness mismatch for ${scenario.id}`, {
      expected: scenario.expectedReadiness,
      actual: readiness
    })
  }

  if (closureStatus !== scenario.expectedClosureStatus) {
    fail(`closure status mismatch for ${scenario.id}`, {
      expected: scenario.expectedClosureStatus,
      actual: closureStatus
    })
  }

  for (const [checkId, expectedStatus] of Object.entries(scenario.expectedChecks)) {
    const actualStatus = checkStatus(report, checkId)
    if (actualStatus !== expectedStatus) {
      fail(`check status mismatch for ${scenario.id}:${checkId}`, {
        expected: expectedStatus,
        actual: actualStatus
      })
    }
  }

  if (strictRun.exitCode !== scenario.expectedStrictExitCode) {
    fail(`strict exit code mismatch for ${scenario.id}`, {
      expected: scenario.expectedStrictExitCode,
      actual: strictRun.exitCode,
      stdout: strictRun.stdout,
      stderr: strictRun.stderr
    })
  }

  return {
    id: scenario.id,
    title: scenario.title,
    readiness,
    expectedReadiness: scenario.expectedReadiness,
    closureStatus,
    expectedClosureStatus: scenario.expectedClosureStatus,
    strictExitCode: strictRun.exitCode,
    expectedStrictExitCode: scenario.expectedStrictExitCode,
    fieldInboxExitCode: report.fieldInboxRun?.exitCode ?? null,
    checks: Object.fromEntries(Object.keys(scenario.expectedChecks).map((checkId) => [checkId, checkStatus(report, checkId)])),
    problematicFields: report.problematicFields || [],
    nextActions: report.nextActions || []
  }
}

function buildMarkdown(report) {
  const rows = report.scenarios.map((scenario) => (
    `| ${scenario.id} | ${markdownCell(scenario.title)} | \`${scenario.readiness}\` | \`${scenario.expectedReadiness}\` | \`${scenario.closureStatus}\` | \`${scenario.expectedClosureStatus}\` | \`${scenario.strictExitCode}\` | \`${scenario.fieldInboxExitCode}\` |`
  )).join('\n')

  return `# HelloTV 现场回传收件箱场景回归

- 生成时间 UTC: \`${report.generatedAtUtc}\`
- 状态: \`${report.status}\`
- schema: \`${report.schemaVersion}\`
- 临时根目录: \`${report.tempRoot}\`
- 场景数: \`${report.scenarios.length}\`

## 场景结果

| 场景 | 说明 | readiness | 预期 readiness | 关闭判定 | 预期关闭判定 | strict 退出码 | field-inbox 退出码 |
| --- | --- | --- | --- | --- | --- | ---: | ---: |
${rows}

## 覆盖意图

- 证据齐全的现场回传必须进入 \`ready_for_engineering_import\`。
- 证据齐全且字段全闭环的现场回传必须给出 \`ready_to_close\`。
- 缺维护码照片必须进入 \`needs_site_follow_up\`，strict 模式必须失败。
- 只有普通照片、文件名无法确认维护码时必须进入 \`needs_manual_photo_review\`。
- JSON 里仍有 \`unknown\` 且没有异常证据时，不能关闭真实盒子验收。
- 失败项如果带了 keyCode/异常照片/日志，应给出 \`needs_fix\`，允许工程导入为待修复组合，而不是丢失现场证据或误关闭。
- C920 到货接入必须额外补齐 \`C920_PREVIEW_TV_SCREEN\`、\`C920_MIC_BUSINESS_INPUT\`、\`C920_HOTPLUG_RETEST\` 和 \`SUPPORT_CODE_C920\`；缺任一项都不能关闭。
`
}

function main() {
  fs.mkdirSync(reportDir, { recursive: true })
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hellotv-return-inbox-scenarios-'))
  const inputRoot = path.join(tempRoot, 'field-returns')
  const tempReportsRoot = path.join(tempRoot, 'reports')
  fs.mkdirSync(inputRoot, { recursive: true })
  fs.mkdirSync(tempReportsRoot, { recursive: true })

  try {
    const scenarioReports = []
    for (const scenario of scenarios) {
      const inputPath = createReturnFolder(inputRoot, scenario)
      const scenarioReportDir = path.join(tempReportsRoot, scenario.id)
      const strictReportDir = path.join(tempReportsRoot, `${scenario.id}-strict`)
      fs.mkdirSync(scenarioReportDir, { recursive: true })
      fs.mkdirSync(strictReportDir, { recursive: true })

      const run = runReturnInbox(inputPath, scenarioReportDir)
      const strictRun = runReturnInbox(inputPath, strictReportDir, ['--strict'])
      scenarioReports.push(validateScenario(scenario, run, strictRun))
    }

    const report = {
      generatedAtUtc: new Date().toISOString(),
      status: 'pass',
      schemaVersion,
      projectRoot: rootDir,
      tempRoot,
      scenarios: scenarioReports
    }

    fs.writeFileSync(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`)
    fs.writeFileSync(outputMarkdownPath, buildMarkdown(report))
    console.log(`TV-box return inbox scenario regression passed: ${outputMarkdownPath}`)
    console.log(`Machine-readable return inbox scenario report: ${outputJsonPath}`)
  } finally {
    if (!keepTemp) fs.rmSync(tempRoot, { recursive: true, force: true })
  }
}

try {
  main()
} catch (error) {
  const report = {
    generatedAtUtc: new Date().toISOString(),
    status: 'fail',
    schemaVersion,
    error: error instanceof Error ? error.message : String(error),
    details: error && error.details ? error.details : null
  }
  fs.mkdirSync(reportDir, { recursive: true })
  fs.writeFileSync(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`)
  fs.writeFileSync(outputMarkdownPath, `# HelloTV 现场回传收件箱场景回归\n\n- 状态: \`fail\`\n- 错误: ${markdownCell(report.error)}\n`)
  console.error(report.error)
  if (report.details) console.error(JSON.stringify(report.details, null, 2))
  process.exit(1)
}
