#!/usr/bin/env node
const childProcess = require('child_process')
const fs = require('fs')
const path = require('path')

const rootDir = path.resolve(__dirname, '..')
const reportDir = process.env.REPORT_DIR || path.join(rootDir, 'reports')
const procurementStatePath = process.env.TV_BOX_C920_PROCUREMENT_JSON || path.join(rootDir, 'tv-box-field-state', 'c920-procurement.json')
const outputJsonPath = process.env.TV_BOX_C920_PREP_JSON || path.join(reportDir, 'tv-box-c920-onsite-prep-latest.json')
const outputMarkdownPath = process.env.TV_BOX_C920_PREP_MD || path.join(reportDir, 'tv-box-c920-onsite-prep-latest.md')
const boxIp = process.env.BOX_IP || '192.168.10.122'
const deviceSerial = process.env.DEVICE_SERIAL || (boxIp.includes(':') ? boxIp : `${boxIp}:5555`)

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

function pad(value) {
  return String(value).padStart(2, '0')
}

function localIsoDate() {
  const now = new Date()
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))
}

function resolveCurrentDate() {
  if (process.env.C920_PREP_CURRENT_DATE) {
    return {
      value: process.env.C920_PREP_CURRENT_DATE,
      source: 'C920_PREP_CURRENT_DATE',
      isOverride: true
    }
  }
  if (process.env.C920_ARRIVED_CURRENT_DATE) {
    return {
      value: process.env.C920_ARRIVED_CURRENT_DATE,
      source: 'C920_ARRIVED_CURRENT_DATE',
      isOverride: true
    }
  }
  return {
    value: localIsoDate(),
    source: 'system_date',
    isOverride: false
  }
}

function parseAdbDevices(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('List of devices'))
    .map((line) => {
      const [serial = '', status = '', ...rest] = line.split(/\s+/)
      return {
        serial,
        status,
        detail: rest.join(' '),
        raw: line
      }
    })
    .filter((item) => item.serial)
}

function adbDevices() {
  if (process.env.TV_BOX_C920_PREP_SKIP_ADB === 'true') {
    return {
      available: false,
      skipped: true,
      raw: '',
      error: '',
      devices: []
    }
  }
  if (process.env.TV_BOX_C920_PREP_FAKE_ADB_DEVICES) {
    const raw = process.env.TV_BOX_C920_PREP_FAKE_ADB_DEVICES
    return {
      available: true,
      skipped: false,
      raw,
      error: '',
      devices: parseAdbDevices(raw)
    }
  }
  try {
    const raw = childProcess.execFileSync('adb', ['devices', '-l'], {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    return {
      available: true,
      skipped: false,
      raw,
      error: '',
      devices: parseAdbDevices(raw)
    }
  } catch (error) {
    return {
      available: false,
      skipped: false,
      raw: error.stdout ? String(error.stdout) : '',
      error: error.stderr ? String(error.stderr).trim() : error.message,
      devices: parseAdbDevices(error.stdout || '')
    }
  }
}

function buildDecision({ currentDate, expectedArrivalDate, adb }) {
  const target = adb.devices.find((item) => item.serial === deviceSerial)
  const onlineDevices = adb.devices.filter((item) => item.status === 'device')
  const unreadyDevices = adb.devices.filter((item) => item.status === 'offline' || item.status === 'unauthorized')
  const beforeExpectedArrival = isIsoDate(currentDate) && isIsoDate(expectedArrivalDate) && currentDate < expectedArrivalDate
  const cleanupCommands = unreadyDevices.map((item) => `adb disconnect ${item.serial}`)

  if (beforeExpectedArrival) {
    return {
      status: 'waiting_for_delivery',
      title: 'C920 PRO 还没到预计到货日',
      reason: `预计 ${expectedArrivalDate} 到货，当前是 ${currentDate}；先只做准备，不运行实体摄像头验收。`,
      readyToRunAcceptance: false,
      target,
      onlineDevices,
      unreadyDevices,
      cleanupCommands
    }
  }

  if (!adb.available && !adb.skipped) {
    return {
      status: 'needs_adb_tool',
      title: '电脑暂时找不到 adb',
      reason: '需要先让 adb 可用，才能确认小米盒子是否在线。',
      readyToRunAcceptance: false,
      target,
      onlineDevices,
      unreadyDevices,
      cleanupCommands
    }
  }

  if (!target || target.status !== 'device') {
    return {
      status: 'needs_box_connection',
      title: '小米盒子还没有处于可安装/验收状态',
      reason: target
        ? `目标设备 ${deviceSerial} 当前状态是 ${target.status}。`
        : `ADB 列表里没有看到目标设备 ${deviceSerial}。`,
      readyToRunAcceptance: false,
      target,
      onlineDevices,
      unreadyDevices,
      cleanupCommands
    }
  }

  return {
    status: unreadyDevices.length ? 'ready_to_plug_and_run_with_adb_noise' : 'ready_to_plug_and_run',
    title: unreadyDevices.length ? '可以接入 C920，但建议先清理离线 ADB 噪声' : '可以接入 C920 并运行验收',
    reason: `目标设备 ${deviceSerial} 在线；C920 到货后直插 USB，再运行一键验收。`,
    readyToRunAcceptance: true,
    target,
    onlineDevices,
    unreadyDevices,
    cleanupCommands
  }
}

function markdownList(items) {
  return items.length ? items.map((item) => `- ${item}`).join('\n') : '- 暂无'
}

function markdownTable(rows) {
  if (!rows.length) return '暂无'
  return [
    '| 序列号 | 状态 | 说明 |',
    '| --- | --- | --- |',
    ...rows.map((row) => `| \`${row.serial}\` | \`${row.status}\` | ${String(row.detail || row.raw || '').replace(/\|/g, '/')} |`)
  ].join('\n')
}

const procurementState = readJson(procurementStatePath) || {}
const expectedArrivalDate = process.env.C920_EXPECTED_ARRIVAL_DATE || procurementState.expectedArrivalDate || ''
const purchaseChannel = process.env.C920_PURCHASE_CHANNEL || procurementState.purchaseChannel || ''
const currentDateInfo = resolveCurrentDate()
const currentDate = currentDateInfo.value
const adb = adbDevices()
const decision = buildDecision({ currentDate, expectedArrivalDate, adb })

const data = {
  generatedAtUtc: new Date().toISOString(),
  projectRoot: rootDir,
  reportDir,
  inputs: {
    boxIp,
    deviceSerial,
    currentDate,
    currentDateSource: currentDateInfo.source,
    currentDateOverride: currentDateInfo.isOverride
  },
  procurement: {
    cameraModel: procurementState.cameraModel || 'Logitech C920 PRO',
    physicalStatus: procurementState.physicalStatus || '',
    purchaseChannel,
    expectedArrivalDate,
    note: procurementState.note || '',
    statePath: procurementStatePath,
    stateExists: fs.existsSync(procurementStatePath)
  },
  adb: {
    available: adb.available,
    skipped: adb.skipped,
    error: adb.error,
    targetSerial: deviceSerial,
    targetStatus: decision.target ? decision.target.status : 'missing',
    devices: adb.devices,
    onlineDevices: decision.onlineDevices,
    unreadyDevices: decision.unreadyDevices
  },
  result: {
    status: decision.status,
    title: decision.title,
    reason: decision.reason,
    readyToRunAcceptance: decision.readyToRunAcceptance
  },
  commands: {
    prep: 'npm run tv-box:c920-prep',
    main: 'npm run tv-box:c920-arrived',
    withBoxIp: `BOX_IP=${boxIp} npm run tv-box:c920-arrived`,
    earlyOverride: 'C920_ARRIVED_ALLOW_EARLY=true npm run tv-box:c920-arrived',
    cleanupAdbNoise: decision.cleanupCommands
  },
  onsiteChecklist: [
    '先把 C920 PRO 直插小米盒子 USB 口。',
    '小米盒子只有一个 USB 口时，第一轮只接 C920：同一根 USB 同时测试画面和 C920 自带麦克风。',
    '电视盒子和电脑保持同一网络，盒子网络调试保持开启。',
    '运行 npm run tv-box:c920-arrived。',
    '电视上看到 C920 实时画面后，FIELD_CAMERA_PREVIEW 才能记 pass。',
    '对着 C920 自带麦克风说话，在互动课/录音链路里确认声音进入业务。',
    '拔插一次 C920 后重新确认 USB/Camera2/预览是否稳定。'
  ],
  singleUsbPlan: {
    status: 'use_c920_builtin_microphone_first',
    reason: '小米盒子只有一个 USB 口，C920 PRO 自带麦克风；先用一根 USB 同时验证视频和音频，减少 Hub 和独立麦克风变量。',
    primary: 'C920 PRO 直插小米盒子 USB 口，先测真实画面，再测 C920 自带麦克风业务输入。',
    fallback: '直插供电不稳、C920 麦克风不进业务，或必须外接独立会议麦克风时，再换带独立供电 USB Hub。',
    doNotStartWith: '不要一开始就串联无源 Hub、独立麦克风和多设备，避免把供电/Hub 问题误判成摄像头不兼容。'
  },
  failureBranches: [
    'USB 仍只看到 Realtek 或没有 Logitech/C920/UVC：重新插紧，再换带独立供电 USB Hub。',
    'USB 有视频线索但 CameraService cameraCount 仍为 0：优先判定为盒子固件/Camera HAL 风险，准备 C270 低规格复测。',
    'CameraPreviewActivity 打开但电视黑屏：不能记 pass，保留照片/日志后排查权限、分辨率和 Camera2 会话。',
    'C920 自带麦克风不稳定：再换带独立供电 USB Hub，并准备免驱 USB Audio Class 会议麦克风。'
  ],
  closeGuards: [
    '没有电视真实画面，不能关闭摄像头验收。',
    '没有业务录音或互动课输入证据，不能关闭麦克风验收。',
    '没有热插拔复测，不能关闭 USB 稳定性验收。',
    '手机当电视摄像头仍走手机采集 + 电视端原生 WebRTC，不伪装系统 Camera2。'
  ]
}

fs.mkdirSync(reportDir, { recursive: true })
fs.writeFileSync(outputJsonPath, `${JSON.stringify(data, null, 2)}\n`)

const md = `# C920 PRO 到货现场预备卡

- 生成时间 UTC: \`${data.generatedAtUtc}\`
- 当前日期: \`${currentDate}\`
- 日期来源: \`${currentDateInfo.source}${currentDateInfo.isOverride ? ' / override' : ''}\`
- 摄像头: \`${data.procurement.cameraModel}\`
- 采购/预计到货: \`${purchaseChannel || '未记录'} / ${expectedArrivalDate || '未记录'}\`
- 盒子 IP: \`${boxIp}\`
- 目标 ADB: \`${deviceSerial}\`
- 当前状态: \`${data.result.status}\`
- 判断: ${data.result.reason}

## 现在只需要做什么

${decision.readyToRunAcceptance
    ? `1. 先执行这些清理命令（如果有）：${decision.cleanupCommands.length ? `\`${decision.cleanupCommands.join(' && ')}\`` : '无'}\n2. C920 PRO 到货后直插小米盒子 USB。\n3. 运行：\`${data.commands.main}\`\n4. 看电视屏幕确认真实画面、麦克风和热插拔。`
    : `1. 暂时不要运行实体摄像头验收。\n2. 先处理当前状态：${data.result.title}。\n3. 到货并插好后运行：\`${data.commands.main}\``
}

## ADB 设备

${markdownTable(data.adb.devices)}

## 离线/未授权噪声

${markdownList(decision.cleanupCommands.length ? decision.cleanupCommands.map((command) => `可执行 \`${command}\` 清理`) : [])}

## 现场核对

${markdownList(data.onsiteChecklist)}

## 单 USB 口接线策略

- 优先: ${data.singleUsbPlan.primary}
- 原因: ${data.singleUsbPlan.reason}
- 降级: ${data.singleUsbPlan.fallback}
- 避免: ${data.singleUsbPlan.doNotStartWith}

## 失败分流

${markdownList(data.failureBranches)}

## 不能关闭的边界

${markdownList(data.closeGuards)}

## 相关文件

- \`${path.relative(rootDir, outputJsonPath)}\`
- \`reports/tv-box-c920-arrival-card-latest.md\`
- \`reports/tv-box-c920-pro-acceptance-latest.md\`
- \`reports/tv-box-support-latest.zip\`
`

fs.writeFileSync(outputMarkdownPath, md)

console.log(`C920 onsite prep card: ${outputMarkdownPath}`)
console.log(`Machine-readable prep: ${outputJsonPath}`)
console.log(`Status: ${data.result.status}`)
