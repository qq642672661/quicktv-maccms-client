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
const outputJsonPath = process.env.TV_BOX_FIELD_SCENARIOS_TEST_JSON || path.join(reportDir, 'tv-box-field-scenarios-test-latest.json')
const outputMarkdownPath = process.env.TV_BOX_FIELD_SCENARIOS_TEST_MD || path.join(reportDir, 'tv-box-field-scenarios-test-latest.md')
const keepTemp = process.env.TV_BOX_FIELD_SCENARIOS_KEEP_TEMP === 'true'

function fail(message, details = {}) {
  const error = new Error(message)
  error.details = details
  throw error
}

function shellEnv(baseEnv, tempReportDir) {
  return {
    ...process.env,
    ...baseEnv,
    REPORT_DIR: tempReportDir
  }
}

function runNode(args, tempReportDir, label) {
  const result = spawnSync('node', args, {
    cwd: rootDir,
    env: shellEnv({}, tempReportDir),
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024
  })
  if (result.status !== 0) {
    fail(`${label} failed`, {
      command: `node ${args.join(' ')}`,
      exitCode: result.status,
      stdout: result.stdout,
      stderr: result.stderr
    })
  }
  return result
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function textDefaults(overrides = {}) {
  const defaults = {
    BOX_IP: '192.0.2.10',
    DEVICE_SERIAL: '192.0.2.10:5555',
    FIELD_OPERATOR: 'field-scenarios-test',
    FIELD_LOCATION: 'automation-lab',
    FIELD_BOX_BRAND: 'HelloTV Synthetic',
    FIELD_BOX_MODEL: 'Synthetic TV Box',
    FIELD_ANDROID_SDK: '31',
    FIELD_REMOTE_MODEL: 'Synthetic Remote',
    FIELD_CAMERA_MODEL: 'Synthetic UVC Camera',
    FIELD_CAMERA_CONNECTION: 'usb',
    FIELD_MICROPHONE_MODEL: 'Synthetic USB Microphone',
    FIELD_MICROPHONE_CONNECTION: 'usb'
  }
  return { ...defaults, ...overrides }
}

function buildEnv(textOverrides, resultOverrides, notes) {
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

function withoutCameraAudio(base = {}) {
  return {
    ...base,
    FIELD_CAMERA_PERMISSION: 'na',
    FIELD_CAMERA_PREVIEW: 'na',
    FIELD_AUDIO_INPUT: 'na',
    FIELD_RECORD_AUDIO_PERMISSION: 'na',
    FIELD_USB_HOTPLUG: 'na'
  }
}

function withUnknowns(base = {}) {
  const env = { ...base }
  for (const [key] of resultPrompts) {
    env[key] = env[key] || 'unknown'
  }
  return {
    ...env,
    FIELD_REMOTE_FOCUS: 'pass',
    FIELD_ZERO_KEY_HELP: 'pass',
    FIELD_HELP_KEY_SHORTCUTS: 'pass',
    FIELD_REMOTE_PRACTICE: 'pass',
    FIELD_EXIT_CONFIRM: 'pass',
    FIELD_LIVE_PLAYBACK: 'pass',
    FIELD_SUPPORT_CODE: 'pass'
  }
}

const scenarios = [
  {
    id: 'all_pass_camera_audio',
    title: '全部通过：盒子、遥控器、摄像头、麦克风都可用',
    expectedImportLevel: 'recommended_candidate',
    expectedCombinationLevel: 'recommended',
    env: buildEnv(
      { FIELD_BOX_MODEL: 'Scenario All Pass Camera Audio' },
      {},
      'Synthetic all-pass sample; proves recommended classification.'
    )
  },
  {
    id: 'tv_core_no_camera_no_mic',
    title: '只验收看电视通过：没有摄像头/麦克风',
    expectedImportLevel: 'tv_core_ready_candidate',
    expectedCombinationLevel: 'tv_core_ready',
    env: buildEnv(
      {
        FIELD_BOX_MODEL: 'Scenario TV Core No Camera',
        FIELD_CAMERA_MODEL: '',
        FIELD_CAMERA_CONNECTION: 'none',
        FIELD_MICROPHONE_MODEL: '',
        FIELD_MICROPHONE_CONNECTION: 'none'
      },
      withoutCameraAudio(),
      'Synthetic TV-core sample; camera and microphone are explicitly not applicable.'
    )
  },
  {
    id: 'remote_focus_failure',
    title: '失败组合：遥控器焦点失败必须进入 needs_fix',
    expectedImportLevel: 'needs_fix',
    expectedCombinationLevel: 'needs_fix',
    env: buildEnv(
      { FIELD_BOX_MODEL: 'Scenario Remote Focus Failure' },
      { FIELD_REMOTE_FOCUS: 'fail' },
      'Synthetic failure sample; remote focus failure must not look recommended.'
    )
  },
  {
    id: 'unknown_rescue_left_open',
    title: '待补测组合：仍有 unknown 不能关闭',
    expectedImportLevel: 'needs_manual_acceptance',
    expectedCombinationLevel: 'needs_manual_acceptance',
    env: buildEnv(
      { FIELD_BOX_MODEL: 'Scenario Unknown Rescue Left Open' },
      withUnknowns({ FIELD_CLASSIC_HOME_RESCUE: 'unknown' }),
      'Synthetic partial sample; unknown rescue fields must keep the record open.'
    )
  }
]

function writeScenarioInput(filePath, scenario) {
  const record = {
    generatedAtUtc: new Date().toISOString(),
    schemaVersion,
    tool: 'FIELD_WIZARD_OFFLINE.html',
    projectRoot: 'tv-box-field-scenarios-test',
    dryRun: false,
    appendMatrix: true,
    scenarioId: scenario.id,
    env: scenario.env
  }
  fs.writeFileSync(filePath, `${JSON.stringify(record, null, 2)}\n`)
}

function markdownCell(value) {
  return String(value ?? '').replace(/\|/g, '/').replace(/\r?\n/g, ' ')
}

function buildMarkdown(report) {
  const rows = report.scenarios.map((scenario) => (
    `| ${scenario.id} | ${markdownCell(scenario.title)} | \`${scenario.importLevel}\` | \`${scenario.expectedImportLevel}\` | \`${scenario.combinationLevel}\` | \`${scenario.expectedCombinationLevel}\` |`
  )).join('\n')

  return `# HelloTV 电视盒子现场验收场景回归

- 生成时间 UTC: \`${report.generatedAtUtc}\`
- 状态: \`${report.status}\`
- schema: \`${report.schemaVersion}\`
- 临时报告目录: \`${report.tempReportDir}\`
- 累计矩阵记录数: \`${report.summary.totalRecords}\`
- recommended: \`${report.summary.recommendedCount}\`
- tv_core_ready: \`${report.summary.tvCoreReadyCount}\`
- needs_fix: \`${report.summary.needsFixCount}\`
- needs_manual_acceptance: \`${report.summary.needsManualAcceptanceCount}\`

## 场景结果

| 场景 | 说明 | 导入分类 | 预期导入 | 矩阵分类 | 预期矩阵 |
| --- | --- | --- | --- | --- | --- |
${rows}

## 覆盖意图

- 全部通过样本必须进入 \`recommended\`，证明摄像头和麦克风可用时能成为推荐组合。
- 无摄像头/麦克风样本必须进入 \`tv_core_ready\`，证明外设缺失不阻塞长辈小孩看电视。
- 遥控器失败样本必须进入 \`needs_fix\`，证明核心遥控器问题不会被误判为可交付。
- unknown 样本必须保持 \`needs_manual_acceptance\`，证明不能用未补测字段关闭真实盒子验收。
`
}

function main() {
  fs.mkdirSync(reportDir, { recursive: true })
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hellotv-field-scenarios-'))
  const tempInputDir = path.join(tempRoot, 'inputs')
  const tempReportDir = path.join(tempRoot, 'reports')
  fs.mkdirSync(tempInputDir, { recursive: true })
  fs.mkdirSync(tempReportDir, { recursive: true })

  const scenarioReports = []
  try {
    scenarios.forEach((scenario, index) => {
      const inputPath = path.join(tempInputDir, `${String(index + 1).padStart(2, '0')}-${scenario.id}.json`)
      writeScenarioInput(inputPath, scenario)
      runNode(['./scripts/tv-box-field-import.js', inputPath, '--append'], tempReportDir, `field import for ${scenario.id}`)
      const importReport = readJson(path.join(tempReportDir, 'tv-box-field-import-latest.json'))
      const importLevel = importReport.classification?.level || 'missing'
      if (importLevel !== scenario.expectedImportLevel) {
        fail(`import classification mismatch for ${scenario.id}`, {
          expected: scenario.expectedImportLevel,
          actual: importLevel
        })
      }
      scenarioReports.push({
        id: scenario.id,
        title: scenario.title,
        inputPath,
        importLevel,
        expectedImportLevel: scenario.expectedImportLevel,
        expectedCombinationLevel: scenario.expectedCombinationLevel,
        boxModel: scenario.env.FIELD_BOX_MODEL
      })
    })

    runNode(['./scripts/tv-box-compatibility-summary.ts'], tempReportDir, 'compatibility summary for synthetic scenarios')
    const summary = readJson(path.join(tempReportDir, 'tv-box-compatibility-summary-latest.json'))

    if (summary.totalRecords !== scenarios.length) {
      fail('scenario matrix record count mismatch', {
        expected: scenarios.length,
        actual: summary.totalRecords
      })
    }

    for (const scenario of scenarioReports) {
      const combination = (summary.combinations || []).find((item) => item.box?.model === scenario.boxModel)
      if (!combination) {
        fail(`missing compatibility combination for ${scenario.id}`, { boxModel: scenario.boxModel })
      }
      scenario.combinationLevel = combination.level
      scenario.failingFields = combination.failingFields || []
      scenario.unknownFields = combination.unknownFields || []
      if (combination.level !== scenario.expectedCombinationLevel) {
        fail(`compatibility level mismatch for ${scenario.id}`, {
          expected: scenario.expectedCombinationLevel,
          actual: combination.level
        })
      }
    }

    const report = {
      generatedAtUtc: new Date().toISOString(),
      status: 'pass',
      schemaVersion,
      projectRoot: rootDir,
      tempReportDir,
      scenarios: scenarioReports,
      summary: {
        totalRecords: summary.totalRecords,
        recommendedCount: (summary.recommended || []).length,
        tvCoreReadyCount: (summary.tvCoreReady || []).length,
        needsFixCount: (summary.needsFix || []).length,
        needsManualAcceptanceCount: (summary.needsManualAcceptance || []).length
      },
      artifacts: {
        tempMatrixCsv: path.join(tempReportDir, 'tv-box-field-matrix.csv'),
        tempCompatibilitySummaryJson: path.join(tempReportDir, 'tv-box-compatibility-summary-latest.json')
      }
    }

    fs.writeFileSync(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`)
    fs.writeFileSync(outputMarkdownPath, buildMarkdown(report))
    console.log(`TV-box field scenario regression passed: ${outputMarkdownPath}`)
    console.log(`Machine-readable scenario report: ${outputJsonPath}`)
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
  fs.writeFileSync(outputMarkdownPath, `# HelloTV 电视盒子现场验收场景回归\n\n- 状态: \`fail\`\n- 错误: ${markdownCell(report.error)}\n`)
  console.error(report.error)
  if (report.details) console.error(JSON.stringify(report.details, null, 2))
  process.exit(1)
}
