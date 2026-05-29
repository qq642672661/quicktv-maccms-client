#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

const rootDir = path.resolve(__dirname, '..')
const reportDir = process.env.REPORT_DIR || path.join(rootDir, 'reports')
const inspectionPath = process.env.TV_BOX_INSPECTION_JSON || path.join(reportDir, 'tv-box-inspection-latest.json')
const compatibilityPath = process.env.TV_BOX_COMPATIBILITY_SUMMARY_JSON || path.join(reportDir, 'tv-box-compatibility-summary-latest.json')
const fieldRecordPath = process.env.TV_BOX_FIELD_RECORD_JSON || path.join(reportDir, 'tv-box-field-record-latest.json')
const outputJsonPath = process.env.TV_BOX_HARDWARE_PROFILE_JSON || path.join(reportDir, 'tv-box-hardware-profile-latest.json')
const outputMarkdownPath = process.env.TV_BOX_HARDWARE_PROFILE_MD || path.join(reportDir, 'tv-box-hardware-profile-latest.md')

const officialReferences = [
  {
    title: 'Android TV App Quality',
    url: 'https://developer.android.com/docs/quality-guidelines/tv-app-quality',
    note: 'TV-DP and TV-DM require D-pad navigation and forbid relying on the Menu key for core navigation.'
  },
  {
    title: 'Android <uses-feature> and required=false',
    url: 'https://developer.android.com/guide/topics/manifest/uses-feature-element',
    note: 'CAMERA permission can imply camera hardware filtering unless camera features are explicitly optional.'
  },
  {
    title: 'Android Camera2 external lenses',
    url: 'https://developer.android.com/media/camera/camera2/camera-enumeration',
    note: 'Camera2 can enumerate front, back, and external camera lenses when the device exposes them.'
  },
  {
    title: 'Android AudioDeviceInfo',
    url: 'https://developer.android.com/reference/android/media/AudioDeviceInfo',
    note: 'AudioManager device inventory can distinguish built-in mic, USB devices, USB headsets, and other input types.'
  },
  {
    title: 'Android UsbConstants',
    url: 'https://developer.android.com/reference/android/hardware/usb/UsbConstants',
    note: 'USB class constants include video and audio classes, useful for spotting UVC and USB microphone hints.'
  }
]

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8')
  } catch {
    return ''
  }
}

function fileState(filePath) {
  const exists = Boolean(filePath && fs.existsSync(filePath))
  return {
    path: filePath || '',
    exists,
    sizeBytes: exists ? fs.statSync(filePath).size : 0
  }
}

function hasText(text, needle) {
  return text.includes(needle)
}

function matchNumber(text, pattern) {
  const match = text.match(pattern)
  return match ? Number(match[1]) : null
}

function parseAndroidBuildConfig() {
  const rootBuild = readText(path.join(rootDir, 'android/build.gradle'))
  const appBuild = readText(path.join(rootDir, 'android/app/build.gradle'))
  return {
    compileSdk: matchNumber(rootBuild, /sdk_compileSdk\s*=\s*(\d+)/),
    minSdk: matchNumber(rootBuild, /sdk_minSdk\s*=\s*(\d+)/),
    targetSdk: matchNumber(rootBuild, /sdk_targetSdk\s*=\s*(\d+)/),
    packageName: (appBuild.match(/APP_PACKAGE\s*=\s*'([^']+)'/) || [])[1] || 'com.quicktvui.hellotv',
    versionName: (appBuild.match(/APP_VERSION_NAME\s*=\s*'([^']+)'/) || [])[1] || '',
    versionCode: matchNumber(appBuild, /APP_VERSION_CODE\s*=\s*(\d+)/)
  }
}

function parseManifestPolicy() {
  const manifest = readText(path.join(rootDir, 'android/app/src/main/AndroidManifest.xml'))
  const feature = (name) => hasText(manifest, `android:name="${name}"`) && hasText(manifest, `android:name="${name}" android:required="false"`)
  return {
    declaresCameraPermission: hasText(manifest, 'android.permission.CAMERA'),
    declaresRecordAudioPermission: hasText(manifest, 'android.permission.RECORD_AUDIO'),
    leanbackLauncher: hasText(manifest, 'android.intent.category.LEANBACK_LAUNCHER'),
    tvBanner: hasText(manifest, 'android:banner="@drawable/tv_banner"'),
    optionalFeatures: {
      leanback: feature('android.software.leanback'),
      touchscreen: feature('android.hardware.touchscreen'),
      camera: feature('android.hardware.camera'),
      cameraAny: feature('android.hardware.camera.any'),
      cameraAutofocus: feature('android.hardware.camera.autofocus'),
      cameraExternal: feature('android.hardware.camera.external'),
      microphone: feature('android.hardware.microphone'),
      usbHost: feature('android.hardware.usb.host')
    }
  }
}

function includesAny(lines, patterns) {
  const text = Array.isArray(lines) ? lines.join('\n') : String(lines || '')
  return patterns.some((pattern) => pattern.test(text))
}

function summarizeFeatureLines(featureLines = []) {
  return {
    leanback: includesAny(featureLines, [/leanback/i, /television/i]),
    camera: includesAny(featureLines, [/android\.hardware\.camera($|\s)/i, /android\.hardware\.camera\.any/i]),
    externalCamera: includesAny(featureLines, [/android\.hardware\.camera\.external/i]),
    microphone: includesAny(featureLines, [/android\.hardware\.microphone/i]),
    usbHost: includesAny(featureLines, [/android\.hardware\.usb\.host/i]),
    audio: includesAny(featureLines, [/audio/i])
  }
}

function summarizeUsbSnapshot(usbSnapshot = []) {
  return {
    hasUsbEvidence: usbSnapshot.length > 0,
    videoHints: usbSnapshot.filter((line) => /video|uvc|webcam|class.?14|USB_CLASS_VIDEO/i.test(line)).slice(0, 12),
    audioHints: usbSnapshot.filter((line) => /audio|microphone|mic|class.?1\b|USB_CLASS_AUDIO/i.test(line)).slice(0, 12)
  }
}

function normalizeResult(value) {
  const text = String(value || '').trim().toLowerCase()
  return ['pass', 'fail', 'skip', 'na', 'unknown'].includes(text) ? text : 'unknown'
}

function currentFieldResults(fieldRecord) {
  const checks = fieldRecord?.checks || {}
  return {
    remoteCore: ['remoteFocus', 'zeroKeyHelp', 'helpKeyShortcuts', 'remotePractice', 'exitConfirm', 'livePlayback', 'classicHomeRescue', 'searchRescue', 'historyRescue', 'supportCode']
      .map((key) => [key, normalizeResult(checks[key])]),
    cameraAudio: ['cameraPermission', 'cameraPreview', 'audioInput', 'recordAudioPermission', 'usbHotplug']
      .map((key) => [key, normalizeResult(checks[key])])
  }
}

function countResults(pairs, result) {
  return pairs.filter(([, value]) => value === result).length
}

function buildDeviceProfile(inspection, fieldRecord) {
  const device = inspection?.deviceEvidence || {}
  const features = summarizeFeatureLines(device.featureLines || [])
  const usb = summarizeUsbSnapshot(device.usbSnapshot || [])
  const fieldResults = currentFieldResults(fieldRecord)
  const status = device.status || 'unknown'
  const riskFlags = []
  const strengths = []

  if (status === 'no_authorized_device') {
    riskFlags.push('no_authorized_device')
  }
  if (status === 'adb_missing') {
    riskFlags.push('adb_missing')
  }
  if (status === 'multiple_authorized_devices') {
    riskFlags.push('multiple_devices_need_serial')
  }
  if (status === 'target_not_online') {
    riskFlags.push('target_not_online')
  }
  if (status === 'selected' && !features.leanback) {
    riskFlags.push('not_confirmed_as_tv_or_leanback')
  }
  if (status === 'selected' && !features.usbHost) {
    riskFlags.push('usb_host_not_reported')
  }
  if (status === 'selected' && !features.camera && usb.videoHints.length > 0) {
    riskFlags.push('usb_video_seen_but_camera_hal_not_reported')
  }
  if (status === 'selected' && !features.microphone && usb.audioHints.length > 0) {
    riskFlags.push('usb_audio_seen_but_microphone_feature_not_reported')
  }
  if (fieldRecord?.verdict === 'needs_fix') {
    riskFlags.push('latest_field_record_needs_fix')
  }
  if (countResults(fieldResults.remoteCore, 'unknown') > 0) {
    riskFlags.push('remote_acceptance_unknown')
  }
  if (countResults(fieldResults.cameraAudio, 'unknown') > 0) {
    riskFlags.push('camera_audio_acceptance_unknown')
  }

  if (features.leanback) strengths.push('tv_or_leanback_feature_reported')
  if (features.usbHost) strengths.push('usb_host_reported')
  if (features.camera || features.externalCamera) strengths.push('camera_feature_reported')
  if (features.microphone || features.audio) strengths.push('audio_input_feature_reported')
  if (usb.videoHints.length > 0) strengths.push('usb_video_device_hint_seen')
  if (usb.audioHints.length > 0) strengths.push('usb_audio_device_hint_seen')
  if (device.appInstalled === true) strengths.push('app_installed_on_selected_box')

  let level = 'needs_real_box'
  let label = '未连接真实盒子'
  if (status === 'selected') {
    if (riskFlags.some((flag) => ['latest_field_record_needs_fix', 'not_confirmed_as_tv_or_leanback'].includes(flag))) {
      level = 'needs_fix'
      label = '已连接但存在高风险项'
    } else if (riskFlags.some((flag) => flag.endsWith('_unknown') || flag.includes('camera_hal'))) {
      level = 'needs_manual_acceptance'
      label = '已连接，仍需人工/摄像头补测'
    } else {
      level = 'candidate_recommended'
      label = '候选推荐组合'
    }
  } else if (['multiple_authorized_devices', 'target_not_online', 'adb_missing'].includes(status)) {
    level = 'needs_environment_fix'
    label = '先修复连接/工具链'
  }

  return {
    level,
    label,
    deviceStatus: status,
    selectedSerial: device.selectedSerial || '',
    model: device.model || '',
    androidSdk: device.androidSdk || '',
    appInstalled: device.appInstalled === true,
    features,
    usb,
    fieldResults: {
      remoteCore: Object.fromEntries(fieldResults.remoteCore),
      cameraAudio: Object.fromEntries(fieldResults.cameraAudio)
    },
    strengths,
    riskFlags,
    nextActions: buildDeviceNextActions(level, riskFlags, device)
  }
}

function buildDeviceNextActions(level, riskFlags, device) {
  const actions = []
  if (level === 'needs_real_box') {
    actions.push('现场连接真实电视盒子，开启开发者选项/网络调试并确认 RSA 授权。')
    actions.push('连接后执行：BOX_IP=<盒子IP> RUN_CAMERA_SMOKE=true npm run tv-box:easy。')
    return actions
  }
  if (riskFlags.includes('adb_missing')) {
    actions.push('在电脑安装 Android Platform Tools，或使用交付包内的 Windows/macOS 安装说明定位 adb。')
  }
  if (riskFlags.includes('multiple_devices_need_serial')) {
    actions.push('指定 DEVICE_SERIAL，避免把 APK 装到错误盒子。')
  }
  if (riskFlags.includes('not_confirmed_as_tv_or_leanback')) {
    actions.push('优先换用 Android TV/Google TV/带 Leanback Launcher 的盒子复测。')
  }
  if (riskFlags.includes('usb_host_not_reported')) {
    actions.push('外接 USB 摄像头场景优先选择明确支持 USB Host/OTG 的盒子。')
  }
  if (riskFlags.includes('usb_video_seen_but_camera_hal_not_reported')) {
    actions.push('USB 视频硬件已出现但 Camera HAL 未报告摄像头，优先升级盒子固件或更换常见 UVC 摄像头。')
  }
  if (riskFlags.includes('remote_acceptance_unknown')) {
    actions.push('按 FIELD_ACCEPTANCE_CHECKLIST.zh-CN.md 补齐真实遥控器焦点、帮助、退出、直播和维护码证据。')
  }
  if (riskFlags.includes('camera_audio_acceptance_unknown')) {
    actions.push('补齐摄像头权限、预览、音频输入、录音权限和 USB 热插拔结果；没有外设时明确填 na。')
  }
  if (device.appInstalled !== true) {
    actions.push('执行一键安装：BOX_IP=<盒子IP> npm run tv-box:easy。')
  }
  if (actions.length === 0) {
    actions.push('把该组合写入兼容性矩阵；新增摄像头/麦克风时继续复测。')
  }
  return [...new Set(actions)]
}

function buildRecommendedSpec(buildConfig) {
  return {
    tvBox: [
      '优先 Android TV / Google TV / 明确带 Leanback Launcher 的电视盒子。',
      `最低安装门槛遵循当前 APK minSdk=${buildConfig.minSdk ?? 'unknown'}；现场推荐 Android 9+ 或厂商仍维护固件的盒子，便于摄像头和权限链路稳定。`,
      '外接摄像头场景优先选择明确支持 USB Host/OTG 的盒子；USB 供电不稳时使用带独立供电的 USB Hub。',
      '必须能打开开发者选项/网络调试，并能在电视屏幕确认 RSA 授权。'
    ],
    remote: [
      '必须有方向键、OK/确认、返回键。',
      '强烈建议有 0、菜单/信息/帮助键之一，用于全局帮助/自检救援。',
      '数字键不是硬性要求，但有数字键时 1-6 可直达首页入口，直播 1-9 可直达频道，7/8 可做收藏操作。'
    ],
    camera: [
      '优先 UVC USB 摄像头；能被 Android Camera2 枚举到才算可预览。',
      '如果 dumpsys usb 能看到 USB 视频设备但 Camera2 看不到摄像头，说明硬件插上了，但盒子固件/Camera HAL 暂未开放给 App。',
      '摄像头权限必须可授权；摄像头缺失时不阻塞看电视，应在现场验收表里填 na。'
    ],
    microphone: [
      '麦克风可来自盒子内置、遥控器、USB 摄像头内置麦或单独 USB 麦。',
      '音频输入需通过 AudioManager 识别，并能授权 RECORD_AUDIO。',
      '没有麦克风不影响直播/点播；语音搜索或视频通话才把录音权限作为强要求。'
    ]
  }
}

function buildCompatibilityPolicy() {
  return {
    recommended: '遥控器核心通过，直播和维护码通过，摄像头预览/音频输入通过或无外设明确 na，且无 fail。',
    tvCoreReady: '遥控器焦点、直播播放、帮助救援、退出确认、全部内容救援、搜索/继续看救援和维护码通过；摄像头/麦克风可继续补测。',
    needsManualAcceptance: '没有 fail，但仍有 unknown；不能关闭，只能作为待补测组合。',
    needsFix: '任一核心项 fail，必须保存 support zip、维护码照片和现场备注后修复。',
    noFakeClosure: '未连接真实盒子时只能是 handoff_ready_needs_box，不能声明实机遥控器/摄像头已完成。'
  }
}

function markdownList(items) {
  return items.map((item) => `- ${item}`).join('\n')
}

function markdownTable(rows) {
  if (!rows.length) return '暂无。\n'
  return [
    '| 项 | 值 |',
    '| --- | --- |',
    ...rows.map(([key, value]) => `| ${key} | ${String(value || '').replace(/\|/g, '/')} |`)
  ].join('\n') + '\n'
}

function buildMarkdown(profile) {
  const device = profile.currentDeviceProfile
  const compatibility = profile.compatibilitySummary || {}
  return `# HelloTV 电视盒子硬件兼容性画像

- 生成时间 UTC: \`${profile.generatedAtUtc}\`
- 画像结论: \`${device.level}\` / ${device.label}
- 当前设备状态: \`${device.deviceStatus}\`
- 当前 readiness: \`${profile.readiness?.level || 'unknown'}\`
- APK: minSdk \`${profile.androidBuild.minSdk ?? 'unknown'}\`, targetSdk \`${profile.androidBuild.targetSdk ?? 'unknown'}\`, compileSdk \`${profile.androidBuild.compileSdk ?? 'unknown'}\`
- 累计兼容性样本: \`${compatibility.totalRecords || 0}\`
- 推荐组合: \`${(compatibility.recommended || []).length}\`
- 待修复组合: \`${(compatibility.needsFix || []).length}\`

## 当前盒子画像

${markdownTable([
  ['盒子型号', device.model || '未连接'],
  ['Android SDK', device.androidSdk || '未知'],
  ['ADB 序列号', device.selectedSerial || '未选择'],
  ['App 已安装', device.appInstalled ? 'yes' : 'no/unknown'],
  ['TV/Leanback feature', device.features.leanback ? 'yes' : 'no/unknown'],
  ['USB Host feature', device.features.usbHost ? 'yes' : 'no/unknown'],
  ['Camera feature', device.features.camera || device.features.externalCamera ? 'yes' : 'no/unknown'],
  ['Microphone/Audio feature', device.features.microphone || device.features.audio ? 'yes' : 'no/unknown'],
  ['USB 视频线索', device.usb.videoHints.length ? device.usb.videoHints.join(' / ') : '未采集'],
  ['USB 音频线索', device.usb.audioHints.length ? device.usb.audioHints.join(' / ') : '未采集']
])}
## 风险标记

${device.riskFlags.length ? markdownList(device.riskFlags.map((flag) => `\`${flag}\``)) : '- 暂无。'}

## 下一步

${markdownList(device.nextActions)}

## 推荐硬件规格

### 电视盒子

${markdownList(profile.recommendedSpec.tvBox)}

### 遥控器

${markdownList(profile.recommendedSpec.remote)}

### 摄像头

${markdownList(profile.recommendedSpec.camera)}

### 麦克风

${markdownList(profile.recommendedSpec.microphone)}

## 兼容性判定规则

${markdownList(Object.entries(profile.compatibilityPolicy).map(([key, value]) => `\`${key}\`: ${value}`))}

## Manifest 策略

${markdownTable([
  ['CAMERA permission', profile.manifestPolicy.declaresCameraPermission ? 'declared' : 'missing'],
  ['RECORD_AUDIO permission', profile.manifestPolicy.declaresRecordAudioPermission ? 'declared' : 'missing'],
  ['Leanback launcher', profile.manifestPolicy.leanbackLauncher ? 'declared' : 'missing'],
  ['TV banner', profile.manifestPolicy.tvBanner ? 'declared' : 'missing'],
  ['optional camera', profile.manifestPolicy.optionalFeatures.camera ? 'yes' : 'no'],
  ['optional camera.any', profile.manifestPolicy.optionalFeatures.cameraAny ? 'yes' : 'no'],
  ['optional external camera', profile.manifestPolicy.optionalFeatures.cameraExternal ? 'yes' : 'no'],
  ['optional microphone', profile.manifestPolicy.optionalFeatures.microphone ? 'yes' : 'no'],
  ['optional USB Host', profile.manifestPolicy.optionalFeatures.usbHost ? 'yes' : 'no'],
  ['optional touchscreen', profile.manifestPolicy.optionalFeatures.touchscreen ? 'yes' : 'no']
])}
## 官方技术依据

${markdownList(profile.officialReferences.map((ref) => `${ref.title}: ${ref.url}`))}
`
}

function main() {
  fs.mkdirSync(reportDir, { recursive: true })
  const inspection = readJson(inspectionPath)
  const compatibility = readJson(compatibilityPath)
  const fieldRecord = readJson(fieldRecordPath)
  const androidBuild = parseAndroidBuildConfig()
  const manifestPolicy = parseManifestPolicy()

  const profile = {
    generatedAtUtc: new Date().toISOString(),
    projectRoot: rootDir,
    inputs: {
      inspection: fileState(inspectionPath),
      compatibilitySummary: fileState(compatibilityPath),
      latestFieldRecord: fileState(fieldRecordPath)
    },
    androidBuild,
    manifestPolicy,
    readiness: inspection?.readiness || null,
    currentDeviceProfile: buildDeviceProfile(inspection, fieldRecord),
    recommendedSpec: buildRecommendedSpec(androidBuild),
    compatibilityPolicy: buildCompatibilityPolicy(),
    compatibilitySummary: compatibility ? {
      totalRecords: compatibility.totalRecords || 0,
      recommended: compatibility.recommended || [],
      tvCoreReady: compatibility.tvCoreReady || [],
      needsFix: compatibility.needsFix || [],
      needsManualAcceptance: compatibility.needsManualAcceptance || [],
      nextActions: compatibility.nextActions || []
    } : null,
    officialReferences
  }

  fs.writeFileSync(outputJsonPath, `${JSON.stringify(profile, null, 2)}\n`)
  fs.writeFileSync(outputMarkdownPath, buildMarkdown(profile))
  console.log(`TV-box hardware profile written to: ${outputMarkdownPath}`)
  console.log(`Machine-readable hardware profile: ${outputJsonPath}`)
}

main()
