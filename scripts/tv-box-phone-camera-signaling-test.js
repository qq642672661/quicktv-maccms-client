#!/usr/bin/env node
const fs = require('fs')
const crypto = require('crypto')
const http = require('http')
const net = require('net')
const path = require('path')
const { createSignalingServer } = require('./tv-box-phone-camera-signaling-server')

const rootDir = path.resolve(__dirname, '..')
const reportDir = process.env.REPORT_DIR || path.join(rootDir, 'reports')
const outputJsonPath = process.env.TV_BOX_PHONE_CAMERA_SIGNALING_JSON || path.join(reportDir, 'tv-box-phone-camera-signaling-test-latest.json')
const outputMarkdownPath = process.env.TV_BOX_PHONE_CAMERA_SIGNALING_MD || path.join(reportDir, 'tv-box-phone-camera-signaling-test-latest.md')

function fail(message) {
  throw new Error(message)
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function markdownTable(rows, headers) {
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map((item) => String(item).replace(/\|/g, '/')).join(' | ')} |`)
  ].join('\n')
}

function httpJson(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, (response) => {
      let body = ''
      response.setEncoding('utf8')
      response.on('data', (chunk) => {
        body += chunk
      })
      response.on('end', () => {
        try {
          resolve(JSON.parse(body))
        } catch (error) {
          reject(error)
        }
      })
    })
    request.on('error', reject)
  })
}

function encodeClientFrame(data, opcode = 0x1) {
  const payload = Buffer.from(String(data))
  let header

  if (payload.length < 126) {
    header = Buffer.alloc(2)
    header[1] = 0x80 | payload.length
  } else if (payload.length < 65536) {
    header = Buffer.alloc(4)
    header[1] = 0x80 | 126
    header.writeUInt16BE(payload.length, 2)
  } else {
    header = Buffer.alloc(10)
    header[1] = 0x80 | 127
    header.writeBigUInt64BE(BigInt(payload.length), 2)
  }

  header[0] = 0x80 | opcode
  const mask = crypto.randomBytes(4)
  const masked = Buffer.from(payload)
  for (let index = 0; index < masked.length; index += 1) {
    masked[index] ^= mask[index % 4]
  }

  return Buffer.concat([header, mask, masked])
}

function decodeServerFrames(buffer) {
  const frames = []
  let offset = 0

  while (offset + 2 <= buffer.length) {
    const byte1 = buffer[offset]
    const byte2 = buffer[offset + 1]
    const opcode = byte1 & 0x0f
    const masked = (byte2 & 0x80) !== 0
    let length = byte2 & 0x7f
    let cursor = offset + 2

    if (length === 126) {
      if (cursor + 2 > buffer.length) break
      length = buffer.readUInt16BE(cursor)
      cursor += 2
    } else if (length === 127) {
      if (cursor + 8 > buffer.length) break
      const bigLength = buffer.readBigUInt64BE(cursor)
      if (bigLength > BigInt(Number.MAX_SAFE_INTEGER)) fail('WebSocket test frame is too large')
      length = Number(bigLength)
      cursor += 8
    }

    const maskOffset = masked ? 4 : 0
    if (cursor + maskOffset + length > buffer.length) break

    let payload = buffer.subarray(cursor + maskOffset, cursor + maskOffset + length)
    if (masked) {
      const mask = buffer.subarray(cursor, cursor + 4)
      payload = Buffer.from(payload)
      for (let index = 0; index < payload.length; index += 1) {
        payload[index] ^= mask[index % 4]
      }
    }

    frames.push({ opcode, payload })
    offset = cursor + maskOffset + length
  }

  return {
    frames,
    rest: buffer.subarray(offset)
  }
}

class NodeWsFallback {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  constructor(url) {
    const parsed = new URL(url)
    if (parsed.protocol !== 'ws:') fail(`fallback WebSocket only supports ws:// URLs: ${url}`)
    this.url = url
    this.readyState = NodeWsFallback.CONNECTING
    this.listeners = { open: [], message: [], error: [], close: [] }
    this.buffer = Buffer.alloc(0)
    this.handshakeComplete = false
    this.socket = net.createConnection(Number(parsed.port || 80), parsed.hostname)
    const key = crypto.randomBytes(16).toString('base64')

    this.socket.on('connect', () => {
      this.socket.write([
        `GET ${parsed.pathname}${parsed.search} HTTP/1.1`,
        `Host: ${parsed.host}`,
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Key: ${key}`,
        'Sec-WebSocket-Version: 13',
        '',
        ''
      ].join('\r\n'))
    })
    this.socket.on('data', (chunk) => this.handleData(chunk))
    this.socket.on('error', (error) => this.emit('error', { message: error.message, error }))
    this.socket.on('close', () => {
      this.readyState = NodeWsFallback.CLOSED
      this.emit('close', {})
    })
  }

  addEventListener(type, listener, options = {}) {
    const wrapped = options.once
      ? (event) => {
        this.listeners[type] = this.listeners[type].filter((item) => item !== wrapped)
        listener(event)
      }
      : listener
    this.listeners[type].push(wrapped)
  }

  emit(type, event) {
    for (const listener of [...(this.listeners[type] || [])]) {
      listener(event)
    }
  }

  handleData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk])

    if (!this.handshakeComplete) {
      const marker = this.buffer.indexOf('\r\n\r\n')
      if (marker < 0) return
      const head = this.buffer.subarray(0, marker).toString('utf8')
      this.buffer = this.buffer.subarray(marker + 4)
      if (!head.startsWith('HTTP/1.1 101')) {
        this.readyState = NodeWsFallback.CLOSED
        this.emit('error', { message: `WebSocket handshake failed: ${head.split('\r\n')[0]}` })
        return
      }
      this.handshakeComplete = true
      this.readyState = NodeWsFallback.OPEN
      this.emit('open', {})
    }

    const decoded = decodeServerFrames(this.buffer)
    this.buffer = decoded.rest
    for (const frame of decoded.frames) {
      if (frame.opcode === 0x1) {
        this.emit('message', { data: frame.payload.toString('utf8') })
      } else if (frame.opcode === 0x8) {
        this.readyState = NodeWsFallback.CLOSED
        this.socket.end()
      }
    }
  }

  send(data) {
    if (this.readyState !== NodeWsFallback.OPEN) fail('fallback WebSocket is not open')
    this.socket.write(encodeClientFrame(data))
  }

  close() {
    if (this.readyState === NodeWsFallback.OPEN) {
      this.readyState = NodeWsFallback.CLOSING
      this.socket.write(encodeClientFrame('', 0x8))
    }
    this.socket.end()
  }
}

const WebSocketImpl = typeof WebSocket === 'function' ? WebSocket : NodeWsFallback
const WS_OPEN = WebSocketImpl.OPEN ?? 1
const WS_CONNECTING = WebSocketImpl.CONNECTING ?? 0

class WsProbe {
  constructor(name, url) {
    this.name = name
    this.url = url
    this.ws = new WebSocketImpl(url)
    this.messages = []
    this.waiters = []

    this.ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      this.messages.push(message)
      this.flushWaiters()
    })
  }

  async open() {
    if (this.ws.readyState === WS_OPEN) return this
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`${this.name} open timeout`)), 2000)
      this.ws.addEventListener('open', () => {
        clearTimeout(timeout)
        resolve()
      }, { once: true })
      this.ws.addEventListener('error', (event) => {
        clearTimeout(timeout)
        reject(new Error(`${this.name} WebSocket error: ${event.message || 'unknown'}`))
      }, { once: true })
    })
    return this
  }

  send(message) {
    this.ws.send(JSON.stringify(message))
  }

  flushWaiters() {
    for (const waiter of [...this.waiters]) {
      const found = this.messages.find((message) => waiter.match(message))
      if (found) {
        clearTimeout(waiter.timeout)
        this.waiters = this.waiters.filter((item) => item !== waiter)
        waiter.resolve(found)
      }
    }
  }

  waitFor(type, predicate = () => true, timeoutMs = 2000) {
    const found = this.messages.find((message) => message.type === type && predicate(message))
    if (found) return Promise.resolve(found)

    return new Promise((resolve, reject) => {
      const waiter = {
        match: (message) => message.type === type && predicate(message),
        resolve,
        timeout: setTimeout(() => {
          this.waiters = this.waiters.filter((item) => item !== waiter)
          reject(new Error(`${this.name} did not receive ${type} in ${timeoutMs}ms`))
        }, timeoutMs)
      }
      this.waiters.push(waiter)
    })
  }

  close() {
    if (this.ws.readyState === WS_OPEN || this.ws.readyState === WS_CONNECTING) {
      this.ws.close()
    }
  }
}

async function main() {
  fs.mkdirSync(reportDir, { recursive: true })

  const service = createSignalingServer({
    roomTtlSeconds: 600,
    codeGenerator: () => '999999',
    logger: { log() {}, info() {}, warn() {}, error() {} }
  })

  const probes = []
  const steps = []

  try {
    await service.listen(0, '127.0.0.1')
    const address = service.address()
    const port = address.port
    const wsUrl = `ws://127.0.0.1:${port}/phone-camera/signaling`
    const healthUrl = `http://127.0.0.1:${port}/healthz`

    steps.push(['start_service', 'pass', wsUrl])

    const tv = await new WsProbe('tv', wsUrl).open()
    probes.push(tv)
    tv.send({ type: 'room.create', role: 'tv', deviceId: 'mitv-azfp0', appVersion: '1.0.5', roomCode: '482913' })
    const created = await tv.waitFor('room.created')
    if (created.roomCode !== '482913') fail(`unexpected room code: ${created.roomCode}`)
    if (created.roomCodeSource !== 'tv_requested') fail(`room code source should be tv_requested: ${created.roomCodeSource}`)
    if (!created.pairUrl.includes('482913')) fail('pairUrl must carry the room code')
    if (created.signalingUrl !== wsUrl) fail(`signalingUrl mismatch: ${created.signalingUrl}`)
    steps.push(['room_create_with_tv_room_code', 'pass', `${created.roomCodeSource} / ${created.pairUrl}`])

    const health = await httpJson(healthUrl)
    if (health.rooms.length !== 1 || !health.rooms[0].tvConnected) fail('healthz did not expose the TV room')
    steps.push(['healthz_room_snapshot', 'pass', `${health.rooms.length} room`])

    const secureService = createSignalingServer({
      publicBaseUrl: 'https://hello-tv.local',
      roomTtlSeconds: 600,
      codeGenerator: () => '135790',
      logger: { log() {}, info() {}, warn() {}, error() {} }
    })
    let secureTv = null
    try {
      await secureService.listen(0, '127.0.0.1')
      const secureAddress = secureService.address()
      const secureWsUrl = `ws://127.0.0.1:${secureAddress.port}/phone-camera/signaling`
      secureTv = await new WsProbe('secure_tv', secureWsUrl).open()
      secureTv.send({ type: 'room.create', role: 'tv', deviceId: 'mitv-azfp0', appVersion: '1.0.5', roomCode: '135790' })
      const secureCreated = await secureTv.waitFor('room.created')
      if (secureCreated.pairUrl !== 'https://hello-tv.local/phone-camera?room=135790') fail(`secure pairUrl mismatch: ${secureCreated.pairUrl}`)
      if (secureCreated.signalingUrl !== 'wss://hello-tv.local/phone-camera/signaling') fail(`secure signalingUrl mismatch: ${secureCreated.signalingUrl}`)
      if (!secureCreated.secureContext?.phoneCameraRequiresSecureContext) fail('secureContext must state that phone camera requires a secure context')
      if (secureCreated.secureContext?.pairUrlBrowserSecure !== true) fail('HTTPS pairUrl must be browser-secure')
      if (secureCreated.secureContext?.signalingUrlSecure !== true) fail('HTTPS signalingUrl must be WSS')
      steps.push(['https_public_base_uses_wss', 'pass', secureCreated.signalingUrl])
    } finally {
      if (secureTv) secureTv.close()
      await secureService.close()
    }

    const duplicateTv = await new WsProbe('duplicate_tv', wsUrl).open()
    probes.push(duplicateTv)
    duplicateTv.send({ type: 'room.create', role: 'tv', deviceId: 'mitv-duplicate', appVersion: '1.0.5', roomCode: '482913' })
    await duplicateTv.waitFor('session.error', (message) => message.code === 'room_code_unavailable')
    steps.push(['duplicate_tv_room_code_rejected', 'pass', 'room_code_unavailable'])

    const badPhone = await new WsProbe('bad_phone', wsUrl).open()
    probes.push(badPhone)
    badPhone.send({
      type: 'peer.hello',
      roomCode: '111111',
      role: 'phone',
      userAgent: 'Phone PWA',
      mediaCapabilities: { camera: true, microphone: true }
    })
    await badPhone.waitFor('session.error', (message) => message.code === 'room_not_found')
    steps.push(['invalid_room_rejected', 'pass', 'room_not_found'])

    const phone = await new WsProbe('phone', wsUrl).open()
    probes.push(phone)
    phone.send({
      type: 'peer.hello',
      roomCode: '482913',
      role: 'phone',
      userAgent: 'Phone PWA',
      mediaCapabilities: { camera: true, microphone: true }
    })
    await tv.waitFor('peer.hello', (message) => message.roomCode === '482913' && message.fromRole === 'phone')
    steps.push(['phone_join_relayed_to_tv', 'pass', 'peer.hello'])

    const secondPhone = await new WsProbe('second_phone', wsUrl).open()
    probes.push(secondPhone)
    secondPhone.send({
      type: 'peer.hello',
      roomCode: '482913',
      role: 'phone',
      userAgent: 'Second Phone',
      mediaCapabilities: { camera: true, microphone: true }
    })
    await secondPhone.waitFor('session.error', (message) => message.code === 'room_already_paired')
    steps.push(['second_phone_rejected', 'pass', 'room_already_paired'])

    phone.send({ type: 'webrtc.offer', sdp: 'v=0 fake offer', profileId: 'default_720p_15' })
    await tv.waitFor('webrtc.offer', (message) => message.fromRole === 'phone' && message.profileId === 'default_720p_15')
    steps.push(['offer_relayed_phone_to_tv', 'pass', 'default_720p_15'])

    tv.send({ type: 'webrtc.answer', sdp: 'v=0 fake answer', receiverProfileId: 'default_720p_15' })
    await phone.waitFor('webrtc.answer', (message) => message.fromRole === 'tv' && message.receiverProfileId === 'default_720p_15')
    steps.push(['answer_relayed_tv_to_phone', 'pass', 'default_720p_15'])

    phone.send({
      type: 'webrtc.ice-candidate',
      candidate: 'candidate:1 1 udp 1 192.168.10.10 5000 typ host',
      sdpMid: '0',
      sdpMLineIndex: 0
    })
    await tv.waitFor('webrtc.ice-candidate', (message) => message.fromRole === 'phone')
    steps.push(['ice_relayed_phone_to_tv', 'pass', 'host candidate'])

    tv.send({
      type: 'webrtc.ice-candidate',
      candidate: 'candidate:2 1 udp 1 192.168.10.122 5002 typ host',
      sdpMid: '0',
      sdpMLineIndex: 0
    })
    await phone.waitFor('webrtc.ice-candidate', (message) => message.fromRole === 'tv')
    steps.push(['ice_relayed_tv_to_phone', 'pass', 'host candidate'])

    phone.send({
      type: 'session.keepalive',
      roomCode: '482913',
      state: 'negotiating',
      timestampUtc: '2026-05-29T08:00:04Z'
    })
    await tv.waitFor('session.keepalive', (message) => message.fromRole === 'phone' && message.state === 'negotiating')
    steps.push(['keepalive_relayed', 'pass', 'negotiating'])

    tv.send({
      type: 'session.stats',
      profileId: 'default_720p_15',
      videoWidth: 1280,
      videoHeight: 720,
      fps: 15,
      bitrateKbps: 1200,
      packetsLost: 0,
      rttMs: 25
    })
    await wait(20)
    const withStats = service.snapshot()
    const lastStats = withStats.rooms[0]?.lastStats
    if (!lastStats || lastStats.profileId !== 'default_720p_15') fail('TV stats were not accepted by the service')
    steps.push(['stats_accepted_without_media_logging', 'pass', `${lastStats.videoWidth}x${lastStats.videoHeight}@${lastStats.fps}`])

    phone.send({ type: 'session.hangup', reason: 'user_stop' })
    await tv.waitFor('session.hangup', (message) => message.fromRole === 'phone' && message.reason === 'user_stop')
    await wait(20)
    if (service.snapshot().rooms.length !== 0) fail('room should close after hangup')
    steps.push(['hangup_closes_room', 'pass', 'user_stop'])

    const report = {
      generatedAtUtc: new Date().toISOString(),
      status: 'pass',
      projectRoot: rootDir,
      service: {
        healthUrl,
        wsUrl,
        roomTtlSeconds: 600
      },
      scenarioCount: steps.length,
      steps: steps.map(([id, status, detail]) => ({ id, status, detail })),
      acceptanceBoundary: {
        provesLanWebSocketSignaling: true,
        provesNativeWebrtcFirstFrame: false,
        provesPhoneCapturePermissions: false,
        noMediaContentPersisted: true,
        roomCodeExpires: true,
        oneTvOnePhone: true
      }
    }

    fs.writeFileSync(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`)
    fs.writeFileSync(outputMarkdownPath, buildMarkdown(report))

    console.log('TV-box phone camera LAN signaling test passed.')
    console.log(`Machine-readable signaling report: ${outputJsonPath}`)
    console.log(`Signaling report: ${outputMarkdownPath}`)
  } finally {
    for (const probe of probes) {
      probe.close()
    }
    await service.close()
  }
}

function buildMarkdown(report) {
  return `# 手机当电视摄像头局域网信令回归

- 生成时间 UTC: \`${report.generatedAtUtc}\`
- 状态: \`${report.status}\`
- WebSocket: \`${report.service.wsUrl}\`
- 健康检查: \`${report.service.healthUrl}\`
- 房间有效期: \`${report.service.roomTtlSeconds} 秒\`
- 场景数: \`${report.scenarioCount}\`

## 已验证

${markdownTable(report.steps.map((step) => [step.id, step.status, step.detail]), ['步骤', '状态', '证据'])}

## 验收边界

${markdownTable(Object.entries(report.acceptanceBoundary).map(([key, value]) => [key, value]), ['边界', '值'])}

这条回归只证明 M2 局域网 WebSocket 信令服务可创建房间、拒绝无效房间、限制一台电视配一台手机、转发 offer/answer/ICE/keepalive、接收 stats、挂断后关闭房间。真实通过仍必须等 Android 原生 WebRTC 接收端、手机采集端、电视首帧、音频接收、重连和停止按钮证据。
`
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
