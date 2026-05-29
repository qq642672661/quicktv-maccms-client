#!/usr/bin/env node
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const rootDir = path.resolve(__dirname, '..')
const reportDir = process.env.REPORT_DIR || path.join(rootDir, 'reports')
const scope = process.env.TV_BOX_COMMAND_CENTER_SCOPE || 'final_delivery'
const outputJsonPath = process.env.TV_BOX_COMMAND_CENTER_JSON || path.join(reportDir, 'tv-box-command-center-latest.json')
const outputMarkdownPath = process.env.TV_BOX_COMMAND_CENTER_MD || path.join(reportDir, 'tv-box-command-center-latest.md')

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

function sha256(filePath) {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
  } catch {
    return ''
  }
}

function sidecarSha(filePath) {
  try {
    return fs.readFileSync(`${filePath}.sha256`, 'utf8').trim().split(/\s+/)[0] || ''
  } catch {
    return ''
  }
}

function fileState(filePath) {
  const exists = Boolean(filePath && fs.existsSync(filePath))
  const isFile = exists && fs.statSync(filePath).isFile()
  const ownSha = isFile ? sha256(filePath) : ''
  const sidecar = isFile ? sidecarSha(filePath) : ''
  return {
    path: filePath || '',
    exists,
    sizeBytes: exists ? fs.statSync(filePath).size : 0,
    sha256: ownSha,
    sidecarSha256: sidecar,
    sha256MatchesSidecar: Boolean(ownSha && sidecar && ownSha === sidecar)
  }
}

function unique(values) {
  const seen = new Set()
  const output = []
  for (const value of values.filter(Boolean)) {
    const key = String(value).trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    output.push(key)
  }
  return output
}

function actionKey(action) {
  const text = String(action || '')
  if (/RUN_CAMERA_SMOKE|camera-smoke|摄像头冒烟|摄像头\/麦克风/.test(text)) return 'run_easy_with_camera'
  if (/BOX_IP=.*tv-box:easy|安装、启动|安装并启动/.test(text)) return 'run_easy'
  if (/FIELD_WIZARD_OFFLINE|field-import|现场下载的JSON|下载 JSON/.test(text)) return 'field_import'
  if (/field-inbox|多份 JSON|收件箱|多人多盒/.test(text)) return 'field_inbox'
  if (/return-inbox|回传收件箱|维护码照片|INSTALL_LOG/.test(text)) return 'return_inbox'
  if (/FIELD_\*|field-record|累计矩阵|latest 记录/.test(text)) return 'field_record'
  if (/网络调试|RSA|授权/.test(text)) return 'rsa_authorization'
  if (/tv-box-handoff-latest\.zip|START_HERE|交付包/.test(text)) return 'handoff_package'
  if (/最终结论|真实遥控器|不能把真实盒子|关闭/.test(text)) return 'closure_boundary'
  if (/dry-run|no-run/.test(text)) return 'dry_run_note'
  return text.trim().replace(/[。.!！\s]+/g, '')
}

function collectNextActions(...groups) {
  const actionMap = new Map()
  for (const action of groups.flat().filter(Boolean)) {
    const key = actionKey(action)
    if (!actionMap.has(key)) actionMap.set(key, action)
  }
  return Array.from(actionMap.values())
}

function countByStatus(requirements) {
  return requirements.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1
    return acc
  }, {})
}

function escapeCell(value) {
  return String(value || '').replace(/\|/g, '/').replace(/\r?\n/g, '<br>')
}

function artifactRow(label, artifact, use) {
  const status = artifact.exists ? '已生成' : '缺失'
  const sha = artifact.sha256 || artifact.sidecarSha256 || ''
  return `| ${label} | ${status} | ${artifact.sizeBytes || 0} | ${sha ? sha.slice(0, 16) : ''} | \`${escapeCell(artifact.path)}\` | ${use} |`
}

function requirementRow(item) {
  return `| ${escapeCell(item.id)} | \`${escapeCell(item.status)}\` | ${escapeCell(item.title)} | ${escapeCell(item.nextAction || item.evidence || '')} |`
}

function buildRoleNextActions(state) {
  if (state.returnInbox?.closureStatus === 'needs_fix') {
    return {
      projectOwner: '不要关闭项目；把这次现场回传标成待修复复测。',
      siteInstaller: '保持盒子、摄像头和麦克风现状，补发失败画面、维护码照片和排障包。',
      engineer: '打开 tv-box-return-inbox-latest.md，按 fail 字段、异常照片/日志和 support zip 定位修复。'
    }
  }

  if (state.returnInbox?.closureStatus === 'ready_to_close' && state.returnInbox?.append !== true) {
    return {
      projectOwner: '现场证据已达到关闭判定，要求工程人员写入兼容性矩阵后复跑总检查。',
      siteInstaller: '无需重复测试；保留原始回传 zip、维护码照片和 INSTALL_LOG/support zip。',
      engineer: '确认是真实盒子验收后运行 npm run tv-box:return-inbox -- <现场回传目录或zip> --append，再跑 npm run tv-box:check。'
    }
  }

  if (state.evidence.canClose) {
    return {
      projectOwner: '复跑 npm run tv-box:check，通过后按交付台账关闭。',
      siteInstaller: '无需继续现场安装，保留最终验收记录和维护码照片。',
      engineer: '归档 release ledger、handoff zip、support zip 和真实盒子兼容性矩阵。'
    }
  }

  if (state.deviceEvidence?.status === 'selected') {
    return {
      projectOwner: '让工程人员跑最终实机验收，成功后再判断是否关闭。',
      siteInstaller: '保持电视盒子在线，不要拔掉摄像头/麦克风，按屏幕权限弹窗选择允许。',
      engineer: '执行 BOX_IP=<盒子IP> RUN_CAMERA_SMOKE=true npm run tv-box:easy，并把现场 JSON 导入矩阵。'
    }
  }

  if (state.evidence.canHandoff) {
    return {
      projectOwner: '现在可以先发交付包，但不能关闭项目。',
      siteInstaller: '解压交付包后只打开 START_HERE.html，按页面提示安装和验收。',
      engineer: '等现场发回文件夹或 zip；先运行 tv-box:return-inbox 做证据质检，再按报告导入现场 JSON。'
    }
  }

  return {
    projectOwner: '先让工程人员生成交付包。',
    siteInstaller: '等待工程人员提供 tv-box-handoff-latest.zip。',
    engineer: '执行 npm run tv-box:check，修复缺失产物后再发包。'
  }
}

function buildPrimaryNextAction(state) {
  const roleNextActions = buildRoleNextActions(state)
  const reason = state.evidence.canClose
    ? '所有完成度要求已有证据。'
    : state.deviceEvidence?.status === 'selected'
      ? '已有授权设备，下一步应跑真实盒子验收。'
      : state.evidence.canHandoff
        ? '交付包和排障包已生成，但真实盒子证据缺失。'
        : '交付包还没有达到可发送状态。'

  return {
    status: state.evidence.canClose ? 'can_close' : state.evidence.canHandoff ? 'can_handoff_needs_box' : 'needs_engineering_fix',
    reason,
    projectOwner: roleNextActions.projectOwner,
    siteInstaller: roleNextActions.siteInstaller,
    engineer: roleNextActions.engineer
  }
}

function buildActionCards(state) {
  const handoffPath = state.artifacts.handoffArchive.path || 'reports/tv-box-handoff-latest.zip'
  const supportPath = state.artifacts.supportArchive.path || 'reports/tv-box-support-latest.zip'
  const actions = [
    {
      audience: '项目负责人/现场安装人员/工程维护人员',
      title: '先看现场开工判定卡',
      command: '双击 SITE_READINESS_CARD.html，或查看 reports/tv-box-site-readiness-latest.md',
      details: [
        '它会把当前状态压成一页：可发包、要授权、可安装、要补证据或要工程修复。',
        '真实盒子未授权时不要反复安装；先处理网络调试、盒子 IP 和 RSA 授权。'
      ]
    },
    {
      audience: '现场安装人员',
      title: '先发交付包，解压后只打开 START_HERE.html',
      command: '不需要命令；双击 START_HERE.html',
      details: [
        `交付包: ${handoffPath}`,
        `SHA256: ${state.artifacts.handoffArchive.sidecarSha256 || state.artifacts.handoffArchive.sha256 || '未生成'}`,
        '安装前按 PRE_INSTALL_CHECKLIST.zh-CN.md 检查同网、IP、网络调试和 RSA 授权。'
      ]
    },
    {
      audience: '现场安装人员',
      title: '测完真实盒子后，离线填写验收表并下载 JSON',
      command: '双击 FIELD_WIZARD_OFFLINE.html',
      details: [
        '按大按钮选择通过/失败/跳过/不适用/未知。',
        'App 安装到电视盒子后，也可以在帮助/自检页按 5 打开电视端现场验收指引。',
        '下载 JSON 后发给工程人员，避免手写 FIELD_* 字段。'
      ]
    },
    {
      audience: '工程维护人员',
      title: '改动简易首页或遥控器前后跑 UX 审计',
      command: 'npm run tv-box:ux-audit',
      details: [
        '它会检查长辈/小孩路径：简易首页、帮助/自检、遥控练习、现场验收、摄像头、直播救援、复杂页救援和退出确认。',
        '该审计只证明源码与交付卡没有漂移；真实焦点、摄像头预览、麦克风和 USB 热插拔仍按现场验收闭环。'
      ]
    },
    {
      audience: '现场安装人员',
      title: '发回证据前先打开现场回传卡',
      command: '双击 FIELD_RETURN_CARD.html',
      details: [
        '按“必须发回 4 样”检查现场 JSON、维护码照片、INSTALL_LOG/support zip 和异常照片。',
        '没有摄像头或麦克风时填 na，没有测填 skip，失败填 fail；不要把应补测项目留成 unknown。'
      ]
    },
    {
      audience: '现场安装人员',
      title: '把回传证据放进 FIELD_RETURN 后一键打包',
      command: '双击 PACK_FIELD_RETURN_ON_WINDOWS.bat 或 PACK_FIELD_RETURN_ON_MAC.command',
      details: [
        '把现场 JSON、维护码照片、INSTALL_LOG/support zip、异常照片或日志放进 FIELD_RETURN 文件夹。',
        '生成的 HelloTV-field-return-*.zip 直接发给工程人员，不要分开发散件。'
      ]
    },
    {
      audience: '工程维护人员',
      title: '拿到现场回传文件夹或 zip 后先质检',
      command: 'npm run tv-box:return-inbox -- <现场回传目录或zip>',
      details: [
        '它会检查 JSON、维护码照片、INSTALL_LOG/support zip、异常照片/日志是否齐全。',
        '同时输出 closure.status：ready_to_close 表示证据可关闭，needs_site_follow_up 表示要现场补发/补测，needs_fix 表示证据齐全但要工程修复。',
        '默认只 dry-run 验证 JSON 导入，不写累计矩阵；确认是真实盒子验收后再加 --append。'
      ]
    },
    {
      audience: '工程维护人员',
      title: '只拿到单个现场 JSON 时导入兼容性矩阵',
      command: 'npm run tv-box:field-import -- <现场下载的JSON>',
      details: [
        '导入后再运行 npm run tv-box:compatibility-summary 查看 recommended / needs_fix。',
        '真实盒子验收未完成前不要把 readiness 改成完成。'
      ]
    },
    {
      audience: '工程维护人员',
      title: '多人多盒复测时批量导入收件箱',
      command: 'npm run tv-box:field-inbox',
      details: [
        '把多个 FIELD_WIZARD_OFFLINE.html 下载的 JSON 放入 reports/tv-box-field-inbox/。',
        '需要先检查不写入矩阵时用 npm run tv-box:field-inbox -- --dry-run --no-append。'
      ]
    },
    {
      audience: '工程维护人员',
      title: '现场失败时收排障包',
      command: 'BOX_IP=<盒子IP> npm run tv-box:support',
      details: [
        `排障包: ${supportPath}`,
        `SHA256: ${state.artifacts.supportArchive.sidecarSha256 || state.artifacts.supportArchive.sha256 || '未生成'}`,
        '同时保留 INSTALL_LOG.txt、电视屏幕照片和 App 内维护码。'
      ]
    },
    {
      audience: '工程维护人员',
      title: '有盒子时跑最终一键实机验收',
      command: 'BOX_IP=<盒子IP> RUN_CAMERA_SMOKE=true npm run tv-box:easy',
      details: [
        '这一步会安装、启动、跑遥控器冒烟、摄像头冒烟并抓取日志。',
        '只有真实盒子结果写入矩阵后，才具备最终关闭条件。'
      ]
    }
  ]

  if (state.readiness?.level === 'complete' || state.completion?.overall === 'complete') {
    actions.unshift({
      audience: '项目负责人',
      title: '当前证据显示可进入交付关闭复核',
      command: 'npm run tv-box:check',
      details: ['确认最新门禁通过、现场矩阵有真实盒子记录、交付包和排障包 SHA 已留档。']
    })
  }

  return actions
}

function main() {
  fs.mkdirSync(reportDir, { recursive: true })

  const inspection = readJson(path.join(reportDir, 'tv-box-inspection-latest.json'))
  const preflight = readJson(path.join(reportDir, 'tv-box-preflight-latest.json'))
  const completionAudit = readJson(path.join(reportDir, 'tv-box-completion-audit-latest.json'))
  const easySummary = readJson(path.join(reportDir, 'tv-box-easy-run-latest.json'))
  const releaseLedger = readJson(path.join(reportDir, 'tv-box-release-ledger-latest.json'))
  const handoffHtmlSmoke = readJson(path.join(reportDir, 'tv-box-handoff-html-smoke-latest.json'))
  const fieldScenarios = readJson(path.join(reportDir, 'tv-box-field-scenarios-test-latest.json'))
  const returnInboxScenarios = readJson(path.join(reportDir, 'tv-box-return-inbox-scenarios-test-latest.json'))
  const uxAudit = readJson(path.join(reportDir, 'tv-box-ux-audit-latest.json'))
  const fieldInbox = readJson(path.join(reportDir, 'tv-box-field-inbox-latest.json'))
  const returnInbox = readJson(path.join(reportDir, 'tv-box-return-inbox-latest.json'))
  const siteReadiness = readJson(path.join(reportDir, 'tv-box-site-readiness-latest.json'))

  const handoffDir = firstLine(path.join(reportDir, 'tv-box-handoff-latest-path.txt')) || path.join(reportDir, 'tv-box-handoff')
  const handoffArchivePath = firstLine(path.join(reportDir, 'tv-box-handoff-latest-archive.txt')) || path.join(reportDir, 'tv-box-handoff-latest.zip')
  const supportDir = firstLine(path.join(reportDir, 'tv-box-support-latest-path.txt')) || ''
  const supportArchivePath = firstLine(path.join(reportDir, 'tv-box-support-latest-archive.txt')) || path.join(reportDir, 'tv-box-support-latest.zip')

  const requirements = completionAudit?.requirements || []
  const openRequirements = requirements.filter((item) => item.status !== 'proven')
  const readiness = inspection?.readiness || releaseLedger?.readiness || completionAudit?.readiness || null
  const deviceEvidence = inspection?.deviceEvidence || null

  const state = {
    generatedAtUtc: new Date().toISOString(),
    scope,
    projectRoot: rootDir,
    packageName: inspection?.packageName || releaseLedger?.packageName || 'com.quicktvui.hellotv',
    releaseId: releaseLedger?.releaseId || '',
    readiness,
    deviceEvidence: deviceEvidence ? {
      status: deviceEvidence.status || 'unknown',
      selectedSerial: deviceEvidence.selectedSerial || '',
      devices: deviceEvidence.devices || []
    } : null,
    preflight: preflight ? {
      verdict: preflight.verdict || '',
      nextActions: preflight.nextActions || []
    } : null,
    completion: completionAudit ? {
      auditScope: completionAudit.auditScope || '',
      overall: completionAudit.summary?.overall || '',
      counts: completionAudit.summary?.counts || countByStatus(requirements)
    } : null,
    handoffHtmlSmoke: handoffHtmlSmoke ? {
      status: handoffHtmlSmoke.status || 'unknown',
      checkCount: (handoffHtmlSmoke.checks || []).length
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
    uxAudit: uxAudit ? {
      overall: uxAudit.summary?.overall || 'unknown',
      pass: uxAudit.summary?.pass || 0,
      fail: uxAudit.summary?.fail || 0,
      failedChecks: uxAudit.summary?.failedChecks || 0
    } : null,
    fieldInbox: fieldInbox ? {
      acceptedJsonFiles: fieldInbox.summary?.acceptedJsonFiles ?? fieldInbox.acceptedFiles?.length ?? 0,
      successfulImports: fieldInbox.summary?.successfulImports ?? 0,
      failedImports: fieldInbox.summary?.failedImports ?? 0,
      classificationCounts: fieldInbox.summary?.classificationCounts || {},
      isDryRun: fieldInbox.options?.dryRun === true || fieldInbox.options?.noRun === true
    } : null,
    returnInbox: returnInbox ? {
      readiness: returnInbox.readiness?.level || 'unknown',
      closureStatus: returnInbox.closure?.status || 'unknown',
      closureSummary: returnInbox.closure?.humanSummary || '',
      failedFieldCount: returnInbox.closure?.failedFieldCount || 0,
      followUpFieldCount: returnInbox.closure?.followUpFieldCount || 0,
      fieldJsons: returnInbox.evidence?.fieldJsons?.length || 0,
      missingEvidence: (returnInbox.evidenceChecks || []).filter((item) => item.status === 'missing').map((item) => item.id),
      needsFollowUp: (returnInbox.evidenceChecks || []).filter((item) => /needs_/.test(item.status)).map((item) => item.id),
      append: returnInbox.options?.append === true
    } : null,
    siteReadiness: siteReadiness ? {
      status: siteReadiness.stage?.status || 'unknown',
      title: siteReadiness.stage?.title || '',
      summary: siteReadiness.stage?.summary || ''
    } : null,
    artifacts: {
      apk: releaseLedger?.artifacts?.apk || inspection?.apk || fileState(''),
      handoffDirectory: fileState(handoffDir),
      startHereHtml: fileState(path.join(handoffDir, 'START_HERE.html')),
      operationCardHtml: fileState(path.join(handoffDir, 'OPERATION_CARD.html')),
      fieldReturnCardHtml: fileState(path.join(handoffDir, 'FIELD_RETURN_CARD.html')),
      fieldReturnCardMarkdown: fileState(path.join(handoffDir, 'FIELD_RETURN_CARD.zh-CN.md')),
      offlineFieldWizardHtml: fileState(path.join(handoffDir, 'FIELD_WIZARD_OFFLINE.html')),
      handoffArchive: releaseLedger?.artifacts?.handoffArchive || fileState(handoffArchivePath),
      supportDirectory: fileState(supportDir),
      supportArchive: releaseLedger?.artifacts?.supportArchive || fileState(supportArchivePath),
      completionAuditJson: fileState(path.join(reportDir, 'tv-box-completion-audit-latest.json')),
      releaseLedgerJson: fileState(path.join(reportDir, 'tv-box-release-ledger-latest.json')),
      easySummaryJson: fileState(path.join(reportDir, 'tv-box-easy-run-latest.json')),
      hardwareProfileMarkdown: fileState(path.join(reportDir, 'tv-box-hardware-profile-latest.md')),
      hardwareProfileJson: fileState(path.join(reportDir, 'tv-box-hardware-profile-latest.json')),
      handoffHtmlSmokeJson: fileState(path.join(reportDir, 'tv-box-handoff-html-smoke-latest.json')),
      uxAuditJson: fileState(path.join(reportDir, 'tv-box-ux-audit-latest.json')),
      uxAuditMarkdown: fileState(path.join(reportDir, 'tv-box-ux-audit-latest.md')),
      fieldScenariosRegressionJson: fileState(path.join(reportDir, 'tv-box-field-scenarios-test-latest.json')),
      fieldScenariosRegressionMarkdown: fileState(path.join(reportDir, 'tv-box-field-scenarios-test-latest.md')),
      returnInboxScenariosRegressionJson: fileState(path.join(reportDir, 'tv-box-return-inbox-scenarios-test-latest.json')),
      returnInboxScenariosRegressionMarkdown: fileState(path.join(reportDir, 'tv-box-return-inbox-scenarios-test-latest.md')),
      returnInboxJson: fileState(path.join(reportDir, 'tv-box-return-inbox-latest.json')),
      returnInboxMarkdown: fileState(path.join(reportDir, 'tv-box-return-inbox-latest.md')),
      siteReadinessMarkdown: fileState(path.join(reportDir, 'tv-box-site-readiness-latest.md')),
      siteReadinessJson: fileState(path.join(reportDir, 'tv-box-site-readiness-latest.json')),
      siteReadinessHtml: fileState(path.join(reportDir, 'tv-box-site-readiness-card.html')),
      fieldInboxJson: fileState(path.join(reportDir, 'tv-box-field-inbox-latest.json')),
      fieldInboxMarkdown: fileState(path.join(reportDir, 'tv-box-field-inbox-latest.md'))
    },
    evidence: {
      requirementCounts: countByStatus(requirements),
      openRequirements,
      canHandoff: readiness?.canHandoff === true || Boolean(releaseLedger?.artifacts?.handoffArchive?.exists),
      canClose: openRequirements.length === 0 && (readiness?.level === 'complete' || completionAudit?.summary?.overall === 'complete')
    },
    upstreamNextActions: collectNextActions(
      ...(completionAudit?.nextActions || []),
      ...(releaseLedger?.nextActions || []),
      ...(easySummary?.nextActions || []),
      ...(returnInbox?.nextActions || []),
      ...(fieldInbox && !(fieldInbox.options?.dryRun || fieldInbox.options?.noRun) ? fieldInbox.nextActions || [] : []),
      ...(preflight?.nextActions || []),
      ...(readiness?.nextActions || []),
      ...(fieldScenarios && fieldScenarios.status !== 'pass' ? ['现场验收场景回归未通过，先运行 npm run tv-box:field-scenarios-test 并修复分类规则。'] : []),
      ...(returnInboxScenarios && returnInboxScenarios.status !== 'pass' ? ['现场回传收件箱场景回归未通过，先运行 npm run tv-box:return-inbox-scenarios-test 并修复证据质检规则。'] : []),
      ...(uxAudit && uxAudit.summary?.overall !== 'pass' ? ['长辈/小孩遥控器 UX 审计未通过，先运行 npm run tv-box:ux-audit 并修复简易首页、帮助、自检、遥控练习、现场验收或退出确认。'] : [])
    ),
    sources: {
      inspection: path.join(reportDir, 'tv-box-inspection-latest.json'),
      preflight: path.join(reportDir, 'tv-box-preflight-latest.json'),
      completionAudit: path.join(reportDir, 'tv-box-completion-audit-latest.json'),
      releaseLedger: path.join(reportDir, 'tv-box-release-ledger-latest.json'),
      easySummary: path.join(reportDir, 'tv-box-easy-run-latest.json'),
      handoffHtmlSmoke: path.join(reportDir, 'tv-box-handoff-html-smoke-latest.json')
    }
  }

  state.actionCards = buildActionCards(state)
  state.roleNextActions = buildRoleNextActions(state)
  state.primaryNextAction = buildPrimaryNextAction(state)

  fs.writeFileSync(outputJsonPath, `${JSON.stringify(state, null, 2)}\n`)

  const openRows = state.evidence.openRequirements.length
    ? state.evidence.openRequirements.map(requirementRow).join('\n')
    : '| 无 | `proven` | 当前无未闭环要求 | 可进入关闭复核 |'

  const actionMarkdown = state.actionCards.map((card, index) => `### ${index + 1}. ${card.audience}: ${card.title}

- 命令/动作: \`${card.command}\`
${card.details.map((item) => `- ${item}`).join('\n')}`).join('\n\n')

  const markdown = `# HelloTV 电视盒子交付总控

- 生成时间 UTC: \`${state.generatedAtUtc}\`
- 范围: \`${state.scope}\`
- releaseId: \`${state.releaseId || '未生成'}\`
- 包名: \`${state.packageName}\`
- readiness: \`${state.readiness?.level || 'unknown'}\`
- completion: \`${state.completion?.overall || 'unknown'}\`
- handoff HTML smoke: \`${state.handoffHtmlSmoke?.status || 'unknown'}\` / checks \`${state.handoffHtmlSmoke?.checkCount ?? 0}\`
- field scenarios regression: \`${state.fieldScenariosRegression?.status || 'unknown'}\` / records \`${state.fieldScenariosRegression?.totalRecords ?? 0}\`
- return inbox scenarios regression: \`${state.returnInboxScenariosRegression?.status || 'unknown'}\` / scenarios \`${state.returnInboxScenariosRegression?.scenarioCount ?? 0}\`
- return inbox closure: \`${state.returnInbox?.closureStatus || 'unknown'}\`
- site readiness: \`${state.siteReadiness?.status || 'unknown'}\`
- elder/child UX audit: \`${state.uxAudit?.overall || 'unknown'}\` / failed checks \`${state.uxAudit?.failedChecks ?? 0}\`
- 设备证据: \`${state.deviceEvidence?.status || 'unknown'}\`

## 一眼结论

${state.readiness?.humanSummary || '当前还没有 readiness 摘要。'}

${state.evidence.canClose
  ? '当前没有未闭环要求；仍建议复跑 `npm run tv-box:check` 后再关闭。'
  : '当前可以继续推进交付和现场验收，但不能把真实盒子安装、遥控器、摄像头和麦克风验收声明为已完成。'}

## 唯一下一步

- 状态: \`${state.primaryNextAction.status}\`
- 判断依据: ${state.primaryNextAction.reason}
- 项目负责人: ${state.primaryNextAction.projectOwner}
- 现场安装人员: ${state.primaryNextAction.siteInstaller}
- 工程维护人员: ${state.primaryNextAction.engineer}

## 傻瓜化下一步

${actionMarkdown}

## 发包清单

| 产物 | 状态 | 字节 | SHA256 前 16 位 | 路径 | 用途 |
| --- | --- | ---: | --- | --- | --- |
${[
  artifactRow('Debug APK', state.artifacts.apk, '安装到电视盒子'),
  artifactRow('交付压缩包', state.artifacts.handoffArchive, '发给现场人员'),
  artifactRow('排障压缩包', state.artifacts.supportArchive, '现场失败时发给维护人员'),
  artifactRow('START_HERE.html', state.artifacts.startHereHtml, '现场双击入口'),
  artifactRow('OPERATION_CARD.html', state.artifacts.operationCardHtml, '打印贴在电视旁'),
  artifactRow('FIELD_RETURN_CARD.html', state.artifacts.fieldReturnCardHtml, '现场发回证据前核对'),
  artifactRow('FIELD_WIZARD_OFFLINE.html', state.artifacts.offlineFieldWizardHtml, '离线填写真实盒子验收'),
  artifactRow('硬件兼容性画像 MD', state.artifacts.hardwareProfileMarkdown, '判断盒子/遥控器/摄像头/麦克风风险'),
  artifactRow('完成度审计 JSON', state.artifacts.completionAuditJson, '机器判断未闭环项'),
  artifactRow('发布台账 JSON', state.artifacts.releaseLedgerJson, '追踪 releaseId 与 SHA'),
  artifactRow('网页离线冒烟 JSON', state.artifacts.handoffHtmlSmokeJson, '验证离线入口可用'),
  artifactRow('长辈/小孩遥控器 UX 审计 MD', state.artifacts.uxAuditMarkdown, '证明简易首页、帮助、自检、遥控练习、现场验收、摄像头、直播救援和退出确认不漂移'),
  artifactRow('长辈/小孩遥控器 UX 审计 JSON', state.artifacts.uxAuditJson, '机器读取 UX 审计状态'),
  artifactRow('现场验收场景回归 MD', state.artifacts.fieldScenariosRegressionMarkdown, '证明现场分类规则不漂移'),
  artifactRow('现场验收场景回归 JSON', state.artifacts.fieldScenariosRegressionJson, '机器读取四类验收场景结果'),
  artifactRow('现场回传收件箱场景回归 MD', state.artifacts.returnInboxScenariosRegressionMarkdown, '证明证据收件箱规则不漂移'),
  artifactRow('现场回传收件箱场景回归 JSON', state.artifacts.returnInboxScenariosRegressionJson, '机器读取五类回传证据场景结果'),
  artifactRow('现场回传收件箱 MD', state.artifacts.returnInboxMarkdown, '质检 JSON/照片/日志/排障包是否齐全'),
  artifactRow('现场回传收件箱 JSON', state.artifacts.returnInboxJson, '机器读取现场回传完整度'),
  artifactRow('现场开工判定卡 MD', state.artifacts.siteReadinessMarkdown, '给负责人/现场/工程判断先授权、安装、补证据还是修复'),
  artifactRow('现场开工判定卡 HTML', state.artifacts.siteReadinessHtml, '可双击打开或打印的一页开工卡'),
  artifactRow('现场开工判定卡 JSON', state.artifacts.siteReadinessJson, '机器读取现场开工状态'),
  artifactRow('现场 JSON 收件箱 MD', state.artifacts.fieldInboxMarkdown, '批量导入多盒多人的现场反馈'),
  artifactRow('现场 JSON 收件箱 JSON', state.artifacts.fieldInboxJson, '机器读取批量导入统计')
].join('\n')}

## 未闭环证据

| id | 状态 | 要求 | 下一步/证据 |
| --- | --- | --- | --- |
${openRows}

## 上游报告给出的下一步

${state.upstreamNextActions.length ? state.upstreamNextActions.map((item) => `- ${item}`).join('\n') : '- 暂无。'}

## 关闭规则

- 必须有真实电视盒子授权、安装、启动和遥控器焦点证据。
- 摄像头和麦克风按可选能力处理；有外设时必须记录 Camera2 预览、USB/UVC、音频输入和权限结果。
- 现场发回文件夹或 zip 先运行 \`tv-box:return-inbox\`，确认 JSON、维护码照片、INSTALL_LOG/support zip 和异常证据齐全。
- \`tv-box:return-inbox\` 的 \`closure.status\` 会把现场证据分成 \`ready_to_close\`、\`needs_site_follow_up\`、\`needs_fix\`；只有 \`ready_to_close\` 且写入兼容性矩阵后才能进入关闭复核。
- 现场下载的 \`FIELD_WIZARD_OFFLINE.html\` JSON 必须导入兼容性矩阵；单个 JSON 用 \`tv-box:field-import\`，多份 JSON 放进 \`reports/tv-box-field-inbox/\` 后运行 \`tv-box:field-inbox\`。
- \`npm run tv-box:check\` 必须通过，交付包和排障包 SHA256 sidecar 必须匹配。
`

  fs.writeFileSync(outputMarkdownPath, markdown)
  console.log(`TV-box command center written to: ${outputMarkdownPath}`)
  console.log(`Machine-readable command center: ${outputJsonPath}`)
}

main()
