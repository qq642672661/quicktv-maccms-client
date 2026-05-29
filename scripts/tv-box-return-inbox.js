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
const defaultInboxDir = process.env.TV_BOX_RETURN_INBOX_DIR || path.join(reportDir, 'tv-box-return-inbox')
const extractedRoot = process.env.TV_BOX_RETURN_INBOX_EXTRACTED_DIR || path.join(reportDir, 'tv-box-return-inbox-extracted')
const stagedJsonRoot = process.env.TV_BOX_RETURN_INBOX_JSON_DIR || path.join(reportDir, 'tv-box-return-inbox-json')
const outputJsonPath = process.env.TV_BOX_RETURN_INBOX_JSON || path.join(reportDir, 'tv-box-return-inbox-latest.json')
const outputMarkdownPath = process.env.TV_BOX_RETURN_INBOX_MD || path.join(reportDir, 'tv-box-return-inbox-latest.md')
const args = process.argv.slice(2)
const flags = new Set(args.filter((arg) => arg.startsWith('--')))
const inputs = args.filter((arg) => !arg.startsWith('--')).map(expandHome)
const strict = flags.has('--strict')
const append = flags.has('--append')
const forceAppend = flags.has('--force-append')
const noAppend = flags.has('--no-append')
const noFieldInbox = flags.has('--no-field-inbox')
const keepGoing = !flags.has('--fail-fast')

function usage() {
  console.log(`HelloTV 电视盒子现场回传收件箱

用法:
  npm run tv-box:return-inbox
  npm run tv-box:return-inbox -- ~/Downloads/HelloTV现场回传
  npm run tv-box:return-inbox -- ~/Downloads/HelloTV现场回传.zip
  npm run tv-box:return-inbox -- reports/tv-box-return-inbox --strict
  npm run tv-box:return-inbox -- reports/tv-box-return-inbox --append

说明:
  - 默认扫描 reports/tv-box-return-inbox/。
  - 可传入目录、单个文件、zip 包，或多个路径。
  - 会检查现场是否发回 JSON、维护码照片、INSTALL_LOG/support zip、异常照片/日志。
  - 默认只 dry-run 验证 JSON 导入，不写入累计兼容性矩阵。
  - --append 会把有效现场 JSON 交给 tv-box:field-inbox 追加矩阵。
  - --force-append 会在证据未齐时仍允许追加，仅用于负责人已人工确认的情况。
  - --strict 会在关键证据缺失时返回失败，适合交付复核。
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
  return String(value || 'field-return')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || 'field-return'
}

function relative(filePath) {
  return filePath ? path.relative(rootDir, filePath) || '.' : ''
}

function markdownCell(value) {
  return String(value ?? '').replace(/\|/g, '/').replace(/\r?\n/g, ' ')
}

const resultLabels = Object.fromEntries(resultPrompts.map(([key, label]) => [key, label]))
const textLabels = Object.fromEntries(textPrompts.map(([key, label]) => [key, label]))

const closeRequiredTextFields = [
  'FIELD_OPERATOR',
  'FIELD_LOCATION',
  'FIELD_BOX_MODEL',
  'FIELD_REMOTE_MODEL'
]

const remoteMustPassFields = [
  'FIELD_REMOTE_FOCUS',
  'FIELD_REMOTE_PRACTICE',
  'FIELD_EXIT_CONFIRM',
  'FIELD_LIVE_PLAYBACK',
  'FIELD_CLASSIC_HOME_RESCUE',
  'FIELD_SEARCH_RESCUE',
  'FIELD_HISTORY_RESCUE'
]

const remotePassOrNaFields = [
  'FIELD_NUMERIC_SHORTCUTS',
  'FIELD_LIVE_NUMERIC_CHANNELS',
  'FIELD_LIVE_MEDIA_KEYS',
  'FIELD_LIVE_FAVORITES'
]

const cameraAudioPassOrNaFields = [
  'FIELD_CAMERA_PERMISSION',
  'FIELD_CAMERA_PREVIEW',
  'FIELD_AUDIO_INPUT',
  'FIELD_RECORD_AUDIO_PERMISSION',
  'FIELD_USB_HOTPLUG'
]

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

function normalizeFieldResult(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (['pass', 'passed', 'ok', 'true', 'yes', 'y'].includes(normalized)) return 'pass'
  if (['fail', 'failed', 'false', 'no', 'n'].includes(normalized)) return 'fail'
  if (['skip', 'skipped'].includes(normalized)) return 'skip'
  if (['na', 'n/a', 'not_applicable', 'not-applicable'].includes(normalized)) return 'na'
  return 'unknown'
}

function fieldLabel(key) {
  return resultLabels[key] || textLabels[key] || key
}

function evaluateTextFields(env, keys) {
  const checks = keys.map((key) => {
    const value = String(env[key] || '').trim()
    return {
      key,
      label: fieldLabel(key),
      value,
      status: value ? 'pass' : 'needs_site_follow_up'
    }
  })
  return {
    status: checks.every((item) => item.status === 'pass') ? 'pass' : 'needs_site_follow_up',
    checks
  }
}

function evaluateResultFields(env, rules) {
  const checks = rules.map((rule) => {
    const key = rule.key
    const value = normalizeFieldResult(env[key])
    const allowed = rule.allowed || ['pass']
    const status = value === 'fail'
      ? 'needs_fix'
      : allowed.includes(value)
        ? 'pass'
        : 'needs_site_follow_up'
    return {
      key,
      label: fieldLabel(key),
      value,
      allowed,
      status,
      note: rule.note || ''
    }
  })
  const groupStatus = checks.some((item) => item.status === 'needs_fix')
    ? 'needs_fix'
    : checks.some((item) => item.status === 'needs_site_follow_up')
      ? 'needs_site_follow_up'
      : 'pass'
  return {
    status: groupStatus,
    checks
  }
}

function evaluateEitherPass(env, keys, title) {
  const checks = keys.map((key) => {
    const value = normalizeFieldResult(env[key])
    return {
      key,
      label: fieldLabel(key),
      value,
      status: value === 'pass' ? 'pass' : value === 'fail' ? 'needs_fix' : 'needs_site_follow_up'
    }
  })
  const hasPass = checks.some((item) => item.value === 'pass')
  const hasFail = checks.some((item) => item.value === 'fail')
  const status = hasPass ? 'pass' : hasFail ? 'needs_fix' : 'needs_site_follow_up'
  return {
    title,
    status,
    checks
  }
}

function buildFieldJsonClosure(record, info) {
  const env = sourceEnvFromRecord(record)
  const identity = evaluateTextFields(env, closeRequiredTextFields)
  const remoteRequired = evaluateResultFields(env, remoteMustPassFields.map((key) => ({ key, allowed: ['pass'] })))
  const remoteOptional = evaluateResultFields(env, remotePassOrNaFields.map((key) => ({ key, allowed: ['pass', 'na'] })))
  const helpShortcut = evaluateEitherPass(env, ['FIELD_ZERO_KEY_HELP', 'FIELD_HELP_KEY_SHORTCUTS'], '至少一个帮助/自检快捷键可用')
  const supportCode = evaluateResultFields(env, [{ key: 'FIELD_SUPPORT_CODE', allowed: ['pass'] }])
  const cameraAudio = evaluateResultFields(env, cameraAudioPassOrNaFields.map((key) => ({ key, allowed: ['pass', 'na'] })))

  const groups = {
    identity,
    remoteRequired,
    remoteOptional,
    helpShortcut,
    supportCode,
    cameraAudio
  }

  const allChecks = Object.values(groups).flatMap((group) => group.checks || [])
  const failedFields = allChecks.filter((item) => item.status === 'needs_fix')
  const followUpFields = allChecks.filter((item) => item.status === 'needs_site_follow_up')
  const status = failedFields.length
    ? 'needs_fix'
    : followUpFields.length
      ? 'needs_site_follow_up'
      : 'ready_to_close'

  return {
    status,
    file: info.relativePath,
    summary: status === 'ready_to_close'
      ? '该现场 JSON 的遥控器、直播、帮助、退出、维护码和摄像头/麦克风可选项已满足关闭条件。'
      : status === 'needs_fix'
        ? '该现场 JSON 存在 fail；证据齐全时应进入工程修复，而不是关闭。'
        : '该现场 JSON 仍有 unknown/skip/空字段；需要现场补测或补填后才能关闭。',
    groups,
    failedFields,
    followUpFields
  }
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

function fileInfo(filePath) {
  const stat = fs.statSync(filePath)
  return {
    path: filePath,
    relativePath: relative(filePath),
    name: path.basename(filePath),
    sizeBytes: stat.size
  }
}

function walk(inputPath, output) {
  if (!fs.existsSync(inputPath)) {
    output.skipped.push({ path: inputPath, reason: '路径不存在' })
    return
  }

  const stat = fs.statSync(inputPath)
  if (stat.isFile()) {
    output.files.push(path.resolve(inputPath))
    return
  }

  if (!stat.isDirectory()) {
    output.skipped.push({ path: inputPath, reason: '不是文件或目录' })
    return
  }

  for (const name of fs.readdirSync(inputPath).sort()) {
    if (['node_modules', '.git'].includes(name)) continue
    walk(path.join(inputPath, name), output)
  }
}

function unzipArchive(archivePath, report) {
  const unzip = spawnSync('unzip', ['-v'], { encoding: 'utf8' })
  if (unzip.status !== 0) {
    report.skipped.push({ path: archivePath, reason: '系统没有 unzip，无法自动解压 zip' })
    return ''
  }

  const targetDir = path.join(extractedRoot, `${stamp()}-${sanitizeName(path.basename(archivePath, '.zip'))}`)
  fs.mkdirSync(targetDir, { recursive: true })
  const result = spawnSync('unzip', ['-qq', '-o', archivePath, '-d', targetDir], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024
  })
  if (result.status !== 0) {
    report.skipped.push({
      path: archivePath,
      reason: `zip 解压失败: ${(result.stderr || result.stdout || '').trim()}`
    })
    return ''
  }
  report.extractedArchives.push({ archivePath, extractedTo: targetDir })
  return targetDir
}

function discoverInputs() {
  fs.mkdirSync(defaultInboxDir, { recursive: true })
  writeInboxReadme()

  const report = { files: [], skipped: [], extractedArchives: [] }
  const scanInputs = inputs.length > 0 ? inputs : [defaultInboxDir]

  for (const rawInput of scanInputs) {
    const inputPath = path.resolve(process.cwd(), rawInput)
    if (inputPath.toLowerCase().endsWith('.zip') && fs.existsSync(inputPath) && fs.statSync(inputPath).isFile()) {
      const extracted = unzipArchive(inputPath, report)
      if (extracted) walk(extracted, report)
    } else {
      walk(inputPath, report)
    }
  }

  const seen = new Set()
  report.files = report.files.filter((filePath) => {
    if (seen.has(filePath)) return false
    seen.add(filePath)
    return true
  }).sort()

  return report
}

function writeInboxReadme() {
  const readmePath = path.join(defaultInboxDir, 'README.zh-CN.md')
  if (fs.existsSync(readmePath)) return
  const readme = `# HelloTV 现场回传收件箱

把现场发回的文件放到这个目录，或把现场发来的 zip 直接传给命令：

\`\`\`bash
npm run tv-box:return-inbox
npm run tv-box:return-inbox -- ~/Downloads/HelloTV现场回传.zip
\`\`\`

现场回传应包含 4 样：

- FIELD_WIZARD_OFFLINE.html 下载的 JSON。
- 电视上“维护码”的照片。
- INSTALL_LOG.txt 或 tv-box-support-latest.zip。
- 如果有失败、unknown、黑屏、权限或摄像头问题，再发异常照片/日志/keyCode。

默认只检查和 dry-run 导入 JSON，不写累计矩阵；确认是真实盒子验收后再运行：

\`\`\`bash
npm run tv-box:return-inbox -- --append
\`\`\`
`
  fs.writeFileSync(readmePath, readme)
}

function classifyFiles(files, skipped) {
  const evidence = {
    fieldJsons: [],
    rejectedJsons: [],
    installLogs: [],
    supportBundles: [],
    supportCodePhotos: [],
    issueEvidence: [],
    genericImages: [],
    otherLogs: [],
    otherFiles: []
  }

  for (const filePath of files) {
    const info = fileInfo(filePath)
    const lower = info.name.toLowerCase()
    const fullLower = filePath.toLowerCase()

    if (lower.endsWith('.json')) {
      const record = readJson(filePath)
      if (isFieldWizardRecord(record)) {
        evidence.fieldJsons.push({
          ...info,
          problematicFields: collectProblematicFields(record),
          closure: buildFieldJsonClosure(record, info)
        })
      } else {
        evidence.rejectedJsons.push({ ...info, reason: record.error ? `JSON 解析失败: ${record.error}` : '不是现场验收 JSON' })
      }
      continue
    }

    if (/install[_ -]?log\.txt$/i.test(info.name) || /安装.*日志|install.*log/i.test(info.name)) {
      evidence.installLogs.push(info)
      continue
    }

    if (/tv-box-support.*\.(zip|tar\.gz)$/i.test(info.name) || /support.*bundle.*\.(zip|tar\.gz)$/i.test(info.name)) {
      evidence.supportBundles.push(info)
      continue
    }

    if (/\.(jpg|jpeg|png|heic|webp|bmp|gif)$/i.test(info.name)) {
      if (/维护码|support|code|维护|排障/i.test(info.name)) {
        evidence.supportCodePhotos.push(info)
      } else if (/keycode|key-code|遥控|按键|权限|permission|camera|摄像头|black|黑屏|crash|崩|error|异常|fail|失败/i.test(info.name)) {
        evidence.issueEvidence.push(info)
      } else {
        evidence.genericImages.push(info)
      }
      continue
    }

    if (/\.(log|txt)$/i.test(info.name)) {
      if (/keycode|key-code|permission|camera|摄像头|crash|崩|error|异常|fail|失败|logcat/i.test(fullLower)) {
        evidence.issueEvidence.push(info)
      } else {
        evidence.otherLogs.push(info)
      }
      continue
    }

    evidence.otherFiles.push(info)
  }

  return { evidence, skipped }
}

function collectProblematicFields(record) {
  const env = sourceEnvFromRecord(record)
  const fields = []
  for (const [key, label] of resultPrompts) {
    const value = String(env[key] || '').trim().toLowerCase()
    if (value === 'fail' || value === 'unknown') {
      fields.push({ key, label, value })
    }
  }
  return fields
}

function buildEvidenceChecks(evidence) {
  const problematicFields = evidence.fieldJsons.flatMap((item) => (
    item.problematicFields.map((field) => ({ file: item.relativePath, ...field }))
  ))
  const unknownFields = problematicFields.filter((field) => field.value === 'unknown')
  const failedFields = problematicFields.filter((field) => field.value === 'fail')
  const issueEvidenceRequired = problematicFields.length > 0
  const hasSupportCodePhoto = evidence.supportCodePhotos.length > 0
  const hasAnyPhoto = hasSupportCodePhoto || evidence.genericImages.length > 0 || evidence.issueEvidence.some((item) => /\.(jpg|jpeg|png|heic|webp|bmp|gif)$/i.test(item.name))
  const hasInstallLogOrSupportBundle = evidence.installLogs.length > 0 || evidence.supportBundles.length > 0
  const hasIssueEvidence = evidence.issueEvidence.length > 0

  const checks = [
    {
      id: 'field_json',
      title: '现场验收 JSON',
      status: evidence.fieldJsons.length > 0 ? 'pass' : 'missing',
      evidence: evidence.fieldJsons.length ? `${evidence.fieldJsons.length} 个有效 JSON` : '未找到 FIELD_WIZARD_OFFLINE.html 下载的 JSON'
    },
    {
      id: 'support_code_photo',
      title: '维护码照片',
      status: hasSupportCodePhoto ? 'pass' : hasAnyPhoto ? 'needs_manual_review' : 'missing',
      evidence: hasSupportCodePhoto
        ? `${evidence.supportCodePhotos.length} 张命名含维护码/support/code 的照片`
        : hasAnyPhoto
          ? '找到照片，但文件名不能确认是否为维护码照片'
          : '未找到照片'
    },
    {
      id: 'install_log_or_support_bundle',
      title: 'INSTALL_LOG 或排障包',
      status: hasInstallLogOrSupportBundle ? 'pass' : 'missing',
      evidence: hasInstallLogOrSupportBundle
        ? `${evidence.installLogs.length} 个安装日志，${evidence.supportBundles.length} 个排障包`
        : '未找到 INSTALL_LOG.txt 或 tv-box-support-latest.zip'
    },
    {
      id: 'issue_evidence',
      title: '异常照片/日志/keyCode',
      status: issueEvidenceRequired ? (hasIssueEvidence ? 'pass' : 'missing') : 'not_required',
      evidence: issueEvidenceRequired
        ? hasIssueEvidence
          ? `${evidence.issueEvidence.length} 个异常证据文件`
          : 'JSON 里存在 fail/unknown，但未找到异常照片、日志或 keyCode 文件'
        : '现场 JSON 未出现 fail/unknown'
    },
    {
      id: 'unknown_closure',
      title: 'unknown 闭环',
      status: unknownFields.length === 0 ? 'pass' : 'needs_follow_up',
      evidence: unknownFields.length === 0 ? '没有 unknown 字段' : `${unknownFields.length} 个字段仍是 unknown`
    }
  ]

  return {
    checks,
    problematicFields,
    unknownFields,
    failedFields,
    issueEvidenceRequired
  }
}

function statusAllowsEngineeringImport(status) {
  return status === 'pass' || status === 'not_required'
}

function buildReadiness(checkBundle) {
  const blocking = checkBundle.checks.filter((item) => !statusAllowsEngineeringImport(item.status))
  const hardBlocking = blocking.filter((item) => item.status !== 'needs_manual_review')
  const hasManualReview = checkBundle.checks.some((item) => item.status === 'needs_manual_review')

  if (blocking.length === 0) {
    return {
      level: 'ready_for_engineering_import',
      humanSummary: '现场回传证据齐全，可以导入兼容性矩阵；仍需保留原始照片和日志。'
    }
  }

  if (hardBlocking.length === 0 && hasManualReview) {
    return {
      level: 'needs_manual_photo_review',
      humanSummary: '文件基本到齐，但照片命名无法确认；工程人员需要人工确认维护码照片后再关闭。'
    }
  }

  return {
    level: 'needs_site_follow_up',
    humanSummary: '现场回传证据不完整，需要让现场补发缺失 JSON、维护码照片、日志/排障包或异常证据。'
  }
}

function stageFieldJsons(fieldJsons) {
  const stagedDir = path.join(stagedJsonRoot, stamp())
  fs.mkdirSync(stagedDir, { recursive: true })
  const staged = []
  fieldJsons.forEach((item, index) => {
    const target = path.join(stagedDir, `${String(index + 1).padStart(3, '0')}-${sanitizeName(item.name)}`)
    fs.copyFileSync(item.path, target)
    staged.push(target)
  })
  return { stagedDir, staged }
}

function runFieldInbox(fieldJsons, readiness) {
  if (noFieldInbox || fieldJsons.length === 0) {
    return {
      skipped: true,
      reason: noFieldInbox ? '已设置 --no-field-inbox' : '没有有效现场 JSON',
      exitCode: null,
      command: ''
    }
  }

  if (append && readiness.level !== 'ready_for_engineering_import' && !forceAppend) {
    return {
      skipped: true,
      reason: `已请求 --append，但 readiness=${readiness.level}；补齐证据或负责人确认后加 --force-append`,
      exitCode: null,
      command: ''
    }
  }

  const staged = stageFieldJsons(fieldJsons)
  const fieldInboxArgs = ['./scripts/tv-box-field-inbox.js', staged.stagedDir]
  if (append) fieldInboxArgs.push('--append')
  else {
    fieldInboxArgs.push('--dry-run')
    fieldInboxArgs.push('--no-append')
  }
  if (noAppend && !fieldInboxArgs.includes('--no-append')) fieldInboxArgs.push('--no-append')

  const result = spawnSync('node', fieldInboxArgs, {
    cwd: rootDir,
    env: process.env,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024
  })

  return {
    skipped: false,
    stagedDir: staged.stagedDir,
    stagedJsonCount: staged.staged.length,
    command: `node ${fieldInboxArgs.join(' ')}`,
    mode: append ? 'append' : 'dry_run_no_append',
    exitCode: result.status === null ? 1 : result.status,
    signal: result.signal || '',
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    latestFieldInboxJson: path.join(reportDir, 'tv-box-field-inbox-latest.json'),
    latestFieldInboxMarkdown: path.join(reportDir, 'tv-box-field-inbox-latest.md')
  }
}

function buildClosureDecision(evidence, checkBundle, readiness, fieldInboxRun) {
  const evidenceBlocking = checkBundle.checks.filter((item) => !statusAllowsEngineeringImport(item.status))
  const recordClosures = evidence.fieldJsons.map((item) => item.closure).filter(Boolean)
  const failedRecords = recordClosures.filter((item) => item.status === 'needs_fix')
  const followUpRecords = recordClosures.filter((item) => item.status === 'needs_site_follow_up')
  const importExitCode = fieldInboxRun?.exitCode ?? null
  const importOk = fieldInboxRun?.skipped === true || importExitCode === 0
  let status = 'ready_to_close'
  let humanSummary = '现场回传证据达到关闭判定：遥控器、直播、帮助、退出、维护码、安装证据和摄像头/麦克风可选项都已闭环。'

  if (evidence.fieldJsons.length === 0) {
    status = 'needs_site_follow_up'
    humanSummary = '没有有效现场 JSON，不能关闭；需要现场重新填写并发回。'
  } else if (evidenceBlocking.length > 0) {
    status = 'needs_site_follow_up'
    humanSummary = '现场回传四样证据不完整，不能关闭；需要现场补发缺失照片、日志、排障包或异常证据。'
  } else if (failedRecords.length > 0) {
    status = 'needs_fix'
    humanSummary = '现场证据齐全但存在 fail；应进入工程修复/复测，不能关闭。'
  } else if (followUpRecords.length > 0) {
    status = 'needs_site_follow_up'
    humanSummary = '现场 JSON 仍有 unknown、skip 或关键身份字段为空；需要补测或补填后才能关闭。'
  } else if (!importOk) {
    status = 'needs_site_follow_up'
    humanSummary = '现场证据看起来完整，但 JSON 导入验证失败；先修复导入问题并保留原始回传。'
  }

  const failedFields = recordClosures.flatMap((item) => item.failedFields.map((field) => ({
    file: item.file,
    key: field.key,
    label: field.label,
    value: field.value
  })))
  const followUpFields = recordClosures.flatMap((item) => item.followUpFields.map((field) => ({
    file: item.file,
    key: field.key,
    label: field.label,
    value: field.value
  })))

  return {
    status,
    humanSummary,
    readyToClose: status === 'ready_to_close',
    needsSiteFollowUp: status === 'needs_site_follow_up',
    needsFix: status === 'needs_fix',
    readinessLevel: readiness.level,
    validFieldJsonCount: evidence.fieldJsons.length,
    blockingEvidenceIds: evidenceBlocking.map((item) => item.id),
    failedFieldCount: failedFields.length,
    followUpFieldCount: followUpFields.length,
    failedFields,
    followUpFields,
    recordClosures,
    matrixAppend: {
      requested: append,
      forceAppend,
      dryRunOnly: !append,
      fieldInboxSkipped: fieldInboxRun?.skipped === true,
      fieldInboxMode: fieldInboxRun?.mode || '',
      fieldInboxExitCode: importExitCode,
      note: append
        ? '已按参数尝试写入兼容性矩阵；以 fieldInboxRun 结果为准。'
        : '当前只完成证据质检和 dry-run 导入；确认真实盒子验收后再加 --append 写入矩阵。'
    }
  }
}

function buildNextActions(report) {
  const actions = []
  const byId = Object.fromEntries(report.evidenceChecks.map((item) => [item.id, item]))

  if (report.closure?.status === 'ready_to_close' && !append) {
    actions.push('关闭判定为 ready_to_close；确认是真实盒子现场验收后，运行 npm run tv-box:return-inbox -- <现场回传目录或zip> --append 写入兼容性矩阵。')
  }
  if (report.closure?.status === 'needs_fix') {
    actions.push('关闭判定为 needs_fix；不要关闭项目，先按 fail 字段、异常照片/日志和排障包定位遥控器、直播、摄像头或麦克风问题。')
  }
  if (report.closure?.status === 'needs_site_follow_up') {
    actions.push('关闭判定为 needs_site_follow_up；先让现场补齐缺失证据或把 unknown/skip 改成 pass/fail/na。')
  }

  if (byId.field_json?.status !== 'pass') {
    actions.push('让现场打开 FIELD_WIZARD_OFFLINE.html，下载 JSON 后重新发回。')
  }
  if (byId.support_code_photo?.status === 'missing') {
    actions.push('让现场在 App 帮助/自检页拍一张“维护码”照片。')
  }
  if (byId.support_code_photo?.status === 'needs_manual_review') {
    actions.push('人工打开照片确认是否包含维护码；确认后建议把文件名改成 support-code.jpg 再归档。')
  }
  if (byId.install_log_or_support_bundle?.status !== 'pass') {
    actions.push('让现场补发 INSTALL_LOG.txt；如果安装或摄像头失败，补发 tv-box-support-latest.zip。')
  }
  if (byId.issue_evidence?.status === 'missing') {
    actions.push('JSON 里有 fail/unknown；让现场补发对应黑屏、权限、摄像头或遥控 keyCode 照片/日志。')
  }
  if (byId.unknown_closure?.status === 'needs_follow_up') {
    actions.push('把 unknown 字段改成 pass/fail/skip/na；不能用 unknown 关闭真实盒子验收。')
  }
  if (report.fieldInboxRun.exitCode && report.fieldInboxRun.exitCode !== 0) {
    actions.push('现场 JSON 通过回传扫描但导入 dry-run 失败；打开 tv-box-return-inbox-latest.md 查看 stdout/stderr。')
  }
  if (append && report.fieldInboxRun.skipped && /--force-append/.test(report.fieldInboxRun.reason || '')) {
    actions.push('已阻止追加矩阵；补齐四样证据后重跑 --append，或由负责人确认后使用 --append --force-append。')
  }
  if (actions.length === 0 && !append) {
    actions.push('证据齐全；确认是真实盒子验收后运行 npm run tv-box:return-inbox -- <回传目录或zip> --append。')
  }
  if (actions.length === 0 && append) {
    actions.push('已按 --append 导入；打开 reports/tv-box-compatibility-summary-latest.md 查看推荐/待修复组合。')
  }
  return actions
}

function listRows(items) {
  return items.length
    ? items.map((item) => `| \`${markdownCell(item.relativePath || relative(item.path))}\` | ${item.sizeBytes || 0} |`).join('\n')
    : '| 无 | - |'
}

function writeOutputs(report) {
  fs.mkdirSync(reportDir, { recursive: true })
  fs.writeFileSync(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`)

  const checkRows = report.evidenceChecks.map((item) => (
    `| ${markdownCell(item.id)} | \`${markdownCell(item.status)}\` | ${markdownCell(item.title)} | ${markdownCell(item.evidence)} |`
  )).join('\n')

  const problemRows = report.problematicFields.length
    ? report.problematicFields.map((item) => `| \`${markdownCell(item.file)}\` | \`${markdownCell(item.key)}\` | ${markdownCell(item.label)} | \`${markdownCell(item.value)}\` |`).join('\n')
    : '| 无 | - | - | - |'

  const skippedRows = report.skipped.length
    ? report.skipped.map((item) => `| \`${markdownCell(item.path)}\` | ${markdownCell(item.reason)} |`).join('\n')
    : '| 无 | 无 |'

  const fieldInboxBlock = report.fieldInboxRun.skipped
    ? `- field-inbox: \`skipped\` (${report.fieldInboxRun.reason})`
    : `- field-inbox: \`${report.fieldInboxRun.mode}\`
- exitCode: \`${report.fieldInboxRun.exitCode}\`
- staged JSON: \`${relative(report.fieldInboxRun.stagedDir)}\`
- 最新导入报告: \`${relative(report.fieldInboxRun.latestFieldInboxMarkdown)}\``

  const closureRows = report.closure.recordClosures.length
    ? report.closure.recordClosures.map((item) => `| \`${markdownCell(item.file)}\` | \`${item.status}\` | \`${item.groups.identity.status}\` | \`${item.groups.remoteRequired.status}\` | \`${item.groups.helpShortcut.status}\` | \`${item.groups.cameraAudio.status}\` | ${item.failedFields.length} | ${item.followUpFields.length} |`).join('\n')
    : '| 无 | - | - | - | - | - | - | - |'

  const closureFieldRows = [...report.closure.failedFields, ...report.closure.followUpFields].length
    ? [...report.closure.failedFields, ...report.closure.followUpFields].map((item) => `| \`${markdownCell(item.file)}\` | \`${markdownCell(item.key)}\` | ${markdownCell(item.label)} | \`${markdownCell(item.value)}\` |`).join('\n')
    : '| 无 | - | - | - |'

  const markdown = `# HelloTV 现场回传收件箱质检

- 生成时间 UTC: \`${report.generatedAtUtc}\`
- readiness: \`${report.readiness.level}\`
- 关闭判定: \`${report.closure.status}\`
- 结论: ${report.readiness.humanSummary}
- 关闭结论: ${report.closure.humanSummary}
- 默认收件箱: \`${relative(defaultInboxDir)}\`
- 输入路径: \`${report.inputs.join('`, `') || relative(defaultInboxDir)}\`
- 扫描文件: \`${report.scannedFileCount}\`
- 有效现场 JSON: \`${report.evidence.fieldJsons.length}\`
- rejected JSON: \`${report.evidence.rejectedJsons.length}\`
- strict: \`${report.options.strict}\`
- append: \`${report.options.append}\`

## 4 样证据检查

| id | 状态 | 项目 | 证据 |
| --- | --- | --- | --- |
${checkRows}

## 现场关闭判定

| JSON | 判定 | 身份字段 | 遥控/直播必测 | 帮助快捷键 | 摄像头/麦克风可选项 | fail | 待补 |
| --- | --- | --- | --- | --- | --- | ---: | ---: |
${closureRows}

### 不能关闭的字段

| JSON | 字段 | 含义 | 值 |
| --- | --- | --- | --- |
${closureFieldRows}

## JSON 中需要关注的字段

| JSON | 字段 | 含义 | 值 |
| --- | --- | --- | --- |
${problemRows}

## field-inbox 导入验证

${fieldInboxBlock}

${report.fieldInboxRun.stdout ? `### stdout\n\n\`\`\`text\n${report.fieldInboxRun.stdout.slice(-4000)}\n\`\`\`\n` : ''}
${report.fieldInboxRun.stderr ? `### stderr\n\n\`\`\`text\n${report.fieldInboxRun.stderr.slice(-4000)}\n\`\`\`\n` : ''}

## 文件清单

### 现场 JSON

| 文件 | 字节 |
| --- | ---: |
${listRows(report.evidence.fieldJsons)}

### 维护码照片

| 文件 | 字节 |
| --- | ---: |
${listRows(report.evidence.supportCodePhotos)}

### 通用照片

| 文件 | 字节 |
| --- | ---: |
${listRows(report.evidence.genericImages)}

### 安装日志

| 文件 | 字节 |
| --- | ---: |
${listRows(report.evidence.installLogs)}

### 排障包

| 文件 | 字节 |
| --- | ---: |
${listRows(report.evidence.supportBundles)}

### 异常证据

| 文件 | 字节 |
| --- | ---: |
${listRows(report.evidence.issueEvidence)}

## 跳过文件

| 路径 | 原因 |
| --- | --- |
${skippedRows}

## 下一步

${report.nextActions.map((item) => `- ${item}`).join('\n')}
`
  fs.writeFileSync(outputMarkdownPath, markdown)
}

function main() {
  if (flags.has('--help') || flags.has('-h')) {
    usage()
    return
  }
  if (append && noAppend) {
    console.error('ERROR: 不能同时使用 --append 和 --no-append。')
    process.exit(1)
  }

  fs.mkdirSync(reportDir, { recursive: true })
  fs.mkdirSync(extractedRoot, { recursive: true })
  fs.mkdirSync(stagedJsonRoot, { recursive: true })

  const discovered = discoverInputs()
  const classified = classifyFiles(discovered.files, discovered.skipped)
  const checkBundle = buildEvidenceChecks(classified.evidence)
  const readiness = buildReadiness(checkBundle)
  const fieldInboxRun = runFieldInbox(classified.evidence.fieldJsons, readiness)
  const closure = buildClosureDecision(classified.evidence, checkBundle, readiness, fieldInboxRun)

  const report = {
    generatedAtUtc: new Date().toISOString(),
    projectRoot: rootDir,
    platform: {
      os: `${os.platform()} ${os.release()}`,
      node: process.version
    },
    inputs,
    defaultInboxDir,
    extractedRoot,
    stagedJsonRoot,
    extractedArchives: discovered.extractedArchives,
    scannedFileCount: discovered.files.length,
    options: {
      strict,
      append,
      forceAppend,
      noAppend,
      noFieldInbox,
      keepGoing
    },
    evidence: classified.evidence,
    evidenceChecks: checkBundle.checks,
    problematicFields: checkBundle.problematicFields,
    unknownFields: checkBundle.unknownFields,
    failedFields: checkBundle.failedFields,
    issueEvidenceRequired: checkBundle.issueEvidenceRequired,
    readiness,
    closure,
    fieldInboxRun,
    skipped: classified.skipped,
    artifacts: {
      outputJsonPath,
      outputMarkdownPath,
      fieldInboxJson: path.join(reportDir, 'tv-box-field-inbox-latest.json'),
      fieldInboxMarkdown: path.join(reportDir, 'tv-box-field-inbox-latest.md')
    },
    nextActions: []
  }

  report.nextActions = buildNextActions(report)
  writeOutputs(report)

  console.log(`现场回传收件箱质检已生成: ${outputMarkdownPath}`)
  console.log(`机器可读报告: ${outputJsonPath}`)
  console.log(`readiness: ${readiness.level}`)

  const hasBlocking = checkBundle.checks.some((item) => !statusAllowsEngineeringImport(item.status))
  if (fieldInboxRun.exitCode && fieldInboxRun.exitCode !== 0) process.exit(1)
  if (strict && hasBlocking) process.exit(1)
}

main()
