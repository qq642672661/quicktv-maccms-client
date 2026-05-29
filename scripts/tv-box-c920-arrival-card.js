#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

const rootDir = path.resolve(__dirname, '..')
const reportDir = process.env.REPORT_DIR || path.join(rootDir, 'reports')
const acceptanceJsonPath = process.env.TV_BOX_C920_ACCEPTANCE_JSON || path.join(reportDir, 'tv-box-c920-pro-acceptance-latest.json')
const outputJsonPath = process.env.TV_BOX_C920_ARRIVAL_CARD_JSON || path.join(reportDir, 'tv-box-c920-arrival-card-latest.json')
const outputMarkdownPath = process.env.TV_BOX_C920_ARRIVAL_CARD_MD || path.join(reportDir, 'tv-box-c920-arrival-card-latest.md')
const outputHtmlPath = process.env.TV_BOX_C920_ARRIVAL_CARD_HTML || path.join(reportDir, 'tv-box-c920-arrival-card.html')
const procurementStatePath = process.env.TV_BOX_C920_PROCUREMENT_JSON || path.join(rootDir, 'tv-box-field-state', 'c920-procurement.json')

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

function htmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function markdownCell(value) {
  return String(value ?? '').replace(/\|/g, '/').replace(/\r?\n/g, '<br>')
}

function makeTable(rows, headers) {
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(markdownCell).join(' | ')} |`)
  ].join('\n')
}

function yesNo(value) {
  return value === true ? 'yes' : value === false ? 'no' : 'unknown'
}

function resultLabel(value) {
  if (value === 'pass') return '通过'
  if (value === 'fail') return '失败'
  if (value === 'na') return '不适用'
  if (value === 'skip') return '跳过'
  return '未确认'
}

function normalizePhysicalStatus(value) {
  const normalized = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  if ([
    'purchased',
    'ordered',
    'paid',
    'purchased_pending_arrival',
    'not_arrived',
    'pending_arrival',
    '已购买',
    '已采购',
    '已下单',
    '已付款',
    '未到货',
    '待到货',
    '已购买待到货',
    '已采购待到货'
  ].includes(normalized)) {
    return 'purchased_pending_arrival'
  }
  if ([
    'not_inserted',
    'unplugged',
    'baseline',
    'not_connected',
    'arrived',
    'arrived_not_inserted',
    'delivered_not_inserted',
    '到货',
    '已到货',
    '未插入',
    '未接入',
    '没插',
    '没有插',
    '到货未插',
    '到货未插入',
    '已到货未插',
    '已到货未插入'
  ].includes(normalized)) {
    return 'not_inserted'
  }
  if ([
    'inserted',
    'plugged',
    'connected',
    'arrived_inserted',
    'delivered_inserted',
    '已插入',
    '已接入',
    '已连接',
    '插入',
    '接入',
    '连接',
    '插上',
    '插上了',
    '到货已插',
    '到货已插入',
    '已到货已插入'
  ].includes(normalized)) {
    return 'inserted'
  }
  return 'unknown'
}

function physicalStatusLabel(value) {
  if (value === 'purchased_pending_arrival') return '已采购，待到货/接入'
  if (value === 'not_inserted') return '已到手或待测，但当前未插入'
  if (value === 'inserted') return '已插入 C920，按识别结果排障'
  return '未确认是否已插入'
}

function readProcurement(report) {
  const state = readJson(procurementStatePath) || {}
  const stateProcurement = state.procurement || state
  const procurement = report?.procurement || {}
  return {
    purchaseChannel: process.env.C920_PURCHASE_CHANNEL || stateProcurement.purchaseChannel || stateProcurement.channel || procurement.purchaseChannel || procurement.channel || '',
    expectedArrivalDate: process.env.C920_EXPECTED_ARRIVAL_DATE || stateProcurement.expectedArrivalDate || procurement.expectedArrivalDate || '',
    note: process.env.C920_PURCHASE_NOTE || stateProcurement.note || procurement.note || '',
    statePath: procurementStatePath,
    stateExists: fs.existsSync(procurementStatePath)
  }
}

function readPhysicalStatus(report) {
  const state = readJson(procurementStatePath) || {}
  const stateStatus = state.physicalStatus || state.status
  const reportStatus = report?.physicalStatus?.status || report?.physicalStatus
  const envStatus = normalizePhysicalStatus(process.env.C920_PHYSICAL_STATUS)
  const normalizedReportStatus = normalizePhysicalStatus(reportStatus)
  const normalizedStateStatus = normalizePhysicalStatus(stateStatus)

  if (envStatus !== 'unknown') return envStatus
  if (normalizedReportStatus !== 'unknown') return normalizedReportStatus
  if (normalizedStateStatus !== 'unknown') return normalizedStateStatus
  return 'unknown'
}

function noNewHardwareSignal(report) {
  const signals = report?.baselineComparison?.signals || {}
  return report?.baselineComparison?.status === 'compared' &&
    !signals.usbVideoIncreased &&
    !signals.camera2Increased &&
    !signals.usbAudioIncreased &&
    !signals.audioInputChanged
}

function buildDecision(report, physicalStatus) {
  const sourceDecision = report?.fieldDecision
  if (sourceDecision?.level === 'waiting_for_camera_or_usb_not_detected') {
    if (physicalStatus === 'purchased_pending_arrival') {
      return {
        ...sourceDecision,
        sourceLevel: sourceDecision.level,
        level: 'c920_purchased_pending_arrival',
        title: 'C920 PRO 已购买，待到货接入',
        summary: '当前报告只是到货前或未插入基线，不能判定为盒子不兼容；等 C920 到货并插入 USB 后再跑验收。',
        primaryAction: '到货后先直插小米盒子 USB 口，再执行 npm run tv-box:c920-arrived。'
      }
    }
    if (physicalStatus === 'not_inserted') {
      return {
        ...sourceDecision,
        sourceLevel: sourceDecision.level,
        level: 'c920_not_inserted_baseline',
        title: 'C920 PRO 当前未插入，仅保留基线',
        summary: '未插入摄像头时看到 USB 视频和 Camera2 为 0 是正常基线，不算兼容失败。',
        primaryAction: '插入 C920 PRO 后重跑验收；只有相对基线新增 USB/Camera2/音频线索，才进入真实设备判断。'
      }
    }
    if (physicalStatus !== 'inserted' && noNewHardwareSignal(report)) {
      return {
        ...sourceDecision,
        sourceLevel: sourceDecision.level,
        level: 'c920_insert_status_unconfirmed',
        title: 'C920 PRO 插入状态待确认',
        summary: '当前与到货前基线一致，不能直接说设备不兼容；如果还未到货或未插入，这是正常状态。',
        primaryAction: '先确认 C920 是否已经插到盒子 USB 口；未插入就等到货，已插入仍无新增线索再按供电 Hub/电脑复测排障。'
      }
    }
    if (physicalStatus === 'inserted') {
      if (report?.hardwareEvidence?.usbRealtekOnly) {
        return {
          ...sourceDecision,
          sourceLevel: sourceDecision.level,
          title: '已插入 C920，但 USB Host 只看到 Realtek 网卡',
          summary: report.hardwareEvidence.usbDeviceSummary || '盒子 USB Host 当前没有看到 Logitech/C920 或 USB Video Class 设备。',
          primaryAction: '先确认 C920 是否真的插在小米盒子 USB 口；重新插紧后重跑，直插仍只见 Realtek 时改用带独立供电 USB Hub。'
        }
      }
      return {
        ...sourceDecision,
        sourceLevel: sourceDecision.level,
        title: '已插入 C920，但未看到 USB 视频设备',
        summary: '物理状态已标记为已插入，但盒子 USB/Camera2 仍没有新增视频线索，才进入硬件识别排障。',
        primaryAction: '重新插紧 C920；直插不行就改用带独立供电 USB Hub，仍不行再接电脑确认摄像头本体。'
      }
    }
  }

  if (sourceDecision) {
    return {
      ...sourceDecision,
      sourceLevel: sourceDecision.level
    }
  }
  return {
    level: 'not_run_yet',
    sourceLevel: 'not_run_yet',
    title: '还未运行 C920 到货验收',
    summary: '先把 C920 PRO 插到小米盒子 USB 口，再运行一条验收命令生成真实证据。',
    primaryAction: '执行 npm run tv-box:c920-arrived；脚本完成后看电视屏幕确认真实画面。'
  }
}

function buildBranch(level) {
  if (level === 'c920_purchased_pending_arrival') {
    return [
      '当前只保留“已采购、待接入”状态，不把 Camera2/USB 为 0 记成失败。',
      '到货后先直插小米盒子唯一 USB 口；如果同时要接独立麦克风，再换带独立供电 USB Hub。',
      '插上后运行验收命令，电视看到 C920 实时画面前，摄像头仍保持 unknown。'
    ]
  }
  if (level === 'c920_not_inserted_baseline') {
    return [
      '这是未插摄像头基线，作用是到货接入后对比是否新增 USB 视频、Camera2 和 USB 音频线索。',
      '不要根据当前 0 结果退货或判定盒子不兼容。',
      '插入 C920 后重跑同一条验收命令。'
    ]
  }
  if (level === 'c920_insert_status_unconfirmed') {
    return [
      '先问现场一句：C920 是否已经插到小米盒子 USB 口。',
      '如果还未到货/未插入，保持待接入，不进入故障排查。',
      '如果确认已插入但仍没有新增 USB/Camera2 线索，再按插紧、供电 Hub、电脑复测、C270 备机的顺序排查。'
    ]
  }
  if (level === 'waiting_for_camera_or_usb_not_detected') {
    return [
      '重新插紧 C920 PRO，确认摄像头指示灯或硬件状态正常。',
      '直插仍无 USB 视频线索时，改用带独立供电 USB Hub 后重跑验收。',
      'Hub 后仍无视频线索时，先把 C920 接电脑确认摄像头本体正常；再准备 C270 做低规格复测。'
    ]
  }
  if (level === 'usb_seen_camera_hal_missing') {
    return [
      'USB 层已经看到视频线索，但 Android Camera2 没枚举，优先用带独立供电 USB Hub 重跑。',
      '仍为 CameraService cameraCount=0 时，试 Logitech C270；C270 也失败就说明小米盒子固件/Camera HAL 风险较高。',
      'Camera HAL 不开放时，不把 C920 记为通过；互动摄像头先走手机 WebRTC 保底路线或后续用户态 UVC 方案。'
    ]
  }
  if (level === 'camera2_seen_preview_failed') {
    return [
      '系统能枚举摄像头，但 App 预览失败；查看 camera-smoke.log 里的权限、分辨率和 Camera2 会话错误。',
      '重启盒子后重跑；如果仍失败，工程侧先降低预览规格或修 CameraPreviewActivity。',
      '现场不要把“系统看到设备”直接等同于“业务画面通过”。'
    ]
  }
  if (level === 'preview_opened_needs_visual_confirmation') {
    return [
      '拿起遥控器看电视屏幕：必须是 C920 的实时画面，黑屏、静态图、权限弹窗都不能算通过。',
      '确认真实画面后重跑并设置 FIELD_CAMERA_PREVIEW=pass；没看到真实画面就保持 unknown 或 fail。',
      '拍一张电视预览画面和维护码照片，后续回传给工程侧。'
    ]
  }
  if (level === 'camera_ok_audio_or_hotplug_open') {
    return [
      '视频画面已确认，继续测 C920 自带麦克风或独立 USB 会议麦克风。',
      '拔插 C920 一次后再跑验收，确认不会掉线、黑屏或卡死。',
      '音频输入和 USB 热插拔都确认后，才能进入完整现场关闭复核。'
    ]
  }
  if (level === 'ready_for_extended_field_acceptance') {
    return [
      'C920 视频、音频和热插拔已闭环，继续做直播播放、遥控器练习、退出确认和维护码照片。',
      '把现场 JSON、预览照片、维护码照片和 support zip 一起回传。',
      '工程侧用 tv-box:return-inbox 质检为 ready_to_close 后再关闭。'
    ]
  }
  return [
    'C920 PRO 先直插小米盒子 USB 口，电脑和盒子保持同一网络。',
    '运行验收命令后只看报告下一步，不要重复手工猜测。',
    '没有真实电视画面前，摄像头验收保持 unknown。'
  ]
}

function buildAcceptanceCommand(boxIp) {
  const baseCommand = 'npm run tv-box:c920-arrived'
  return boxIp === '192.168.10.122' ? baseCommand : `BOX_IP=${boxIp} ${baseCommand}`
}

function buildEvidenceReturnChecklist(boxIp, command) {
  return {
    folder: 'FIELD_RETURN/',
    returnInboxCommand: 'npm run tv-box:return-inbox -- <现场回传目录或zip>',
    acceptanceCommand: command,
    confirmationCommand: `BOX_IP=${boxIp || '192.168.10.122'} C920_CONFIRM_ALL_PASS=true npm run tv-box:c920-confirm`,
    items: [
      {
        id: 'preview_photo_or_video',
        fileName: 'C920_PREVIEW_TV_SCREEN.jpg 或 C920_PREVIEW_TV_SCREEN.mp4',
        requiredForClose: true,
        proves: '电视屏幕已经显示 C920 PRO 的真实实时画面。',
        passRule: '只有看得出画面来自 C920，FIELD_CAMERA_PREVIEW / C920_CONFIRM_VIDEO 才能记 pass。'
      },
      {
        id: 'microphone_business_input',
        fileName: 'C920_MIC_BUSINESS_INPUT.mp4 或 C920_MIC_BUSINESS_INPUT.txt',
        requiredForClose: true,
        proves: 'C920 自带麦克风或独立 USB 麦克风已经进入录音/互动课业务链路。',
        passRule: '只看到 USB 音频线索不算通过；必须有录音、互动课输入或现场文字说明。'
      },
      {
        id: 'hotplug_retest',
        fileName: 'C920_HOTPLUG_RETEST.jpg 或 C920_HOTPLUG_RETEST.txt',
        requiredForClose: true,
        proves: '拔插 C920 后系统仍能识别，并且预览不会黑屏或卡死。',
        passRule: '未做拔插复测时，FIELD_USB_HOTPLUG / C920_CONFIRM_HOTPLUG 保持 unknown。'
      },
      {
        id: 'support_code_photo',
        fileName: 'SUPPORT_CODE_C920.jpg',
        requiredForClose: true,
        proves: '摄像头页或帮助页维护码可读，工程侧能看见设备、权限和能力摘要。',
        passRule: '维护码照片清晰可读后，FIELD_SUPPORT_CODE / C920_CONFIRM_SUPPORT_CODE 才能记 pass。'
      },
      {
        id: 'acceptance_report',
        fileName: 'tv-box-c920-pro-acceptance-latest.md 和 tv-box-c920-pro-acceptance-latest.json',
        requiredForClose: true,
        proves: '保留本次 USB、Camera2、音频、基线对比和日志目录证据。',
        passRule: '不要只发照片；报告和照片需要一起回传。'
      },
      {
        id: 'support_bundle_when_failed_or_unknown',
        fileName: 'tv-box-support-latest.zip',
        requiredForClose: false,
        proves: '摄像头、麦克风或热插拔失败/unknown 时，给工程侧完整日志和环境快照。',
        passRule: '有 fail、unknown、黑屏、无声或掉线时必须一起发。'
      }
    ],
    closeRule: '工程侧收到后先跑 return-inbox；只有 JSON、维护码、C920 预览/麦克风/热插拔证据和报告齐全，且现场结果没有 fail/unknown，才能进入关闭复核。'
  }
}

function isPendingOrBaselineDecision(level) {
  return [
    'c920_purchased_pending_arrival',
    'c920_not_inserted_baseline',
    'c920_insert_status_unconfirmed'
  ].includes(level)
}

function normalizeFieldResultsForDecision(fieldResults, decisionLevel) {
  if (isPendingOrBaselineDecision(decisionLevel)) {
    return {
      cameraPreview: 'unknown',
      audioInput: 'unknown',
      usbHotplug: 'unknown'
    }
  }

  return {
    cameraPreview: fieldResults.cameraPreview || 'unknown',
    audioInput: fieldResults.audioInput || 'unknown',
    usbHotplug: fieldResults.usbHotplug || 'unknown'
  }
}

function buildRemoteSmokeEvidence(report) {
  const source = report?.remoteSmokeEvidence || {}
  const remoteSmokeExitCode = report?.remoteSmokeExitCode
  return {
    status: source.status || (remoteSmokeExitCode === 99 ? 'skipped' : 'missing'),
    exitCode: source.exitCode ?? remoteSmokeExitCode ?? '',
    reportPath: source.reportPath || '',
    markdownPath: source.markdownPath || '',
    screenshotPath: source.screenshotPath || '',
    runDir: source.runDir || '',
    deviceSerial: source.deviceSerial || report?.deviceSerial || '',
    scenarioCount: source.scenarioCount ?? 0,
    keyEventCount: source.keyEventCount ?? 0,
    crashDetected: source.crashDetected === true,
    replacesRealRemoteAcceptance: source.replacesRealRemoteAcceptance === true,
    replacesC920Acceptance: source.replacesC920Acceptance === true,
    boundary: Array.isArray(source.boundary) && source.boundary.length
      ? source.boundary
      : [
        'ADB remote smoke proves only remote keyevent navigation, launch/focus state, screenshot capture, and filtered crash-log state.',
        'It does not replace physical remote-control hand-feel acceptance.',
        'It does not replace C920 real preview, microphone input, or USB hotplug acceptance.'
      ]
  }
}

function buildCard(report) {
  const physicalStatus = readPhysicalStatus(report)
  const decision = buildDecision(report, physicalStatus)
  const procurement = readProcurement(report)
  const checklist = decision.checklist || {}
  const boxIp = report?.boxIp || process.env.BOX_IP || '192.168.10.122'
  const command = buildAcceptanceCommand(boxIp)
  const acceptanceExists = fs.existsSync(acceptanceJsonPath)
  const fieldResults = normalizeFieldResultsForDecision(report?.fieldResults || {}, decision.level)
  const hardware = report?.hardwareEvidence || {}
  const native = hardware.nativeCapabilities || {}

  return {
    generatedAtUtc: new Date().toISOString(),
    projectRoot: rootDir,
    acceptanceReportExists: acceptanceExists,
    acceptanceReportPath: acceptanceJsonPath,
    boxIp,
    command,
    status: decision.level,
    sourceStatus: decision.sourceLevel || decision.level,
    physicalStatus,
    physicalStatusLabel: physicalStatusLabel(physicalStatus),
    physicalStatusInputHints: {
      purchasedPendingArrival: ['purchased_pending_arrival', '已采购待到货', '待到货'],
      notInserted: ['not_inserted', '已到货未插入', '未插入'],
      inserted: ['inserted', '已插入', '已接入']
    },
    procurement,
    title: decision.title,
    summary: decision.summary,
    primaryAction: decision.primaryAction,
    branchSteps: buildBranch(decision.level),
    checklist: {
      usbVideoDetected: checklist.usbVideoDetected,
      camera2Enumerated: checklist.camera2Enumerated,
      previewActivityOpened: checklist.previewActivityOpened,
      realPreviewConfirmed: checklist.realPreviewConfirmed,
      usbAudioDetected: checklist.usbAudioDetected,
      audioConfirmed: checklist.audioConfirmed,
      hotplugConfirmed: checklist.hotplugConfirmed
    },
    fieldResults: {
      cameraPreview: fieldResults.cameraPreview,
      audioInput: fieldResults.audioInput,
      usbHotplug: fieldResults.usbHotplug
    },
    hardwareEvidence: {
      cameraServiceCameraCount: report?.cameraService?.cameraCount ?? 'unknown',
      usbHostVisibleDeviceCount: hardware.usbHostVisibleDeviceCount ?? 'unknown',
      usbDeviceSummary: hardware.usbDeviceSummary || '未采集',
      usbDeviceSummaries: hardware.usbDeviceSummaries || [],
      usbLogitechC920Detected: hardware.usbLogitechC920Detected,
      usbVideoDeviceDetected: hardware.usbVideoDeviceDetected,
      usbAudioDeviceDetected: hardware.usbAudioDeviceDetected,
      usbRealtekOnly: hardware.usbRealtekOnly,
      usbVideoHintCount: hardware.usbVideoHintCount ?? 0,
      usbAudioHintCount: hardware.usbAudioHintCount ?? 0,
      nativeCameraCount: native.cameraCount ?? 'unknown',
      nativeExternalCameraCount: native.externalCameraCount ?? 'unknown',
      nativeUsbVideoDeviceCount: native.usbVideoDeviceCount ?? 'unknown',
      nativeAudioInputDeviceCount: native.audioInputDeviceCount ?? 'unknown',
      nativeUsbAudioInputDeviceCount: native.usbAudioInputDeviceCount ?? 'unknown'
    },
    baselineComparison: {
      status: report?.baselineComparison?.status || 'unknown',
      summary: report?.baselineComparison?.summary || '',
      usbVideoIncreased: report?.baselineComparison?.signals?.usbVideoIncreased,
      camera2Increased: report?.baselineComparison?.signals?.camera2Increased,
      usbAudioIncreased: report?.baselineComparison?.signals?.usbAudioIncreased,
      audioInputChanged: report?.baselineComparison?.signals?.audioInputChanged
    },
    remoteSmokeEvidence: buildRemoteSmokeEvidence(report),
    evidenceReturn: buildEvidenceReturnChecklist(boxIp, command),
    closeGuard: [
      '只有电视上看到 C920 PRO 真实画面，FIELD_CAMERA_PREVIEW 才能记 pass。',
      'C920 自带麦克风或独立 USB 麦克风必须通过业务录音/互动课链路确认，不能只看 USB 线索。',
      'USB 热插拔必须拔插后重跑确认稳定；unknown 不能关闭。',
      '手机当电视摄像头默认是手机采集 + 电视端原生 WebRTC 接收，不伪装成系统 Camera2。'
    ]
  }
}

function buildMarkdown(card) {
  const checklistRows = [
    ['USB 视频线索', yesNo(card.checklist.usbVideoDetected), '没看到时先换线/插紧/供电 Hub'],
    ['Camera2 枚举', yesNo(card.checklist.camera2Enumerated), '只有 Camera2/CameraService 枚举才算 App 可开摄像头'],
    ['预览页打开', yesNo(card.checklist.previewActivityOpened), 'Activity 打开不等于真实画面通过'],
    ['电视真实画面', yesNo(card.checklist.realPreviewConfirmed), '必须肉眼看到 C920 实时画面'],
    ['USB 音频线索', yesNo(card.checklist.usbAudioDetected), '只说明系统疑似看到音频设备'],
    ['麦克风业务输入', yesNo(card.checklist.audioConfirmed), '必须录音/互动课链路确认'],
    ['USB 热插拔', yesNo(card.checklist.hotplugConfirmed), '拔插后仍稳定才算通过']
  ]

  const evidenceRows = [
    ['CameraService cameraCount', card.hardwareEvidence.cameraServiceCameraCount],
    ['USB host 可见设备数', card.hardwareEvidence.usbHostVisibleDeviceCount],
    ['USB 设备清单', card.hardwareEvidence.usbDeviceSummary],
    ['USB 是否看到 Logitech/C920', yesNo(card.hardwareEvidence.usbLogitechC920Detected)],
    ['USB 视频线索数', card.hardwareEvidence.usbVideoHintCount],
    ['USB 音频线索数', card.hardwareEvidence.usbAudioHintCount],
    ['App camera/external/usbVideo', `${card.hardwareEvidence.nativeCameraCount}/${card.hardwareEvidence.nativeExternalCameraCount}/${card.hardwareEvidence.nativeUsbVideoDeviceCount}`],
    ['App audioInput/usbAudio', `${card.hardwareEvidence.nativeAudioInputDeviceCount}/${card.hardwareEvidence.nativeUsbAudioInputDeviceCount}`],
    ['FIELD_CAMERA_PREVIEW', resultLabel(card.fieldResults.cameraPreview)],
    ['FIELD_AUDIO_INPUT', resultLabel(card.fieldResults.audioInput)],
    ['FIELD_USB_HOTPLUG', resultLabel(card.fieldResults.usbHotplug)]
  ]

  const remoteSmokeRows = [
    ['状态', card.remoteSmokeEvidence.status],
    ['退出码', card.remoteSmokeEvidence.exitCode],
    ['设备', card.remoteSmokeEvidence.deviceSerial || 'unknown'],
    ['场景数 / keyevent 数', `${card.remoteSmokeEvidence.scenarioCount} / ${card.remoteSmokeEvidence.keyEventCount}`],
    ['捕获 fatal/JS 运行时异常', card.remoteSmokeEvidence.crashDetected ? 'yes' : 'no'],
    ['JSON 报告', card.remoteSmokeEvidence.reportPath || '未生成'],
    ['Markdown 报告', card.remoteSmokeEvidence.markdownPath || '未生成'],
    ['截图', card.remoteSmokeEvidence.screenshotPath || '未生成'],
    ['替代真实遥控器验收', card.remoteSmokeEvidence.replacesRealRemoteAcceptance ? 'yes' : 'no'],
    ['替代 C920 实物验收', card.remoteSmokeEvidence.replacesC920Acceptance ? 'yes' : 'no']
  ]

  const evidenceReturnRows = card.evidenceReturn.items.map((item) => [
    item.fileName,
    item.requiredForClose ? '必须' : '失败/unknown 时必须',
    item.proves,
    item.passRule
  ])

  return `# C920 PRO 到货现场操作卡

- 生成时间 UTC: \`${card.generatedAtUtc}\`
- 验收报告: \`${card.acceptanceReportExists ? card.acceptanceReportPath : '尚未生成'}\`
- 当前判定: \`${card.status}\`
- 原始判定: \`${card.sourceStatus}\`
- 物理状态: ${card.physicalStatusLabel}
- 最简状态输入: 待到货用 \`C920_PHYSICAL_STATUS=已采购待到货\`；到货未插用 \`C920_PHYSICAL_STATUS=已到货未插入\`；已插好用 \`C920_PHYSICAL_STATUS=已插入\`
- 采购渠道: ${card.procurement.purchaseChannel || '未记录'}
- 预计到货: ${card.procurement.expectedArrivalDate || '未记录'}
- 采购状态源: \`${card.procurement.stateExists ? card.procurement.statePath : '未配置'}\`
- 标题: ${card.title}
- 说明: ${card.summary}
- 一键命令: \`${card.command}\`

## 先做三步

1. 先直插 C920 PRO 到小米盒子 USB 口，电视盒子和电脑保持同一网络；直插不稳或要同时接 USB 麦克风时，换带独立供电 USB Hub。
2. 运行 \`${card.command}\`，不要跳过自动采集。
3. 看电视屏幕：只有电视上看到 C920 PRO 真实画面，\`FIELD_CAMERA_PREVIEW\` 才能记 \`pass\`。

## 当前下一步

${card.primaryAction}

${card.branchSteps.map((step) => `- ${step}`).join('\n')}

## 现场核对

${makeTable(checklistRows, ['项目', '结果', '说明'])}

## 证据摘要

${makeTable(evidenceRows, ['证据', '值'])}

## USB Host 清单

${card.hardwareEvidence.usbDeviceSummaries.length ? card.hardwareEvidence.usbDeviceSummaries.map((item) => `- ${item}`).join('\n') : '- 未列出外设。'}

## 基线对比

- 状态: \`${card.baselineComparison.status}\`
- 摘要: ${card.baselineComparison.summary || '暂无'}
- 新增 USB 视频: \`${yesNo(card.baselineComparison.usbVideoIncreased)}\`
- 新增 Camera2 摄像头: \`${yesNo(card.baselineComparison.camera2Increased)}\`
- 新增 USB 音频: \`${yesNo(card.baselineComparison.usbAudioIncreased)}\`
- 音频输入数量变化: \`${yesNo(card.baselineComparison.audioInputChanged)}\`

## ADB 遥控器冒烟证据

${makeTable(remoteSmokeRows, ['证据', '值'])}

${card.remoteSmokeEvidence.boundary.map((item) => `- ${item}`).join('\n')}

## 不能关闭的边界

${card.closeGuard.map((item) => `- ${item}`).join('\n')}

## C920 回传证据文件名

把下面文件放进交付包里的 \`${card.evidenceReturn.folder}\`，再双击 \`PACK_FIELD_RETURN_ON_MAC.command\` 或 \`PACK_FIELD_RETURN_ON_WINDOWS.bat\` 打包；工程侧收到后先运行 \`${card.evidenceReturn.returnInboxCommand}\`。

${makeTable(evidenceReturnRows, ['文件名', '关闭要求', '证明什么', 'pass 规则'])}

## 回传给工程侧

- 电视 C920 预览画面照片或短视频。
- C920 麦克风业务输入证据。
- USB 热插拔复测证据。
- 摄像头页/帮助页维护码照片。
- \`reports/tv-box-c920-pro-acceptance-latest.md/json\`。
- \`reports/tv-box-support-latest.zip\`。
`
}

function buildHtml(card) {
  const branchItems = card.branchSteps.map((step) => `<li>${htmlEscape(step)}</li>`).join('\n')
  const guardItems = card.closeGuard.map((step) => `<li>${htmlEscape(step)}</li>`).join('\n')
  const remoteSmokeBoundaryItems = card.remoteSmokeEvidence.boundary.map((step) => `<li>${htmlEscape(step)}</li>`).join('\n')
  const evidenceRows = card.evidenceReturn.items.map((item) => `<tr><th>${htmlEscape(item.fileName)}</th><td>${htmlEscape(item.requiredForClose ? '必须' : '失败/unknown 时必须')}</td><td>${htmlEscape(item.proves)}</td><td>${htmlEscape(item.passRule)}</td></tr>`).join('\n')
  const usbDeviceItems = card.hardwareEvidence.usbDeviceSummaries.length
    ? card.hardwareEvidence.usbDeviceSummaries.map((item) => `<li>${htmlEscape(item)}</li>`).join('\n')
    : '<li>未列出外设。</li>'
  const rows = [
    ['USB 视频线索', yesNo(card.checklist.usbVideoDetected)],
    ['Camera2 枚举', yesNo(card.checklist.camera2Enumerated)],
    ['预览页打开', yesNo(card.checklist.previewActivityOpened)],
    ['电视真实画面', yesNo(card.checklist.realPreviewConfirmed)],
    ['麦克风业务输入', yesNo(card.checklist.audioConfirmed)],
    ['USB 热插拔', yesNo(card.checklist.hotplugConfirmed)]
  ].map(([label, value]) => `<tr><th>${htmlEscape(label)}</th><td>${htmlEscape(value)}</td></tr>`).join('\n')
  const remoteSmokeRows = [
    ['状态', card.remoteSmokeEvidence.status],
    ['退出码', card.remoteSmokeEvidence.exitCode],
    ['设备', card.remoteSmokeEvidence.deviceSerial || 'unknown'],
    ['场景数 / keyevent 数', `${card.remoteSmokeEvidence.scenarioCount} / ${card.remoteSmokeEvidence.keyEventCount}`],
    ['捕获 fatal/JS 运行时异常', card.remoteSmokeEvidence.crashDetected ? 'yes' : 'no'],
    ['JSON 报告', card.remoteSmokeEvidence.reportPath || '未生成'],
    ['Markdown 报告', card.remoteSmokeEvidence.markdownPath || '未生成'],
    ['截图', card.remoteSmokeEvidence.screenshotPath || '未生成'],
    ['替代真实遥控器验收', card.remoteSmokeEvidence.replacesRealRemoteAcceptance ? 'yes' : 'no'],
    ['替代 C920 实物验收', card.remoteSmokeEvidence.replacesC920Acceptance ? 'yes' : 'no']
  ].map(([label, value]) => `<tr><th>${htmlEscape(label)}</th><td>${htmlEscape(value)}</td></tr>`).join('\n')

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>C920 PRO 到货现场操作卡</title>
  <style>
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif; background: #f7f8fb; color: #172033; font-size: 20px; line-height: 1.55; }
    main { max-width: 960px; margin: 0 auto; padding: 32px 24px 48px; }
    h1 { margin: 0 0 8px; font-size: 36px; }
    h2 { margin-top: 28px; font-size: 26px; }
    .status { display: inline-block; padding: 6px 10px; border-radius: 6px; background: #172033; color: #fff; font-weight: 700; }
    .action { background: #fff; border: 2px solid #172033; border-radius: 8px; padding: 18px; margin-top: 18px; }
    code { background: #e9eef5; padding: 2px 6px; border-radius: 4px; }
    table { width: 100%; border-collapse: collapse; background: #fff; }
    th, td { border: 1px solid #ccd4df; padding: 10px 12px; text-align: left; }
    th { width: 38%; background: #eef3f8; }
    button { font-size: 20px; padding: 10px 16px; border: 0; border-radius: 6px; background: #2454a6; color: white; }
    @media print { button { display: none; } body { background: #fff; } main { padding: 0; } }
  </style>
</head>
<body>
  <main>
    <button type="button" onclick="window.print()">打印 C920 到货操作卡</button>
    <h1>C920 PRO 到货现场操作卡</h1>
    <p><span class="status">${htmlEscape(card.status)}</span></p>
    <p>${htmlEscape(card.title)}</p>
    <p>${htmlEscape(card.summary)}</p>
    <p>物理状态：${htmlEscape(card.physicalStatusLabel)}；原始判定：${htmlEscape(card.sourceStatus)}</p>
    <p>最简状态输入：待到货用 <code>C920_PHYSICAL_STATUS=已采购待到货</code>；到货未插用 <code>C920_PHYSICAL_STATUS=已到货未插入</code>；已插好用 <code>C920_PHYSICAL_STATUS=已插入</code>。</p>
    <p>采购渠道：${htmlEscape(card.procurement.purchaseChannel || '未记录')}；预计到货：${htmlEscape(card.procurement.expectedArrivalDate || '未记录')}</p>
    <p>采购状态源：${htmlEscape(card.procurement.stateExists ? card.procurement.statePath : '未配置')}</p>
    <div class="action">
      <strong>先做三步</strong>
      <ol>
        <li>先直插 C920 PRO 到小米盒子 USB 口；直插不稳或要同时接 USB 麦克风时，换带独立供电 USB Hub。</li>
        <li>运行 <code>${htmlEscape(card.command)}</code>。</li>
        <li>只有电视上看到 C920 PRO 真实画面，<code>FIELD_CAMERA_PREVIEW</code> 才能记 <code>pass</code>。</li>
      </ol>
    </div>
    <h2>当前下一步</h2>
    <p>${htmlEscape(card.primaryAction)}</p>
    <ul>${branchItems}</ul>
    <h2>现场核对</h2>
    <table>${rows}</table>
    <h2>USB Host 清单</h2>
    <p>${htmlEscape(card.hardwareEvidence.usbDeviceSummary)}</p>
    <ul>${usbDeviceItems}</ul>
    <h2>ADB 遥控器冒烟证据</h2>
    <table>${remoteSmokeRows}</table>
    <ul>${remoteSmokeBoundaryItems}</ul>
    <h2>不能关闭的边界</h2>
    <ul>${guardItems}</ul>
    <h2>C920 回传证据文件名</h2>
    <p>把下面文件放进 <code>${htmlEscape(card.evidenceReturn.folder)}</code>，再双击回传打包脚本；工程侧收到后先运行 <code>${htmlEscape(card.evidenceReturn.returnInboxCommand)}</code>。</p>
    <table>
      <tr><th>文件名</th><th>关闭要求</th><th>证明什么</th><th>pass 规则</th></tr>
      ${evidenceRows}
    </table>
    <h2>回传给工程侧</h2>
    <ul>
      <li>电视 C920 预览画面照片或短视频。</li>
      <li>C920 麦克风业务输入证据。</li>
      <li>USB 热插拔复测证据。</li>
      <li>摄像头页/帮助页维护码照片。</li>
      <li>reports/tv-box-c920-pro-acceptance-latest.md/json。</li>
      <li>reports/tv-box-support-latest.zip。</li>
    </ul>
  </main>
</body>
</html>
`
}

function main() {
  fs.mkdirSync(reportDir, { recursive: true })
  const report = readJson(acceptanceJsonPath)
  const card = buildCard(report)
  fs.writeFileSync(outputJsonPath, `${JSON.stringify(card, null, 2)}\n`)
  fs.writeFileSync(outputMarkdownPath, buildMarkdown(card))
  fs.writeFileSync(outputHtmlPath, buildHtml(card))
  console.log(`C920 arrival card: ${outputMarkdownPath}`)
  console.log(`Printable C920 arrival card: ${outputHtmlPath}`)
}

main()
