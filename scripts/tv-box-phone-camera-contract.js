#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

const rootDir = path.resolve(__dirname, '..')
const reportDir = process.env.REPORT_DIR || path.join(rootDir, 'reports')
const outputJsonPath = process.env.TV_BOX_PHONE_CAMERA_CONTRACT_JSON || path.join(reportDir, 'tv-box-phone-camera-contract-latest.json')
const outputMarkdownPath = process.env.TV_BOX_PHONE_CAMERA_CONTRACT_MD || path.join(reportDir, 'tv-box-phone-camera-contract-latest.md')

const contract = {
  version: '2026-05-29.1',
  purpose: '手机采集摄像头和麦克风，电视盒子原生 WebRTC 接收；QuickTVUI 只负责遥控器友好的配对、状态、重试和降级。',
  defaultRoute: 'native_webrtc_receiver',
  nonGoals: [
    '不把手机伪装成 Android 系统 Camera2 摄像头。',
    '不承诺微信小程序免审核推流。',
    '不把 RTSP/RTMP 当作低延迟互动课长期主方案。'
  ],
  room: {
    codePattern: '^[0-9]{6}$',
    codeExample: '482913',
    ttlSeconds: 600,
    maxPeers: 2,
    roles: ['tv', 'phone'],
    expireOnPair: true,
    regenerateActions: ['tv_remote_ok', 'tv_remote_0_help', 'timeout', 'pair_failed']
  },
  components: [
    {
      id: 'tv_quicktvui_pairing_page',
      owner: 'QuickTVUI frontend',
      responsibilities: ['显示大二维码和 6 位房间码', '只暴露重新生成/返回/帮助三个遥控动作', '展示连接中/已连接/重连/降级/失败状态']
    },
    {
      id: 'android_webrtc_receiver',
      owner: 'Android native module',
      responsibilities: ['集成成熟 WebRTC SDK', '接收远端视频和音频轨', '限制旧盒子默认 720p/15fps 或 480p/15fps', '向 QuickTVUI 上报首帧、码率、丢包、断线和错误码']
    },
    {
      id: 'phone_capture_entry',
      owner: 'Phone PWA/App/mini-program',
      responsibilities: ['请求手机摄像头和麦克风权限', '展示明确的隐私告知和停止按钮', '采集横屏优先视频和 Opus 音频', '弱网时自动降到 480p/15fps']
    },
    {
      id: 'lan_signaling_service',
      owner: 'Backend or local gateway',
      responsibilities: ['WebSocket 信令', '一次性房间码校验', 'offer/answer/ICE 转发', '心跳和过期清理', '不保存音视频内容']
    }
  ],
  stateMachine: {
    states: ['idle', 'waiting_for_phone', 'phone_connected', 'negotiating', 'receiving', 'reconnecting', 'degraded', 'stopped', 'error'],
    transitions: [
      ['idle', 'waiting_for_phone', 'tv_generate_room'],
      ['waiting_for_phone', 'phone_connected', 'phone_hello'],
      ['phone_connected', 'negotiating', 'offer_exchange_started'],
      ['negotiating', 'receiving', 'first_frame_and_audio_ready'],
      ['receiving', 'reconnecting', 'ice_disconnected'],
      ['reconnecting', 'receiving', 'ice_recovered'],
      ['receiving', 'degraded', 'packet_loss_or_low_bitrate'],
      ['degraded', 'receiving', 'stats_recovered'],
      ['waiting_for_phone', 'stopped', 'room_expired_or_user_back'],
      ['receiving', 'stopped', 'user_stop_or_back'],
      ['negotiating', 'error', 'offer_answer_or_permission_failed']
    ]
  },
  signalingMessages: [
    { type: 'room.create', direction: 'tv->service', required: ['role', 'deviceId', 'appVersion'] },
    { type: 'room.created', direction: 'service->tv', required: ['roomCode', 'expiresAtUtc', 'pairUrl'] },
    { type: 'peer.hello', direction: 'phone->service->tv', required: ['roomCode', 'role', 'userAgent', 'mediaCapabilities'] },
    { type: 'webrtc.offer', direction: 'phone->service->tv', required: ['sdp', 'profileId'] },
    { type: 'webrtc.answer', direction: 'tv->service->phone', required: ['sdp', 'receiverProfileId'] },
    { type: 'webrtc.ice-candidate', direction: 'both', required: ['candidate', 'sdpMid', 'sdpMLineIndex'] },
    { type: 'session.keepalive', direction: 'both', required: ['roomCode', 'state', 'timestampUtc'] },
    { type: 'session.stats', direction: 'tv->service', required: ['profileId', 'videoWidth', 'videoHeight', 'fps', 'bitrateKbps', 'packetsLost', 'rttMs'] },
    { type: 'session.hangup', direction: 'both', required: ['reason'] },
    { type: 'session.error', direction: 'both', required: ['code', 'message', 'recoverable'] }
  ],
  mediaProfiles: [
    { id: 'mvp_480p_15', width: 640, height: 480, fps: 15, videoCodec: 'VP8 or H264 Baseline', audioCodec: 'Opus', maxVideoKbps: 700 },
    { id: 'default_720p_15', width: 1280, height: 720, fps: 15, videoCodec: 'VP8 or H264 Baseline', audioCodec: 'Opus', maxVideoKbps: 1500 },
    { id: 'lab_720p_30', width: 1280, height: 720, fps: 30, videoCodec: 'VP8 or H264 Baseline', audioCodec: 'Opus', maxVideoKbps: 2500 }
  ],
  acceptance: {
    pairWithinSeconds: 60,
    firstFrameWithinSeconds: 10,
    reconnectWithinSeconds: 15,
    statsCadenceSeconds: 2,
    minimumStableMinutes: 10,
    requiredEvidence: [
      '电视端房间码/二维码照片',
      '手机端权限已授权截图',
      '电视端首帧截图或视频',
      'session.stats JSON',
      '断开重连记录',
      '失败时 support bundle'
    ],
    fieldResults: [
      'phonePairing',
      'phoneCameraPermission',
      'phoneMicrophonePermission',
      'tvFirstFrame',
      'tvAudioReceiving',
      'reconnect',
      'privacyStop'
    ]
  },
  fallbackPolicy: [
    { route: 'native_webrtc_receiver', when: '互动课、视频通话、AI 看护、低延迟手机摄像头', status: 'default' },
    { route: 'rtsp_rtmp_preview', when: '同网只看画面、MVP 预览、非强互动', status: 'fallback' },
    { route: 'usb_uvc_camera2', when: '实体摄像头、扫码、拍照、离线能力', status: 'parallel_baseline' },
    { route: 'wechat_live_pusher', when: '主体资质、服务类目、接口权限和隐私合规通过后', status: 'gated_optional' }
  ],
  privacyAndSafety: {
    consentRequired: true,
    noRecordingByDefault: true,
    localOnlyDefault: true,
    visibleStopControl: true,
    minorProtectionCopyRequired: true,
    logMediaContent: false,
    roomCodeMustExpire: true
  },
  implementationMilestones: [
    { id: 'm1_contract_and_pairing_ui', label: '合同、配对页、房间码和状态文案', proof: 'tv-box:phone-camera-contract + QuickTVUI pairing page source check' },
    { id: 'm2_lan_signaling', label: '局域网 WebSocket 信令服务', proof: 'offer/answer/ICE contract test' },
    { id: 'm3_android_receiver', label: 'Android 原生 WebRTC 接收端', proof: '真实电视盒子首帧和 stats' },
    { id: 'm4_phone_capture', label: '手机采集端/PWA 或 App', proof: '手机权限、采集、停止按钮和弱网降级记录' },
    { id: 'm5_field_acceptance', label: '现场验收矩阵纳入手机摄像头结果', proof: 'field record/inbox/import close-ready evidence' }
  ],
  officialBasis: [
    'QuickTVUI/HelloTV 当前未提供手机摄像头直连电视的 WebRTC 示例，需自建接收和信令层。',
    'Android Camera2/USB UVC 仍作为实体摄像头保底，手机摄像头不等于系统 Camera2 设备。',
    '微信小程序 live-pusher 需要服务类目、主体资质和接口权限审核，只能作为合规后入口。'
  ]
}

function fail(message) {
  throw new Error(message)
}

function assertContractShape() {
  if (!/^\^\[0-9\]\{6\}\$$/.test(contract.room.codePattern)) fail('room code must be a six-digit numeric code pattern')
  if (contract.room.ttlSeconds < 300 || contract.room.ttlSeconds > 900) fail('room ttl must stay between 5 and 15 minutes')
  if (!contract.room.roles.includes('tv') || !contract.room.roles.includes('phone')) fail('room roles must include tv and phone')
  if (contract.room.maxPeers !== 2) fail('phone camera room must stay one TV plus one phone for MVP')

  const requiredMessages = ['room.create', 'room.created', 'peer.hello', 'webrtc.offer', 'webrtc.answer', 'webrtc.ice-candidate', 'session.keepalive', 'session.stats', 'session.hangup', 'session.error']
  const messageTypes = contract.signalingMessages.map((message) => message.type)
  for (const type of requiredMessages) {
    if (!messageTypes.includes(type)) fail(`missing signaling message: ${type}`)
  }

  const requiredStates = ['idle', 'waiting_for_phone', 'phone_connected', 'negotiating', 'receiving', 'reconnecting', 'degraded', 'stopped', 'error']
  for (const state of requiredStates) {
    if (!contract.stateMachine.states.includes(state)) fail(`missing state: ${state}`)
  }

  const defaultProfile = contract.mediaProfiles.find((profile) => profile.id === 'default_720p_15')
  if (!defaultProfile) fail('missing default_720p_15 media profile')
  if (defaultProfile.height > 720 || defaultProfile.fps > 15) fail('default TV-box profile must stay <= 720p/15fps for older boxes')

  if (!contract.privacyAndSafety.consentRequired) fail('consent is required')
  if (!contract.privacyAndSafety.noRecordingByDefault) fail('recording must be off by default')
  if (!contract.privacyAndSafety.localOnlyDefault) fail('LAN/local-first default is required')
  if (!contract.privacyAndSafety.roomCodeMustExpire) fail('room code expiration is required')

  const fallbackRoutes = contract.fallbackPolicy.map((item) => item.route)
  for (const route of ['native_webrtc_receiver', 'rtsp_rtmp_preview', 'usb_uvc_camera2', 'wechat_live_pusher']) {
    if (!fallbackRoutes.includes(route)) fail(`missing fallback route: ${route}`)
  }
}

function markdownTable(rows, headers = ['项', '值']) {
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map((item) => String(item).replace(/\|/g, '/')).join(' | ')} |`)
  ].join('\n')
}

function markdownList(items) {
  return items.map((item) => `- ${item}`).join('\n')
}

function buildMarkdown(profile) {
  return `# 手机当电视摄像头信令与验收合同

- 生成时间 UTC: \`${profile.generatedAtUtc}\`
- 合同版本: \`${profile.contract.version}\`
- 默认路线: \`${profile.contract.defaultRoute}\`
- 验证状态: \`${profile.verification.status}\`

## 目标边界

${profile.contract.purpose}

${markdownList(profile.contract.nonGoals)}

## 房间码

${markdownTable([
  ['格式', profile.contract.room.codePattern],
  ['示例', profile.contract.room.codeExample],
  ['有效期', `${profile.contract.room.ttlSeconds} 秒`],
  ['参与方', profile.contract.room.roles.join(' + ')],
  ['最大连接数', profile.contract.room.maxPeers],
  ['配对后失效', profile.contract.room.expireOnPair ? 'yes' : 'no']
])}

## 组件责任

${markdownTable(profile.contract.components.map((item) => [item.id, item.owner, item.responsibilities.join('；')]), ['组件', '责任方', '职责'])}

## 状态机

状态：${profile.contract.stateMachine.states.map((state) => `\`${state}\``).join(' -> ')}

${markdownTable(profile.contract.stateMachine.transitions.map(([from, to, event]) => [from, to, event]), ['from', 'to', 'event'])}

## 信令消息

${markdownTable(profile.contract.signalingMessages.map((message) => [message.type, message.direction, message.required.join(', ')]), ['type', '方向', '必填字段'])}

## 媒体档位

${markdownTable(profile.contract.mediaProfiles.map((profileItem) => [profileItem.id, `${profileItem.width}x${profileItem.height}`, `${profileItem.fps}fps`, profileItem.videoCodec, profileItem.audioCodec, `${profileItem.maxVideoKbps}kbps`]), ['id', '分辨率', '帧率', '视频', '音频', '上限'])}

## 现场验收

${markdownTable([
  ['配对', `${profile.contract.acceptance.pairWithinSeconds} 秒内完成`],
  ['首帧', `${profile.contract.acceptance.firstFrameWithinSeconds} 秒内出现`],
  ['重连', `${profile.contract.acceptance.reconnectWithinSeconds} 秒内恢复`],
  ['统计', `${profile.contract.acceptance.statsCadenceSeconds} 秒一条 stats`],
  ['稳定性', `连续 ${profile.contract.acceptance.minimumStableMinutes} 分钟`]
])}

必须回传证据：

${markdownList(profile.contract.acceptance.requiredEvidence)}

## 降级路线

${markdownTable(profile.contract.fallbackPolicy.map((item) => [item.route, item.status, item.when]), ['路线', '状态', '适用场景'])}

## 隐私与未成年人保护

${markdownTable(Object.entries(profile.contract.privacyAndSafety).map(([key, value]) => [key, value]))}

## 里程碑

${markdownTable(profile.contract.implementationMilestones.map((item) => [item.id, item.label, item.proof]), ['id', '交付物', '证明方式'])}

## 技术依据

${markdownList(profile.contract.officialBasis)}
`
}

function main() {
  assertContractShape()
  fs.mkdirSync(reportDir, { recursive: true })
  const profile = {
    generatedAtUtc: new Date().toISOString(),
    projectRoot: rootDir,
    verification: {
      status: 'pass',
      checks: [
        'six_digit_expiring_room_code',
        'tv_phone_roles_only',
        'required_signaling_messages_present',
        'required_state_machine_states_present',
        'default_profile_capped_for_old_tv_boxes',
        'privacy_defaults_enabled',
        'fallback_routes_declared'
      ]
    },
    contract
  }
  fs.writeFileSync(outputJsonPath, `${JSON.stringify(profile, null, 2)}\n`)
  fs.writeFileSync(outputMarkdownPath, buildMarkdown(profile))
  console.log(`TV-box phone camera contract written to: ${outputMarkdownPath}`)
  console.log(`Machine-readable phone camera contract: ${outputJsonPath}`)
}

main()
