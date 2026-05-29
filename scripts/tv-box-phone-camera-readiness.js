#!/usr/bin/env node
const fs = require('fs')
const http = require('http')
const net = require('net')
const crypto = require('crypto')
const path = require('path')
const {
  createSignalingServer,
  signalingUrlFromBaseUrl,
  phoneCameraPairUrlFromBaseUrl
} = require('./tv-box-phone-camera-signaling-server')

const rootDir = path.resolve(__dirname, '..')
const reportDir = process.env.REPORT_DIR || path.join(rootDir, 'reports')
const outputJsonPath = process.env.TV_BOX_PHONE_CAMERA_READINESS_JSON || path.join(reportDir, 'tv-box-phone-camera-readiness-latest.json')
const outputMarkdownPath = process.env.TV_BOX_PHONE_CAMERA_READINESS_MD || path.join(reportDir, 'tv-box-phone-camera-readiness-latest.md')
const outputOnsiteCardPath = process.env.TV_BOX_PHONE_CAMERA_ONSITE_CARD_HTML || path.join(reportDir, 'tv-box-phone-camera-onsite-card.html')
const defaultPairBaseUrlValue = 'https://quicktv.local/phone-camera'
const configuredPairBaseUrl = [
  ['TV_BOX_PHONE_CAMERA_PAIR_BASE_URL', process.env.TV_BOX_PHONE_CAMERA_PAIR_BASE_URL],
  ['VITE_PHONE_CAMERA_PAIR_BASE_URL', process.env.VITE_PHONE_CAMERA_PAIR_BASE_URL]
].find(([, value]) => String(value || '').trim())
const defaultPairBaseUrl = configuredPairBaseUrl?.[1] || defaultPairBaseUrlValue
const pairBaseUrlSource = configuredPairBaseUrl?.[0] || 'built_in_default'
const defaultProfileId = process.env.TV_BOX_PHONE_CAMERA_PROFILE_ID ||
  process.env.VITE_PHONE_CAMERA_PROFILE_ID ||
  'default_720p_15'
const defaultRoomCode = process.env.TV_BOX_PHONE_CAMERA_ROOM_CODE || '482913'
const allowInsecure = process.env.TV_BOX_PHONE_CAMERA_ALLOW_INSECURE === 'true'

function fail(message) {
  throw new Error(message)
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizePairBaseUrl(value) {
  const raw = String(value || '').trim() || 'https://quicktv.local/phone-camera'
  const url = new URL(raw)
  const normalizedPath = url.pathname.replace(/\/$/, '')
  if (!normalizedPath || normalizedPath === '/') {
    url.pathname = '/phone-camera'
  } else if (!normalizedPath.endsWith('/phone-camera')) {
    url.pathname = `${normalizedPath}/phone-camera`
  }
  url.search = ''
  url.hash = ''
  return url.toString().replace(/\/$/, '')
}

function isLocalHost(hostname) {
  return ['localhost', '127.0.0.1', '::1'].includes(String(hostname || '').toLowerCase())
}

function buildFieldReachability(pairBaseUrl, source) {
  const parsed = new URL(pairBaseUrl)
  const hostname = parsed.hostname.toLowerCase()
  const isQuickTvDefault = hostname === 'quicktv.local'
  const isLocalDomain = hostname.endsWith('.local')
  const defaultOrLocalPlaceholder = source === 'built_in_default' || isQuickTvDefault || isLocalDomain

  return {
    status: defaultOrLocalPlaceholder ? 'needs_phone_dns_https_proof' : 'configured_entry_still_needs_real_phone_proof',
    pairBaseUrlSource: source,
    hostname,
    defaultPairBaseUrl: defaultPairBaseUrlValue,
    usesDefaultOrLocalPlaceholder: defaultOrLocalPlaceholder,
    provesFieldPhoneReachability: false,
    requiresPhoneDnsHttpsProof: true,
    detail: defaultOrLocalPlaceholder
      ? `${pairBaseUrl} 是默认/局域网占位入口；必须用现场手机证明 DNS、HTTPS 证书和扫码首开都可用。`
      : `${pairBaseUrl} 已配置为自定义入口；自动检查仍不能代替真实手机扫码首开证据。`,
    requiredEvidence: [
      '手机扫码首开成功截图，包含地址栏域名',
      '手机浏览器 HTTPS 证书/安全锁状态截图',
      '手机摄像头和麦克风权限已允许截图',
      '手机端本地预览与电视端首帧照片或短视频'
    ]
  }
}

function isBrowserSecureUrl(value) {
  const url = new URL(value)
  return url.protocol === 'https:' || isLocalHost(url.hostname)
}

function isSecureSignalingUrl(value) {
  const url = new URL(value)
  return url.protocol === 'wss:' || (url.protocol === 'ws:' && isLocalHost(url.hostname))
}

function httpText(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, (response) => {
      let body = ''
      response.setEncoding('utf8')
      response.on('data', (chunk) => {
        body += chunk
      })
      response.on('end', () => resolve({ statusCode: response.statusCode || 0, body }))
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
      if (bigLength > BigInt(Number.MAX_SAFE_INTEGER)) fail('WebSocket frame is too large')
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
  return { frames, rest: buffer.subarray(offset) }
}

class ReadinessWsProbe {
  constructor(url) {
    const parsed = new URL(url)
    if (parsed.protocol !== 'ws:') fail(`readiness probe only supports ws:// URLs: ${url}`)
    this.parsed = parsed
    this.messages = []
    this.waiters = []
    this.buffer = Buffer.alloc(0)
    this.handshakeComplete = false
    this.socket = net.createConnection(Number(parsed.port || 80), parsed.hostname)
  }

  open() {
    return new Promise((resolve, reject) => {
      const key = crypto.randomBytes(16).toString('base64')
      const timeout = setTimeout(() => reject(new Error('readiness WebSocket open timeout')), 2000)
      this.socket.on('connect', () => {
        this.socket.write([
          `GET ${this.parsed.pathname}${this.parsed.search} HTTP/1.1`,
          `Host: ${this.parsed.host}`,
          'Upgrade: websocket',
          'Connection: Upgrade',
          `Sec-WebSocket-Key: ${key}`,
          'Sec-WebSocket-Version: 13',
          '',
          ''
        ].join('\r\n'))
      })
      this.socket.on('data', (chunk) => this.handleData(chunk, resolve, reject, timeout))
      this.socket.on('error', (error) => {
        clearTimeout(timeout)
        reject(error)
      })
    })
  }

  handleData(chunk, resolve, reject, timeout) {
    this.buffer = Buffer.concat([this.buffer, chunk])
    if (!this.handshakeComplete) {
      const marker = this.buffer.indexOf('\r\n\r\n')
      if (marker < 0) return
      const head = this.buffer.subarray(0, marker).toString('utf8')
      this.buffer = this.buffer.subarray(marker + 4)
      if (!head.startsWith('HTTP/1.1 101')) {
        clearTimeout(timeout)
        reject(new Error(`WebSocket handshake failed: ${head.split('\r\n')[0]}`))
        return
      }
      this.handshakeComplete = true
      clearTimeout(timeout)
      resolve(this)
    }
    const decoded = decodeServerFrames(this.buffer)
    this.buffer = decoded.rest
    for (const frame of decoded.frames) {
      if (frame.opcode === 0x1) {
        this.messages.push(JSON.parse(frame.payload.toString('utf8')))
        this.flushWaiters()
      }
    }
  }

  send(message) {
    this.socket.write(encodeClientFrame(JSON.stringify(message)))
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
          reject(new Error(`readiness probe did not receive ${type}`))
        }, timeoutMs)
      }
      this.waiters.push(waiter)
    })
  }

  flushWaiters() {
    for (const waiter of [...this.waiters]) {
      const found = this.messages.find((message) => waiter.match(message))
      if (!found) continue
      clearTimeout(waiter.timeout)
      this.waiters = this.waiters.filter((item) => item !== waiter)
      waiter.resolve(found)
    }
  }

  close() {
    this.socket.end()
  }
}

function addCheck(checks, id, pass, detail, required = true) {
  checks.push({
    id,
    status: pass ? 'pass' : (required ? 'fail' : 'warn'),
    required,
    detail
  })
}

function markdownTable(rows, headers) {
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map((item) => String(item).replace(/\|/g, '/')).join(' | ')} |`)
  ].join('\n')
}

function htmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildMarkdown(report) {
  const reachabilityRows = [
    ['入口来源', report.fieldReachability.pairBaseUrlSource],
    ['主机名', report.fieldReachability.hostname],
    ['是否默认/局域网占位入口', report.fieldReachability.usesDefaultOrLocalPlaceholder ? 'yes' : 'no'],
    ['自动证明手机现场可达', report.fieldReachability.provesFieldPhoneReachability ? 'yes' : 'no'],
    ['需要手机 DNS/HTTPS 证据', report.fieldReachability.requiresPhoneDnsHttpsProof ? 'yes' : 'no'],
    ['说明', report.fieldReachability.detail]
  ]

  return `# 手机当电视摄像头现场准备度

- 生成时间 UTC: \`${report.generatedAtUtc}\`
- 状态: \`${report.status}\`
- 手机入口: \`${report.inputs.pairBaseUrl}\`
- 手机扫码 URL: \`${report.inputs.pairUrl}\`
- 信令 URL: \`${report.inputs.signalingUrl}\`
- 房间码: \`${report.inputs.roomCode}\`
- 媒体档位: \`${report.inputs.profileId}\`

## 准备度检查

${markdownTable(report.checks.map((check) => [check.id, check.status, check.required ? 'yes' : 'no', check.detail]), ['检查', '状态', '必需', '证据'])}

## 现场手机可达性

${markdownTable(reachabilityRows, ['项目', '值'])}

必须由现场手机补齐：${report.fieldReachability.requiredEvidence.join('；')}

## 现场命令

${markdownTable(Object.entries(report.fieldCommands).map(([key, value]) => [key, value]), ['用途', '命令'])}

## 验收边界

${markdownTable(Object.entries(report.acceptanceBoundary).map(([key, value]) => [key, value]), ['边界', '值'])}

这份报告只证明手机扫码入口、安全上下文配置、局域网信令服务健康检查和电视端房间创建参数已经准备好。真实通过仍必须等手机权限、电视首帧、电视声音、session.stats、断线重连和停止按钮证据闭环。
`
}

function buildOnsiteCardHtml(report) {
  const statusClass = report.status === 'pass' ? 'ok' : report.status === 'warn' ? 'warn' : 'fail'
  const failedChecks = report.checks.filter((check) => check.status !== 'pass')
  const evidenceItems = [
    '手机扫码首开成功截图，包含地址栏、域名和 HTTPS 证书安全状态',
    '电视端房间码/二维码照片',
    '手机端摄像头和麦克风权限截图',
    '手机端本地预览截图',
    '电视端首帧照片或短视频',
    '电视端收到声音的业务证据',
    'session.stats JSON 或维护码照片',
    '断线重连和停止按钮证据'
  ]
  const steps = [
    `工程电脑启动信令：${report.fieldCommands.startSignaling}`,
    `手机先直接打开扫码 URL，确认不是 DNS 或 HTTPS 证书错误页：${report.inputs.pairUrl}`,
    `电视盒子打开配对页：${report.fieldCommands.androidPairSmoke}`,
    `手机扫码打开：${report.inputs.pairUrl}`,
    '手机允许摄像头和麦克风，屏幕上必须能看到本地预览。',
    '电视出现真实首帧并能收到声音后，才把手机摄像头记为 pass。',
    '断开手机网络或退出一次后重连，确认 15 秒内恢复；最后点手机停止按钮。'
  ]

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>手机当电视摄像头现场操作卡</title>
  <style>
    :root { color-scheme: light; --ink: #172033; --muted: #5b6576; --line: #d8dee8; --ok: #0f7b4f; --warn: #9a5b00; --fail: #a12b2b; --bg: #f7f9fc; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--ink); background: var(--bg); }
    main { max-width: 980px; margin: 0 auto; padding: 28px; }
    h1 { margin: 0 0 8px; font-size: 34px; line-height: 1.15; }
    h2 { margin: 26px 0 10px; font-size: 22px; }
    p { line-height: 1.65; }
    .meta, .panel { background: white; border: 1px solid var(--line); border-radius: 8px; padding: 18px; margin-top: 16px; }
    .status { display: inline-block; padding: 6px 12px; border-radius: 999px; font-weight: 700; color: white; }
    .status.ok { background: var(--ok); }
    .status.warn { background: var(--warn); }
    .status.fail { background: var(--fail); }
    code { background: #eef2f7; border-radius: 5px; padding: 2px 5px; word-break: break-all; }
    .big-code { font-size: 32px; font-weight: 800; letter-spacing: 0; }
    ol, ul { padding-left: 24px; }
    li { margin: 8px 0; line-height: 1.55; }
    table { width: 100%; border-collapse: collapse; background: white; margin-top: 8px; }
    th, td { border: 1px solid var(--line); padding: 10px; text-align: left; vertical-align: top; }
    th { background: #eef2f7; }
    .guard { border-left: 6px solid var(--fail); }
    @media print { body { background: white; } main { padding: 0; max-width: none; } .panel, .meta { break-inside: avoid; } }
  </style>
</head>
<body>
  <main>
    <h1>手机当电视摄像头现场操作卡</h1>
    <p><span class="status ${statusClass}">${htmlEscape(report.status)}</span> 这张卡只负责现场按步骤验证手机摄像头路线，不把手机伪装成系统 Camera2。</p>

    <section class="meta">
      <p>房间码：<span class="big-code">${htmlEscape(report.inputs.roomCode)}</span></p>
      <p>手机扫码 URL：<code>${htmlEscape(report.inputs.pairUrl)}</code></p>
      <p>信令 URL：<code>${htmlEscape(report.inputs.signalingUrl)}</code></p>
      <p>媒体档位：<code>${htmlEscape(report.inputs.profileId)}</code></p>
      <p>现场手机可达性：<code>${htmlEscape(report.fieldReachability.status)}</code></p>
    </section>

    <section class="panel">
      <h2>只做六步</h2>
      <ol>${steps.map((step) => `<li>${htmlEscape(step)}</li>`).join('')}</ol>
    </section>

    <section class="panel guard">
      <h2>不能误判通过</h2>
      <ul>
        <li><code>quicktv.local</code> 是默认安全占位域名；没有手机 DNS、HTTPS 证书和首开截图时，不能说手机现场可达。</li>
        <li>手机扫码页能打开，只说明入口存在，不等于手机权限通过。</li>
        <li>信令 room.create 成功，只说明房间码和 WebSocket 可用，不等于电视有画面。</li>
        <li>只有电视上看到真实首帧、收到声音、持续上报 stats、可重连且手机停止按钮有效，才能写入 pass。</li>
        <li>微信小程序 live-pusher 需要主体资质、服务类目和接口权限审核，不能当成默认免安装承诺。</li>
      </ul>
    </section>

    <section class="panel">
      <h2>必须回传证据</h2>
      <ul>${evidenceItems.map((item) => `<li>${htmlEscape(item)}</li>`).join('')}</ul>
    </section>

    <section class="panel">
      <h2>准备度检查</h2>
      <table>
        <thead><tr><th>检查</th><th>状态</th><th>证据</th></tr></thead>
        <tbody>${report.checks.map((check) => `<tr><td>${htmlEscape(check.id)}</td><td>${htmlEscape(check.status)}</td><td>${htmlEscape(check.detail)}</td></tr>`).join('')}</tbody>
      </table>
      ${failedChecks.length ? `<p>先处理未通过项：${htmlEscape(failedChecks.map((check) => check.id).join('、'))}</p>` : '<p>准备度检查已通过，可以进入真实手机和电视首帧验收。</p>'}
    </section>
  </main>
</body>
</html>
`
}

async function main() {
  fs.mkdirSync(reportDir, { recursive: true })
  const checks = []
  const pairBaseUrl = normalizePairBaseUrl(defaultPairBaseUrl)
  const pairUrl = phoneCameraPairUrlFromBaseUrl(pairBaseUrl, defaultRoomCode)
  const signalingUrl = signalingUrlFromBaseUrl(pairBaseUrl)
  const pairParsed = new URL(pairBaseUrl)
  const signalingParsed = new URL(signalingUrl)
  const pairIsSecure = isBrowserSecureUrl(pairBaseUrl)
  const signalingIsSecure = isSecureSignalingUrl(signalingUrl)
  const insecureAllowed = allowInsecure && !pairIsSecure
  const fieldReachability = buildFieldReachability(pairBaseUrl, pairBaseUrlSource)

  addCheck(checks, 'pair_base_url_parseable', pairParsed.pathname.endsWith('/phone-camera'), pairBaseUrl)
  addCheck(checks, 'pair_entry_secure_context', pairIsSecure || insecureAllowed, pairIsSecure ? 'HTTPS/localhost 安全上下文' : `非安全入口: ${pairBaseUrl}`, !insecureAllowed)
  addCheck(checks, 'signaling_url_secure', signalingIsSecure || insecureAllowed, signalingIsSecure ? signalingUrl : `非安全信令: ${signalingUrl}`, !insecureAllowed)
  addCheck(checks, 'https_pair_uses_wss', pairParsed.protocol !== 'https:' || signalingParsed.protocol === 'wss:', signalingUrl)
  addCheck(checks, 'phone_dns_https_field_proof', !fieldReachability.usesDefaultOrLocalPlaceholder, fieldReachability.detail, false)
  addCheck(checks, 'room_code_six_digits', /^[0-9]{6}$/.test(defaultRoomCode), defaultRoomCode)
  addCheck(checks, 'profile_capped_for_tv_box', ['mvp_480p_15', 'default_720p_15', 'lab_720p_30'].includes(defaultProfileId), defaultProfileId)

  const service = createSignalingServer({
    publicBaseUrl: pairBaseUrl,
    roomTtlSeconds: 600,
    codeGenerator: () => defaultRoomCode,
    logger: { log() {}, info() {}, warn() {}, error() {} }
  })
  let probe = null

  try {
    await service.listen(0, '127.0.0.1')
    const address = service.address()
    const localPort = address.port
    const localPhoneUrl = `http://127.0.0.1:${localPort}/phone-camera?room=${defaultRoomCode}`
    const localHealthUrl = `http://127.0.0.1:${localPort}/healthz`
    const localWsUrl = `ws://127.0.0.1:${localPort}/phone-camera/signaling`

    const phonePage = await httpText(localPhoneUrl)
    addCheck(checks, 'phone_capture_page_served', phonePage.statusCode === 200, `${localPhoneUrl} -> ${phonePage.statusCode}`)
    addCheck(checks, 'phone_capture_page_has_getusermedia', phonePage.body.includes('navigator.mediaDevices.getUserMedia'), 'getUserMedia')
    addCheck(checks, 'phone_capture_page_has_webrtc_offer', phonePage.body.includes('new RTCPeerConnection'), 'RTCPeerConnection')
    addCheck(checks, 'phone_capture_page_has_stop_button', phonePage.body.includes('id="stopButton"'), 'visible stop button')
    addCheck(checks, 'phone_capture_page_warns_secure_context', phonePage.body.includes('window.isSecureContext'), 'window.isSecureContext guard')

    const health = JSON.parse((await httpText(localHealthUrl)).body)
    addCheck(checks, 'signaling_healthz_ok', health.status === 'ok' && health.service === 'quicktv-phone-camera-signaling', `${localHealthUrl} -> ${health.status}`)

    probe = await new ReadinessWsProbe(localWsUrl).open()
    probe.send({
      type: 'room.create',
      role: 'tv',
      deviceId: 'readiness-tv-box',
      appVersion: '1.0.5',
      roomCode: defaultRoomCode
    })
    const created = await probe.waitFor('room.created')
    addCheck(checks, 'tv_room_create_public_pair_url', created.pairUrl === pairUrl, created.pairUrl)
    addCheck(checks, 'tv_room_create_public_signaling_url', created.signalingUrl === signalingUrl, created.signalingUrl)
    addCheck(checks, 'room_created_exposes_secure_context', created.secureContext?.phoneCameraRequiresSecureContext === true, JSON.stringify(created.secureContext || {}))
    await wait(20)
    const afterRoom = JSON.parse((await httpText(localHealthUrl)).body)
    addCheck(checks, 'healthz_reports_tv_room', afterRoom.rooms.length === 1 && afterRoom.rooms[0].tvConnected === true, `${afterRoom.rooms.length} room(s)`)
  } finally {
    if (probe) probe.close()
    await service.close()
  }

  const failed = checks.filter((check) => check.status === 'fail')
  const warned = checks.filter((check) => check.status === 'warn')
  const report = {
    generatedAtUtc: new Date().toISOString(),
    status: failed.length > 0 ? 'fail' : warned.length > 0 ? 'warn' : 'pass',
    projectRoot: rootDir,
    inputs: {
      pairBaseUrl,
      pairBaseUrlSource,
      pairUrl,
      signalingUrl,
      roomCode: defaultRoomCode,
      profileId: defaultProfileId,
      allowInsecure
    },
    checks,
    fieldReachability,
    fieldCommands: {
      startSignaling: `PHONE_CAMERA_PUBLIC_BASE_URL=${pairBaseUrl} npm run tv-box:phone-camera-signaling`,
      androidPairSmoke: 'BOX_IP=<盒子IP> npm run tv-box:phone-camera-pair-smoke',
      realMediaAcceptance: '手机授权摄像头/麦克风后，记录电视首帧、声音、session.stats、重连和停止按钮证据',
      fallbackUsbCamera: 'C920 PRO 到货后执行 npm run tv-box:c920-arrived'
    },
    acceptanceBoundary: {
      provesSecureEntryConfiguration: failed.length === 0,
      provesLocalSignalingServiceCanStart: true,
      provesFieldPhoneReachability: fieldReachability.provesFieldPhoneReachability,
      requiresPhoneDnsHttpsProof: fieldReachability.requiresPhoneDnsHttpsProof,
      provesPhoneCapturePermissions: false,
      provesTvNativeWebrtcFirstFrame: false,
      provesTvAudioReceiving: false,
      provesReconnectAndPrivacyStop: false,
      noMediaContentPersisted: true
    },
    onsiteCard: {
      htmlPath: outputOnsiteCardPath,
      title: '手机当电视摄像头现场操作卡'
    }
  }

  fs.writeFileSync(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`)
  fs.writeFileSync(outputMarkdownPath, buildMarkdown(report))
  fs.writeFileSync(outputOnsiteCardPath, buildOnsiteCardHtml(report))

  console.log(`TV-box phone camera readiness: ${report.status}`)
  console.log(`Phone camera readiness report: ${outputMarkdownPath}`)
  console.log(`Machine-readable readiness report: ${outputJsonPath}`)
  console.log(`Printable phone camera onsite card: ${outputOnsiteCardPath}`)
  if (failed.length > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
