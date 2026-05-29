#!/usr/bin/env zx
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { spawnSync } = require('child_process')

const rootDir = path.resolve(__dirname, '..')
const reportDir = process.env.REPORT_DIR || path.join(rootDir, 'reports')
const outputPath = process.env.TV_BOX_INSPECTION_JSON || path.join(reportDir, 'tv-box-inspection-latest.json')
const packageName = process.env.PACKAGE_NAME || 'com.quicktvui.hellotv'
const boxIp = process.env.BOX_IP || ''
const deviceSerial = process.env.DEVICE_SERIAL || ''

function hasJavaHome(javaHome) {
  return Boolean(javaHome && fs.existsSync(path.join(javaHome, 'bin', process.platform.startsWith('win') ? 'java.exe' : 'java')))
}

function firstExistingDir(candidates) {
  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || ''
}

function resolveJavaHome() {
  if (hasJavaHome(process.env.JAVA_HOME)) return process.env.JAVA_HOME
  return firstExistingDir([
    '/opt/homebrew/opt/openjdk@11/libexec/openjdk.jdk/Contents/Home',
    '/usr/local/opt/openjdk@11/libexec/openjdk.jdk/Contents/Home',
    '/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home',
    '/usr/local/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home'
  ])
}

function resolveAndroidHome() {
  if (process.env.ANDROID_HOME && fs.existsSync(process.env.ANDROID_HOME)) return process.env.ANDROID_HOME
  if (process.env.ANDROID_SDK_ROOT && fs.existsSync(process.env.ANDROID_SDK_ROOT)) return process.env.ANDROID_SDK_ROOT
  return firstExistingDir([
    '/opt/homebrew/share/android-commandlinetools',
    '/usr/local/share/android-commandlinetools',
    path.join(process.env.HOME || '', 'Library/Android/sdk')
  ])
}

function prependPath(paths, currentPath) {
  const validPaths = paths.filter((candidate) => candidate && fs.existsSync(candidate))
  return [...validPaths, currentPath || ''].join(path.delimiter)
}

const resolvedJavaHome = resolveJavaHome()
const resolvedAndroidHome = resolveAndroidHome()
if (resolvedJavaHome && !process.env.JAVA_HOME) process.env.JAVA_HOME = resolvedJavaHome
if (resolvedAndroidHome && !process.env.ANDROID_HOME) process.env.ANDROID_HOME = resolvedAndroidHome
if (resolvedAndroidHome && !process.env.ANDROID_SDK_ROOT) process.env.ANDROID_SDK_ROOT = resolvedAndroidHome
process.env.PATH = prependPath([
  resolvedJavaHome ? path.join(resolvedJavaHome, 'bin') : '',
  resolvedAndroidHome ? path.join(resolvedAndroidHome, 'platform-tools') : '',
  resolvedAndroidHome ? path.join(resolvedAndroidHome, 'cmdline-tools/latest/bin') : ''
], process.env.PATH)

function run(command, args = [], options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || rootDir,
    env: process.env,
    encoding: 'utf8',
    timeout: options.timeout || 15000,
    shell: false
  })

  return {
    command: [command, ...args].join(' '),
    ok: result.status === 0,
    status: result.status,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
    error: result.error ? String(result.error.message || result.error) : ''
  }
}

function runBash(script, options = {}) {
  return run('bash', ['-lc', script], options)
}

function commandPath(commandName) {
  const result = runBash(`command -v ${commandName}`)
  return result.ok ? result.stdout : ''
}

function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8')
  } catch {
    return ''
  }
}

function latestApk() {
  const apkDir = path.join(rootDir, 'android/app/build/outputs/apk/debug')
  if (!fs.existsSync(apkDir)) return ''
  const apks = fs.readdirSync(apkDir)
    .filter((fileName) => fileName.endsWith('_debug.apk'))
    .map((fileName) => path.join(apkDir, fileName))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
  return apks[0] || ''
}

function sha256(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return ''
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

function hasText(filePath, text) {
  return readFile(filePath).includes(text)
}

function normalizeBoxTarget(target) {
  if (!target) return ''
  return target.includes(':') ? target : `${target}:5555`
}

function parseAdbDevices(adbOutput) {
  return adbOutput
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [serial, state, ...details] = line.split(/\s+/)
      return { serial, state, details: details.join(' ') }
    })
}

function runAdbShell(serial, shellCommand, timeout = 15000) {
  return run('adb', ['-s', serial, 'shell', shellCommand], { timeout })
}

function lines(text) {
  return (text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
}

function sourceContracts() {
  return {
    simpleModeDefault: hasText(path.join(rootDir, '.env.production'), 'VITE_TV_BOX_SIMPLE_MODE=true'),
    simpleHomeRoute: hasText(path.join(rootDir, 'src/routes.ts'), "name: 'tv_box_home'"),
    tvBoxHelpRoute: hasText(path.join(rootDir, 'src/routes.ts'), "name: 'tv_box_help'"),
    remotePracticeRoute: hasText(path.join(rootDir, 'src/routes.ts'), "name: 'tv_box_remote_practice'"),
    fieldGuideRoute: hasText(path.join(rootDir, 'src/routes.ts'), "name: 'tv_box_field_guide'"),
    tvBoxExitRoute: hasText(path.join(rootDir, 'src/routes.ts'), "name: 'tv_box_exit'"),
    cameraSetupRoute: hasText(path.join(rootDir, 'src/routes.ts'), "name: 'camera_setup'"),
    numericHomeBadges: hasText(path.join(rootDir, 'src/pages/tv-box-home/index.vue'), 'tv-box-home-card-key'),
    visibleHomeHelpCard: hasText(path.join(rootDir, 'src/pages/tv-box-home/index.vue'), '帮助自检'),
    numericCameraBadges: hasText(path.join(rootDir, 'src/pages/camera-setup/index.vue'), 'camera-setup-button-key'),
    zeroKeyHelp: hasText(path.join(rootDir, 'src/pages/tv-box-home/index.vue'), 'launch.launchTvBoxHelp()'),
    remoteHelpKeys: hasText(path.join(rootDir, 'src/tools/tv-box/remote-control.ts'), 'isRemoteHelpKey'),
    homeHelpKeys: hasText(path.join(rootDir, 'src/pages/tv-box-home/index.vue'), 'isRemoteHelpKey'),
    cameraHelpKeys: hasText(path.join(rootDir, 'src/pages/camera-setup/index.vue'), 'isRemoteHelpKey'),
    cameraSixKeyHelp: hasText(path.join(rootDir, 'src/pages/camera-setup/index.vue'), 'remoteNumber === 6'),
    helpSixKeyRefresh: hasText(path.join(rootDir, 'src/pages/tv-box-help/index.vue'), 'remoteNumber === 6'),
    helpPrimaryNextAction: hasText(path.join(rootDir, 'src/pages/tv-box-help/index.vue'), 'primaryNextTitle'),
    helpRemotePracticeShortcut: hasText(path.join(rootDir, 'src/pages/tv-box-help/index.vue'), 'launch.launchTvBoxRemotePractice'),
    helpFieldGuideShortcut: hasText(path.join(rootDir, 'src/pages/tv-box-help/index.vue'), 'launch.launchTvBoxFieldGuide'),
    remotePracticePage: fs.existsSync(path.join(rootDir, 'src/pages/tv-box-remote-practice/index.vue')),
    remotePracticeDpad: hasText(path.join(rootDir, 'src/pages/tv-box-remote-practice/index.vue'), 'remoteMoveDirectionFromKeyCode'),
    remotePracticeConfirm: hasText(path.join(rootDir, 'src/pages/tv-box-remote-practice/index.vue'), 'isRemoteConfirmKey'),
    remotePracticeKeyCodeFeedback: hasText(path.join(rootDir, 'src/pages/tv-box-remote-practice/index.vue'), 'remoteKeyLabelFromKeyCode') &&
      hasText(path.join(rootDir, 'src/pages/tv-box-remote-practice/index.vue'), 'keyCode') &&
      hasText(path.join(rootDir, 'src/pages/tv-box-remote-practice/index.vue'), '未知键请拍照'),
    remoteKeyLabelHelper: hasText(path.join(rootDir, 'src/tools/tv-box/remote-control.ts'), 'remoteKeyLabelFromKeyCode'),
    fieldGuidePage: fs.existsSync(path.join(rootDir, 'src/pages/tv-box-field-guide/index.vue')),
    fieldGuideRecordEvidence: hasText(path.join(rootDir, 'src/pages/tv-box-field-guide/index.vue'), '维护码照片') &&
      hasText(path.join(rootDir, 'src/pages/tv-box-field-guide/index.vue'), '现场验收 JSON') &&
      hasText(path.join(rootDir, 'src/pages/tv-box-field-guide/index.vue'), 'tv-box-support-latest.zip'),
    fieldGuideHardwareBoundary: hasText(path.join(rootDir, 'src/pages/tv-box-field-guide/index.vue'), '没有摄像头或麦克风就写不适用，不能留未知'),
    fieldGuideSupportCode: hasText(path.join(rootDir, 'src/pages/tv-box-field-guide/index.vue'), 'supportCodeText'),
    simpleHomeBackExit: hasText(path.join(rootDir, 'src/pages/tv-box-home/index.vue'), 'launch.launchTvBoxExit()'),
    tvBoxExitPage: fs.existsSync(path.join(rootDir, 'src/pages/tv-box-exit/index.vue')),
    tvBoxExitConfirm: hasText(path.join(rootDir, 'src/pages/tv-box-exit/index.vue'), '退出应用'),
    tvBoxExitContinueDefault: hasText(path.join(rootDir, 'src/pages/tv-box-exit/index.vue'), '继续看'),
    liveNumericChannelShortcuts: hasText(path.join(rootDir, 'src/pages/live/index.vue'), 'playMediaByRemoteNumberKey'),
    liveNumericChannelHelper: hasText(path.join(rootDir, 'src/tools/tv-box/remote-control.ts'), 'remoteChannelIndexFromKeyCode'),
    liveMediaKeyShortcuts: hasText(path.join(rootDir, 'src/pages/live/index.vue'), 'handleRemoteMediaKey') &&
      hasText(path.join(rootDir, 'src/tools/tv-box/remote-control.ts'), 'remoteMediaActionFromKeyCode'),
    liveHelpShortcut: hasText(path.join(rootDir, 'src/pages/live/index.vue'), 'isRemoteHelpKey') &&
      hasText(path.join(rootDir, 'src/pages/live/index.vue'), 'launch.launchTvBoxHelp()'),
    liveBackToSimpleHome: hasText(path.join(rootDir, 'src/pages/live/index.vue'), 'launch.launchTvBoxHome()'),
    liveFavoriteShortcut: hasText(path.join(rootDir, 'src/pages/live/index.vue'), 'LIVE_FAVORITE_TOGGLE_NUMBER') &&
      hasText(path.join(rootDir, 'src/tools/tv-box/live-favorites.ts'), 'toggleLiveFavoriteId'),
    liveFavoriteOnlyShortcut: hasText(path.join(rootDir, 'src/pages/live/index.vue'), 'LIVE_FAVORITE_FILTER_NUMBER') &&
      hasText(path.join(rootDir, 'src/tools/tv-box/live-favorites.ts'), 'filterLiveFavorites'),
    liveFavoriteStorage: hasText(path.join(rootDir, 'src/pages/live/index.vue'), 'TV_BOX_LIVE_FAVORITES_STORAGE_KEY') &&
      hasText(path.join(rootDir, 'src/tools/tv-box/live-favorites.ts'), 'serializeLiveFavoriteIds'),
    classicHomeHelpRescue: hasText(path.join(rootDir, 'src/pages/home/index.vue'), 'BuildConfig.tvBoxSimpleMode') &&
      hasText(path.join(rootDir, 'src/pages/home/index.vue'), 'remoteNumber === 6') &&
      hasText(path.join(rootDir, 'src/pages/home/index.vue'), 'launch.launchTvBoxHelp()'),
    classicHomeBackToSimpleHome: hasText(path.join(rootDir, 'src/pages/home/index.vue'), 'BuildConfig.tvBoxSimpleMode') &&
      hasText(path.join(rootDir, 'src/pages/home/index.vue'), 'launch.launchTvBoxHome()'),
    historyRouteUsesRawPage: hasText(path.join(rootDir, 'src/routes.ts'), "import('./pages/history/index-raw.vue')"),
    historyHelpRescue: hasText(path.join(rootDir, 'src/pages/history/index-raw.vue'), 'isRemoteHelpKey') &&
      hasText(path.join(rootDir, 'src/pages/history/index-raw.vue'), 'launch.launchTvBoxHelp()'),
    historyBackToSimpleHome: hasText(path.join(rootDir, 'src/pages/history/index-raw.vue'), 'launch.launchTvBoxHome()'),
    searchHelpRescue: hasText(path.join(rootDir, 'src/pages/search/two-columns.vue'), 'launch.launchTvBoxHelp()') &&
      hasText(path.join(rootDir, 'src/pages/search/three-columns.vue'), 'launch.launchTvBoxHelp()'),
    searchBackToSimpleHome: hasText(path.join(rootDir, 'src/pages/search/two-columns.vue'), 'launch.launchTvBoxHome()') &&
      hasText(path.join(rootDir, 'src/pages/search/three-columns.vue'), 'launch.launchTvBoxHome()'),
    nativeTvBoxModule: fs.existsSync(path.join(rootDir, 'android/app/src/main/java/com/quicktvui/hellotv/tvbox/TvBoxModule.java')),
    nativeCameraPreviewActivity: fs.existsSync(path.join(rootDir, 'android/app/src/main/java/com/quicktvui/hellotv/tvbox/CameraPreviewActivity.java')),
    leanbackLauncher: hasText(path.join(rootDir, 'android/app/src/main/AndroidManifest.xml'), 'android.intent.category.LEANBACK_LAUNCHER'),
    internalCameraPreviewActivity: hasText(path.join(rootDir, 'android/app/src/main/AndroidManifest.xml'), 'CameraPreviewActivity'),
    tvBanner: hasText(path.join(rootDir, 'android/app/src/main/AndroidManifest.xml'), 'android:banner="@drawable/tv_banner"'),
    cameraPermission: hasText(path.join(rootDir, 'android/app/src/main/AndroidManifest.xml'), 'android.permission.CAMERA'),
    recordAudioPermission: hasText(path.join(rootDir, 'android/app/src/main/AndroidManifest.xml'), 'android.permission.RECORD_AUDIO'),
    optionalExternalCamera: hasText(path.join(rootDir, 'android/app/src/main/AndroidManifest.xml'), 'android.hardware.camera.external" android:required="false'),
    optionalMicrophone: hasText(path.join(rootDir, 'android/app/src/main/AndroidManifest.xml'), 'android.hardware.microphone" android:required="false'),
    optionalUsbHost: hasText(path.join(rootDir, 'android/app/src/main/AndroidManifest.xml'), 'android.hardware.usb.host" android:required="false'),
    optionalTouchscreen: hasText(path.join(rootDir, 'android/app/src/main/AndroidManifest.xml'), 'android.hardware.touchscreen" android:required="false'),
    nativeAudioInputDetection: hasText(path.join(rootDir, 'android/app/src/main/java/com/quicktvui/hellotv/tvbox/TvBoxModule.java'), 'audioInputDeviceCount'),
    frontEndAudioInputDetection: hasText(path.join(rootDir, 'src/tools/tv-box/native-capabilities.ts'), 'audioInputDeviceCount'),
    cameraPageMicrophoneStatus: hasText(path.join(rootDir, 'src/pages/camera-setup/index.vue'), '麦克风'),
    supportCodeAudioInput: hasText(path.join(rootDir, 'src/tools/tv-box/support-code.ts'), '音频输入')
  }
}

function failedContractNames(contracts) {
  return Object.entries(contracts)
    .filter(([, ok]) => !ok)
    .map(([name]) => name)
}

function buildReadiness(contracts, apk, remoteSelfTest, deviceEvidence) {
  const blockers = []
  const warnings = []
  const nextActions = []
  const failedContracts = failedContractNames(contracts)

  if (!apk.exists) {
    blockers.push('未找到 Debug APK，请先执行 npm run build-apk-debug')
  }
  if (!apk.sha256) {
    blockers.push('APK SHA256 为空，请重新生成交付包')
  }
  if (!remoteSelfTest.ok) {
    blockers.push('遥控器核心路径自测未通过')
  }
  if (failedContracts.length > 0) {
    blockers.push(`源码合约缺失：${failedContracts.join(', ')}`)
  }

  if (deviceEvidence.status === 'no_authorized_device') {
    warnings.push('当前没有授权电视盒子，已完成本地构建与交付检查，真实遥控器/摄像头仍需实机验收')
    nextActions.push('把 reports/tv-box-handoff-latest.zip 发给现场人员，解压后优先双击 START_HERE.html；实机验收可打开 FIELD_WIZARD_OFFLINE.html 离线填写，再用 tv-box:field-import 导入 JSON')
    nextActions.push('现场开启电视盒子开发者选项/网络调试，并确认 RSA 授权弹窗')
    nextActions.push('连接盒子后执行：BOX_IP=<盒子IP> RUN_CAMERA_SMOKE=true npm run tv-box:easy')
  } else if (deviceEvidence.status === 'multiple_authorized_devices') {
    warnings.push('检测到多台授权设备，需要指定 DEVICE_SERIAL 避免装错盒子')
    nextActions.push('执行：DEVICE_SERIAL=<序列号> BOX_IP=<盒子IP> npm run tv-box:easy')
  } else if (deviceEvidence.status === 'target_not_online') {
    warnings.push('指定的电视盒子不在线或未授权')
    nextActions.push('确认盒子 IP/网络调试/RSA 授权后重新执行 tv-box:inspect')
  } else if (deviceEvidence.status === 'adb_missing') {
    warnings.push('当前电脑缺少 adb，交付目录可生成，但本机无法连接盒子验收')
    nextActions.push('macOS 安装 Android Platform Tools：brew install android-platform-tools')
  } else if (deviceEvidence.status === 'selected') {
    if (deviceEvidence.appInstalled) {
      nextActions.push('执行摄像头实机冒烟：BOX_IP=<盒子IP> npm run tv-box:camera-smoke')
      nextActions.push('按操作卡人工确认真实遥控器焦点、权限弹窗和 USB 摄像头热插拔')
    } else {
      warnings.push('电视盒子已授权，但 App 尚未安装')
      nextActions.push('执行：BOX_IP=<盒子IP> npm run tv-box:easy')
    }
  }

  if (blockers.length > 0) {
    return {
      level: 'blocked',
      canHandoff: false,
      canRunOnCurrentBox: false,
      humanSummary: '交付被阻断，需要先修复构建、遥控器自测或源码合约问题。',
      blockers,
      warnings,
      nextActions: [...blockers, ...nextActions]
    }
  }

  const canRunOnCurrentBox = deviceEvidence.status === 'selected'
  let level = 'handoff_ready_needs_box'
  let humanSummary = '本地构建、APK、遥控器自测和交付包已就绪；等待连接真实电视盒子完成焦点与摄像头验收。'

  if (canRunOnCurrentBox && deviceEvidence.appInstalled) {
    level = 'device_verified'
    humanSummary = '电视盒子已连接且 App 已安装；可以继续做摄像头冒烟和人工验收。'
  } else if (canRunOnCurrentBox) {
    level = 'ready_to_install'
    humanSummary = '电视盒子已连接并授权；下一步可一键安装和实机冒烟。'
  }

  return {
    level,
    canHandoff: true,
    canRunOnCurrentBox,
    humanSummary,
    blockers,
    warnings,
    nextActions
  }
}

function inspectDevice(adbPath) {
  if (!adbPath) {
    return {
      status: 'adb_missing',
      devices: [],
      selectedSerial: '',
      nextActions: ['在电脑上安装 Android Platform Tools：brew install android-platform-tools']
    }
  }

  const boxTarget = normalizeBoxTarget(boxIp)
  const connectResult = boxTarget ? run('adb', ['connect', boxTarget], { timeout: 12000 }) : null
  const devicesResult = run('adb', ['devices', '-l'])
  const devices = parseAdbDevices(devicesResult.stdout)
  const authorizedDevices = devices.filter((device) => device.state === 'device')

  let selectedSerial = ''
  let status = 'no_authorized_device'
  if (deviceSerial) {
    selectedSerial = deviceSerial
    status = authorizedDevices.some((device) => device.serial === deviceSerial) ? 'selected' : 'target_not_online'
  } else if (boxTarget && authorizedDevices.some((device) => device.serial === boxTarget)) {
    selectedSerial = boxTarget
    status = 'selected'
  } else if (authorizedDevices.length === 1) {
    selectedSerial = authorizedDevices[0].serial
    status = 'selected'
  } else if (authorizedDevices.length > 1) {
    status = 'multiple_authorized_devices'
  }

  const nextActions = []
  if (status === 'no_authorized_device') {
    nextActions.push('在电视盒子打开开发者选项/网络调试')
    nextActions.push('看电视屏幕确认 RSA 授权弹窗')
    nextActions.push('重新执行：BOX_IP=<盒子IP> npm run tv-box:easy')
  }
  if (status === 'multiple_authorized_devices') {
    nextActions.push('指定目标设备：DEVICE_SERIAL=<序列号> npm run tv-box:inspect')
  }
  if (status === 'target_not_online') {
    nextActions.push('确认目标盒子 IP/序列号在线并已授权')
  }

  if (status !== 'selected') {
    return {
      status,
      connectResult,
      devices,
      selectedSerial: '',
      nextActions
    }
  }

  const model = runAdbShell(selectedSerial, 'getprop ro.product.model').stdout
  const sdk = runAdbShell(selectedSerial, 'getprop ro.build.version.sdk').stdout
  const features = lines(runAdbShell(selectedSerial, 'pm list features').stdout)
    .filter((line) => /leanback|television|camera|microphone|audio|usb\.host/i.test(line))
  const usbSnapshot = runAdbShell(
    selectedSerial,
    "dumpsys usb | grep -Ei 'Device|Class|class|interface|video|camera|uvc|webcam|audio|microphone|host|accessory' | head -120",
    20000
  ).stdout.split(/\r?\n/).filter(Boolean)
  const appPath = runAdbShell(selectedSerial, `pm path ${packageName}`)
  const appInstalled = appPath.ok && appPath.stdout.includes(packageName)
  const appPackageLines = appInstalled
    ? lines(runAdbShell(selectedSerial, `dumpsys package ${packageName} | grep -E 'android.permission.CAMERA|android.permission.RECORD_AUDIO|android.hardware.camera|android.hardware.microphone|android.hardware.usb.host|android.software.leanback'`).stdout)
    : []
  const cameraPermissionContext = appInstalled
    ? lines(runAdbShell(selectedSerial, `dumpsys package ${packageName} | grep -A2 -B2 'android.permission.CAMERA' | head -40`).stdout)
    : []
  const recordAudioPermissionContext = appInstalled
    ? lines(runAdbShell(selectedSerial, `dumpsys package ${packageName} | grep -A2 -B2 'android.permission.RECORD_AUDIO' | head -40`).stdout)
    : []
  const cameraAppOpsLines = appInstalled
    ? lines(runAdbShell(selectedSerial, `appops get ${packageName} CAMERA 2>/dev/null || true`).stdout)
    : []
  const recordAudioAppOpsLines = appInstalled
    ? lines(runAdbShell(selectedSerial, `appops get ${packageName} RECORD_AUDIO 2>/dev/null || true`).stdout)
    : []
  const currentFocusLines = lines(runAdbShell(
    selectedSerial,
    "dumpsys window windows | grep -E 'mCurrentFocus|mFocusedApp|mFocusedWindow' | head -30",
    20000
  ).stdout)
  const resumedActivityLines = lines(runAdbShell(
    selectedSerial,
    "dumpsys activity activities | grep -E 'mResumedActivity|ResumedActivity|topResumedActivity' | head -30",
    20000
  ).stdout)

  return {
    status,
    connectResult,
    devices,
    selectedSerial,
    model,
    androidSdk: sdk,
    featureLines: features,
    usbSnapshot,
    appInstalled,
    appPackageLines,
    cameraPermissionContext,
    recordAudioPermissionContext,
    cameraAppOpsLines,
    recordAudioAppOpsLines,
    currentFocusLines,
    resumedActivityLines,
    nextActions: appInstalled
      ? ['执行摄像头实机冒烟：BOX_IP=<盒子IP> npm run tv-box:camera-smoke']
      : ['安装并启动：BOX_IP=<盒子IP> npm run tv-box:easy']
  }
}

function main() {
  fs.mkdirSync(reportDir, { recursive: true })
  const apkPath = latestApk()
  const remoteSelfTest = commandPath('npm') ? run('npm', ['run', '-s', 'tv-box:remote-test'], { timeout: 30000 }) : {
    command: 'npm run -s tv-box:remote-test',
    ok: false,
    status: null,
    stdout: '',
    stderr: 'npm missing',
    error: ''
  }
  const adbPath = commandPath('adb')
  const contracts = sourceContracts()
  const apk = {
    path: apkPath,
    exists: Boolean(apkPath),
    sizeBytes: apkPath ? fs.statSync(apkPath).size : 0,
    sha256: sha256(apkPath)
  }
  const remoteSelfTestSummary = {
    ok: remoteSelfTest.ok,
    command: remoteSelfTest.command,
    stdout: remoteSelfTest.stdout,
    stderr: remoteSelfTest.stderr
  }
  const deviceEvidence = inspectDevice(adbPath)

  const inspection = {
    generatedAtUtc: new Date().toISOString(),
    projectRoot: rootDir,
    packageName,
    inputs: {
      boxIp,
      deviceSerial
    },
    host: {
      node: commandPath('node'),
      npm: commandPath('npm'),
      adb: adbPath,
      java: commandPath('java'),
      JAVA_HOME: process.env.JAVA_HOME || '',
      ANDROID_HOME: process.env.ANDROID_HOME || '',
      ANDROID_SDK_ROOT: process.env.ANDROID_SDK_ROOT || ''
    },
    sourceContracts: contracts,
    apk,
    remoteSelfTest: remoteSelfTestSummary,
    readiness: buildReadiness(contracts, apk, remoteSelfTestSummary, deviceEvidence),
    deviceEvidence
  }

  fs.writeFileSync(outputPath, `${JSON.stringify(inspection, null, 2)}\n`)
  console.log(`TV-box machine inspection written to: ${outputPath}`)
}

main()
