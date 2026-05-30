#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

const rootDir = path.resolve(__dirname, '..')
const reportDir = process.env.REPORT_DIR || path.join(rootDir, 'reports')
const baseUrl = String(process.env.TV_BOX_PHONE_CAMERA_CLOUDFLARE_BASE_URL || '').replace(/\/$/, '')
const roomCode = process.env.TV_BOX_PHONE_CAMERA_ROOM_CODE || '735921'
const outputJson = path.join(reportDir, 'tv-box-phone-camera-cloudflare-smoke-latest.json')
const outputMarkdown = path.join(reportDir, 'tv-box-phone-camera-cloudflare-smoke-latest.md')

function fail(message) {
  throw new Error(message)
}

function wsUrl(role) {
  return `${baseUrl.replace(/^http/, 'ws')}/phone-camera/signaling?room=${roomCode}&role=${role}`
}

function connect(role) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl(role))
    socket.messages = []
    socket.waiters = []
    socket.addEventListener('open', () => resolve(socket), { once: true })
    socket.addEventListener('error', () => reject(new Error(`${role} WebSocket failed`)), { once: true })
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data))
      socket.messages.push(message)
      for (const waiter of [...socket.waiters]) {
        if (waiter.type === message.type) {
          clearTimeout(waiter.timer)
          socket.waiters.splice(socket.waiters.indexOf(waiter), 1)
          waiter.resolve(message)
        }
      }
    })
  })
}

function waitFor(socket, type, timeoutMs = 5000) {
  const existing = socket.messages.find((message) => message.type === type)
  if (existing) return Promise.resolve(existing)
  return new Promise((resolve, reject) => {
    const waiter = {
      type,
      resolve,
      timer: setTimeout(() => reject(new Error(`Timed out waiting for ${type}`)), timeoutMs)
    }
    socket.waiters.push(waiter)
  })
}

function send(socket, payload) {
  socket.send(JSON.stringify(payload))
}

async function main() {
  if (!baseUrl.startsWith('https://')) fail('Set TV_BOX_PHONE_CAMERA_CLOUDFLARE_BASE_URL=https://<worker>.workers.dev')
  if (typeof WebSocket !== 'function') fail('Node.js with global WebSocket support is required')
  fs.mkdirSync(reportDir, { recursive: true })
  const steps = []
  const health = await fetch(`${baseUrl}/healthz`).then((response) => response.json())
  if (health.status !== 'ok') fail('Worker healthz failed')
  steps.push(['worker_healthz', 'pass', health.architecture])

  const tv = await connect('tv')
  send(tv, { type: 'room.create', role: 'tv', deviceId: 'cloudflare-smoke-tv', appVersion: 'smoke', roomCode, receiverProfileId: 'default_720p_15' })
  const created = await waitFor(tv, 'room.created')
  if (created.roomCode !== roomCode) fail('room.created returned a different room code')
  steps.push(['tv_room_create', 'pass', created.signalingUrl])

  const phone = await connect('phone')
  send(phone, { type: 'peer.hello', roomCode, role: 'phone', userAgent: 'cloudflare-smoke-phone', mediaCapabilities: { camera: true, microphone: true, profileId: 'default_720p_15', secureContext: true } })
  await waitFor(tv, 'peer.hello')
  steps.push(['phone_join', 'pass', roomCode])

  send(phone, { type: 'webrtc.offer', sdp: 'smoke-offer', profileId: 'default_720p_15' })
  await waitFor(tv, 'webrtc.offer')
  send(tv, { type: 'webrtc.answer', sdp: 'smoke-answer', receiverProfileId: 'default_720p_15' })
  await waitFor(phone, 'webrtc.answer')
  steps.push(['offer_answer_relay', 'pass', 'offer -> answer'])

  send(tv, { type: 'session.stats', profileId: 'default_720p_15', videoWidth: 1280, videoHeight: 720, fps: 15, bitrateKbps: 900, packetsLost: 0, rttMs: 12 })
  await new Promise((resolve) => setTimeout(resolve, 300))
  const roomHealth = await fetch(`${baseUrl}/healthz?room=${roomCode}`).then((response) => response.json())
  if (!roomHealth.room?.lastStats) fail('room healthz did not persist stats')
  steps.push(['stats_persisted', 'pass', `${roomHealth.room.lastStats.videoWidth}x${roomHealth.room.lastStats.videoHeight}`])

  send(phone, { type: 'session.hangup', reason: 'smoke_complete' })
  await waitFor(tv, 'session.hangup')
  tv.close()
  phone.close()
  steps.push(['privacy_stop_hangup', 'pass', 'session.hangup relayed'])

  const report = {
    generatedAtUtc: new Date().toISOString(),
    status: 'pass',
    baseUrl,
    roomCode,
    boundary: 'This proves Cloudflare HTTPS/WSS room routing, relay, stats persistence and hangup only. Real phone permissions, TV first frame, TV audio, reconnect and privacy-stop field evidence are still required.',
    steps
  }
  fs.writeFileSync(outputJson, `${JSON.stringify(report, null, 2)}\n`)
  fs.writeFileSync(outputMarkdown, `# HelloTV Cloudflare 手机摄像头信令冒烟

- 生成时间 UTC: \`${report.generatedAtUtc}\`
- 状态: \`${report.status}\`
- Worker: \`${report.baseUrl}\`
- 房间码: \`${report.roomCode}\`

| 检查 | 状态 | 证据 |
| --- | --- | --- |
${steps.map(([id, status, evidence]) => `| ${id} | ${status} | ${evidence} |`).join('\n')}

## 验收边界

${report.boundary}
`)
  console.log(`TV-box phone camera Cloudflare smoke: ${report.status}`)
  console.log(`Machine-readable report: ${outputJson}`)
  console.log(`Markdown report: ${outputMarkdown}`)
}

main().catch((error) => {
  console.error(error.stack || error.message)
  process.exitCode = 1
})
