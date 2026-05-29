#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const {
  textPrompts,
  resultPrompts,
  schemaVersion
} = require('./tv-box-field-wizard-schema')

const rootDir = path.resolve(__dirname, '..')
const reportDir = process.env.REPORT_DIR || path.join(rootDir, 'reports')
const defaultInboxDir = process.env.TV_BOX_FIELD_INBOX_DIR || path.join(reportDir, 'tv-box-field-inbox')
const outputJsonPath = process.env.TV_BOX_FIELD_INBOX_JSON || path.join(reportDir, 'tv-box-field-inbox-latest.json')
const outputMarkdownPath = process.env.TV_BOX_FIELD_INBOX_MD || path.join(reportDir, 'tv-box-field-inbox-latest.md')
const importArchiveRoot = process.env.TV_BOX_FIELD_INBOX_IMPORT_DIR || path.join(reportDir, 'tv-box-field-inbox-imports')
const latestImportJsonPath = path.join(reportDir, 'tv-box-field-import-latest.json')
const latestImportMdPath = path.join(reportDir, 'tv-box-field-import-latest.md')
const latestImportEnvPath = path.join(reportDir, 'tv-box-field-import-latest.env')
const args = process.argv.slice(2)
const flags = new Set(args.filter((arg) => arg.startsWith('--')))
const inputArgs = args.filter((arg) => !arg.startsWith('--')).map(expandHome)
const dryRun = flags.has('--dry-run')
const noRun = flags.has('--no-run')
const forceAppend = flags.has('--append')
const forceNoAppend = flags.has('--no-append')
const strict = flags.has('--strict')
const keepGoing = !flags.has('--fail-fast')

function usage() {
  console.log(`HelloTV 电视盒子现场 JSON 收件箱

用法:
  npm run tv-box:field-inbox
  npm run tv-box:field-inbox -- reports/tv-box-field-inbox
  npm run tv-box:field-inbox -- ~/Downloads/tv-box-field-wizard-offline-a.json ~/Downloads/tv-box-field-wizard-offline-b.json
  npm run tv-box:field-inbox -- reports/tv-box-field-wizard-latest.json --dry-run --no-append

说明:
  - 默认扫描 reports/tv-box-field-inbox/ 里的 JSON 文件。
  - 可直接传入一个目录、一个 JSON，或多个 JSON。
  - 每个有效 JSON 会复用 tv-box:field-import，再刷新兼容性矩阵和兼容性汇总。
  - --append / --no-append 会批量覆盖现场 JSON 里的追加矩阵选择。
  - --dry-run 或 --no-run 只生成导入报告，不写入累计矩阵。
  - --strict 会在没有有效 JSON 时返回失败，适合 CI。
  - --fail-fast 会在第一条导入失败后停止。
`)
}

function expandHome(value) {
  if (!value || value === '~') return process.env.HOME || value
  if (value.startsWith('~/')) return path.join(process.env.HOME || '', value.slice(2))
  return value
}

function stamp() {
  return new Date().toISOString().replace(/[-:.]/g, '').replace('T', 'T').replace('Z', 'Z')
}

function sanitizeName(value) {
  return String(value || 'field-json')
    .replace(/\.json$/i, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'field-json'
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

function sourceEnvFromRecord(record) {
  if (record && typeof record.env === 'object' && record.env) return record.env
  if (record && typeof record === 'object') return record
  return {}
}

function isGeneratedImportReport(record) {
  return Boolean(record && record.source && record.run && record.classification && record.env)
}

function isFieldWizardRecord(record) {
  if (!record || typeof record !== 'object' || record.error) return false
  if (isGeneratedImportReport(record)) return false
  const sourceEnv = sourceEnvFromRecord(record)
  const knownKeys = new Set([
    ...textPrompts.map(([key]) => key),
    ...resultPrompts.map(([key]) => key),
    'FIELD_NOTES',
    'FIELD_APPEND_MATRIX'
  ])
  const knownCount = Object.keys(sourceEnv).filter((key) => knownKeys.has(key)).length
  if (record.schemaVersion === schemaVersion) return true
  if (record.tool === 'FIELD_WIZARD_OFFLINE.html') return true
  if (record.projectRoot && record.env && knownCount >= 4) return true
  return knownCount >= 6
}

function walkJsonFiles(inputPath, output) {
  if (!fs.existsSync(inputPath)) {
    output.skipped.push({ path: inputPath, reason: '路径不存在' })
    return
  }

  const stat = fs.statSync(inputPath)
  if (stat.isFile()) {
    if (inputPath.toLowerCase().endsWith('.json')) {
      output.files.push(path.resolve(inputPath))
    } else {
      output.skipped.push({ path: inputPath, reason: '不是 JSON 文件' })
    }
    return
  }

  if (!stat.isDirectory()) {
    output.skipped.push({ path: inputPath, reason: '不是文件或目录' })
    return
  }

  for (const name of fs.readdirSync(inputPath).sort()) {
    if (['node_modules', '.git'].includes(name)) continue
    const childPath = path.join(inputPath, name)
    if (childPath.includes(`${path.sep}tv-box-field-inbox-imports${path.sep}`)) continue
    const childStat = fs.statSync(childPath)
    if (childStat.isFile() && !childPath.toLowerCase().endsWith('.json')) continue
    walkJsonFiles(childPath, output)
  }
}

function discoverFiles(inputs) {
  const output = { files: [], skipped: [] }
  const scanInputs = inputs.length > 0 ? inputs : [defaultInboxDir]
  fs.mkdirSync(defaultInboxDir, { recursive: true })
  writeInboxReadme()
  for (const input of scanInputs) walkJsonFiles(path.resolve(rootDir, input), output)

  const seen = new Set()
  output.files = output.files
    .filter((filePath) => {
      const baseName = path.basename(filePath)
      if (/^tv-box-field-inbox-latest\./.test(baseName)) return false
      if (seen.has(filePath)) return false
      seen.add(filePath)
      return true
    })
    .sort()

  return output
}

function writeInboxReadme() {
  const readmePath = path.join(defaultInboxDir, 'README.zh-CN.md')
  if (fs.existsSync(readmePath)) return
  const readme = `# HelloTV 现场 JSON 收件箱

把现场人员从 \`FIELD_WIZARD_OFFLINE.html\` 下载的 JSON 文件放到这个目录，然后在源码工程执行：

\`\`\`bash
npm run tv-box:field-inbox
\`\`\`

常用方式：

- 先检查不写入矩阵：\`npm run tv-box:field-inbox -- --dry-run --no-append\`
- 确认都是真实盒子验收后强制追加：\`npm run tv-box:field-inbox -- --append\`
- 只导入某个目录：\`npm run tv-box:field-inbox -- ~/Downloads/hellotv-field-json\`

生成结果：

- \`reports/tv-box-field-inbox-latest.md/json\`
- \`reports/tv-box-field-inbox-imports/\`
- \`reports/tv-box-field-matrix.csv\`
- \`reports/tv-box-compatibility-summary-latest.md/json\`
`
  fs.writeFileSync(readmePath, readme)
}

function normalizeLevel(value) {
  const normalized = String(value || '').trim()
  return normalized || 'unknown'
}

function markdownCell(value) {
  return String(value ?? '').replace(/\|/g, '/').replace(/\r?\n/g, ' ')
}

function copyIfExists(sourcePath, targetPath) {
  if (!fs.existsSync(sourcePath)) return ''
  fs.copyFileSync(sourcePath, targetPath)
  return targetPath
}

function importFlags() {
  const importArgs = []
  if (dryRun) importArgs.push('--dry-run')
  if (noRun) importArgs.push('--no-run')
  if (forceAppend) importArgs.push('--append')
  if (forceNoAppend) importArgs.push('--no-append')
  return importArgs
}

function runImport(filePath, index, importArchiveDir) {
  const baseName = `${String(index + 1).padStart(3, '0')}-${sanitizeName(path.basename(filePath))}`
  console.log(`\n== Field inbox import ${index + 1}: ${filePath} ==`)
  const result = spawnSync('node', ['./scripts/tv-box-field-import.js', filePath, ...importFlags()], {
    cwd: rootDir,
    env: process.env,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024
  })

  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)

  const importJsonPath = copyIfExists(latestImportJsonPath, path.join(importArchiveDir, `${baseName}.json`))
  const importMarkdownPath = copyIfExists(latestImportMdPath, path.join(importArchiveDir, `${baseName}.md`))
  const importEnvPath = copyIfExists(latestImportEnvPath, path.join(importArchiveDir, `${baseName}.env`))
  const importReport = importJsonPath ? readJson(importJsonPath) : null

  return {
    inputPath: filePath,
    exitCode: result.status === null ? 1 : result.status,
    signal: result.signal || '',
    importJsonPath,
    importMarkdownPath,
    importEnvPath,
    source: importReport?.source || null,
    classification: importReport?.classification || null,
    appendMatrix: importReport?.env?.FIELD_APPEND_MATRIX || '',
    fieldRecordExitCode: importReport?.run?.fieldRecordExitCode ?? null,
    compatibilitySummaryExitCode: importReport?.run?.compatibilitySummaryExitCode ?? null
  }
}

function buildNextActions(report) {
  const actions = []
  if (report.acceptedFiles.length === 0) {
    actions.push(`把 FIELD_WIZARD_OFFLINE.html 下载的 JSON 放入 ${path.relative(rootDir, defaultInboxDir)}，再运行 npm run tv-box:field-inbox。`)
  }
  if (dryRun || noRun) {
    actions.push('当前是 dry-run/no-run；确认 JSON 都是真实盒子验收后，去掉 --dry-run 或 --no-run 再导入。')
  }
  if (report.summary.failedImports > 0) {
    actions.push('有 JSON 导入失败；先打开 reports/tv-box-field-inbox-latest.md 查看失败文件，再保留原始 JSON 给工程人员。')
  }
  if ((report.summary.classificationCounts.needs_fix || 0) > 0) {
    actions.push('存在 needs_fix 组合；优先保留 tv-box-support-latest.zip、维护码照片和现场备注。')
  }
  if ((report.summary.classificationCounts.recommended_candidate || 0) > 0) {
    actions.push('已有 recommended_candidate 样本；复跑 npm run tv-box:compatibility-summary，把推荐组合写入对外推荐清单。')
  }
  if (actions.length === 0) {
    actions.push('继续收集更多盒子、遥控器、摄像头和麦克风组合；每批 JSON 都走 tv-box:field-inbox。')
  }
  return actions
}

function writeOutputs(report) {
  fs.mkdirSync(reportDir, { recursive: true })
  fs.writeFileSync(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`)

  const importedRows = report.imported.length
    ? report.imported.map((item) => `| ${markdownCell(path.basename(item.inputPath))} | ${item.exitCode} | ${markdownCell(item.classification?.level || 'unknown')} | ${markdownCell(item.appendMatrix || 'unknown')} | ${item.fieldRecordExitCode ?? '未运行'} | \`${markdownCell(path.relative(rootDir, item.importMarkdownPath || ''))}\` |`).join('\n')
    : '| 无 | - | - | - | - | - |'

  const skippedRows = report.skipped.length
    ? report.skipped.map((item) => `| \`${markdownCell(item.path)}\` | ${markdownCell(item.reason)} |`).join('\n')
    : '| 无 | 无 |'

  const markdown = `# HelloTV 电视盒子现场 JSON 收件箱

- 生成时间 UTC: \`${report.generatedAtUtc}\`
- 默认收件箱: \`${path.relative(rootDir, defaultInboxDir)}\`
- 输入路径: \`${report.inputs.join('`, `') || path.relative(rootDir, defaultInboxDir)}\`
- dry run: \`${report.options.dryRun}\`
- no run: \`${report.options.noRun}\`
- force append: \`${report.options.forceAppend}\`
- force no append: \`${report.options.forceNoAppend}\`
- 扫描 JSON: \`${report.scannedFiles.length}\`
- 有效现场 JSON: \`${report.acceptedFiles.length}\`
- 成功导入: \`${report.summary.successfulImports}\`
- 失败导入: \`${report.summary.failedImports}\`
- 分档统计: \`${JSON.stringify(report.summary.classificationCounts)}\`
- 单条导入归档: \`${path.relative(rootDir, report.importArchiveDir)}\`

## 导入明细

| JSON | exit | 预判 | 追加矩阵 | field-record | 导入报告 |
| --- | ---: | --- | --- | --- | --- |
${importedRows}

## 跳过文件

| 路径 | 原因 |
| --- | --- |
${skippedRows}

## 下一步

${report.nextActions.map((item) => `- ${item}`).join('\n')}

## 给现场人员的最简口径

1. 打开交付包里的 \`FIELD_WIZARD_OFFLINE.html\`。
2. 按大按钮填完验收结果，下载 JSON。
3. 把所有 JSON 发给工程人员；工程人员放进 \`${path.relative(rootDir, defaultInboxDir)}\` 后运行 \`npm run tv-box:field-inbox\`。
`
  fs.writeFileSync(outputMarkdownPath, markdown)
}

function main() {
  if (flags.has('--help') || flags.has('-h')) {
    usage()
    return
  }
  if (forceAppend && forceNoAppend) {
    console.error('ERROR: 不能同时使用 --append 和 --no-append。')
    process.exit(1)
  }

  fs.mkdirSync(reportDir, { recursive: true })
  const importArchiveDir = path.join(importArchiveRoot, stamp())
  fs.mkdirSync(importArchiveDir, { recursive: true })

  const discovered = discoverFiles(inputArgs)
  const acceptedFiles = []
  const skipped = [...discovered.skipped]

  for (const filePath of discovered.files) {
    const record = readJson(filePath)
    if (isFieldWizardRecord(record)) {
      acceptedFiles.push(filePath)
    } else {
      skipped.push({
        path: filePath,
        reason: record.error ? `JSON 解析失败: ${record.error}` : '不是 FIELD_WIZARD_OFFLINE 或 tv-box:field-wizard 现场记录'
      })
    }
  }

  const imported = []
  for (let index = 0; index < acceptedFiles.length; index += 1) {
    const result = runImport(acceptedFiles[index], index, importArchiveDir)
    imported.push(result)
    if (result.exitCode !== 0 && !keepGoing) break
  }

  const classificationCounts = {}
  for (const item of imported) {
    const level = normalizeLevel(item.classification?.level)
    classificationCounts[level] = (classificationCounts[level] || 0) + 1
  }

  const report = {
    generatedAtUtc: new Date().toISOString(),
    projectRoot: rootDir,
    inputs: inputArgs,
    defaultInboxDir,
    importArchiveDir,
    options: {
      dryRun,
      noRun,
      forceAppend,
      forceNoAppend,
      strict,
      keepGoing
    },
    scannedFiles: discovered.files,
    acceptedFiles,
    skipped,
    imported,
    summary: {
      scannedJsonFiles: discovered.files.length,
      acceptedJsonFiles: acceptedFiles.length,
      successfulImports: imported.filter((item) => item.exitCode === 0).length,
      failedImports: imported.filter((item) => item.exitCode !== 0).length,
      classificationCounts
    },
    artifacts: {
      outputJsonPath,
      outputMarkdownPath,
      latestImportJsonPath,
      latestImportMarkdownPath: latestImportMdPath,
      latestImportEnvPath,
      fieldMatrixCsv: path.join(reportDir, 'tv-box-field-matrix.csv'),
      compatibilitySummaryJson: path.join(reportDir, 'tv-box-compatibility-summary-latest.json'),
      compatibilitySummaryMarkdown: path.join(reportDir, 'tv-box-compatibility-summary-latest.md')
    },
    nextActions: []
  }
  report.nextActions = buildNextActions(report)
  writeOutputs(report)

  console.log(`\n现场 JSON 收件箱报告已生成: ${outputMarkdownPath}`)
  console.log(`机器可读报告: ${outputJsonPath}`)

  if (report.summary.failedImports > 0) process.exit(1)
  if (strict && report.acceptedFiles.length === 0) process.exit(1)
}

main()
