#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

const rootDir = path.resolve(__dirname, '..')
const reportDir = process.env.REPORT_DIR || path.join(rootDir, 'reports')
const acceptanceJsonPath = process.env.TV_BOX_C920_ACCEPTANCE_JSON || path.join(reportDir, 'tv-box-c920-pro-acceptance-latest.json')
const outputJsonPath = process.env.TV_BOX_C920_ARRIVAL_CARD_JSON || path.join(reportDir, 'tv-box-c920-arrival-card-latest.json')
const outputMarkdownPath = process.env.TV_BOX_C920_ARRIVAL_CARD_MD || path.join(reportDir, 'tv-box-c920-arrival-card-latest.md')
const outputHtmlPath = process.env.TV_BOX_C920_ARRIVAL_CARD_HTML || path.join(reportDir, 'tv-box-c920-arrival-card.html')

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

function buildDecision(report) {
  if (report?.fieldDecision) return report.fieldDecision
  return {
    level: 'not_run_yet',
    title: '还未运行 C920 到货验收',
    summary: '先把 C920 PRO 插到小米盒子 USB 口，再运行一条验收命令生成真实证据。',
    primaryAction: '执行 BOX_IP=192.168.10.122 npm run tv-box:c920-acceptance；脚本完成后看电视屏幕确认真实画面。'
  }
}

function buildBranch(level) {
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

function buildCard(report) {
  const decision = buildDecision(report)
  const checklist = decision.checklist || {}
  const boxIp = report?.boxIp || process.env.BOX_IP || '192.168.10.122'
  const command = `BOX_IP=${boxIp} npm run tv-box:c920-acceptance`
  const acceptanceExists = fs.existsSync(acceptanceJsonPath)
  const fieldResults = report?.fieldResults || {}
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
      cameraPreview: fieldResults.cameraPreview || 'unknown',
      audioInput: fieldResults.audioInput || 'unknown',
      usbHotplug: fieldResults.usbHotplug || 'unknown'
    },
    hardwareEvidence: {
      cameraServiceCameraCount: report?.cameraService?.cameraCount ?? 'unknown',
      usbVideoHintCount: hardware.usbVideoHintCount ?? 0,
      usbAudioHintCount: hardware.usbAudioHintCount ?? 0,
      nativeCameraCount: native.cameraCount ?? 'unknown',
      nativeExternalCameraCount: native.externalCameraCount ?? 'unknown',
      nativeUsbVideoDeviceCount: native.usbVideoDeviceCount ?? 'unknown',
      nativeAudioInputDeviceCount: native.audioInputDeviceCount ?? 'unknown',
      nativeUsbAudioInputDeviceCount: native.usbAudioInputDeviceCount ?? 'unknown'
    },
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
    ['USB 视频线索数', card.hardwareEvidence.usbVideoHintCount],
    ['USB 音频线索数', card.hardwareEvidence.usbAudioHintCount],
    ['App camera/external/usbVideo', `${card.hardwareEvidence.nativeCameraCount}/${card.hardwareEvidence.nativeExternalCameraCount}/${card.hardwareEvidence.nativeUsbVideoDeviceCount}`],
    ['App audioInput/usbAudio', `${card.hardwareEvidence.nativeAudioInputDeviceCount}/${card.hardwareEvidence.nativeUsbAudioInputDeviceCount}`],
    ['FIELD_CAMERA_PREVIEW', resultLabel(card.fieldResults.cameraPreview)],
    ['FIELD_AUDIO_INPUT', resultLabel(card.fieldResults.audioInput)],
    ['FIELD_USB_HOTPLUG', resultLabel(card.fieldResults.usbHotplug)]
  ]

  return `# C920 PRO 到货现场操作卡

- 生成时间 UTC: \`${card.generatedAtUtc}\`
- 验收报告: \`${card.acceptanceReportExists ? card.acceptanceReportPath : '尚未生成'}\`
- 当前判定: \`${card.status}\`
- 标题: ${card.title}
- 一键命令: \`${card.command}\`

## 先做三步

1. 先直插 C920 PRO 到小米盒子 USB 口，电视盒子和电脑保持同一网络。
2. 运行 \`${card.command}\`，不要跳过自动采集。
3. 看电视屏幕：只有电视上看到 C920 PRO 真实画面，\`FIELD_CAMERA_PREVIEW\` 才能记 \`pass\`。

## 当前下一步

${card.primaryAction}

${card.branchSteps.map((step) => `- ${step}`).join('\n')}

## 现场核对

${makeTable(checklistRows, ['项目', '结果', '说明'])}

## 证据摘要

${makeTable(evidenceRows, ['证据', '值'])}

## 不能关闭的边界

${card.closeGuard.map((item) => `- ${item}`).join('\n')}

## 回传给工程侧

- 电视 C920 预览画面照片或短视频。
- 摄像头页/帮助页维护码照片。
- \`reports/tv-box-c920-pro-acceptance-latest.md/json\`。
- \`reports/tv-box-support-latest.zip\`。
`
}

function buildHtml(card) {
  const branchItems = card.branchSteps.map((step) => `<li>${htmlEscape(step)}</li>`).join('\n')
  const guardItems = card.closeGuard.map((step) => `<li>${htmlEscape(step)}</li>`).join('\n')
  const rows = [
    ['USB 视频线索', yesNo(card.checklist.usbVideoDetected)],
    ['Camera2 枚举', yesNo(card.checklist.camera2Enumerated)],
    ['预览页打开', yesNo(card.checklist.previewActivityOpened)],
    ['电视真实画面', yesNo(card.checklist.realPreviewConfirmed)],
    ['麦克风业务输入', yesNo(card.checklist.audioConfirmed)],
    ['USB 热插拔', yesNo(card.checklist.hotplugConfirmed)]
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
    <div class="action">
      <strong>先做三步</strong>
      <ol>
        <li>先直插 C920 PRO 到小米盒子 USB 口。</li>
        <li>运行 <code>${htmlEscape(card.command)}</code>。</li>
        <li>只有电视上看到 C920 PRO 真实画面，<code>FIELD_CAMERA_PREVIEW</code> 才能记 <code>pass</code>。</li>
      </ol>
    </div>
    <h2>当前下一步</h2>
    <p>${htmlEscape(card.primaryAction)}</p>
    <ul>${branchItems}</ul>
    <h2>现场核对</h2>
    <table>${rows}</table>
    <h2>不能关闭的边界</h2>
    <ul>${guardItems}</ul>
    <h2>回传给工程侧</h2>
    <ul>
      <li>电视 C920 预览画面照片或短视频。</li>
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
