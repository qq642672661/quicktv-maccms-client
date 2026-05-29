#!/usr/bin/env node
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const rootDir = path.resolve(__dirname, '..')
const reportDir = process.env.REPORT_DIR || path.join(rootDir, 'reports')
const outputJsonPath = process.env.TV_BOX_RELEASE_LEDGER_JSON || path.join(reportDir, 'tv-box-release-ledger-latest.json')
const outputMarkdownPath = process.env.TV_BOX_RELEASE_LEDGER_MD || path.join(reportDir, 'tv-box-release-ledger-latest.md')
const outputJsonlPath = process.env.TV_BOX_RELEASE_LEDGER_JSONL || path.join(reportDir, 'tv-box-release-ledger.jsonl')
const appendLedger = process.env.TV_BOX_RELEASE_LEDGER_APPEND !== 'false'

function firstLine(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8').split(/\r?\n/).find(Boolean) || ''
  } catch {
    return ''
  }
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

function sha256(filePath) {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
  } catch {
    return ''
  }
}

function fileState(filePath) {
  const exists = Boolean(filePath && fs.existsSync(filePath))
  return {
    path: filePath || '',
    exists,
    sizeBytes: exists ? fs.statSync(filePath).size : 0,
    sha256: exists && fs.statSync(filePath).isFile() ? sha256(filePath) : ''
  }
}

function sidecarSha(filePath) {
  try {
    return fs.readFileSync(`${filePath}.sha256`, 'utf8').trim().split(/\s+/)[0] || ''
  } catch {
    return ''
  }
}

function gitValue(args) {
  try {
    return execFileSync('git', ['-C', rootDir, ...args], { encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

function gitChangeCount() {
  const status = gitValue(['status', '--short'])
  return status ? status.split(/\r?\n/).filter(Boolean).length : 0
}

function latestApkPath() {
  const inspection = readJson(path.join(reportDir, 'tv-box-inspection-latest.json'))
  if (inspection?.apk?.path) return inspection.apk.path
  try {
    return execFileSync('bash', ['-lc', `ls -t ${JSON.stringify(path.join(rootDir, 'android/app/build/outputs/apk/debug'))}/*_debug.apk 2>/dev/null | head -n 1`], { encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

function boolLabel(value) {
  return value ? 'yes' : 'no'
}

function artifactRow(label, artifact) {
  const shaShort = artifact.sha256 ? artifact.sha256.slice(0, 12) : ''
  return `| ${label} | ${boolLabel(artifact.exists)} | ${artifact.sizeBytes || 0} | ${shaShort} | \`${artifact.path || ''}\` |`
}

function actionKey(action) {
  if (/RUN_CAMERA_SMOKE|camera-smoke|摄像头冒烟/.test(action)) return 'camera_easy'
  if (/FIELD_WIZARD_OFFLINE|field-import|现场下载的JSON/.test(action)) return 'field_import'
  if (/FIELD_\*|field-record|累计矩阵|latest 记录/.test(action)) return 'field_record'
  if (/网络调试|RSA/.test(action)) return 'rsa_authorization'
  if (/tv-box-handoff-latest\.zip|START_HERE/.test(action)) return 'handoff_package'
  if (/最终结论|真实遥控器|麦克风验收/.test(action)) return 'closure_boundary'
  return action.trim().replace(/[。.!！\s]+/g, '')
}

function collectNextActions(...groups) {
  const actionMap = new Map()
  for (const action of groups.flat().filter(Boolean)) {
    const key = actionKey(action)
    if (!actionMap.has(key)) actionMap.set(key, action)
  }
  return Array.from(actionMap.values())
}

function appendJsonl(filePath, record) {
  if (!appendLedger) return
  const line = JSON.stringify(record)
  let lastRecord = null
  try {
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean)
    lastRecord = lines.length ? JSON.parse(lines[lines.length - 1]) : null
  } catch {
    lastRecord = null
  }
  if (lastRecord?.releaseId === record.releaseId && lastRecord?.generatedAtUtc === record.generatedAtUtc) return
  fs.appendFileSync(filePath, `${line}\n`)
}

function main() {
  fs.mkdirSync(reportDir, { recursive: true })

  const completionAudit = readJson(path.join(reportDir, 'tv-box-completion-audit-latest.json'))
  const inspection = readJson(path.join(reportDir, 'tv-box-inspection-latest.json'))
  const preflight = readJson(path.join(reportDir, 'tv-box-preflight-latest.json'))
  const compatibility = readJson(path.join(reportDir, 'tv-box-compatibility-summary-latest.json'))
  const easySummary = readJson(path.join(reportDir, 'tv-box-easy-run-latest.json'))
  const fieldRecord = readJson(path.join(reportDir, 'tv-box-field-record-latest.json'))
  const handoffHtmlSmoke = readJson(path.join(reportDir, 'tv-box-handoff-html-smoke-latest.json'))
  const fieldScenarios = readJson(path.join(reportDir, 'tv-box-field-scenarios-test-latest.json'))
  const returnInboxScenarios = readJson(path.join(reportDir, 'tv-box-return-inbox-scenarios-test-latest.json'))
  const returnInbox = readJson(path.join(reportDir, 'tv-box-return-inbox-latest.json'))
  const uxAudit = readJson(path.join(reportDir, 'tv-box-ux-audit-latest.json'))

  const handoffArchivePath = firstLine(path.join(reportDir, 'tv-box-handoff-latest-archive.txt')) || path.join(reportDir, 'tv-box-handoff-latest.zip')
  const supportArchivePath = firstLine(path.join(reportDir, 'tv-box-support-latest-archive.txt')) || path.join(reportDir, 'tv-box-support-latest.zip')
  const apk = fileState(latestApkPath())
  const handoffArchive = fileState(handoffArchivePath)
  const supportArchive = fileState(supportArchivePath)
  const handoffShaSidecar = sidecarSha(handoffArchivePath)
  const supportShaSidecar = sidecarSha(supportArchivePath)
  const releaseId = [
    new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z'),
    apk.sha256 ? apk.sha256.slice(0, 12) : 'noapk'
  ].join('-')

  const nextActions = collectNextActions(
    completionAudit?.nextActions || [],
    inspection?.readiness?.nextActions || [],
    preflight?.nextActions || [],
    easySummary?.nextActions || [],
    fieldScenarios && fieldScenarios.status !== 'pass' ? ['现场验收场景回归未通过，先运行 npm run tv-box:field-scenarios-test 并修复分类规则。'] : [],
    returnInboxScenarios && returnInboxScenarios.status !== 'pass' ? ['现场回传收件箱场景回归未通过，先运行 npm run tv-box:return-inbox-scenarios-test 并修复证据质检规则。'] : [],
    returnInbox?.nextActions || [],
    uxAudit && uxAudit.summary?.overall !== 'pass' ? ['长辈/小孩遥控器 UX 审计未通过，先运行 npm run tv-box:ux-audit 并修复失败检查项。'] : []
  )

  const record = {
    releaseId,
    generatedAtUtc: new Date().toISOString(),
    projectRoot: rootDir,
    packageName: inspection?.packageName || completionAudit?.packageName || 'com.quicktvui.hellotv',
    git: {
      branch: gitValue(['branch', '--show-current']),
      commit: gitValue(['rev-parse', '--short', 'HEAD']),
      worktreeChangeCount: gitChangeCount()
    },
    readiness: inspection?.readiness || null,
    preflight: preflight ? { verdict: preflight.verdict, readiness: preflight.readiness || null } : null,
    completion: completionAudit ? { auditScope: completionAudit.auditScope, summary: completionAudit.summary } : null,
    compatibility: compatibility ? {
      totalRecords: compatibility.totalRecords || 0,
      recommendedCount: (compatibility.recommended || []).length,
      needsFixCount: (compatibility.needsFix || []).length,
      needsMoreEvidenceCount: (compatibility.needsMoreEvidence || []).length
    } : null,
    fieldRecord: fieldRecord ? {
      verdict: fieldRecord.verdict || '',
      appendRow: fieldRecord.matrix?.appendRow === true,
      checks: fieldRecord.checks || {}
    } : null,
    handoffHtmlSmoke: handoffHtmlSmoke ? {
      status: handoffHtmlSmoke.status || 'unknown',
      checkCount: (handoffHtmlSmoke.checks || []).length,
      errorMessage: handoffHtmlSmoke.error?.message || ''
    } : null,
    fieldScenariosRegression: fieldScenarios ? {
      status: fieldScenarios.status || 'unknown',
      totalRecords: fieldScenarios.summary?.totalRecords || 0,
      recommendedCount: fieldScenarios.summary?.recommendedCount || 0,
      tvCoreReadyCount: fieldScenarios.summary?.tvCoreReadyCount || 0,
      needsFixCount: fieldScenarios.summary?.needsFixCount || 0,
      needsManualAcceptanceCount: fieldScenarios.summary?.needsManualAcceptanceCount || 0
    } : null,
    returnInboxScenariosRegression: returnInboxScenarios ? {
      status: returnInboxScenarios.status || 'unknown',
      scenarioCount: (returnInboxScenarios.scenarios || []).length,
      scenarioIds: (returnInboxScenarios.scenarios || []).map((scenario) => scenario.id).filter(Boolean)
    } : null,
    returnInboxClosure: returnInbox ? {
      readiness: returnInbox.readiness?.level || 'unknown',
      status: returnInbox.closure?.status || 'unknown',
      failedFieldCount: returnInbox.closure?.failedFieldCount || 0,
      followUpFieldCount: returnInbox.closure?.followUpFieldCount || 0,
      append: returnInbox.options?.append === true
    } : null,
    uxAudit: uxAudit ? {
      overall: uxAudit.summary?.overall || 'unknown',
      pass: uxAudit.summary?.pass || 0,
      fail: uxAudit.summary?.fail || 0,
      failedChecks: uxAudit.summary?.failedChecks || 0
    } : null,
    artifacts: {
      apk,
      handoffArchive: { ...handoffArchive, sidecarSha256: handoffShaSidecar, sha256MatchesSidecar: handoffArchive.exists && handoffArchive.sha256 === handoffShaSidecar },
      supportArchive: { ...supportArchive, sidecarSha256: supportShaSidecar, sha256MatchesSidecar: supportArchive.exists && supportArchive.sha256 === supportShaSidecar },
      handoffDirectory: fileState(path.join(reportDir, 'tv-box-handoff')),
      handoffHtmlSmokeJson: fileState(path.join(reportDir, 'tv-box-handoff-html-smoke-latest.json')),
      handoffHtmlSmokeMarkdown: fileState(path.join(reportDir, 'tv-box-handoff-html-smoke-latest.md')),
      fieldScenariosRegressionJson: fileState(path.join(reportDir, 'tv-box-field-scenarios-test-latest.json')),
      fieldScenariosRegressionMarkdown: fileState(path.join(reportDir, 'tv-box-field-scenarios-test-latest.md')),
      returnInboxScenariosRegressionJson: fileState(path.join(reportDir, 'tv-box-return-inbox-scenarios-test-latest.json')),
      returnInboxScenariosRegressionMarkdown: fileState(path.join(reportDir, 'tv-box-return-inbox-scenarios-test-latest.md')),
      uxAuditJson: fileState(path.join(reportDir, 'tv-box-ux-audit-latest.json')),
      uxAuditMarkdown: fileState(path.join(reportDir, 'tv-box-ux-audit-latest.md')),
      completionAuditJson: fileState(path.join(reportDir, 'tv-box-completion-audit-latest.json')),
      supportBundleDirectory: fileState(firstLine(path.join(reportDir, 'tv-box-support-latest-path.txt')))
    },
    nextActions
  }

  fs.writeFileSync(outputJsonPath, `${JSON.stringify(record, null, 2)}\n`)
  appendJsonl(outputJsonlPath, record)

  const readinessLevel = record.readiness?.level || 'unknown'
  const completionOverall = record.completion?.summary?.overall || 'unknown'
  const markdown = `# HelloTV 电视盒子交付台账

- releaseId: \`${record.releaseId}\`
- 生成时间 UTC: \`${record.generatedAtUtc}\`
- 包名: \`${record.packageName}\`
- Git: \`${record.git.branch || 'unknown'} @ ${record.git.commit || 'unknown'}\`
- 工作区变更数: \`${record.git.worktreeChangeCount}\`
- readiness: \`${readinessLevel}\`
- completion overall: \`${completionOverall}\`
- compatibility records: \`${record.compatibility?.totalRecords ?? 0}\`
- handoff HTML smoke: \`${record.handoffHtmlSmoke?.status || 'unknown'}\` / checks \`${record.handoffHtmlSmoke?.checkCount ?? 0}\`
- field scenarios regression: \`${record.fieldScenariosRegression?.status || 'unknown'}\` / records \`${record.fieldScenariosRegression?.totalRecords ?? 0}\`
- return inbox scenarios regression: \`${record.returnInboxScenariosRegression?.status || 'unknown'}\` / scenarios \`${record.returnInboxScenariosRegression?.scenarioCount ?? 0}\`
- return inbox closure: \`${record.returnInboxClosure?.status || 'unknown'}\`
- elder/child UX audit: \`${record.uxAudit?.overall || 'unknown'}\` / failed checks \`${record.uxAudit?.failedChecks ?? 0}\`

## 结论

${record.readiness?.humanSummary || '暂无 readiness 摘要。'}

${completionOverall === 'complete'
  ? '完成度审计显示所有要求已有证据支撑。'
  : '当前台账可用于发包和远程排障追踪；真实盒子授权、安装、遥控器、摄像头和麦克风验收仍需现场证据。'}

## 核心产物

| 产物 | 存在 | 字节 | SHA256 前 12 位 | 路径 |
| --- | --- | ---: | --- | --- |
${artifactRow('Debug APK', record.artifacts.apk)}
${artifactRow('交付压缩包', record.artifacts.handoffArchive)}
${artifactRow('排障压缩包', record.artifacts.supportArchive)}
${artifactRow('交付网页离线冒烟 JSON', record.artifacts.handoffHtmlSmokeJson)}
${artifactRow('交付网页离线冒烟 MD', record.artifacts.handoffHtmlSmokeMarkdown)}
${artifactRow('现场验收场景回归 JSON', record.artifacts.fieldScenariosRegressionJson)}
${artifactRow('现场验收场景回归 MD', record.artifacts.fieldScenariosRegressionMarkdown)}
${artifactRow('现场回传收件箱场景回归 JSON', record.artifacts.returnInboxScenariosRegressionJson)}
${artifactRow('现场回传收件箱场景回归 MD', record.artifacts.returnInboxScenariosRegressionMarkdown)}
${artifactRow('长辈/小孩遥控器 UX 审计 JSON', record.artifacts.uxAuditJson)}
${artifactRow('长辈/小孩遥控器 UX 审计 MD', record.artifacts.uxAuditMarkdown)}
${artifactRow('完成度审计 JSON', record.artifacts.completionAuditJson)}

## 校验

- 交付压缩包 SHA sidecar 匹配: \`${record.artifacts.handoffArchive.sha256MatchesSidecar}\`
- 排障压缩包 SHA sidecar 匹配: \`${record.artifacts.supportArchive.sha256MatchesSidecar}\`
- 交付网页离线冒烟状态: \`${record.handoffHtmlSmoke?.status || 'unknown'}\`
- 现场验收场景回归状态: \`${record.fieldScenariosRegression?.status || 'unknown'}\`
- 现场回传收件箱场景回归状态: \`${record.returnInboxScenariosRegression?.status || 'unknown'}\`
- 长辈/小孩遥控器 UX 审计状态: \`${record.uxAudit?.overall || 'unknown'}\`
- 交付包内审计范围: \`handoff_package\`
- 排障包内审计范围: \`support_bundle\`
- 根目录审计范围: \`${record.completion?.auditScope || 'unknown'}\`

## 下一步

${record.nextActions.length ? record.nextActions.map((item) => `- ${item}`).join('\n') : '- 暂无。'}
`
  fs.writeFileSync(outputMarkdownPath, markdown)

  console.log(`TV-box release ledger written to: ${outputMarkdownPath}`)
  console.log(`Machine-readable release ledger: ${outputJsonPath}`)
  if (appendLedger) console.log(`Append-only release ledger: ${outputJsonlPath}`)
}

main()
