#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

const rootDir = path.resolve(__dirname, '..')
const reportDir = process.env.REPORT_DIR || path.join(rootDir, 'reports')
const matrixCsvPath = process.env.TV_BOX_FIELD_MATRIX_CSV || path.join(reportDir, 'tv-box-field-matrix.csv')
const latestRecordPath = process.env.TV_BOX_FIELD_RECORD_JSON || path.join(reportDir, 'tv-box-field-record-latest.json')
const inspectionPath = process.env.TV_BOX_INSPECTION_JSON || path.join(reportDir, 'tv-box-inspection-latest.json')
const outputJsonPath = process.env.TV_BOX_COMPATIBILITY_SUMMARY_JSON || path.join(reportDir, 'tv-box-compatibility-summary-latest.json')
const outputMarkdownPath = process.env.TV_BOX_COMPATIBILITY_SUMMARY_MD || path.join(reportDir, 'tv-box-compatibility-summary-latest.md')

const resultValues = ['pass', 'fail', 'skip', 'na', 'unknown']
const checkFields = [
  'remoteFocus',
  'numericShortcuts',
  'zeroKeyHelp',
  'helpKeyShortcuts',
  'remotePractice',
  'exitConfirm',
  'livePlayback',
  'liveNumericChannels',
  'liveMediaKeys',
  'liveFavorites',
  'classicHomeRescue',
  'searchRescue',
  'historyRescue',
  'cameraPermission',
  'cameraPreview',
  'audioInput',
  'recordAudioPermission',
  'usbHotplug',
  'supportCode'
]
const phoneCameraFields = [
  'phoneCameraPairing',
  'phoneCameraPermission',
  'phoneMicrophonePermission',
  'phoneTvFirstFrame',
  'phoneTvAudio',
  'phoneSessionStats',
  'phoneReconnect',
  'phonePrivacyStop'
]
const summaryFields = [...checkFields, ...phoneCameraFields]
const coreFields = ['remoteFocus', 'livePlayback', 'supportCode']
const cameraFields = ['cameraPermission', 'cameraPreview']
const audioFields = ['audioInput']

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

function parseCsvLine(line) {
  const cells = []
  let current = ''
  let inQuotes = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const nextChar = line[index + 1]
    if (inQuotes && char === '"' && nextChar === '"') {
      current += '"'
      index += 1
      continue
    }
    if (char === '"') {
      inQuotes = !inQuotes
      continue
    }
    if (!inQuotes && char === ',') {
      cells.push(current)
      current = ''
      continue
    }
    current += char
  }
  cells.push(current)
  return cells
}

function readCsv(filePath) {
  if (!fs.existsSync(filePath)) {
    return { header: [], rows: [] }
  }
  const raw = fs.readFileSync(filePath, 'utf8').trim()
  if (!raw) {
    return { header: [], rows: [] }
  }
  const lines = raw.split(/\r?\n/).filter(Boolean)
  const header = parseCsvLine(lines[0])
  const rows = lines.slice(1).map((line) => {
    const cells = parseCsvLine(line)
    return Object.fromEntries(header.map((name, index) => [name, cells[index] || '']))
  })
  return { header, rows }
}

function normalizeResult(value) {
  const normalized = String(value || '').trim().toLowerCase()
  return resultValues.includes(normalized) ? normalized : 'unknown'
}

function countBy(values) {
  const summary = Object.fromEntries(resultValues.map((value) => [value, 0]))
  for (const value of values) {
    summary[normalizeResult(value)] += 1
  }
  return summary
}

function rowTitle(row) {
  return [
    row.boxBrand || '未知品牌',
    row.boxModel || '未知盒子',
    row.androidSdk ? `SDK${row.androidSdk}` : '',
    row.remoteModel ? `遥控器:${row.remoteModel}` : '',
    row.cameraModel ? `摄像头:${row.cameraModel}` : '',
    row.microphoneModel ? `麦克风:${row.microphoneModel}` : ''
  ].filter(Boolean).join(' / ')
}

function allPass(row, fields) {
  return fields.every((field) => normalizeResult(row[field]) === 'pass')
}

function anyPass(row, fields) {
  return fields.some((field) => normalizeResult(row[field]) === 'pass')
}

function anyFail(row, fields = summaryFields) {
  return fields.some((field) => normalizeResult(row[field]) === 'fail')
}

function failingFields(row) {
  return summaryFields.filter((field) => normalizeResult(row[field]) === 'fail')
}

function isPhoneCameraText(value) {
  return /(^|[^a-z])phone([^a-z]|$)|mobile|webrtc|手机/i.test(String(value || ''))
}

function phoneCameraInScope(row) {
  const connectionInScope = [
    row.cameraConnection,
    row.microphoneConnection,
    row.cameraModel,
    row.microphoneModel
  ].some(isPhoneCameraText)
  const explicitPhoneResult = phoneCameraFields
    .map((field) => normalizeResult(row[field]))
    .some((result) => ['pass', 'fail', 'skip'].includes(result))
  return connectionInScope || explicitPhoneResult
}

function phoneCameraOpenFields(row) {
  if (!phoneCameraInScope(row)) return []
  return phoneCameraFields.filter((field) => !['pass', 'fail'].includes(normalizeResult(row[field])))
}

function unknownFields(row) {
  return [
    ...checkFields.filter((field) => normalizeResult(row[field]) === 'unknown'),
    ...phoneCameraOpenFields(row)
  ]
}

function buildCombination(row) {
  const title = rowTitle(row)
  const failures = failingFields(row)
  const unknowns = unknownFields(row)
  const phoneRouteInScope = phoneCameraInScope(row)
  const elderReady = allPass(row, coreFields) &&
    allPass(row, ['remotePractice', 'exitConfirm', 'classicHomeRescue', 'searchRescue', 'historyRescue']) &&
    anyPass(row, ['zeroKeyHelp', 'helpKeyShortcuts', 'numericShortcuts'])
  const cameraReady = allPass(row, cameraFields)
  const audioReady = allPass(row, audioFields)
  const phoneCameraReady = phoneRouteInScope && allPass(row, phoneCameraFields)
  const level = failures.length > 0
    ? 'needs_fix'
    : elderReady && (
      (cameraReady && (audioReady || ['skip', 'na', 'unknown'].includes(normalizeResult(row.recordAudioPermission)))) ||
      phoneCameraReady
    )
      ? 'recommended'
      : phoneRouteInScope && !phoneCameraReady
        ? 'needs_manual_acceptance'
        : elderReady
          ? 'tv_core_ready'
          : unknowns.length > 0
          ? 'needs_manual_acceptance'
          : 'watch'

  return {
    title,
    level,
    generatedAtUtc: row.generatedAtUtc || '',
    recordId: row.recordId || '',
    verdict: row.verdict || '',
    box: {
      brand: row.boxBrand || '',
      model: row.boxModel || '',
      androidSdk: row.androidSdk || '',
      deviceStatus: row.deviceStatus || ''
    },
    remote: row.remoteModel || '',
    camera: {
      model: row.cameraModel || '',
      connection: row.cameraConnection || ''
    },
    audio: {
      microphoneModel: row.microphoneModel || '',
      microphoneConnection: row.microphoneConnection || ''
    },
    checks: Object.fromEntries(checkFields.map((field) => [field, normalizeResult(row[field])])),
    phoneCameraChecks: Object.fromEntries(phoneCameraFields.map((field) => [field, normalizeResult(row[field])])),
    phoneCameraInScope: phoneRouteInScope,
    phoneCameraReady,
    failingFields: failures,
    unknownFields: unknowns,
    notes: row.notes || ''
  }
}

function summarizeRows(rows) {
  const combinations = rows.map(buildCombination)
  const checkSummary = Object.fromEntries(summaryFields.map((field) => [
    field,
    countBy(rows.map((row) => row[field]))
  ]))
  const verdictSummary = countBy(rows.map((row) => row.verdict))
  verdictSummary.needs_box = rows.filter((row) => row.verdict === 'needs_box').length
  verdictSummary.needs_fix = rows.filter((row) => row.verdict === 'needs_fix').length
  verdictSummary.needs_manual_acceptance = rows.filter((row) => row.verdict === 'needs_manual_acceptance').length

  return {
    totalRecords: rows.length,
    recommended: combinations.filter((combo) => combo.level === 'recommended'),
    tvCoreReady: combinations.filter((combo) => combo.level === 'tv_core_ready'),
    needsFix: combinations.filter((combo) => combo.level === 'needs_fix'),
    needsManualAcceptance: combinations.filter((combo) => combo.level === 'needs_manual_acceptance'),
    watch: combinations.filter((combo) => combo.level === 'watch'),
    checkSummary,
    verdictSummary,
    combinations
  }
}

function buildNextActions(summary, inspection, latestRecord) {
  const actions = []
  if (summary.totalRecords === 0) {
    actions.push('连接一台真实电视盒子，执行 BOX_IP=<盒子IP> RUN_CAMERA_SMOKE=true npm run tv-box:easy。')
    actions.push('现场按 FIELD_ACCEPTANCE_CHECKLIST.zh-CN.md 验收后，用 tv-box:field-record 写入第一条兼容性记录。')
  }
  if ((inspection?.deviceEvidence || {}).status === 'no_authorized_device') {
    actions.push('当前电脑没有授权电视盒子；先让现场开启开发者选项/网络调试并确认 RSA 授权。')
  }
  if (latestRecord?.matrix?.appendRow === false) {
    actions.push('latest 记录未追加到累计矩阵；如这是有效现场样本，请补 FIELD_* 字段或设置 FIELD_APPEND_MATRIX=true 后重跑。')
  }
  if (summary.needsFix.length > 0) {
    actions.push('优先处理 needs_fix 组合，保留 tv-box-support-latest.zip、维护码照片和现场备注。')
  }
  if (summary.recommended.length === 0 && summary.totalRecords > 0) {
    actions.push('当前还没有达到 recommended 的完整组合；继续补遥控器、退出确认、直播、全部内容救援、搜索/继续看救援、摄像头预览、音频输入和维护码字段。')
  }
  if (actions.length === 0) {
    actions.push('把 recommended 组合写入对外推荐清单；新增盒子/摄像头/麦克风时继续追加矩阵。')
  }
  return actions
}

function markdownTable(rows, columns) {
  if (rows.length === 0) return '暂无。\n'
  const header = `| ${columns.map((column) => column.title).join(' |')} |`
  const divider = `| ${columns.map(() => '---').join(' |')} |`
  const body = rows.map((row) => `| ${columns.map((column) => String(column.value(row) || '').replace(/\|/g, '/')).join(' |')} |`)
  return `${[header, divider, ...body].join('\n')}\n`
}

function buildMarkdown(summary, nextActions, latestRecord, inspection) {
  return `# HelloTV 电视盒子兼容性自动汇总

- 生成时间 UTC: \`${summary.generatedAtUtc}\`
- 累计记录数: \`${summary.totalRecords}\`
- 推荐组合: \`${summary.recommended.length}\`
- 核心看电视可用组合: \`${summary.tvCoreReady.length}\`
- 待修复组合: \`${summary.needsFix.length}\`
- 待人工补测组合: \`${summary.needsManualAcceptance.length}\`
- 当前 readiness: \`${inspection?.readiness?.level || 'unknown'}\`
- 最新记录结论: \`${latestRecord?.verdict || 'unknown'}\`

## 推荐组合

${markdownTable(summary.recommended, [
  { title: '组合', value: (row) => row.title },
  { title: '结论', value: (row) => row.level },
  { title: '备注', value: (row) => row.notes }
])}
## 核心可用但需继续补摄像头/音频

${markdownTable(summary.tvCoreReady, [
  { title: '组合', value: (row) => row.title },
  { title: '摄像头', value: (row) => `${row.checks.cameraPermission}/${row.checks.cameraPreview}` },
  { title: '音频', value: (row) => `${row.checks.audioInput}/${row.checks.recordAudioPermission}` }
])}
## 待修复组合

${markdownTable(summary.needsFix, [
  { title: '组合', value: (row) => row.title },
  { title: '失败字段', value: (row) => row.failingFields.join(', ') },
  { title: '备注', value: (row) => row.notes }
])}
## 待人工补测组合

${markdownTable(summary.needsManualAcceptance, [
  { title: '组合', value: (row) => row.title },
  { title: '缺失字段', value: (row) => row.unknownFields.slice(0, 8).join(', ') },
  { title: '备注', value: (row) => row.notes }
])}
## 指标统计

| 字段 | pass | fail | skip | na | unknown |
| --- | --- | --- | --- | --- | --- |
${checkFields.map((field) => {
  const counts = summary.checkSummary[field]
  return `| ${field} | ${counts.pass} | ${counts.fail} | ${counts.skip} | ${counts.na} | ${counts.unknown} |`
}).join('\n')}

## 手机摄像头指标统计

| 字段 | pass | fail | skip | na | unknown |
| --- | --- | --- | --- | --- | --- |
${phoneCameraFields.map((field) => {
  const counts = summary.checkSummary[field]
  return `| ${field} | ${counts.pass} | ${counts.fail} | ${counts.skip} | ${counts.na} | ${counts.unknown} |`
}).join('\n')}

## 下一步

${nextActions.map((action) => `- ${action}`).join('\n')}
`
}

function main() {
  fs.mkdirSync(reportDir, { recursive: true })
  const matrix = readCsv(matrixCsvPath)
  const latestRecord = readJson(latestRecordPath)
  const inspection = readJson(inspectionPath)
  const rowSummary = summarizeRows(matrix.rows)
  const generatedAtUtc = new Date().toISOString()
  const summary = {
    generatedAtUtc,
    projectRoot: rootDir,
    inputs: {
      matrixCsvPath,
      latestRecordPath,
      inspectionPath
    },
    matrixHeader: matrix.header,
    latestRecord: latestRecord ? {
      recordId: latestRecord.recordId || '',
      verdict: latestRecord.verdict || '',
      appendRow: latestRecord.matrix?.appendRow === true,
      appendReason: latestRecord.matrix?.appendReason || ''
    } : null,
    readiness: inspection?.readiness || null,
    ...rowSummary
  }
  const nextActions = buildNextActions(summary, inspection, latestRecord)
  summary.nextActions = nextActions

  fs.writeFileSync(outputJsonPath, `${JSON.stringify(summary, null, 2)}\n`)
  fs.writeFileSync(outputMarkdownPath, buildMarkdown(summary, nextActions, latestRecord, inspection))
  console.log(`TV-box compatibility summary written to: ${outputMarkdownPath}`)
  console.log(`Machine-readable summary: ${outputJsonPath}`)
}

main()
