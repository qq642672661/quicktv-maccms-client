#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const rootDir = path.resolve(__dirname, '..')
const reportDir = process.env.REPORT_DIR || path.join(rootDir, 'reports')
const contractJsonPath = process.env.TV_BOX_PHONE_CAMERA_CONTRACT_JSON || path.join(reportDir, 'tv-box-phone-camera-contract-latest.json')
const outputJsonPath = process.env.TV_BOX_PHONE_CAMERA_SCENARIOS_JSON || path.join(reportDir, 'tv-box-phone-camera-scenarios-test-latest.json')
const outputMarkdownPath = process.env.TV_BOX_PHONE_CAMERA_SCENARIOS_MD || path.join(reportDir, 'tv-box-phone-camera-scenarios-test-latest.md')

function fail(message) {
  throw new Error(message)
}

function runContractGenerator() {
  const result = spawnSync('npm', ['run', '-s', 'tv-box:phone-camera-contract'], {
    cwd: rootDir,
    env: process.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  })

  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join('\n')
    fail(`phone camera contract generation failed\n${detail}`)
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function messageMap(contract) {
  return new Map(contract.signalingMessages.map((message) => [message.type, message]))
}

function transitionMap(contract) {
  const map = new Map()
  for (const [from, to, event] of contract.stateMachine.transitions) {
    map.set(`${from}:${event}`, to)
  }
  return map
}

function validateRoomCode(contract, roomCode) {
  return new RegExp(contract.room.codePattern).test(roomCode)
}

function validateMessage(contract, messages, step) {
  const definition = messages.get(step.type)
  if (!definition) fail(`unknown signaling message: ${step.type}`)

  const payload = step.payload || {}
  for (const field of definition.required) {
    if (!(field in payload)) fail(`${step.type} missing required field: ${field}`)
  }

  if ('roomCode' in payload && !validateRoomCode(contract, payload.roomCode)) {
    fail(`${step.type} has invalid roomCode: ${payload.roomCode}`)
  }

  if (step.type === 'room.created') {
    if (!validateRoomCode(contract, payload.roomCode)) fail('room.created roomCode must be six digits')
    if (!String(payload.pairUrl || '').includes(payload.roomCode)) fail('room.created pairUrl must carry roomCode')
  }

  if (step.type === 'session.stats') {
    const defaultProfile = contract.mediaProfiles.find((profile) => profile.id === payload.profileId)
    if (!defaultProfile) fail(`session.stats profileId is not declared: ${payload.profileId}`)
    if (payload.videoHeight > defaultProfile.height || payload.fps > defaultProfile.fps) {
      fail(`session.stats exceeds declared profile: ${payload.profileId}`)
    }
  }
}

function validateStatsCadence(contract, steps) {
  const stats = steps
    .filter((step) => step.kind === 'message' && step.type === 'session.stats')
    .map((step) => step.payload)
    .filter((payload) => typeof payload.sequenceSecond === 'number')

  for (let index = 1; index < stats.length; index += 1) {
    const delta = stats[index].sequenceSecond - stats[index - 1].sequenceSecond
    if (delta > contract.acceptance.statsCadenceSeconds) {
      fail(`session.stats cadence drifted to ${delta}s`)
    }
  }
}

function runStateScenario(contract, scenario) {
  const messages = messageMap(contract)
  const transitions = transitionMap(contract)
  let state = 'idle'
  const pathItems = [state]
  const emittedMessages = []

  for (const step of scenario.steps) {
    if (step.kind === 'message') {
      validateMessage(contract, messages, step)
      emittedMessages.push(step.type)
      continue
    }

    if (step.kind === 'event') {
      const next = transitions.get(`${state}:${step.event}`)
      if (!next) fail(`${scenario.id} cannot transition ${state} via ${step.event}`)
      state = next
      pathItems.push(state)
      continue
    }

    fail(`${scenario.id} has unknown step kind: ${step.kind}`)
  }

  validateStatsCadence(contract, scenario.steps)

  if (scenario.expectedFinalState && state !== scenario.expectedFinalState) {
    fail(`${scenario.id} final state ${state}, expected ${scenario.expectedFinalState}`)
  }

  for (const type of scenario.requiredMessages || []) {
    if (!emittedMessages.includes(type)) fail(`${scenario.id} did not emit ${type}`)
  }

  return {
    id: scenario.id,
    label: scenario.label,
    status: 'pass',
    route: scenario.route || contract.defaultRoute,
    finalState: state,
    statePath: pathItems,
    messages: emittedMessages,
    evidence: scenario.evidence || [],
    nextAction: scenario.nextAction || ''
  }
}

function runRouteGateScenario(contract, scenario) {
  const route = contract.fallbackPolicy.find((item) => item.route === scenario.route)
  if (!route) fail(`${scenario.id} missing route: ${scenario.route}`)
  if (route.status !== scenario.expectedRouteStatus) {
    fail(`${scenario.id} route status ${route.status}, expected ${scenario.expectedRouteStatus}`)
  }
  if (scenario.route === 'wechat_live_pusher' && route.status !== 'gated_optional') {
    fail('WeChat live-pusher must stay gated_optional')
  }

  return {
    id: scenario.id,
    label: scenario.label,
    status: 'pass',
    route: scenario.route,
    routeStatus: route.status,
    finalState: 'gated',
    statePath: [],
    messages: [],
    evidence: scenario.evidence || [],
    nextAction: scenario.nextAction || ''
  }
}

const baseConnectSteps = [
  { kind: 'message', type: 'room.create', payload: { role: 'tv', deviceId: 'mitv-azfp0', appVersion: '1.0.5' } },
  { kind: 'event', event: 'tv_generate_room' },
  { kind: 'message', type: 'room.created', payload: { roomCode: '482913', expiresAtUtc: '2026-05-29T08:10:00Z', pairUrl: 'https://hello-tv.local/pair?room=482913' } },
  { kind: 'message', type: 'peer.hello', payload: { roomCode: '482913', role: 'phone', userAgent: 'Phone PWA', mediaCapabilities: { camera: true, microphone: true } } },
  { kind: 'event', event: 'phone_hello' },
  { kind: 'message', type: 'webrtc.offer', payload: { sdp: 'v=0 fake offer', profileId: 'default_720p_15' } },
  { kind: 'event', event: 'offer_exchange_started' },
  { kind: 'message', type: 'webrtc.answer', payload: { sdp: 'v=0 fake answer', receiverProfileId: 'default_720p_15' } },
  { kind: 'message', type: 'webrtc.ice-candidate', payload: { candidate: 'candidate:1 1 udp 1 192.168.10.122 5000 typ host', sdpMid: '0', sdpMLineIndex: 0 } },
  { kind: 'message', type: 'session.keepalive', payload: { roomCode: '482913', state: 'negotiating', timestampUtc: '2026-05-29T08:00:04Z' } },
  { kind: 'event', event: 'first_frame_and_audio_ready' }
]

const statsOk = [
  { kind: 'message', type: 'session.stats', payload: { profileId: 'default_720p_15', videoWidth: 1280, videoHeight: 720, fps: 15, bitrateKbps: 1200, packetsLost: 0, rttMs: 25, sequenceSecond: 2 } },
  { kind: 'message', type: 'session.stats', payload: { profileId: 'default_720p_15', videoWidth: 1280, videoHeight: 720, fps: 15, bitrateKbps: 1180, packetsLost: 1, rttMs: 32, sequenceSecond: 4 } }
]

const scenarios = [
  {
    id: 'happy_path_native_webrtc',
    label: '手机扫码后完成 WebRTC 首帧和音频接收',
    steps: [...baseConnectSteps, ...statsOk],
    expectedFinalState: 'receiving',
    requiredMessages: ['room.create', 'room.created', 'peer.hello', 'webrtc.offer', 'webrtc.answer', 'webrtc.ice-candidate', 'session.keepalive', 'session.stats'],
    evidence: ['电视端房间码/二维码照片', '手机端权限截图', '电视端首帧截图或视频', 'session.stats JSON'],
    nextAction: '进入 10 分钟稳定性和遥控器返回/停止测试。'
  },
  {
    id: 'room_expired_before_phone',
    label: '手机未扫码时房间码过期，不进入媒体协商',
    steps: [
      { kind: 'message', type: 'room.create', payload: { role: 'tv', deviceId: 'mitv-azfp0', appVersion: '1.0.5' } },
      { kind: 'event', event: 'tv_generate_room' },
      { kind: 'message', type: 'room.created', payload: { roomCode: '482913', expiresAtUtc: '2026-05-29T08:10:00Z', pairUrl: 'https://hello-tv.local/pair?room=482913' } },
      { kind: 'event', event: 'room_expired_or_user_back' },
      { kind: 'message', type: 'session.hangup', payload: { reason: 'room_expired' } }
    ],
    expectedFinalState: 'stopped',
    requiredMessages: ['room.create', 'room.created', 'session.hangup'],
    evidence: ['电视端显示重新生成房间码', '旧二维码不可继续配对'],
    nextAction: '遥控器 OK 重新生成房间码，旧房间码必须失效。'
  },
  {
    id: 'phone_permission_failed',
    label: '手机摄像头或麦克风权限失败，进入可恢复错误',
    steps: [
      { kind: 'message', type: 'room.create', payload: { role: 'tv', deviceId: 'mitv-azfp0', appVersion: '1.0.5' } },
      { kind: 'event', event: 'tv_generate_room' },
      { kind: 'message', type: 'room.created', payload: { roomCode: '482913', expiresAtUtc: '2026-05-29T08:10:00Z', pairUrl: 'https://hello-tv.local/pair?room=482913' } },
      { kind: 'message', type: 'peer.hello', payload: { roomCode: '482913', role: 'phone', userAgent: 'Phone PWA', mediaCapabilities: { camera: false, microphone: false } } },
      { kind: 'event', event: 'phone_hello' },
      { kind: 'message', type: 'webrtc.offer', payload: { sdp: 'v=0 fake offer missing tracks', profileId: 'mvp_480p_15' } },
      { kind: 'event', event: 'offer_exchange_started' },
      { kind: 'message', type: 'session.error', payload: { code: 'phone_permission_denied', message: '手机未授权摄像头或麦克风', recoverable: true } },
      { kind: 'event', event: 'offer_answer_or_permission_failed' }
    ],
    expectedFinalState: 'error',
    requiredMessages: ['peer.hello', 'webrtc.offer', 'session.error'],
    evidence: ['手机权限失败截图', '电视端错误码 phone_permission_denied'],
    nextAction: '电视端只提示手机重新授权，不把电视盒子 Camera2 记为失败。'
  },
  {
    id: 'ice_disconnect_recover',
    label: '网络短断后 15 秒内重连恢复',
    steps: [
      ...baseConnectSteps,
      { kind: 'event', event: 'ice_disconnected' },
      { kind: 'message', type: 'session.keepalive', payload: { roomCode: '482913', state: 'reconnecting', timestampUtc: '2026-05-29T08:00:08Z' } },
      { kind: 'event', event: 'ice_recovered' },
      ...statsOk
    ],
    expectedFinalState: 'receiving',
    requiredMessages: ['session.keepalive', 'session.stats'],
    evidence: ['断线时间点', '恢复时间点', '重连后 session.stats'],
    nextAction: '现场记录重连耗时，超过合同阈值时进入 needs_fix。'
  },
  {
    id: 'weak_network_degrade_recover',
    label: '弱网先降级再恢复默认档位',
    steps: [
      ...baseConnectSteps,
      { kind: 'message', type: 'session.stats', payload: { profileId: 'mvp_480p_15', videoWidth: 640, videoHeight: 480, fps: 15, bitrateKbps: 420, packetsLost: 120, rttMs: 180, sequenceSecond: 2 } },
      { kind: 'event', event: 'packet_loss_or_low_bitrate' },
      { kind: 'message', type: 'session.stats', payload: { profileId: 'default_720p_15', videoWidth: 1280, videoHeight: 720, fps: 15, bitrateKbps: 1100, packetsLost: 2, rttMs: 35, sequenceSecond: 4 } },
      { kind: 'event', event: 'stats_recovered' }
    ],
    expectedFinalState: 'receiving',
    requiredMessages: ['session.stats'],
    evidence: ['弱网降级 stats', '恢复后 stats'],
    nextAction: '弱网只降清晰度，不让长辈重新配置复杂参数。'
  },
  {
    id: 'privacy_stop',
    label: '手机或电视端停止后不再接收音视频',
    steps: [
      ...baseConnectSteps,
      { kind: 'message', type: 'session.hangup', payload: { reason: 'user_stop' } },
      { kind: 'event', event: 'user_stop_or_back' }
    ],
    expectedFinalState: 'stopped',
    requiredMessages: ['session.hangup'],
    evidence: ['手机端停止按钮截图', '电视端已停止状态截图'],
    nextAction: '停止按钮必须显眼，默认不录制、不留媒体内容。'
  },
  {
    id: 'wechat_live_pusher_gated',
    label: '微信小程序 live-pusher 保持资质门禁，不进入默认路线',
    kind: 'route_gate',
    route: 'wechat_live_pusher',
    expectedRouteStatus: 'gated_optional',
    evidence: ['主体资质', '服务类目', '接口权限', '隐私与未成年人告知'],
    nextAction: '资质未确认前，产品只写可接入方案，不承诺扫码即用。'
  }
]

function markdownTable(rows, headers) {
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map((item) => String(item).replace(/\|/g, '/')).join(' | ')} |`)
  ].join('\n')
}

function buildMarkdown(report) {
  return `# 手机当电视摄像头场景回归

- 生成时间 UTC: \`${report.generatedAtUtc}\`
- 合同版本: \`${report.contractVersion}\`
- 默认路线: \`${report.defaultRoute}\`
- 状态: \`${report.status}\`
- 场景数: \`${report.scenarioCount}\`

## 场景

${markdownTable(report.scenarios.map((scenario) => [
  scenario.id,
  scenario.status,
  scenario.route,
  scenario.finalState || scenario.routeStatus,
  scenario.nextAction
]), ['id', '状态', '路线', '最终状态', '下一步'])}

## 保护边界

- 手机摄像头不伪装成 Android 系统 Camera2。
- 默认路线保持电视端原生 WebRTC 接收。
- 微信小程序 live-pusher 仍是 \`gated_optional\`，需要主体资质、服务类目和接口权限。
- 现场关闭条件必须包含首帧、音频、重连、隐私停止和 stats 证据。
`
}

function main() {
  fs.mkdirSync(reportDir, { recursive: true })
  runContractGenerator()
  const profile = readJson(contractJsonPath)
  const contract = profile.contract
  const results = scenarios.map((scenario) => (
    scenario.kind === 'route_gate'
      ? runRouteGateScenario(contract, scenario)
      : runStateScenario(contract, scenario)
  ))

  const report = {
    generatedAtUtc: new Date().toISOString(),
    projectRoot: rootDir,
    contractPath: contractJsonPath,
    contractVersion: contract.version,
    defaultRoute: contract.defaultRoute,
    status: results.every((scenario) => scenario.status === 'pass') ? 'pass' : 'fail',
    scenarioCount: results.length,
    scenarios: results,
    acceptanceBoundaries: {
      phoneCameraIsNotSystemCamera2: true,
      defaultRouteIsNativeWebrtcReceiver: contract.defaultRoute === 'native_webrtc_receiver',
      wechatLivePusherRequiresQualification: contract.fallbackPolicy.some((item) => item.route === 'wechat_live_pusher' && item.status === 'gated_optional'),
      requiredFieldEvidence: contract.acceptance.requiredEvidence
    }
  }

  fs.writeFileSync(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`)
  fs.writeFileSync(outputMarkdownPath, buildMarkdown(report))
  console.log('TV-box phone camera scenarios test passed.')
  console.log(`Machine-readable scenarios report: ${outputJsonPath}`)
  console.log(`Scenarios report: ${outputMarkdownPath}`)
}

main()
