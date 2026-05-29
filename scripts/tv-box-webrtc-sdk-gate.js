#!/usr/bin/env node
const fs = require('fs')
const https = require('https')
const path = require('path')

const rootDir = path.resolve(__dirname, '..')
const reportDir = process.env.REPORT_DIR || path.join(rootDir, 'reports')
const outputJsonPath = process.env.TV_BOX_WEBRTC_SDK_GATE_JSON || path.join(reportDir, 'tv-box-webrtc-sdk-gate-latest.json')
const outputMarkdownPath = process.env.TV_BOX_WEBRTC_SDK_GATE_MD || path.join(reportDir, 'tv-box-webrtc-sdk-gate-latest.md')
const defaultCoordinate = 'io.github.webrtc-sdk:android:114.5735.11'
const coordinate = process.env.PHONE_CAMERA_WEBRTC_COORDINATE || defaultCoordinate
const networkCheckEnabled = /^(1|true|yes|y)$/i.test(process.env.WEBRTC_SDK_GATE_NETWORK || '')
const sdkEnabled = /^(1|true|yes|y)$/i.test(process.env.ENABLE_PHONE_CAMERA_WEBRTC || '')

function readText(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8')
}

function hasText(relativePath, needle) {
  try {
    return readText(relativePath).includes(needle)
  } catch {
    return false
  }
}

function fail(message) {
  throw new Error(message)
}

function parseCoordinate(value) {
  const parts = String(value || '').split(':')
  if (parts.length !== 3 || parts.some((part) => part.trim().length === 0)) {
    fail(`invalid Maven coordinate: ${value}`)
  }
  return {
    groupId: parts[0],
    artifactId: parts[1],
    version: parts[2]
  }
}

function mavenCentralUrl({ groupId, artifactId, version }, extension) {
  const groupPath = groupId.replace(/\./g, '/')
  return `https://repo.maven.apache.org/maven2/${groupPath}/${artifactId}/${version}/${artifactId}-${version}.${extension}`
}

function head(url) {
  return new Promise((resolve) => {
    const request = https.request(url, { method: 'HEAD', timeout: 20000 }, (response) => {
      response.resume()
      resolve({
        url,
        ok: response.statusCode >= 200 && response.statusCode < 300,
        statusCode: response.statusCode,
        contentLength: Number(response.headers['content-length'] || 0),
        contentType: response.headers['content-type'] || '',
        lastModified: response.headers['last-modified'] || '',
        sha1: response.headers['x-checksum-sha1'] || '',
        md5: response.headers['x-checksum-md5'] || ''
      })
    })
    request.on('error', (error) => resolve({ url, ok: false, error: error.message }))
    request.on('timeout', () => {
      request.destroy()
      resolve({ url, ok: false, error: 'timeout' })
    })
    request.end()
  })
}

function staticGateChecks() {
  return [
    {
      id: 'gradle_has_enable_flag',
      pass: hasText('android/app/build.gradle', 'ENABLE_PHONE_CAMERA_WEBRTC'),
      evidence: 'android/app/build.gradle reads ENABLE_PHONE_CAMERA_WEBRTC'
    },
    {
      id: 'gradle_has_coordinate_flag',
      pass: hasText('android/app/build.gradle', 'PHONE_CAMERA_WEBRTC_COORDINATE'),
      evidence: 'android/app/build.gradle reads PHONE_CAMERA_WEBRTC_COORDINATE'
    },
    {
      id: 'gradle_has_default_candidate',
      pass: hasText('android/app/build.gradle', defaultCoordinate),
      evidence: `default candidate is ${defaultCoordinate}`
    },
    {
      id: 'gradle_dependency_is_optional',
      pass: hasText('android/app/build.gradle', 'implementation phoneCameraWebRtcCoordinate') &&
        hasText('android/app/build.gradle', 'phoneCameraWebRtcEnabled'),
      evidence: 'WebRTC AAR is only included when the SDK gate is enabled'
    },
    {
      id: 'gradle_source_set_is_optional',
      pass: hasText('android/app/build.gradle', 'src/phoneCameraWebRtc/java') &&
        hasText('android/app/build.gradle', 'phoneCameraWebRtcEnabled'),
      evidence: 'org.webrtc source files are compiled only when the SDK gate is enabled'
    },
    {
      id: 'gradle_raises_min_sdk_only_for_webrtc',
      pass: hasText('android/app/build.gradle', 'phoneCameraWebRtcMinSdk') &&
        hasText('android/app/build.gradle', 'Math.max(baseMinSdk, 21)'),
      evidence: 'WebRTC experiment raises minSdk to 21 without changing the default APK gate'
    },
    {
      id: 'runtime_detects_org_webrtc',
      pass: hasText('android/app/src/main/java/com/quicktvui/hellotv/tvbox/PhoneCameraWebRtcSupport.java', 'org.webrtc.PeerConnectionFactory') &&
        hasText('android/app/src/main/java/com/quicktvui/hellotv/tvbox/PhoneCameraWebRtcSupport.java', 'PhoneCameraNativeWebRtcEngine'),
      evidence: 'PhoneCameraWebRtcSupport detects both org.webrtc.PeerConnectionFactory and the optional media engine'
    },
    {
      id: 'media_engine_has_default_noop',
      pass: hasText('android/app/src/main/java/com/quicktvui/hellotv/tvbox/PhoneCameraMediaEngineFactory.java', 'PhoneCameraNoopMediaEngine') &&
        hasText('android/app/src/main/java/com/quicktvui/hellotv/tvbox/PhoneCameraNoopMediaEngine.java', 'native_webrtc_unavailable'),
      evidence: 'default APK keeps a no-op engine instead of hard-linking org.webrtc'
    },
    {
      id: 'native_media_engine_creates_answer',
      pass: hasText('android/app/src/phoneCameraWebRtc/java/com/quicktvui/hellotv/tvbox/PhoneCameraNativeWebRtcEngine.java', 'createAnswer') &&
        hasText('android/app/src/phoneCameraWebRtc/java/com/quicktvui/hellotv/tvbox/PhoneCameraNativeWebRtcEngine.java', 'setRemoteDescription') &&
        hasText('android/app/src/phoneCameraWebRtc/java/com/quicktvui/hellotv/tvbox/PhoneCameraNativeWebRtcEngine.java', 'onLocalIceCandidate'),
      evidence: 'optional org.webrtc engine can consume offer, create answer and emit ICE'
    },
    {
      id: 'native_media_engine_renders_and_reports',
      pass: hasText('android/app/src/phoneCameraWebRtc/java/com/quicktvui/hellotv/tvbox/PhoneCameraNativeWebRtcEngine.java', 'SurfaceViewRenderer') &&
        hasText('android/app/src/phoneCameraWebRtc/java/com/quicktvui/hellotv/tvbox/PhoneCameraNativeWebRtcEngine.java', 'onRemoteVideoTrack') &&
        hasText('android/app/src/phoneCameraWebRtc/java/com/quicktvui/hellotv/tvbox/PhoneCameraNativeWebRtcEngine.java', 'onRemoteAudioTrack') &&
        hasText('android/app/src/phoneCameraWebRtc/java/com/quicktvui/hellotv/tvbox/PhoneCameraNativeWebRtcEngine.java', 'onStatsDelivered'),
      evidence: 'optional org.webrtc engine renders remote video, tracks audio and emits stats summaries'
    },
    {
      id: 'native_readiness_keeps_media_closed',
      pass: hasText('android/app/src/main/java/com/quicktvui/hellotv/tvbox/TvBoxModule.java', 'phoneCameraMediaReady') &&
        hasText('android/app/src/main/java/com/quicktvui/hellotv/tvbox/TvBoxModule.java', 'canProveRealMedia') &&
        hasText('android/app/src/main/java/com/quicktvui/hellotv/tvbox/TvBoxModule.java', 'mediaAcceptanceStatus'),
      evidence: 'native bridge exposes media readiness fields without claiming real media'
    },
    {
      id: 'native_receiver_creates_signaling_room',
      pass: hasText('android/app/src/main/java/com/quicktvui/hellotv/tvbox/PhoneCameraSignalingClient.java', '"room.create"') &&
        hasText('android/app/src/main/java/com/quicktvui/hellotv/tvbox/PhoneCameraSignalingClient.java', '"webrtc.offer"') &&
        hasText('android/app/src/main/java/com/quicktvui/hellotv/tvbox/PhoneCameraSignalingClient.java', '"webrtc.answer"') &&
        hasText('android/app/src/main/java/com/quicktvui/hellotv/tvbox/PhoneCameraSignalingClient.java', 'sendStats') &&
        hasText('android/app/src/main/java/com/quicktvui/hellotv/tvbox/PhoneCameraReceiverActivity.java', 'startSignalingIfReady'),
      evidence: 'native receiver creates the TV signaling room and can exchange offer/answer/ICE/stats before field acceptance'
    },
    {
      id: 'pair_page_shows_readiness',
      pass: hasText('src/pages/phone-camera-pair/index.vue', '接收端准备度') &&
        hasText('src/pages/phone-camera-pair/index.vue', 'getPhoneCameraReceiverStatus'),
      evidence: 'pairing page shows receiver readiness from native bridge'
    },
    {
      id: 'field_boundary_documented',
      pass: hasText('docs/TV_BOX_PHONE_CAMERA_CONTRACT.zh-CN.md', '接收端准备度') &&
        hasText('docs/TV_BOX_PHONE_CAMERA_CONTRACT.zh-CN.md', '首帧/音频/stats'),
      evidence: 'phone camera contract documents readiness and media evidence boundary'
    }
  ]
}

function markdownTable(rows, headers = ['项', '值']) {
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map((item) => String(item ?? '').replace(/\|/g, '/')).join(' | ')} |`)
  ].join('\n')
}

function buildMarkdown(report) {
  return `# 手机摄像头 Android WebRTC SDK 接入门禁

- 生成时间 UTC: \`${report.generatedAtUtc}\`
- 状态: \`${report.status}\`
- 当前是否启用 SDK: \`${report.sdkEnabled ? 'yes' : 'no'}\`
- 候选坐标: \`${report.coordinate.raw}\`
- 网络校验: \`${report.networkCheck.enabled ? 'enabled' : 'skipped'}\`

## 静态门禁

${markdownTable(report.staticChecks.map((check) => [check.id, check.pass ? 'pass' : 'fail', check.evidence]), ['id', '结果', '证据'])}

## Maven Central 证据

${report.networkCheck.enabled
    ? markdownTable([
      ['AAR', report.networkCheck.aar.ok ? 'found' : 'missing', report.networkCheck.aar.contentLength || report.networkCheck.aar.error || report.networkCheck.aar.statusCode],
      ['POM', report.networkCheck.pom.ok ? 'found' : 'missing', report.networkCheck.pom.contentLength || report.networkCheck.pom.error || report.networkCheck.pom.statusCode],
      ['AAR sha1', report.networkCheck.aar.sha1 || 'unknown', report.networkCheck.aar.url],
      ['lastModified', report.networkCheck.aar.lastModified || 'unknown', report.networkCheck.aar.contentType || 'unknown']
    ], ['项', '结果', '证据'])
    : '- 默认跳过联网校验；需要验证候选 AAR 是否仍可解析时运行 `WEBRTC_SDK_GATE_NETWORK=true npm run tv-box:webrtc-sdk-gate`。'}

## 接入原则

- 默认构建不启用 WebRTC AAR，避免 APK 体积和兼容性在未实机验收前突然变化。
- 候选 WebRTC AAR 要求 Android 5.0+ / minSdk 21；只有启用实验 SDK 时才把构建 minSdk 提到 21，默认电视 APK 仍沿用项目基线。
- 电视接收端已能用同一个 6 位房间码创建信令房间；实验包会用可选 org.webrtc 媒体引擎处理 offer、发送 answer/ICE、渲染远端视频、接收音频并上报 stats。
- 真机实验时使用 \`ENABLE_PHONE_CAMERA_WEBRTC=true PHONE_CAMERA_WEBRTC_COORDINATE=${report.coordinate.raw} ./scripts/android-verify.sh\` 或对应 Gradle 命令。
- 即使 SDK 已解析，仍不能把手机摄像头记为通过；还必须看到电视首帧、音频接收、session.stats、断线重连和停止按钮证据。
- 只有真实证据闭环后，才能把 \`phoneCameraMediaReady\` / \`canProveRealMedia\` 从 false 推进。
`
}

async function main() {
  const parsedCoordinate = parseCoordinate(coordinate)
  const staticChecks = staticGateChecks()
  const failedChecks = staticChecks.filter((check) => !check.pass)
  let networkCheck = { enabled: false }

  if (networkCheckEnabled) {
    const aar = await head(mavenCentralUrl(parsedCoordinate, 'aar'))
    const pom = await head(mavenCentralUrl(parsedCoordinate, 'pom'))
    networkCheck = { enabled: true, aar, pom }
    if (!aar.ok || !pom.ok) {
      failedChecks.push({
        id: 'maven_candidate_resolves',
        pass: false,
        evidence: `AAR=${aar.statusCode || aar.error}; POM=${pom.statusCode || pom.error}`
      })
    }
  }

  const report = {
    generatedAtUtc: new Date().toISOString(),
    status: failedChecks.length === 0
      ? (networkCheckEnabled ? 'candidate_resolvable_media_engine_scaffolded_needs_field_evidence' : 'optional_media_engine_scaffolded_needs_sdk_resolution')
      : 'missing_webrtc_sdk_gate',
    projectRoot: rootDir,
    sdkEnabled,
    coordinate: {
      raw: coordinate,
      ...parsedCoordinate
    },
    defaultCoordinate,
    networkCheck,
    staticChecks,
    failedChecks,
    mediaAcceptanceBoundary: {
      realMediaProven: false,
      requiredEvidence: [
        'real phone camera and microphone permission',
        'TV first video frame',
        'TV audio receiving',
        'session.stats from TV receiver',
        'reconnect evidence',
        'privacy stop evidence'
      ]
    }
  }

  fs.mkdirSync(reportDir, { recursive: true })
  fs.writeFileSync(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`)
  fs.writeFileSync(outputMarkdownPath, buildMarkdown(report))
  console.log(`WebRTC SDK gate report: ${outputMarkdownPath}`)
  console.log(`Machine-readable WebRTC SDK gate: ${outputJsonPath}`)

  if (failedChecks.length > 0) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error.stack || error.message)
  process.exit(1)
})
