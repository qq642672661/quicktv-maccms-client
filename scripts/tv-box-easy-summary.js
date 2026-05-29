#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

const rootDir = path.resolve(__dirname, '..')
const reportDir = process.env.REPORT_DIR || path.join(rootDir, 'reports')
const outputJsonPath = process.env.TV_BOX_EASY_SUMMARY_JSON || path.join(reportDir, 'tv-box-easy-run-latest.json')
const outputMarkdownPath = process.env.TV_BOX_EASY_SUMMARY_MD || path.join(reportDir, 'tv-box-easy-run-latest.md')
const inspectionPath = process.env.TV_BOX_INSPECTION_JSON || path.join(reportDir, 'tv-box-inspection-latest.json')
const fieldRecordPath = process.env.TV_BOX_FIELD_RECORD_JSON || path.join(reportDir, 'tv-box-field-record-latest.json')
const compatibilitySummaryPath = process.env.TV_BOX_COMPATIBILITY_SUMMARY_JSON || path.join(reportDir, 'tv-box-compatibility-summary-latest.json')
const preflightPath = process.env.TV_BOX_PREFLIGHT_JSON || path.join(reportDir, 'tv-box-preflight-latest.json')
const handoffHtmlSmokePath = process.env.TV_BOX_HANDOFF_HTML_SMOKE_JSON || path.join(reportDir, 'tv-box-handoff-html-smoke-latest.json')
const remoteSmokePath = process.env.TV_BOX_REMOTE_SMOKE_JSON || path.join(reportDir, 'tv-box-remote-smoke-latest.json')
const fieldScenariosPath = process.env.TV_BOX_FIELD_SCENARIOS_TEST_JSON || path.join(reportDir, 'tv-box-field-scenarios-test-latest.json')
const returnInboxScenariosPath = process.env.TV_BOX_RETURN_INBOX_SCENARIOS_JSON || path.join(reportDir, 'tv-box-return-inbox-scenarios-test-latest.json')
const returnInboxPath = process.env.TV_BOX_RETURN_INBOX_JSON || path.join(reportDir, 'tv-box-return-inbox-latest.json')
const uxAuditPath = process.env.TV_BOX_UX_AUDIT_JSON || path.join(reportDir, 'tv-box-ux-audit-latest.json')
const handoffPathMarker = process.env.HANDOFF_LATEST_PATH_FILE || path.join(reportDir, 'tv-box-handoff-latest-path.txt')
const handoffArchiveMarker = process.env.HANDOFF_LATEST_ARCHIVE_FILE || path.join(reportDir, 'tv-box-handoff-latest-archive.txt')
const supportArchiveMarker = process.env.SUPPORT_LATEST_ARCHIVE_FILE || path.join(reportDir, 'tv-box-support-latest-archive.txt')

function env(name, fallback = '') {
  const value = process.env[name]
  return value === undefined || value === '' ? fallback : value
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

function firstLine(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8').split(/\r?\n/).find(Boolean) || ''
  } catch {
    return ''
  }
}

function fileState(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return {
      path: filePath || '',
      exists: false,
      sizeBytes: 0,
      sha256: ''
    }
  }

  let sha256 = ''
  try {
    const crypto = require('crypto')
    sha256 = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
  } catch {
    sha256 = ''
  }

  return {
    path: filePath,
    exists: true,
    sizeBytes: fs.statSync(filePath).size,
    sha256
  }
}

function boolEnv(name) {
  return ['true', '1', 'yes', 'y', 'on'].includes(String(env(name)).trim().toLowerCase())
}

function count(value) {
  return Array.isArray(value) ? value.length : 0
}

function deriveOperatorStatus(inspection, fieldRecord) {
  if (env('EASY_RUN_RESULT')) return env('EASY_RUN_RESULT')
  if ((inspection?.deviceEvidence || {}).status === 'selected' && fieldRecord?.verdict) return 'completed_needs_manual_acceptance'
  if ((inspection?.deviceEvidence || {}).status === 'no_authorized_device') return 'handoff_ready_needs_box'
  return 'summary_generated'
}

function deriveNextActions(summary, inspection, fieldRecord, compatibility) {
  const actions = []
  const deviceStatus = inspection?.deviceEvidence?.status || ''
  const readinessLevel = inspection?.readiness?.level || ''
  const handoffHtmlSmokeStatus = summary.handoffHtmlSmoke?.status || ''

  if (summary.artifacts.handoffArchive.exists) {
    actions.push('发给现场优先使用 tv-box-handoff-latest.zip；解压后先打开 START_HERE.html。')
  } else {
    actions.push('先运行 npm run tv-box:handoff 生成可发送现场的交付压缩包。')
  }

  if (handoffHtmlSmokeStatus && handoffHtmlSmokeStatus !== 'pass') {
    actions.push('交付网页离线冒烟未通过，先运行 npm run tv-box:handoff-html-smoke 并修复 START_HERE / FIELD_WIZARD_OFFLINE。')
  }

  if (summary.fieldScenariosRegression?.status && summary.fieldScenariosRegression.status !== 'pass') {
    actions.push('现场验收场景回归未通过，先运行 npm run tv-box:field-scenarios-test 并修复分类规则。')
  }

  if (summary.returnInboxScenariosRegression?.status && summary.returnInboxScenariosRegression.status !== 'pass') {
    actions.push('现场回传收件箱场景回归未通过，先运行 npm run tv-box:return-inbox-scenarios-test 并修复证据质检规则。')
  }

  if (summary.returnInboxClosure?.status === 'needs_site_follow_up') {
    actions.push('最新现场回传关闭判定为 needs_site_follow_up；先让现场补发证据或补测 unknown/skip 项。')
  }

  if (summary.returnInboxClosure?.status === 'needs_fix') {
    actions.push('最新现场回传关闭判定为 needs_fix；证据齐全但已有失败项，先工程修复或复测，不能关闭。')
  }

  if (summary.uxAudit?.overall && summary.uxAudit.overall !== 'pass') {
    actions.push('长辈/小孩遥控器 UX 审计未通过，先运行 npm run tv-box:ux-audit 并修复简易首页、帮助、自检、遥控练习或退出确认。')
  }

  if (summary.remoteSmoke?.status === 'fail') {
    actions.push('ADB 遥控器冒烟报告为 fail；先打开 tv-box-remote-smoke-latest.md，看当前 Activity、截图和 logcat 后再修复。')
  }

  if (deviceStatus === 'selected' && !summary.artifacts.remoteSmokeJson.exists) {
    actions.push('真实盒子已授权；可运行 BOX_IP=<盒子IP> npm run tv-box:smoke，生成 ADB 遥控器冒烟截图、焦点和日志证据。')
  }

  if (deviceStatus !== 'selected') {
    actions.push('当前没有已授权真实盒子；到现场后执行 BOX_IP=<盒子IP> RUN_CAMERA_SMOKE=true npm run tv-box:easy。')
  }

  if (fieldRecord?.matrix?.appendRow === false) {
    actions.push('本次 latest 记录未写入累计矩阵；真实验收时补 FIELD_* 字段或设置 FIELD_APPEND_MATRIX=true。')
  }

  if (compatibility?.needsFix?.length > 0) {
    actions.push('兼容性汇总存在 needs_fix 组合，优先保留 support zip、维护码照片和现场备注再修复。')
  }

  if (readinessLevel === 'handoff_ready_needs_box') {
    actions.push('交付包可以先发，但最终结论必须等真实遥控器、摄像头和麦克风验收后再关闭。')
  }

  if (actions.length === 0) {
    actions.push('把推荐组合写入对外交付清单；新增盒子、遥控器、摄像头或麦克风时继续追加矩阵。')
  }

  return actions
}

function markdownArtifactRow(label, artifact, hint = '') {
  const existsText = artifact.exists ? '已生成' : '缺失'
  const sizeText = artifact.exists ? `${artifact.sizeBytes} bytes` : ''
  return `| ${label} | ${existsText} | \`${artifact.path || '未生成'}\` | ${sizeText} | ${hint} |`
}

function main() {
  fs.mkdirSync(reportDir, { recursive: true })

  const inspection = readJson(inspectionPath)
  const fieldRecord = readJson(fieldRecordPath)
  const compatibility = readJson(compatibilitySummaryPath)
  const preflight = readJson(preflightPath)
  const handoffHtmlSmoke = readJson(handoffHtmlSmokePath)
  const remoteSmoke = readJson(remoteSmokePath)
  const fieldScenarios = readJson(fieldScenariosPath)
  const returnInboxScenarios = readJson(returnInboxScenariosPath)
  const returnInbox = readJson(returnInboxPath)
  const uxAudit = readJson(uxAuditPath)
  const handoffDir = env('HANDOFF_DIR', firstLine(handoffPathMarker) || path.join(reportDir, 'tv-box-handoff'))
  const handoffArchivePath = env('HANDOFF_ARCHIVE_PATH', firstLine(handoffArchiveMarker) || path.join(reportDir, 'tv-box-handoff-latest.zip'))
  const supportArchivePath = env('SUPPORT_ARCHIVE_PATH', firstLine(supportArchiveMarker))

  const artifacts = {
    acceptanceReport: fileState(path.join(reportDir, 'tv-box-acceptance-latest.md')),
    inspectionJson: fileState(inspectionPath),
    fieldRecordMarkdown: fileState(path.join(reportDir, 'tv-box-field-record-latest.md')),
    fieldRecordJson: fileState(fieldRecordPath),
    fieldMatrixCsv: fileState(path.join(reportDir, 'tv-box-field-matrix.csv')),
    compatibilitySummaryMarkdown: fileState(path.join(reportDir, 'tv-box-compatibility-summary-latest.md')),
    compatibilitySummaryJson: fileState(compatibilitySummaryPath),
    hardwareProfileMarkdown: fileState(path.join(reportDir, 'tv-box-hardware-profile-latest.md')),
    hardwareProfileJson: fileState(path.join(reportDir, 'tv-box-hardware-profile-latest.json')),
    preflightMarkdown: fileState(path.join(reportDir, 'tv-box-preflight-latest.md')),
    preflightJson: fileState(preflightPath),
    handoffHtmlSmokeMarkdown: fileState(path.join(reportDir, 'tv-box-handoff-html-smoke-latest.md')),
    handoffHtmlSmokeJson: fileState(handoffHtmlSmokePath),
    remoteSmokeMarkdown: fileState(path.join(reportDir, 'tv-box-remote-smoke-latest.md')),
    remoteSmokeJson: fileState(remoteSmokePath),
    remoteSmokeScreenshot: fileState(path.join(reportDir, 'tv-box-remote-smoke-latest.png')),
    fieldScenariosRegressionMarkdown: fileState(path.join(reportDir, 'tv-box-field-scenarios-test-latest.md')),
    fieldScenariosRegressionJson: fileState(fieldScenariosPath),
    returnInboxScenariosRegressionMarkdown: fileState(path.join(reportDir, 'tv-box-return-inbox-scenarios-test-latest.md')),
    returnInboxScenariosRegressionJson: fileState(returnInboxScenariosPath),
    returnInboxMarkdown: fileState(path.join(reportDir, 'tv-box-return-inbox-latest.md')),
    returnInboxJson: fileState(returnInboxPath),
    uxAuditMarkdown: fileState(path.join(reportDir, 'tv-box-ux-audit-latest.md')),
    uxAuditJson: fileState(uxAuditPath),
    handoffDirectory: {
      path: handoffDir,
      exists: fs.existsSync(handoffDir),
      sizeBytes: 0,
      sha256: ''
    },
    handoffArchive: fileState(handoffArchivePath),
    handoffArchiveSha256: fileState(`${handoffArchivePath}.sha256`),
    supportArchive: fileState(supportArchivePath),
    supportArchiveSha256: supportArchivePath ? fileState(`${supportArchivePath}.sha256`) : fileState('')
  }

  const summary = {
    generatedAtUtc: new Date().toISOString(),
    projectRoot: rootDir,
    packageName: env('PACKAGE_NAME', inspection?.packageName || 'com.quicktvui.hellotv'),
    boxIp: env('BOX_IP'),
    deviceSerial: env('DEVICE_SERIAL', inspection?.deviceEvidence?.selectedSerial || ''),
    command: {
      easyInstall: 'BOX_IP=<盒子IP> npm run tv-box:easy',
      easyInstallWithCameraSmoke: 'BOX_IP=<盒子IP> RUN_CAMERA_SMOKE=true npm run tv-box:easy',
      cameraSmokeRequested: boolEnv('RUN_CAMERA_SMOKE') || boolEnv('EASY_RUN_CAMERA_SMOKE')
    },
    status: deriveOperatorStatus(inspection, fieldRecord),
    readiness: {
      level: inspection?.readiness?.level || 'unknown',
      summary: inspection?.readiness?.humanSummary || ''
    },
    device: {
      evidenceStatus: inspection?.deviceEvidence?.status || 'unknown',
      model: inspection?.deviceEvidence?.model || '',
      androidSdk: inspection?.deviceEvidence?.androidSdk || '',
      appInstalled: inspection?.deviceEvidence?.appInstalled === true
    },
    latestFieldRecord: fieldRecord ? {
      recordId: fieldRecord.recordId || '',
      verdict: fieldRecord.verdict || '',
      appendRow: fieldRecord.matrix?.appendRow === true,
      appendReason: fieldRecord.matrix?.appendReason || ''
    } : null,
    compatibility: compatibility ? {
      totalRecords: compatibility.totalRecords || 0,
      recommendedCount: count(compatibility.recommended),
      tvCoreReadyCount: count(compatibility.tvCoreReady),
      needsFixCount: count(compatibility.needsFix),
      needsManualAcceptanceCount: count(compatibility.needsManualAcceptance),
      nextActions: compatibility.nextActions || []
    } : null,
    preflight: preflight ? {
      readiness: preflight.readiness || null,
      nextActions: preflight.nextActions || []
    } : null,
    handoffHtmlSmoke: handoffHtmlSmoke ? {
      status: handoffHtmlSmoke.status || 'unknown',
      checkCount: count(handoffHtmlSmoke.checks),
      errorMessage: handoffHtmlSmoke.error?.message || ''
    } : null,
    remoteSmoke: remoteSmoke ? {
      status: remoteSmoke.status || 'unknown',
      exitCode: remoteSmoke.exitCode ?? null,
      deviceSerial: remoteSmoke.deviceSerial || '',
      scenarioCount: count(remoteSmoke.scenarios),
      keyEventCount: count(remoteSmoke.keyEvents),
      replacesRealRemoteAcceptance: remoteSmoke.boundary?.replacesRealRemoteAcceptance === true,
      replacesC920Acceptance: remoteSmoke.boundary?.replacesC920Acceptance === true,
      crashDetected: remoteSmoke.crashCheck?.crashDetected === true
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
      scenarioCount: count(returnInboxScenarios.scenarios),
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
    artifacts
  }
  summary.nextActions = deriveNextActions(summary, inspection, fieldRecord, compatibility)

  fs.writeFileSync(outputJsonPath, `${JSON.stringify(summary, null, 2)}\n`)

  const markdown = `# HelloTV 一键安装自动沉淀摘要

- 生成时间 UTC: \`${summary.generatedAtUtc}\`
- 状态: \`${summary.status}\`
- readiness: \`${summary.readiness.level}\`
- readiness 摘要: ${summary.readiness.summary || '未生成'}
- 盒子: ${summary.device.model || '未识别'} / SDK ${summary.device.androidSdk || '未知'} / ${summary.device.evidenceStatus}
- 最新兼容性记录: \`${summary.latestFieldRecord?.verdict || 'unknown'}\`
- 累计样本数: \`${summary.compatibility?.totalRecords ?? 0}\`
- 推荐组合: \`${summary.compatibility?.recommendedCount ?? 0}\`
- 待修复组合: \`${summary.compatibility?.needsFixCount ?? 0}\`
- 交付网页离线冒烟: \`${summary.handoffHtmlSmoke?.status || 'unknown'}\` / checks \`${summary.handoffHtmlSmoke?.checkCount ?? 0}\`
- ADB 遥控器冒烟证据: \`${summary.remoteSmoke?.status || 'not_run'}\` / scenarios \`${summary.remoteSmoke?.scenarioCount ?? 0}\` / keyevents \`${summary.remoteSmoke?.keyEventCount ?? 0}\`
- 现场验收场景回归: \`${summary.fieldScenariosRegression?.status || 'unknown'}\` / records \`${summary.fieldScenariosRegression?.totalRecords ?? 0}\`
- 现场回传收件箱场景回归: \`${summary.returnInboxScenariosRegression?.status || 'unknown'}\` / scenarios \`${summary.returnInboxScenariosRegression?.scenarioCount ?? 0}\`
- 现场回传关闭判定: \`${summary.returnInboxClosure?.status || 'unknown'}\`
- 长辈/小孩遥控器 UX 审计: \`${summary.uxAudit?.overall || 'unknown'}\` / failed checks \`${summary.uxAudit?.failedChecks ?? 0}\`

## 傻瓜化交付结论

${summary.nextActions.map((action) => `- ${action}`).join('\n')}

## 自动生成物

| 文件 | 状态 | 路径 | 大小 | 作用 |
| --- | --- | --- | --- | --- |
${[
  markdownArtifactRow('验收报告', artifacts.acceptanceReport, '给工程/现场复核'),
  markdownArtifactRow('机器检查 JSON', artifacts.inspectionJson, '自动判断 readiness 和实机证据'),
  markdownArtifactRow('实机兼容性记录 MD', artifacts.fieldRecordMarkdown, '人可读 latest 记录'),
  markdownArtifactRow('实机兼容性记录 JSON', artifacts.fieldRecordJson, '机器可读 latest 记录'),
  markdownArtifactRow('累计兼容性 CSV', artifacts.fieldMatrixCsv, '长期沉淀盒子/遥控器/摄像头/麦克风组合'),
  markdownArtifactRow('兼容性自动汇总 MD', artifacts.compatibilitySummaryMarkdown, '区分 recommended、needs_fix、待补测'),
  markdownArtifactRow('硬件兼容性画像 MD', artifacts.hardwareProfileMarkdown, '给现场/采购看盒子、遥控器、摄像头和麦克风风险'),
  markdownArtifactRow('安装前预检 MD', artifacts.preflightMarkdown, '现场安装前自检'),
  markdownArtifactRow('交付网页离线冒烟 MD', artifacts.handoffHtmlSmokeMarkdown, '验证 START_HERE 和离线验收表可用'),
  markdownArtifactRow('交付网页离线冒烟 JSON', artifacts.handoffHtmlSmokeJson, '机器可读 smoke 状态和检查项'),
  markdownArtifactRow('ADB 遥控器冒烟 MD', artifacts.remoteSmokeMarkdown, '记录远程 keyevent、Activity、焦点、截图和 logcat；不替代真实遥控器/C920 验收'),
  markdownArtifactRow('ADB 遥控器冒烟 JSON', artifacts.remoteSmokeJson, '机器可读远程冒烟证据'),
  markdownArtifactRow('ADB 遥控器冒烟截图', artifacts.remoteSmokeScreenshot, '远程确认当前电视画面'),
  markdownArtifactRow('现场验收场景回归 MD', artifacts.fieldScenariosRegressionMarkdown, '验证现场分类规则不漂移'),
  markdownArtifactRow('现场验收场景回归 JSON', artifacts.fieldScenariosRegressionJson, '机器可读分类场景结果'),
  markdownArtifactRow('现场回传收件箱场景回归 MD', artifacts.returnInboxScenariosRegressionMarkdown, '验证现场证据质检规则不漂移'),
  markdownArtifactRow('现场回传收件箱场景回归 JSON', artifacts.returnInboxScenariosRegressionJson, '机器可读回传证据场景结果'),
  markdownArtifactRow('现场回传收件箱 MD', artifacts.returnInboxMarkdown, '检查现场四样证据并给出关闭判定'),
  markdownArtifactRow('现场回传收件箱 JSON', artifacts.returnInboxJson, '机器可读 ready_to_close / needs_site_follow_up / needs_fix'),
  markdownArtifactRow('长辈/小孩遥控器 UX 审计 MD', artifacts.uxAuditMarkdown, '验证简易首页、帮助、自检、遥控练习、现场验收和退出确认不漂移'),
  markdownArtifactRow('长辈/小孩遥控器 UX 审计 JSON', artifacts.uxAuditJson, '机器可读 UX 审计结果'),
  markdownArtifactRow('交付目录', artifacts.handoffDirectory, '现场解压后先打开 START_HERE.html'),
  markdownArtifactRow('交付压缩包', artifacts.handoffArchive, '优先发给现场'),
  markdownArtifactRow('交付压缩包 SHA256', artifacts.handoffArchiveSha256, '确认远程传输没损坏'),
  markdownArtifactRow('排障压缩包', artifacts.supportArchive, '失败时发给维护人员')
].join('\n')}

## 现场复测命令

\`\`\`bash
BOX_IP=<盒子IP> RUN_CAMERA_SMOKE=true npm run tv-box:easy
\`\`\`

如果已经在电视前逐项测过，可补充 \`FIELD_*\` 字段后运行 \`npm run tv-box:field-record\`，把真实盒子、遥控器、摄像头和麦克风组合写入累计矩阵。
`

  fs.writeFileSync(outputMarkdownPath, markdown)
  console.log(`TV-box easy install summary written to: ${outputMarkdownPath}`)
  console.log(`Machine-readable easy summary: ${outputJsonPath}`)
}

main()
