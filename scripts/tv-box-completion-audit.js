#!/usr/bin/env node
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const rootDir = path.resolve(__dirname, '..')
const reportDir = process.env.REPORT_DIR || path.join(rootDir, 'reports')
const outputJsonPath = process.env.TV_BOX_COMPLETION_AUDIT_JSON || path.join(reportDir, 'tv-box-completion-audit-latest.json')
const outputMarkdownPath = process.env.TV_BOX_COMPLETION_AUDIT_MD || path.join(reportDir, 'tv-box-completion-audit-latest.md')
const inspectionPath = process.env.TV_BOX_INSPECTION_JSON || path.join(reportDir, 'tv-box-inspection-latest.json')
const preflightPath = process.env.TV_BOX_PREFLIGHT_JSON || path.join(reportDir, 'tv-box-preflight-latest.json')
const fieldRecordPath = process.env.TV_BOX_FIELD_RECORD_JSON || path.join(reportDir, 'tv-box-field-record-latest.json')
const compatibilityPath = process.env.TV_BOX_COMPATIBILITY_SUMMARY_JSON || path.join(reportDir, 'tv-box-compatibility-summary-latest.json')
const fieldScenariosPath = process.env.TV_BOX_FIELD_SCENARIOS_TEST_JSON || path.join(reportDir, 'tv-box-field-scenarios-test-latest.json')
const returnInboxScenariosPath = process.env.TV_BOX_RETURN_INBOX_SCENARIOS_JSON || path.join(reportDir, 'tv-box-return-inbox-scenarios-test-latest.json')
const hardwareProfilePath = process.env.TV_BOX_HARDWARE_PROFILE_JSON || path.join(reportDir, 'tv-box-hardware-profile-latest.json')
const easySummaryPath = process.env.TV_BOX_EASY_SUMMARY_JSON || path.join(reportDir, 'tv-box-easy-run-latest.json')
const uxAuditPath = process.env.TV_BOX_UX_AUDIT_JSON || path.join(reportDir, 'tv-box-ux-audit-latest.json')
const uxAuditMarkdownPath = process.env.TV_BOX_UX_AUDIT_MD || path.join(reportDir, 'tv-box-ux-audit-latest.md')
const handoffDir = process.env.HANDOFF_DIR || firstLine(path.join(reportDir, 'tv-box-handoff-latest-path.txt')) || path.join(reportDir, 'tv-box-handoff')
const handoffArchivePath = process.env.HANDOFF_ARCHIVE_PATH || firstLine(path.join(reportDir, 'tv-box-handoff-latest-archive.txt')) || path.join(reportDir, 'tv-box-handoff-latest.zip')
const supportDir = process.env.SUPPORT_BUNDLE_DIR || firstLine(path.join(reportDir, 'tv-box-support-latest-path.txt'))
const supportArchivePath = process.env.SUPPORT_ARCHIVE_PATH || firstLine(path.join(reportDir, 'tv-box-support-latest-archive.txt')) || path.join(reportDir, 'tv-box-support-latest.zip')
const auditScope = process.env.TV_BOX_COMPLETION_AUDIT_SCOPE || 'final_delivery'
const validAuditScopes = new Set(['final_delivery', 'handoff_package', 'support_bundle'])

if (!validAuditScopes.has(auditScope)) {
  console.error(`Unsupported TV_BOX_COMPLETION_AUDIT_SCOPE: ${auditScope}`)
  process.exit(1)
}

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

function deferredFileState(filePath, note) {
  return {
    path: filePath || '',
    exists: false,
    sizeBytes: 0,
    sha256: '',
    deferred: true,
    note
  }
}

function sidecarSha(filePath) {
  try {
    return fs.readFileSync(`${filePath}.sha256`, 'utf8').trim().split(/\s+/)[0] || ''
  } catch {
    return ''
  }
}

function allTruthy(object, keys) {
  return keys.every((key) => object?.[key] === true)
}

function resultIsPass(record, key) {
  return record?.checks?.[key] === 'pass'
}

function resultIsOneOf(record, key, values) {
  return values.includes(record?.checks?.[key])
}

function resultIsPassOrNotApplicable(record, key) {
  return resultIsOneOf(record, key, ['pass', 'na'])
}

function fieldScenariosRegressionPassed(report) {
  return report?.status === 'pass' &&
    report?.summary?.totalRecords === 4 &&
    report?.summary?.recommendedCount === 1 &&
    report?.summary?.tvCoreReadyCount === 1 &&
    report?.summary?.needsFixCount === 1 &&
    report?.summary?.needsManualAcceptanceCount === 1
}

function returnInboxScenariosRegressionPassed(report) {
  const requiredIds = new Set([
    'complete_ready',
    'missing_support_code_photo',
    'ambiguous_photo_manual_review',
    'unknown_without_issue_evidence',
    'failure_with_issue_evidence'
  ])
  const expectedClosure = {
    complete_ready: 'ready_to_close',
    missing_support_code_photo: 'needs_site_follow_up',
    ambiguous_photo_manual_review: 'needs_site_follow_up',
    unknown_without_issue_evidence: 'needs_site_follow_up',
    failure_with_issue_evidence: 'needs_fix'
  }
  const scenarios = Array.isArray(report?.scenarios) ? report.scenarios : []
  const scenarioIds = new Set(scenarios.map((scenario) => scenario.id))
  return report?.status === 'pass' &&
    scenarios.length === requiredIds.size &&
    [...requiredIds].every((id) => scenarioIds.has(id)) &&
    scenarios.every((scenario) => scenario.readiness === scenario.expectedReadiness &&
      scenario.closureStatus === scenario.expectedClosureStatus &&
      scenario.closureStatus === expectedClosure[scenario.id] &&
      scenario.strictExitCode === scenario.expectedStrictExitCode)
}

function anyResultIsPass(record, keys) {
  return keys.some((key) => resultIsPass(record, key))
}

function fieldCheck(record, key) {
  return record?.checks?.[key] || 'unknown'
}

function statusRank(status) {
  return {
    proven: 0,
    needs_box: 1,
    weak: 2,
    missing: 3,
    failed: 4
  }[status] ?? 4
}

function makeRequirement(id, title, status, evidence, nextAction = '') {
  return { id, title, status, evidence, nextAction }
}

function summarize(requirements) {
  const counts = requirements.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1
    return acc
  }, {})
  const worst = requirements.reduce((current, item) => (
    statusRank(item.status) > statusRank(current) ? item.status : current
  ), 'proven')
  const overall = counts.failed || counts.missing
    ? 'needs_fix'
    : counts.weak
      ? 'needs_stronger_evidence'
      : counts.needs_box
        ? 'handoff_ready_needs_box'
        : 'complete'

  return {
    overall,
    worstStatus: worst,
    counts: {
      proven: counts.proven || 0,
      needs_box: counts.needs_box || 0,
      weak: counts.weak || 0,
      missing: counts.missing || 0,
      failed: counts.failed || 0
    }
  }
}

function markdownTable(rows) {
  const header = '| 项 | 状态 | 证据 | 下一步 |'
  const divider = '| --- | --- | --- | --- |'
  const body = rows.map((row) => [
    row.title,
    `\`${row.status}\``,
    row.evidence || '',
    row.nextAction || ''
  ].map((cell) => String(cell).replace(/\|/g, '/')).join(' | '))
  return [header, divider, ...body.map((row) => `| ${row} |`)].join('\n')
}

function main() {
  fs.mkdirSync(reportDir, { recursive: true })

  const inspection = readJson(inspectionPath)
  const preflight = readJson(preflightPath)
  const fieldRecord = readJson(fieldRecordPath)
  const compatibility = readJson(compatibilityPath)
  const fieldScenarios = readJson(fieldScenariosPath)
  const returnInboxScenarios = readJson(returnInboxScenariosPath)
  const hardwareProfile = readJson(hardwareProfilePath)
  const easySummary = readJson(easySummaryPath)
  const uxAudit = readJson(uxAuditPath)
  const sourceContracts = inspection?.sourceContracts || {}
  const deviceStatus = inspection?.deviceEvidence?.status || 'unknown'
  const hasSelectedDevice = ['selected', 'authorized'].includes(deviceStatus)
  const apk = inspection?.apk || {}
  const isFinalDeliveryScope = auditScope === 'final_delivery'
  const isHandoffPackageScope = auditScope === 'handoff_package'
  const isSupportBundleScope = auditScope === 'support_bundle'
  const archiveDeferredNote = '外层压缩包会在本随包快照写入后生成；最终 zip/tar.gz SHA256 由 final_delivery 审计、tv-box:audit 和 tv-box:handoff-standalone-test 校验。'
  const supportArchiveDeferredNote = '排障包压缩包会在本排障包快照写入后生成；最终 support zip/tar.gz SHA256 由 final_delivery 审计和 tv-box:audit 校验。'
  const handoffArchive = isFinalDeliveryScope ? fileState(handoffArchivePath) : deferredFileState(handoffArchivePath, archiveDeferredNote)
  const handoffArchiveSidecar = isFinalDeliveryScope ? sidecarSha(handoffArchivePath) : ''
  const supportArchive = isFinalDeliveryScope ? fileState(supportArchivePath) : deferredFileState(supportArchivePath, supportArchiveDeferredNote)
  const supportArchiveSidecar = isFinalDeliveryScope ? sidecarSha(supportArchivePath) : ''
  const handoffDirectory = fileState(handoffDir)
  const supportDirectory = fileState(supportDir)
  const handoffApk = fileState(path.join(handoffDir, 'HelloTV-debug.apk'))
  const handoffChecksums = fileState(path.join(handoffDir, 'SHA256SUMS'))
  const handoffOperationCardHtml = fileState(path.join(handoffDir, 'OPERATION_CARD.html'))
  const handoffHardwareProfileJson = fileState(path.join(handoffDir, 'tv-box-hardware-profile-latest.json'))
  const handoffHardwareProfileMd = fileState(path.join(handoffDir, 'tv-box-hardware-profile-latest.md'))
  const fieldScenariosJson = fileState(fieldScenariosPath)
  const fieldScenariosMd = fileState(path.join(reportDir, 'tv-box-field-scenarios-test-latest.md'))
  const returnInboxScenariosJson = fileState(returnInboxScenariosPath)
  const returnInboxScenariosMd = fileState(path.join(reportDir, 'tv-box-return-inbox-scenarios-test-latest.md'))
  const handoffFieldScenariosJson = fileState(path.join(handoffDir, 'tv-box-field-scenarios-test-latest.json'))
  const handoffFieldScenariosMd = fileState(path.join(handoffDir, 'tv-box-field-scenarios-test-latest.md'))
  const handoffReturnInboxScenariosJson = fileState(path.join(handoffDir, 'tv-box-return-inbox-scenarios-test-latest.json'))
  const handoffReturnInboxScenariosMd = fileState(path.join(handoffDir, 'tv-box-return-inbox-scenarios-test-latest.md'))
  const uxAuditJson = fileState(uxAuditPath)
  const uxAuditMd = fileState(uxAuditMarkdownPath)
  const handoffUxAuditJson = fileState(path.join(handoffDir, 'tv-box-ux-audit-latest.json'))
  const handoffUxAuditMd = fileState(path.join(handoffDir, 'tv-box-ux-audit-latest.md'))
  const supportScript = fileState(path.join(rootDir, 'scripts', 'tv-box-support-bundle.sh'))
  const handoffArchiveEvidence = isFinalDeliveryScope
    ? `dir=${handoffDirectory.exists}, apk=${handoffApk.exists}, checksums=${handoffChecksums.exists}, operationCardHtml=${handoffOperationCardHtml.exists}, archive=${handoffArchive.path || 'not-yet-generated'}, archiveSha256Match=${handoffArchive.exists && handoffArchive.sha256 === handoffArchiveSidecar}`
    : `scope=${auditScope}, dir=${handoffDirectory.exists}, apk=${handoffApk.exists}, checksums=${handoffChecksums.exists}, operationCardHtml=${handoffOperationCardHtml.exists}; ${archiveDeferredNote}`
  const supportBundleProven = isFinalDeliveryScope
    ? supportDirectory.exists && supportArchive.exists && supportArchive.sha256 && supportArchive.sha256 === supportArchiveSidecar && easySummary?.status !== 'support_bundle'
    : supportScript.exists && (!isSupportBundleScope || supportDirectory.exists)
  const supportBundleEvidence = isFinalDeliveryScope
    ? `supportArchive=${supportArchive.path}, sha256Match=${supportArchive.sha256 === supportArchiveSidecar}, rootEasyStatus=${easySummary?.status || 'unknown'}`
    : `scope=${auditScope}, supportScript=${supportScript.exists}, supportDir=${supportDirectory.exists}; ${supportArchiveDeferredNote}`
  const realRemoteAcceptanceProven = resultIsPass(fieldRecord, 'remoteFocus') &&
    resultIsPassOrNotApplicable(fieldRecord, 'numericShortcuts') &&
    anyResultIsPass(fieldRecord, ['zeroKeyHelp', 'helpKeyShortcuts']) &&
    resultIsPass(fieldRecord, 'remotePractice') &&
    resultIsPass(fieldRecord, 'exitConfirm') &&
    resultIsPass(fieldRecord, 'livePlayback') &&
    resultIsPassOrNotApplicable(fieldRecord, 'liveNumericChannels') &&
    resultIsPassOrNotApplicable(fieldRecord, 'liveMediaKeys') &&
    resultIsPassOrNotApplicable(fieldRecord, 'liveFavorites') &&
    resultIsPass(fieldRecord, 'classicHomeRescue') &&
    resultIsPass(fieldRecord, 'searchRescue') &&
    resultIsPass(fieldRecord, 'historyRescue') &&
    resultIsPass(fieldRecord, 'supportCode')
  const realCameraAcceptanceProven = resultIsPassOrNotApplicable(fieldRecord, 'cameraPermission') &&
    resultIsPassOrNotApplicable(fieldRecord, 'cameraPreview') &&
    resultIsPassOrNotApplicable(fieldRecord, 'audioInput') &&
    resultIsPassOrNotApplicable(fieldRecord, 'recordAudioPermission') &&
    resultIsPassOrNotApplicable(fieldRecord, 'usbHotplug')

  const requirements = []
  requirements.push(makeRequirement(
    'simple_mode_home',
    '长辈/小孩简易首页、帮助入口、直播救援和退出确认',
    allTruthy(sourceContracts, ['simpleModeDefault', 'simpleHomeRoute', 'tvBoxHelpRoute', 'remotePracticeRoute', 'fieldGuideRoute', 'tvBoxExitRoute', 'numericHomeBadges', 'visibleHomeHelpCard', 'zeroKeyHelp', 'remoteHelpKeys', 'cameraSixKeyHelp', 'helpSixKeyRefresh', 'helpPrimaryNextAction', 'helpRemotePracticeShortcut', 'helpFieldGuideShortcut', 'remotePracticePage', 'remotePracticeDpad', 'remotePracticeConfirm', 'remotePracticeKeyCodeFeedback', 'remoteKeyLabelHelper', 'fieldGuidePage', 'fieldGuideRecordEvidence', 'fieldGuideHardwareBoundary', 'fieldGuideSupportCode', 'simpleHomeBackExit', 'tvBoxExitPage', 'tvBoxExitConfirm', 'tvBoxExitContinueDefault', 'liveNumericChannelShortcuts', 'liveNumericChannelHelper', 'liveMediaKeyShortcuts', 'liveHelpShortcut', 'liveBackToSimpleHome', 'liveFavoriteShortcut', 'liveFavoriteOnlyShortcut', 'liveFavoriteStorage', 'classicHomeHelpRescue', 'classicHomeBackToSimpleHome', 'historyRouteUsesRawPage', 'historyHelpRescue', 'historyBackToSimpleHome', 'searchHelpRescue', 'searchBackToSimpleHome']) ? 'proven' : 'missing',
    'inspection.sourceContracts 覆盖 simple mode、home/help/practice/field-guide/exit routes、可见帮助入口、数字快捷键、6/0 帮助、帮助键、帮助页唯一下一步、遥控练习、遥控器 keyCode 反馈、现场验收指引、直播数字键换台、直播播放/暂停物理键、直播 0/帮助键自检、直播返回首页、直播收藏/只看收藏持久化、全部内容误入救援返回、继续看真实路由救援返回、搜索救援返回和大字退出确认。'
  ))
  requirements.push(makeRequirement(
    'remote_logic',
    '遥控器方向键/确认/数字/帮助键逻辑',
    inspection?.remoteSelfTest?.ok === true ? 'proven' : 'failed',
    inspection?.remoteSelfTest?.stdout || inspection?.remoteSelfTest?.stderr || 'remote self-test missing',
    '如果失败，先运行 npm run tv-box:remote-test。'
  ))
  requirements.push(makeRequirement(
    'elder_child_ux_audit',
    '长辈/小孩遥控器 UX 独立审计',
    uxAudit?.summary?.overall === 'pass' && (!isHandoffPackageScope || (handoffUxAuditJson.exists && handoffUxAuditMd.exists)) ? 'proven' : uxAuditJson.exists ? 'failed' : 'missing',
    `overall=${uxAudit?.summary?.overall || 'missing'}, pass=${uxAudit?.summary?.pass || 0}, fail=${uxAudit?.summary?.fail || 0}, failedChecks=${uxAudit?.summary?.failedChecks || 0}, handoffJson=${handoffUxAuditJson.exists}, handoffMd=${handoffUxAuditMd.exists}`,
    '如果失败或缺失，运行 npm run tv-box:ux-audit；交付包缺随包报告时重新运行 npm run tv-box:handoff。'
  ))
  requirements.push(makeRequirement(
    'real_remote_acceptance',
    '真实电视盒子遥控器、帮助、退出和直播验收',
    realRemoteAcceptanceProven ? 'proven' : 'needs_box',
    `latest field record verdict=${fieldRecord?.verdict || 'missing'}, remoteFocus=${fieldCheck(fieldRecord, 'remoteFocus')}, numericShortcuts=${fieldCheck(fieldRecord, 'numericShortcuts')}, zeroKeyHelp=${fieldCheck(fieldRecord, 'zeroKeyHelp')}, helpKeyShortcuts=${fieldCheck(fieldRecord, 'helpKeyShortcuts')}, remotePractice=${fieldCheck(fieldRecord, 'remotePractice')}, exitConfirm=${fieldCheck(fieldRecord, 'exitConfirm')}, livePlayback=${fieldCheck(fieldRecord, 'livePlayback')}, liveNumericChannels=${fieldCheck(fieldRecord, 'liveNumericChannels')}, liveMediaKeys=${fieldCheck(fieldRecord, 'liveMediaKeys')}, liveFavorites=${fieldCheck(fieldRecord, 'liveFavorites')}, classicHomeRescue=${fieldCheck(fieldRecord, 'classicHomeRescue')}, searchRescue=${fieldCheck(fieldRecord, 'searchRescue')}, historyRescue=${fieldCheck(fieldRecord, 'historyRescue')}, supportCode=${fieldCheck(fieldRecord, 'supportCode')}`,
    '连接真实盒子后按 FIELD_ACCEPTANCE_CHECKLIST.zh-CN.md 验收；数字键/播放暂停键缺失的遥控器可把 numericShortcuts/liveNumericChannels/liveMediaKeys/liveFavorites 记为 na，但帮助键、遥控练习、退出确认、直播、全部内容救援、搜索/继续看救援和维护码必须有证据。'
  ))
  requirements.push(makeRequirement(
    'optional_hardware_manifest',
    '摄像头/麦克风/USB Host/触屏不阻塞安装',
    allTruthy(sourceContracts, ['optionalExternalCamera', 'optionalMicrophone', 'optionalUsbHost', 'optionalTouchscreen', 'leanbackLauncher', 'tvBanner']) ? 'proven' : 'missing',
    'inspection.sourceContracts 覆盖 optional 外设 feature、Leanback launcher 和 TV banner。'
  ))
  requirements.push(makeRequirement(
    'native_camera_audio_bridge',
    '摄像头、USB 视频、麦克风和权限原生能力检测',
    allTruthy(sourceContracts, ['nativeTvBoxModule', 'nativeCameraPreviewActivity', 'internalCameraPreviewActivity', 'nativeAudioInputDetection', 'frontEndAudioInputDetection', 'supportCodeAudioInput']) ? 'proven' : 'missing',
    'inspection.sourceContracts 覆盖 TvBoxModule、CameraPreviewActivity、音频输入和维护码字段。'
  ))
  requirements.push(makeRequirement(
    'real_camera_acceptance',
    '真实摄像头/麦克风/USB 热插拔或无外设降级验收',
    realCameraAcceptanceProven ? 'proven' : 'needs_box',
    `cameraPermission=${fieldCheck(fieldRecord, 'cameraPermission')}, cameraPreview=${fieldCheck(fieldRecord, 'cameraPreview')}, audioInput=${fieldCheck(fieldRecord, 'audioInput')}, recordAudioPermission=${fieldCheck(fieldRecord, 'recordAudioPermission')}, usbHotplug=${fieldCheck(fieldRecord, 'usbHotplug')}`,
    '现场执行 BOX_IP=<盒子IP> RUN_CAMERA_SMOKE=true npm run tv-box:easy；没有摄像头/麦克风/USB 热插拔时要显式记录 na，不能留 unknown。'
  ))
  requirements.push(makeRequirement(
    'apk_build',
    'Debug APK 已构建且可追溯 SHA256',
    apk.exists && apk.sha256 && apk.sizeBytes > 0 ? 'proven' : 'missing',
    apk.exists ? `${apk.path} / ${apk.sizeBytes} bytes / ${apk.sha256}` : 'inspection.apk missing',
    '如果缺失，运行 npm run build-apk-debug。'
  ))
  requirements.push(makeRequirement(
    'handoff_package',
    '现场傻瓜化交付包和校验文件',
    handoffDirectory.exists && handoffApk.exists && handoffChecksums.exists && handoffOperationCardHtml.exists ? 'proven' : 'missing',
    handoffArchiveEvidence,
    '如果缺失或不匹配，运行 npm run tv-box:handoff。'
  ))
  requirements.push(makeRequirement(
    'field_workflow',
    '离线现场验收表、导入器、收件箱和兼容性矩阵',
    fs.existsSync(path.join(handoffDir, 'FIELD_WIZARD_OFFLINE.html')) &&
      fs.existsSync(path.join(reportDir, 'tv-box-field-import-latest.json')) &&
      fs.existsSync(path.join(reportDir, 'tv-box-field-inbox-latest.json')) &&
      fs.existsSync(path.join(reportDir, 'tv-box-field-matrix.csv')) ? 'proven' : 'missing',
    'FIELD_WIZARD_OFFLINE.html / tv-box-field-import-latest.json / tv-box-field-inbox-latest.json / tv-box-field-matrix.csv',
    '如果缺失，运行 npm run tv-box:field-wizard-html && npm run tv-box:field-import -- reports/tv-box-field-wizard-latest.json --no-append && npm run tv-box:field-inbox -- reports/tv-box-field-wizard-latest.json --dry-run --no-append。'
  ))
  requirements.push(makeRequirement(
    'field_scenarios_regression',
    '现场验收分类规则回归',
    fieldScenariosRegressionPassed(fieldScenarios) && handoffFieldScenariosJson.exists && handoffFieldScenariosMd.exists ? 'proven' : fieldScenariosJson.exists ? 'failed' : 'missing',
    `status=${fieldScenarios?.status || 'missing'}, totalRecords=${fieldScenarios?.summary?.totalRecords || 0}, recommended=${fieldScenarios?.summary?.recommendedCount || 0}, tvCoreReady=${fieldScenarios?.summary?.tvCoreReadyCount || 0}, needsFix=${fieldScenarios?.summary?.needsFixCount || 0}, needsManualAcceptance=${fieldScenarios?.summary?.needsManualAcceptanceCount || 0}, handoffJson=${handoffFieldScenariosJson.exists}, handoffMd=${handoffFieldScenariosMd.exists}`,
    '如果失败或缺失，运行 npm run tv-box:field-scenarios-test 后重新生成 npm run tv-box:handoff。'
  ))
  requirements.push(makeRequirement(
    'return_inbox_scenarios_regression',
    '现场回传收件箱证据规则回归',
    returnInboxScenariosRegressionPassed(returnInboxScenarios) && handoffReturnInboxScenariosJson.exists && handoffReturnInboxScenariosMd.exists ? 'proven' : returnInboxScenariosJson.exists ? 'failed' : 'missing',
    `status=${returnInboxScenarios?.status || 'missing'}, scenarios=${Array.isArray(returnInboxScenarios?.scenarios) ? returnInboxScenarios.scenarios.length : 0}, completeReady=${returnInboxScenarios?.scenarios?.some((item) => item.id === 'complete_ready' && item.closureStatus === 'ready_to_close') === true}, missingSupportCode=${returnInboxScenarios?.scenarios?.some((item) => item.id === 'missing_support_code_photo' && item.closureStatus === 'needs_site_follow_up') === true}, ambiguousPhoto=${returnInboxScenarios?.scenarios?.some((item) => item.id === 'ambiguous_photo_manual_review' && item.closureStatus === 'needs_site_follow_up') === true}, unknownOpen=${returnInboxScenarios?.scenarios?.some((item) => item.id === 'unknown_without_issue_evidence' && item.closureStatus === 'needs_site_follow_up') === true}, failureEvidence=${returnInboxScenarios?.scenarios?.some((item) => item.id === 'failure_with_issue_evidence' && item.closureStatus === 'needs_fix') === true}, handoffJson=${handoffReturnInboxScenariosJson.exists}, handoffMd=${handoffReturnInboxScenariosMd.exists}`,
    '如果失败或缺失，运行 npm run tv-box:return-inbox-scenarios-test 后重新生成 npm run tv-box:handoff。'
  ))
  requirements.push(makeRequirement(
    'hardware_profile',
    '盒子/遥控器/摄像头/麦克风硬件兼容性画像',
    hardwareProfile && handoffHardwareProfileJson.exists && handoffHardwareProfileMd.exists ? 'proven' : 'missing',
    `profileLevel=${hardwareProfile?.currentDeviceProfile?.level || 'missing'}, handoffJson=${handoffHardwareProfileJson.exists}, handoffMd=${handoffHardwareProfileMd.exists}`,
    '如果缺失，运行 npm run tv-box:hardware-profile 后重新生成 tv-box:handoff。'
  ))
  requirements.push(makeRequirement(
    'compatibility_samples',
    '长期兼容性样本沉淀',
    (compatibility?.totalRecords || 0) > 0 ? 'proven' : 'needs_box',
    `compatibility.totalRecords=${compatibility?.totalRecords || 0}, latest append=${fieldRecord?.matrix?.appendRow === true}`,
    '真实验收后单份 JSON 用 tv-box:field-import，多份 JSON 放入 reports/tv-box-field-inbox/ 后运行 tv-box:field-inbox；也可补 FIELD_* 后运行 tv-box:field-record。'
  ))
  requirements.push(makeRequirement(
    'support_bundle',
    '失败排障包可生成且不污染主交付 latest',
    supportBundleProven ? 'proven' : 'missing',
    supportBundleEvidence,
    '如果缺失，运行 npm run tv-box:support；根目录 easy summary 不应是 support_bundle。'
  ))
  requirements.push(makeRequirement(
    'device_authorization',
    '真实盒子 ADB/RSA 授权',
    hasSelectedDevice ? 'proven' : 'needs_box',
    `deviceEvidence.status=${deviceStatus}`,
    '现场开启开发者选项/网络调试并确认 RSA 授权。'
  ))
  requirements.push(makeRequirement(
    'device_install',
    '真实盒子安装并启动 HelloTV',
    inspection?.deviceEvidence?.appInstalled === true ? 'proven' : 'needs_box',
    `appInstalled=${inspection?.deviceEvidence?.appInstalled === true}, selectedSerial=${inspection?.deviceEvidence?.selectedSerial || ''}`,
    '现场执行 BOX_IP=<盒子IP> npm run tv-box:easy，脚本会安装、启动并抓取日志。'
  ))
  requirements.push(makeRequirement(
    'preflight',
    '安装前预检能给出下一步',
    preflight?.verdict ? 'proven' : 'missing',
    `preflight.verdict=${preflight?.verdict || 'missing'}`,
    '如果缺失，运行 npm run tv-box:preflight。'
  ))

  const summary = summarize(requirements)
  const nextActions = [
    ...new Set(requirements
      .filter((item) => item.status !== 'proven' && item.nextAction)
      .map((item) => item.nextAction))
  ]

  const result = {
    generatedAtUtc: new Date().toISOString(),
    auditScope,
    projectRoot: rootDir,
    packageName: inspection?.packageName || 'com.quicktvui.hellotv',
    summary,
    readiness: inspection?.readiness || null,
    preflight: preflight ? { verdict: preflight.verdict, nextActions: preflight.nextActions || [] } : null,
    artifacts: {
      inspection: fileState(inspectionPath),
      preflight: fileState(preflightPath),
      fieldRecord: fileState(fieldRecordPath),
      compatibility: fileState(compatibilityPath),
      fieldScenariosRegressionJson: fieldScenariosJson,
      fieldScenariosRegressionMarkdown: fieldScenariosMd,
      returnInboxScenariosRegressionJson: returnInboxScenariosJson,
      returnInboxScenariosRegressionMarkdown: returnInboxScenariosMd,
      handoffFieldScenariosRegressionJson: handoffFieldScenariosJson,
      handoffFieldScenariosRegressionMarkdown: handoffFieldScenariosMd,
      handoffReturnInboxScenariosRegressionJson: handoffReturnInboxScenariosJson,
      handoffReturnInboxScenariosRegressionMarkdown: handoffReturnInboxScenariosMd,
      uxAuditJson,
      uxAuditMarkdown: uxAuditMd,
      handoffUxAuditJson,
      handoffUxAuditMarkdown: handoffUxAuditMd,
      hardwareProfile: fileState(hardwareProfilePath),
      easySummary: fileState(easySummaryPath),
      handoffDirectory,
      handoffApk,
      handoffChecksums,
      handoffOperationCardHtml,
      handoffHardwareProfileJson,
      handoffHardwareProfileMd,
      handoffArchive,
      supportDirectory,
      supportArchive,
      supportScript
    },
    requirements,
    nextActions
  }

  fs.writeFileSync(outputJsonPath, `${JSON.stringify(result, null, 2)}\n`)

  const markdown = `# HelloTV 电视盒子完成度证据审计

- 生成时间 UTC: \`${result.generatedAtUtc}\`
- auditScope: \`${auditScope}\`
- overall: \`${summary.overall}\`
- readiness: \`${inspection?.readiness?.level || 'unknown'}\`
- proven: \`${summary.counts.proven}\`
- needs_box: \`${summary.counts.needs_box}\`
- weak: \`${summary.counts.weak}\`
- missing: \`${summary.counts.missing}\`
- failed: \`${summary.counts.failed}\`

## 结论

${summary.overall === 'complete'
  ? '所有要求都有当前证据支撑，可以进入最终关闭。'
  : '系统已有可发送现场的交付证据；仍有项目必须等真实电视盒子完成授权、安装、遥控器、摄像头和麦克风验收后才能关闭。'}

${isFinalDeliveryScope
  ? '本报告是最终交付审计，会校验当前交付压缩包和排障压缩包的 SHA256。'
  : `本报告是 \`${auditScope}\` 随包快照；外层压缩包会在本文件写入后生成，最终 SHA256 以根目录 \`final_delivery\` 审计和 \`tv-box:audit\` 为准。`}

## 要求与证据

${markdownTable(requirements)}

## 下一步

${nextActions.length ? nextActions.map((action) => `- ${action}`).join('\n') : '- 暂无。'}
`
  fs.writeFileSync(outputMarkdownPath, markdown)

  console.log(`TV-box completion audit written to: ${outputMarkdownPath}`)
  console.log(`Machine-readable completion audit: ${outputJsonPath}`)
}

main()
