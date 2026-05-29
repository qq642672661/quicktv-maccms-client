#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const rootDir = path.resolve(__dirname, '..')
const reportDir = process.env.REPORT_DIR || path.join(rootDir, 'reports')
const outputJsonPath = process.env.TV_BOX_SITE_READINESS_JSON || path.join(reportDir, 'tv-box-site-readiness-latest.json')
const outputMarkdownPath = process.env.TV_BOX_SITE_READINESS_MD || path.join(reportDir, 'tv-box-site-readiness-latest.md')
const outputHtmlPath = process.env.TV_BOX_SITE_READINESS_HTML || path.join(reportDir, 'tv-box-site-readiness-card.html')

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

function fileState(filePath) {
  const exists = Boolean(filePath && fs.existsSync(filePath))
  return {
    path: filePath || '',
    exists,
    sizeBytes: exists ? fs.statSync(filePath).size : 0,
    sha256: exists && fs.statSync(filePath).isFile() ? sha256(filePath) : ''
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
  return String(value ?? '').replace(/\|/g, '/').replace(/\r?\n/g, ' ')
}

function unique(values) {
  const seen = new Set()
  const out = []
  for (const value of values.filter(Boolean)) {
    const key = String(value).trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(key)
  }
  return out
}

function deriveStage(state) {
  const verdict = state.preflight?.verdict || ''
  const readiness = state.commandCenter?.readiness?.level || state.inspection?.readiness?.level || ''
  const completion = state.completionAudit?.summary?.overall || ''
  const deviceStatus = state.preflight?.device?.status || state.commandCenter?.deviceEvidence?.status || ''

  if (completion === 'complete' || readiness === 'complete') {
    return {
      status: 'ready_for_close_review',
      title: '可进入关闭复核',
      summary: '自动化证据和真实盒子证据都已闭环；复跑 npm run tv-box:check 后归档 release ledger、handoff zip 和 support zip。'
    }
  }

  if (verdict === 'ready_for_box_install' || deviceStatus === 'authorized') {
    return {
      status: 'ready_for_install',
      title: '已授权，可安装和验收',
      summary: '电脑已经能看到授权电视盒子；下一步直接安装、启动，并跑遥控器和摄像头/麦克风验收。'
    }
  }

  if (verdict === 'needs_box_authorization' || deviceStatus === 'unauthorized_or_offline' || deviceStatus === 'target_not_authorized') {
    return {
      status: 'needs_box_authorization',
      title: '先处理盒子授权',
      summary: '电视盒子已出现或已指定，但还没有完成 ADB/RSA 授权；不要反复安装，先让电视屏幕点允许。'
    }
  }

  if (['needs_toolchain', 'needs_code_fix', 'needs_build_or_handoff', 'needs_handoff_regeneration'].includes(verdict)) {
    return {
      status: verdict,
      title: '先修工程环境或交付包',
      summary: '电脑工具链、构建产物或交付压缩包还未达标，先按 preflight 下一步修复。'
    }
  }

  if (readiness === 'handoff_ready_needs_box' || state.commandCenter?.evidence?.canHandoff === true) {
    return {
      status: 'handoff_ready_needs_box',
      title: '可发现场，不能关闭',
      summary: '交付包和排障包已准备好；下一步必须在真实电视盒子上完成授权、安装、遥控器、摄像头/麦克风和回传证据。'
    }
  }

  return {
    status: 'needs_preflight',
    title: '先跑安装前预检',
    summary: '当前缺少足够的 preflight/command-center 证据；先运行 npm run tv-box:preflight。'
  }
}

function buildRoleActions(stage, state) {
  const boxIp = state.preflight?.inputs?.boxIp || '<盒子IP>'
  const selected = state.preflight?.device?.selected || '<设备序列号>'
  const handoff = state.artifacts.handoffArchive.path || 'reports/tv-box-handoff-latest.zip'
  const support = state.artifacts.supportArchive.path || 'reports/tv-box-support-latest.zip'

  if (stage.status === 'ready_for_install') {
    return {
      projectOwner: '安排现场继续安装验收；完成前不要关闭项目。',
      siteInstaller: [
        '保持电视盒子在线，不要拔掉摄像头/麦克风。',
        '安装后在电视上看到 HelloTV 简易首页。',
        '按 FIELD_WIZARD_OFFLINE.html 记录遥控器、直播、摄像头、麦克风和维护码结果。'
      ],
      engineer: [
        `执行 BOX_IP=${boxIp} RUN_CAMERA_SMOKE=true npm run tv-box:easy。`,
        `如果不是按 IP 连接，执行 DEVICE_SERIAL=${selected} RUN_CAMERA_SMOKE=true npm run tv-box:easy。`,
        '拿到现场回传 zip 后先跑 npm run tv-box:return-inbox -- <zip>，ready_to_close 后再 --append。'
      ]
    }
  }

  if (stage.status === 'needs_box_authorization') {
    return {
      projectOwner: '当前不是代码问题，先让现场把电视盒子授权做好。',
      siteInstaller: [
        '确认电脑和电视盒子在同一个 Wi-Fi/网线网络。',
        '电视盒子打开“开发者选项 / 网络调试”，记下系统显示的 IP。',
        '工程人员连接后，电视屏幕出现“允许 USB 调试/网络调试/RSA”时选择允许。',
        '没有弹窗时，关闭再打开网络调试，或重启盒子后重新运行安装脚本。'
      ],
      engineer: [
        `执行 BOX_IP=${boxIp} npm run tv-box:preflight。`,
        '如果仍是 unauthorized/offline，先让现场拍电视屏幕和网络调试页面。',
        `需要排障时执行 BOX_IP=${boxIp} npm run tv-box:support，并归档 ${support}。`
      ]
    }
  }

  if (stage.status === 'handoff_ready_needs_box') {
    return {
      projectOwner: '可以先把交付包发给现场，但不能关闭项目。',
      siteInstaller: [
        `解压 ${handoff} 后只打开 START_HERE.html。`,
        '按 PRE_INSTALL_CHECKLIST.zh-CN.md 找到盒子 IP、打开网络调试并允许 RSA。',
        '安装完成后打开 FIELD_WIZARD_OFFLINE.html，下载 JSON，再用 FIELD_RETURN 文件夹一键打包回传。'
      ],
      engineer: [
        '现场不会命令行时，让他双击 INSTALL_ON_MAC.command 或 INSTALL_ON_WINDOWS.bat。',
        '收到 HelloTV-field-return-*.zip 后运行 npm run tv-box:return-inbox -- <zip>。',
        '只有 closure.status=ready_to_close 且写入矩阵后，才进入关闭复核。'
      ]
    }
  }

  return {
    projectOwner: '先让工程人员修复预检报告指出的问题。',
    siteInstaller: [
      '暂时不要安装到家庭电视盒子。',
      '等待工程人员重新发送 tv-box-handoff-latest.zip。'
    ],
    engineer: unique([
      ...(state.preflight?.nextActions || []),
      '修复后运行 npm run tv-box:check，再重新发交付包。'
    ])
  }
}

function buildFieldChecklist() {
  return [
    '遥控器方向键焦点能移动，OK 能进入，返回不会卡死。',
    '直播能播放、换台、返回首页；数字键缺失的遥控器可把数字项记为 na。',
    '6/0/菜单/信息/帮助键至少一种能打开帮助/自检。',
    '首页退出有大字确认，默认停在继续使用。',
    '全部内容、搜索、继续看误入后能回到简易首页。',
    '有摄像头/麦克风时测权限、Camera2 预览、音频输入和 USB 热插拔；没有外设明确记 na。',
    '帮助/自检页维护码能拍照发给工程人员。'
  ]
}

function buildReport() {
  fs.mkdirSync(reportDir, { recursive: true })

  const preflight = readJson(path.join(reportDir, 'tv-box-preflight-latest.json'))
  const commandCenter = readJson(path.join(reportDir, 'tv-box-command-center-latest.json'))
  const completionAudit = readJson(path.join(reportDir, 'tv-box-completion-audit-latest.json'))
  const inspection = readJson(path.join(reportDir, 'tv-box-inspection-latest.json'))
  const releaseLedger = readJson(path.join(reportDir, 'tv-box-release-ledger-latest.json'))
  const returnInbox = readJson(path.join(reportDir, 'tv-box-return-inbox-latest.json'))
  const handoffArchivePath = firstLine(path.join(reportDir, 'tv-box-handoff-latest-archive.txt')) || path.join(reportDir, 'tv-box-handoff-latest.zip')
  const supportArchivePath = firstLine(path.join(reportDir, 'tv-box-support-latest-archive.txt')) || path.join(reportDir, 'tv-box-support-latest.zip')

  const state = {
    preflight,
    commandCenter,
    completionAudit,
    inspection,
    releaseLedger,
    returnInbox,
    artifacts: {
      handoffArchive: fileState(handoffArchivePath),
      handoffSha: fileState(`${handoffArchivePath}.sha256`),
      supportArchive: fileState(supportArchivePath),
      supportSha: fileState(`${supportArchivePath}.sha256`),
      preflightMarkdown: fileState(path.join(reportDir, 'tv-box-preflight-latest.md')),
      commandCenterMarkdown: fileState(path.join(reportDir, 'tv-box-command-center-latest.md')),
      fieldWizardHtml: fileState(path.join(reportDir, 'tv-box-field-wizard-offline.html')),
      returnInboxMarkdown: fileState(path.join(reportDir, 'tv-box-return-inbox-latest.md'))
    }
  }

  const stage = deriveStage(state)
  const roleActions = buildRoleActions(stage, state)
  const report = {
    generatedAtUtc: new Date().toISOString(),
    projectRoot: rootDir,
    packageName: inspection?.packageName || commandCenter?.packageName || 'com.quicktvui.hellotv',
    stage,
    readiness: {
      preflightVerdict: preflight?.verdict || 'missing',
      commandCenterReadiness: commandCenter?.readiness?.level || 'missing',
      completionOverall: completionAudit?.summary?.overall || 'missing',
      returnInboxClosure: returnInbox?.closure?.status || 'missing'
    },
    device: {
      preflightStatus: preflight?.device?.status || 'missing',
      target: preflight?.device?.target || '',
      selected: preflight?.device?.selected || '',
      authorizedCount: preflight?.device?.authorizedCount || 0,
      unreadyCount: preflight?.device?.unreadyCount || 0,
      unreadyDevices: preflight?.device?.unreadyDevices || [],
      commandCenterStatus: commandCenter?.deviceEvidence?.status || 'missing'
    },
    roleActions,
    fieldChecklist: buildFieldChecklist(),
    artifacts: state.artifacts,
    closureBoundary: [
      '没有真实盒子授权、安装和现场 JSON，不允许关闭。',
      '有 fail 时进入 needs_fix，不允许用 ready_to_close 关闭。',
      '有 unknown/skip 或缺照片/日志/排障包时进入 needs_site_follow_up。',
      '摄像头/麦克风没有外设时必须显式记录 na，不能留 unknown。'
    ]
  }

  return report
}

function list(items) {
  return items.map((item) => `- ${item}`).join('\n')
}

function htmlList(items) {
  return items.map((item) => `<li>${htmlEscape(item)}</li>`).join('')
}

function writeMarkdown(report) {
  const artifactRows = Object.entries(report.artifacts).map(([key, artifact]) => (
    `| ${markdownCell(key)} | ${artifact.exists ? 'yes' : 'no'} | ${artifact.sizeBytes || 0} | \`${markdownCell(artifact.path || '')}\` |`
  )).join('\n')

  const markdown = `# HelloTV 电视盒子现场开工判定卡

- 生成时间 UTC: \`${report.generatedAtUtc}\`
- 当前状态: \`${report.stage.status}\`
- 一句话: ${report.stage.summary}
- preflight: \`${report.readiness.preflightVerdict}\`
- command readiness: \`${report.readiness.commandCenterReadiness}\`
- completion: \`${report.readiness.completionOverall}\`
- return inbox closure: \`${report.readiness.returnInboxClosure}\`
- 设备状态: \`${report.device.preflightStatus}\`

## 项目负责人

${report.roleActions.projectOwner}

## 现场安装人员只做这些

${list(report.roleActions.siteInstaller)}

## 工程维护人员只做这些

${list(report.roleActions.engineer)}

## 真实盒子验收清单

${list(report.fieldChecklist)}

## 不能关闭的边界

${list(report.closureBoundary)}

## 产物

| 项 | 存在 | 字节 | 路径 |
| --- | --- | ---: | --- |
${artifactRows}
`
  fs.writeFileSync(outputMarkdownPath, markdown)
}

function writeHtml(report) {
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>HelloTV 现场开工判定卡</title>
  <style>
    body{margin:0;background:#f5f7fb;color:#14213d;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    main{max-width:980px;margin:0 auto;padding:28px}
    header{background:#0f172a;color:white;padding:24px;border-radius:8px}
    h1{margin:0 0 10px;font-size:32px}
    h2{font-size:22px;margin:0 0 12px}
    .status{display:inline-block;background:#fbbf24;color:#111827;font-weight:800;padding:8px 12px;border-radius:6px}
    section{background:white;margin-top:16px;padding:20px;border:1px solid #d8dee9;border-radius:8px}
    li{margin:8px 0;font-size:18px;line-height:1.45}
    .danger{border-left:6px solid #dc2626}
    .ok{border-left:6px solid #16a34a}
    code{background:#eef2ff;padding:2px 4px;border-radius:4px}
    @media print{body{background:white}main{padding:0}section,header{break-inside:avoid}}
  </style>
</head>
<body>
  <main>
    <header>
      <h1>HelloTV 现场开工判定卡</h1>
      <div class="status">${htmlEscape(report.stage.status)}</div>
      <p>${htmlEscape(report.stage.summary)}</p>
    </header>
    <section class="ok">
      <h2>项目负责人</h2>
      <p>${htmlEscape(report.roleActions.projectOwner)}</p>
    </section>
    <section>
      <h2>现场安装人员</h2>
      <ol>${htmlList(report.roleActions.siteInstaller)}</ol>
    </section>
    <section>
      <h2>工程维护人员</h2>
      <ol>${htmlList(report.roleActions.engineer)}</ol>
    </section>
    <section>
      <h2>真实盒子验收清单</h2>
      <ul>${htmlList(report.fieldChecklist)}</ul>
    </section>
    <section class="danger">
      <h2>不能关闭的边界</h2>
      <ul>${htmlList(report.closureBoundary)}</ul>
    </section>
  </main>
</body>
</html>
`
  fs.writeFileSync(outputHtmlPath, html)
}

function main() {
  const report = buildReport()
  fs.writeFileSync(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`)
  writeMarkdown(report)
  writeHtml(report)
  console.log(`TV-box site readiness card written to: ${outputMarkdownPath}`)
  console.log(`Printable site readiness card: ${outputHtmlPath}`)
  console.log(`Machine-readable site readiness: ${outputJsonPath}`)
}

main()
