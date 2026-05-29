#!/usr/bin/env node
const fs = require('fs')
const http = require('http')
const path = require('path')
const { createSignalingServer, buildPhoneCameraHtml } = require('./tv-box-phone-camera-signaling-server')

const rootDir = path.resolve(__dirname, '..')
const reportDir = process.env.REPORT_DIR || path.join(rootDir, 'reports')
const outputJsonPath = process.env.TV_BOX_PHONE_CAMERA_CAPTURE_JSON || path.join(reportDir, 'tv-box-phone-camera-capture-test-latest.json')
const outputMarkdownPath = process.env.TV_BOX_PHONE_CAMERA_CAPTURE_MD || path.join(reportDir, 'tv-box-phone-camera-capture-test-latest.md')

function fail(message) {
  throw new Error(message)
}

function httpText(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, (response) => {
      let body = ''
      response.setEncoding('utf8')
      response.on('data', (chunk) => {
        body += chunk
      })
      response.on('end', () => {
        resolve({
          statusCode: response.statusCode,
          headers: response.headers,
          body
        })
      })
    })
    request.on('error', reject)
  })
}

function assertIncludes(text, needle, label, steps) {
  if (!text.includes(needle)) fail(`${label} missing: ${needle}`)
  steps.push({ id: label, status: 'pass', evidence: needle })
}

function assertNotIncludes(text, needle, label, steps) {
  if (text.includes(needle)) fail(`${label} unexpectedly found: ${needle}`)
  steps.push({ id: label, status: 'pass', evidence: `not present: ${needle}` })
}

function markdownTable(rows, headers) {
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map((item) => String(item).replace(/\|/g, '/')).join(' | ')} |`)
  ].join('\n')
}

function buildMarkdown(report) {
  return `# 手机摄像头采集端页面回归

- 生成时间 UTC: \`${report.generatedAtUtc}\`
- 状态: \`${report.status}\`
- 测试页面: \`${report.service.phoneCameraUrl}\`
- 场景数: \`${report.stepCount}\`

## 已验证

${markdownTable(report.steps.map((step) => [step.id, step.status, step.evidence]), ['步骤', '状态', '证据'])}

## 验收边界

${markdownTable(Object.entries(report.acceptanceBoundary).map(([key, value]) => [key, value]), ['边界', '值'])}

这条回归证明 M4 手机采集入口已经具备房间码、权限请求、WebRTC offer、停止按钮和 HTTPS/WSS 安全上下文保护。它仍不证明真实手机权限、电视端原生 WebRTC 首帧、音频接收或弱网重连已经通过。
`
}

async function main() {
  fs.mkdirSync(reportDir, { recursive: true })

  const service = createSignalingServer({
    roomTtlSeconds: 600,
    codeGenerator: () => '482913',
    logger: { log() {}, info() {}, warn() {}, error() {} }
  })
  const steps = []

  try {
    await service.listen(0, '127.0.0.1')
    const address = service.address()
    const port = address.port
    const phoneCameraUrl = `http://127.0.0.1:${port}/phone-camera?room=482913`
    const response = await httpText(phoneCameraUrl)

    if (response.statusCode !== 200) fail(`phone camera page status must be 200, got ${response.statusCode}`)
    steps.push({ id: 'http_phone_camera_page', status: 'pass', evidence: String(response.statusCode) })

    const html = response.body
    const directHtml = buildPhoneCameraHtml('482913')

    assertIncludes(html, 'value="482913"', 'room_code_prefilled', steps)
    assertIncludes(html, 'navigator.mediaDevices.getUserMedia', 'uses_get_user_media', steps)
    assertIncludes(html, 'new RTCPeerConnection', 'uses_rtc_peer_connection', steps)
    assertIncludes(html, "type: 'peer.hello'", 'sends_peer_hello', steps)
    assertIncludes(html, "type: 'webrtc.offer'", 'sends_webrtc_offer', steps)
    assertIncludes(html, "type: 'session.keepalive'", 'sends_keepalive', steps)
    assertIncludes(html, "type: 'session.hangup'", 'sends_hangup', steps)
    assertIncludes(html, 'window.isSecureContext', 'guards_secure_context', steps)
    assertIncludes(html, "window.location.protocol === 'https:' ? 'wss:' : 'ws:'", 'selects_wss_on_https', steps)
    assertIncludes(html, 'default_720p_15', 'uses_default_tv_profile', steps)
    assertIncludes(html, 'id="stopButton"', 'has_visible_stop_button', steps)
    assertIncludes(html, '默认不录制', 'keeps_no_recording_copy', steps)
    assertIncludes(html, '不上传音视频内容', 'keeps_no_media_upload_copy', steps)
    assertIncludes(html, 'HTTPS/WSS', 'documents_secure_origin_need', steps)
    assertNotIncludes(html, '<script src=', 'no_external_script_dependency', steps)
    assertNotIncludes(html, 'MediaRecorder', 'no_recording_api', steps)
    assertNotIncludes(html, 'fetch(', 'no_media_upload_fetch', steps)
    assertIncludes(directHtml, '<video id="localPreview"', 'direct_renderer_has_preview', steps)

    const report = {
      generatedAtUtc: new Date().toISOString(),
      status: 'pass',
      projectRoot: rootDir,
      service: {
        phoneCameraUrl,
        roomTtlSeconds: 600
      },
      stepCount: steps.length,
      steps,
      acceptanceBoundary: {
        provesPhoneCaptureEntryHtml: true,
        provesGetUserMediaRequestPath: true,
        provesWebrtcOfferPath: true,
        provesVisibleStopControl: true,
        provesSecureContextGuard: true,
        provesRealPhonePermission: false,
        provesNativeWebrtcTvFirstFrame: false,
        provesTvAudioReceiving: false
      }
    }

    fs.writeFileSync(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`)
    fs.writeFileSync(outputMarkdownPath, buildMarkdown(report))

    console.log('TV-box phone camera capture page test passed.')
    console.log(`Machine-readable capture report: ${outputJsonPath}`)
    console.log(`Capture report: ${outputMarkdownPath}`)
  } finally {
    await service.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
