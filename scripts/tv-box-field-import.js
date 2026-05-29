#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const {
  textPrompts,
  resultPrompts,
  resultText,
  schemaVersion
} = require('./tv-box-field-wizard-schema')

const rootDir = path.resolve(__dirname, '..')
const reportDir = process.env.REPORT_DIR || path.join(rootDir, 'reports')
const args = process.argv.slice(2)
const flags = new Set(args.filter((arg) => arg.startsWith('--')))
const inputArg = args.find((arg) => !arg.startsWith('--'))
const defaultInputPath = path.join(reportDir, 'tv-box-field-wizard-latest.json')
const inputPath = path.resolve(rootDir, process.env.TV_BOX_FIELD_IMPORT_JSON || inputArg || defaultInputPath)
const outputJsonPath = process.env.TV_BOX_FIELD_IMPORT_OUTPUT_JSON || path.join(reportDir, 'tv-box-field-import-latest.json')
const outputMarkdownPath = process.env.TV_BOX_FIELD_IMPORT_OUTPUT_MD || path.join(reportDir, 'tv-box-field-import-latest.md')
const outputEnvPath = process.env.TV_BOX_FIELD_IMPORT_OUTPUT_ENV || path.join(reportDir, 'tv-box-field-import-latest.env')
const dryRun = flags.has('--dry-run')
const noRun = flags.has('--no-run')
const shouldRunRecord = !dryRun && !noRun
const forceAppend = flags.has('--append')
const forceNoAppend = flags.has('--no-append')

function usage() {
  console.log(`HelloTV 电视盒子离线验收 JSON 导入器

用法:
  npm run tv-box:field-import
  npm run tv-box:field-import -- reports/tv-box-field-wizard-latest.json
  npm run tv-box:field-import -- ~/Downloads/tv-box-field-wizard-offline-20260528-120000.json --append
  npm run tv-box:field-import -- reports/tv-box-field-wizard-latest.json --dry-run --no-append

说明:
  - 默认读取 reports/tv-box-field-wizard-latest.json。
  - 可读取 FIELD_WIZARD_OFFLINE.html 下载的 JSON，也可读取命令行 tv-box:field-wizard 生成的 JSON。
  - 默认按 JSON 里的 FIELD_APPEND_MATRIX 决定是否追加累计矩阵。
  - --append 强制追加，--no-append 强制不追加，--dry-run 只生成导入报告。
`)
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function normalizeResult(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (['1', 'p', 'pass', 'passed', 'ok', 'true', 'yes', 'y', '通过', '正常', '好'].includes(normalized)) return 'pass'
  if (['2', 'f', 'fail', 'failed', 'false', 'no', 'n', '失败', '不通过', '异常', '坏'].includes(normalized)) return 'fail'
  if (['3', 's', 'skip', 'skipped', '跳过', '未测', '没测'].includes(normalized)) return 'skip'
  if (['4', 'na', 'n/a', 'not_applicable', 'not-applicable', '不适用', '无', '没有'].includes(normalized)) return 'na'
  return 'unknown'
}

function boolString(value, fallback = 'false') {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (['true', '1', 'yes', 'y', '是', '追加'].includes(normalized)) return 'true'
  if (['false', '0', 'no', 'n', '否', '不追加', ''].includes(normalized)) return 'false'
  return fallback
}

function shellQuote(value) {
  return `'${String(value ?? '').replace(/'/g, `'\\''`)}'`
}

function markdownCell(value) {
  return String(value || '').replace(/\|/g, '/').replace(/\r?\n/g, ' ')
}

function sourceEnvFromRecord(record) {
  if (record && typeof record.env === 'object' && record.env) return record.env
  if (record && typeof record === 'object') return record
  return {}
}

function buildEnv(record) {
  const sourceEnv = sourceEnvFromRecord(record)
  const importedEnv = {}

  for (const [key, , fallback] of textPrompts) {
    importedEnv[key] = sourceEnv[key] === undefined || sourceEnv[key] === null ? fallback : String(sourceEnv[key])
  }

  for (const [key] of resultPrompts) {
    importedEnv[key] = normalizeResult(sourceEnv[key])
  }

  importedEnv.FIELD_NOTES = String(sourceEnv.FIELD_NOTES || '')

  if (forceAppend && forceNoAppend) {
    throw new Error('不能同时使用 --append 和 --no-append。')
  }
  if (forceAppend) {
    importedEnv.FIELD_APPEND_MATRIX = 'true'
  } else if (forceNoAppend) {
    importedEnv.FIELD_APPEND_MATRIX = 'false'
  } else {
    importedEnv.FIELD_APPEND_MATRIX = boolString(sourceEnv.FIELD_APPEND_MATRIX, record.appendMatrix === true ? 'true' : 'false')
  }

  return importedEnv
}

function classify(importedEnv) {
  const failures = resultPrompts
    .filter(([key]) => importedEnv[key] === 'fail')
    .map(([, label]) => label)
  const unknowns = resultPrompts
    .filter(([key]) => importedEnv[key] === 'unknown')
    .map(([, label]) => label)

  const coreReady = importedEnv.FIELD_REMOTE_FOCUS === 'pass'
    && importedEnv.FIELD_LIVE_PLAYBACK === 'pass'
    && importedEnv.FIELD_SUPPORT_CODE === 'pass'
  const helpReady = importedEnv.FIELD_ZERO_KEY_HELP === 'pass'
    || importedEnv.FIELD_HELP_KEY_SHORTCUTS === 'pass'
    || importedEnv.FIELD_NUMERIC_SHORTCUTS === 'pass'
  const practiceReady = importedEnv.FIELD_REMOTE_PRACTICE === 'pass'
  const exitReady = importedEnv.FIELD_EXIT_CONFIRM === 'pass'
  const rescueReady = importedEnv.FIELD_CLASSIC_HOME_RESCUE === 'pass'
    && importedEnv.FIELD_SEARCH_RESCUE === 'pass'
    && importedEnv.FIELD_HISTORY_RESCUE === 'pass'
  const cameraReady = importedEnv.FIELD_CAMERA_PERMISSION === 'pass'
    && importedEnv.FIELD_CAMERA_PREVIEW === 'pass'

  if (failures.length > 0) return { level: 'needs_fix', failures, unknowns }
  if (coreReady && helpReady && practiceReady && exitReady && rescueReady && cameraReady) return { level: 'recommended_candidate', failures, unknowns }
  if (coreReady && helpReady && practiceReady && exitReady && rescueReady) return { level: 'tv_core_ready_candidate', failures, unknowns }
  return { level: unknowns.length > 0 ? 'needs_manual_acceptance' : 'watch', failures, unknowns }
}

function writeOutputs(importReport) {
  fs.mkdirSync(reportDir, { recursive: true })
  fs.writeFileSync(outputJsonPath, `${JSON.stringify(importReport, null, 2)}\n`)

  const envLines = Object.entries(importReport.env)
    .map(([key, value]) => `export ${key}=${shellQuote(value)}`)
    .join('\n')
  fs.writeFileSync(outputEnvPath, `${envLines}\n`)

  const markdown = `# HelloTV 电视盒子离线验收导入记录

- 生成时间 UTC: \`${importReport.generatedAtUtc}\`
- 输入 JSON: \`${importReport.inputPath}\`
- 输入工具: \`${importReport.source.tool || 'unknown'}\`
- schema: \`${importReport.source.schemaVersion || 'unknown'}\`
- dry run: \`${importReport.dryRun}\`
- 是否运行 field-record: \`${importReport.run.enabled}\`
- 是否允许追加累计矩阵: \`${importReport.env.FIELD_APPEND_MATRIX}\`
- 导入预判: \`${importReport.classification.level}\`
- env 文件: \`${path.relative(rootDir, outputEnvPath)}\`

## 现场信息

| 项目 | 值 |
| --- | --- |
${textPrompts.map(([key, label]) => `| ${label} | ${markdownCell(importReport.env[key]) || '未填写'} |`).join('\n')}

## 验收结果

| 项目 | 结果 |
| --- | --- |
${resultPrompts.map(([key, label]) => `| ${label} | ${resultText[importReport.env[key]] || importReport.env[key] || '未知'} |`).join('\n')}

## 导入结果

- field-record exitCode: \`${importReport.run.fieldRecordExitCode ?? '未运行'}\`
- compatibility-summary exitCode: \`${importReport.run.compatibilitySummaryExitCode ?? '未运行'}\`
- latest record: \`${importReport.artifacts.latestFieldRecordJson || '未生成'}\`
- compatibility summary: \`${importReport.artifacts.compatibilitySummaryJson || '未生成'}\`

## 工程人员复用

\`\`\`bash
source ${path.relative(rootDir, outputEnvPath)}
npm run tv-box:field-record
npm run tv-box:compatibility-summary
\`\`\`

## 失败项

${importReport.classification.failures.map((item) => `- ${item}`).join('\n') || '无'}

## 待补测

${importReport.classification.unknowns.map((item) => `- ${item}`).join('\n') || '无'}

## 备注

${importReport.env.FIELD_NOTES || '无'}
`
  fs.writeFileSync(outputMarkdownPath, markdown)
}

function runCommand(command, commandArgs, envVars) {
  const result = spawnSync(command, commandArgs, {
    cwd: rootDir,
    env: { ...process.env, ...envVars },
    stdio: 'inherit'
  })
  return result.status === null ? 1 : result.status
}

function latestArtifacts() {
  const latestFieldRecordJson = path.join(reportDir, 'tv-box-field-record-latest.json')
  const compatibilitySummaryJson = path.join(reportDir, 'tv-box-compatibility-summary-latest.json')
  return {
    latestFieldRecordJson: fs.existsSync(latestFieldRecordJson) ? latestFieldRecordJson : '',
    latestFieldRecordMarkdown: fs.existsSync(path.join(reportDir, 'tv-box-field-record-latest.md'))
      ? path.join(reportDir, 'tv-box-field-record-latest.md')
      : '',
    compatibilitySummaryJson: fs.existsSync(compatibilitySummaryJson) ? compatibilitySummaryJson : '',
    compatibilitySummaryMarkdown: fs.existsSync(path.join(reportDir, 'tv-box-compatibility-summary-latest.md'))
      ? path.join(reportDir, 'tv-box-compatibility-summary-latest.md')
      : ''
  }
}

function main() {
  if (flags.has('--help') || flags.has('-h')) {
    usage()
    return
  }

  if (!fs.existsSync(inputPath)) {
    console.error(`ERROR: 导入 JSON 不存在: ${inputPath}`)
    console.error('请传入 FIELD_WIZARD_OFFLINE.html 下载的 JSON，或先运行 npm run tv-box:field-wizard。')
    process.exit(1)
  }

  const sourceRecord = readJson(inputPath)
  const importedEnv = buildEnv(sourceRecord)
  const classification = classify(importedEnv)
  const importReport = {
    generatedAtUtc: new Date().toISOString(),
    projectRoot: rootDir,
    inputPath,
    dryRun,
    source: {
      tool: sourceRecord.tool || (sourceRecord.dryRun !== undefined ? 'tv-box:field-wizard' : 'unknown'),
      generatedAtUtc: sourceRecord.generatedAtUtc || '',
      schemaVersion: sourceRecord.schemaVersion || schemaVersion
    },
    env: importedEnv,
    classification,
    run: {
      enabled: shouldRunRecord,
      fieldRecordExitCode: null,
      compatibilitySummaryExitCode: null
    },
    artifacts: latestArtifacts()
  }

  writeOutputs(importReport)

  if (shouldRunRecord) {
    const fieldRecordExitCode = runCommand('npm', ['run', '-s', 'tv-box:field-record'], importedEnv)
    importReport.run.fieldRecordExitCode = fieldRecordExitCode
    if (fieldRecordExitCode !== 0) {
      importReport.artifacts = latestArtifacts()
      writeOutputs(importReport)
      process.exit(fieldRecordExitCode)
    }

    const summaryExitCode = runCommand('npm', ['run', '-s', 'tv-box:compatibility-summary'], importedEnv)
    importReport.run.compatibilitySummaryExitCode = summaryExitCode
    importReport.artifacts = latestArtifacts()
    writeOutputs(importReport)
    if (summaryExitCode !== 0) process.exit(summaryExitCode)
  } else {
    console.log('dry-run/no-run 模式：没有调用 tv-box:field-record。')
  }

  console.log(`离线验收导入报告已生成: ${outputMarkdownPath}`)
  console.log(`可复用环境变量: ${outputEnvPath}`)
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
