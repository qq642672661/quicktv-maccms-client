#!/usr/bin/env node
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const rootDir = path.resolve(__dirname, '..')
const reportDir = process.env.REPORT_DIR || path.join(rootDir, 'reports')
const outputJsonPath = process.env.TV_BOX_UX_AUDIT_JSON || path.join(reportDir, 'tv-box-ux-audit-latest.json')
const outputMarkdownPath = process.env.TV_BOX_UX_AUDIT_MD || path.join(reportDir, 'tv-box-ux-audit-latest.md')
const inspectionPath = process.env.TV_BOX_INSPECTION_JSON || path.join(reportDir, 'tv-box-inspection-latest.json')
const handoffDir = process.env.HANDOFF_DIR || firstLine(path.join(reportDir, 'tv-box-handoff-latest-path.txt')) || path.join(reportDir, 'tv-box-handoff')

function firstLine(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8').split(/\r?\n/).find(Boolean) || ''
  } catch {
    return ''
  }
}

function readText(relativePath) {
  try {
    return fs.readFileSync(path.join(rootDir, relativePath), 'utf8')
  } catch {
    return ''
  }
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

function sha256(filePath) {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
  } catch {
    return ''
  }
}

function fileState(filePath) {
  const exists = Boolean(filePath && fs.existsSync(filePath))
  return {
    path: filePath || '',
    exists,
    sizeBytes: exists ? fs.statSync(filePath).size : 0,
    sha256: exists && fs.statSync(filePath).isFile() ? sha256(filePath) : ''
  }
}

function has(relativePath, needle) {
  return readText(relativePath).includes(needle)
}

function sourceOk(contracts, key) {
  return contracts?.[key] === true
}

function allChecksPass(checks) {
  return checks.every((check) => check.ok === true)
}

function makeCheck(id, label, ok, evidence = '') {
  return { id, label, ok: Boolean(ok), evidence }
}

function makeArea(id, title, audience, checks, nextAction = '') {
  const missing = checks.filter((check) => !check.ok)
  return {
    id,
    title,
    audience,
    status: missing.length === 0 ? 'pass' : 'fail',
    missingChecks: missing.map((check) => check.id),
    checks,
    nextAction
  }
}

function statusCounts(areas) {
  return areas.reduce((acc, area) => {
    acc[area.status] = (acc[area.status] || 0) + 1
    return acc
  }, {})
}

function escapeCell(value) {
  return String(value || '').replace(/\|/g, '/').replace(/\r?\n/g, '<br>')
}

function markdownAreaRow(area) {
  const missing = area.missingChecks.length ? area.missingChecks.join(', ') : '无'
  return `| ${escapeCell(area.title)} | ${escapeCell(area.audience)} | \`${area.status}\` | ${escapeCell(missing)} | ${escapeCell(area.nextAction || '保持当前自动化守护。')} |`
}

function markdownCheckRows(area) {
  return area.checks.map((check) => (
    `| ${escapeCell(area.id)} | ${escapeCell(check.id)} | ${check.ok ? '通过' : '缺失'} | ${escapeCell(check.label)} | ${escapeCell(check.evidence)} |`
  )).join('\n')
}

function buildAreas(inspection) {
  const contracts = inspection?.sourceContracts || {}
  const handoffScript = readText('scripts/tv-box-handoff.sh')
  const homeLabels = ['看电视', '找节目', '继续看', '摄像头', '全部内容', '帮助自检']
  const helpLabels = ['电视环境', '摄像头', '权限', '麦克风', '维护码', '现在下一步']
  const operationCardSignals = ['日常看电视', '直播数字键 1-9 换台', '播放/暂停键', '摄像头检查', '现场排障']

  return [
    makeArea(
      'simple_home',
      '六入口简易首页',
      '长辈 / 小孩 / 首次安装人员',
      [
        makeCheck('simple_mode_default', '生产环境默认进入电视盒子简易模式', sourceOk(contracts, 'simpleModeDefault'), '.env.production'),
        makeCheck('simple_home_route', '默认首页路由存在', sourceOk(contracts, 'simpleHomeRoute'), 'src/routes.ts'),
        makeCheck('home_labels', '首页只暴露看电视/找节目/继续看/摄像头/全部内容/帮助自检六个大入口', homeLabels.every((label) => has('src/pages/tv-box-home/index.vue', label)), homeLabels.join(' / ')),
        makeCheck('numeric_badges', '首页按钮显示数字快捷键，适配带数字键遥控器', sourceOk(contracts, 'numericHomeBadges'), 'tv-box-home-card-key'),
        makeCheck('visible_help_card', '首页有可见帮助自检入口，不依赖隐藏快捷键', sourceOk(contracts, 'visibleHomeHelpCard'), '帮助自检'),
        makeCheck('zero_key_help', '0 键可直接进入帮助/自检', sourceOk(contracts, 'zeroKeyHelp'), 'launchTvBoxHelp'),
        makeCheck('help_keys', '菜单/信息/帮助等遥控器帮助键可救援', sourceOk(contracts, 'homeHelpKeys') && sourceOk(contracts, 'remoteHelpKeys'), 'isRemoteHelpKey'),
        makeCheck('safe_exit', '首页返回进入大字退出确认，不直接关闭', sourceOk(contracts, 'simpleHomeBackExit'), 'launchTvBoxExit')
      ],
      '恢复首页六个大入口、数字角标、0/6/帮助键和返回退出确认。'
    ),
    makeArea(
      'remote_first_navigation',
      '遥控器优先交互',
      '只有遥控器的电视盒子用户',
      [
        makeCheck('dpad_helper', '方向键移动逻辑集中在共享 helper', has('src/tools/tv-box/remote-control.ts', 'remoteMoveDirectionFromKeyCode'), 'remote-control.ts'),
        makeCheck('confirm_keys', 'OK/Enter/小键盘 Enter/蓝牙确认键都有兜底', has('src/tools/tv-box/remote-control.ts', 'NUMPAD_ENTER') && has('src/tools/tv-box/remote-control.ts', 'BUTTON_A'), 'NUMPAD_ENTER / BUTTON_A'),
        makeCheck('numeric_helper', '数字键统一解析，降低页面各自实现风险', has('src/tools/tv-box/remote-control.ts', 'remoteNumberFromKeyCode'), 'remoteNumberFromKeyCode'),
        makeCheck('help_key_helper', '菜单/信息/指南/设置/帮助键统一识别', has('src/tools/tv-box/remote-control.ts', 'isRemoteHelpKey'), 'isRemoteHelpKey'),
        makeCheck('media_key_helper', '播放/暂停/停止媒体键统一识别，适配带播放键的电视盒子遥控器', has('src/tools/tv-box/remote-control.ts', 'remoteMediaActionFromKeyCode'), 'remoteMediaActionFromKeyCode'),
        makeCheck('key_label_helper', '未知遥控器 keyCode 可显示给现场拍照回传', sourceOk(contracts, 'remoteKeyLabelHelper'), 'remoteKeyLabelFromKeyCode'),
        makeCheck('remote_self_test', '遥控器核心逻辑已有无盒子自测', inspection?.remoteSelfTest?.ok === true, inspection?.remoteSelfTest?.stdout || 'remoteSelfTest missing'),
        makeCheck('practice_test', '自测覆盖遥控练习动作行', has('scripts/tv-box-remote-test.ts', 'testPracticeActionRow'), 'testPracticeActionRow'),
        makeCheck('exit_test', '自测覆盖退出确认动作行', has('scripts/tv-box-remote-test.ts', 'testExitActionRow'), 'testExitActionRow')
      ],
      '先运行 npm run tv-box:remote-test，失败时修复共享遥控器 helper。'
    ),
    makeArea(
      'help_self_check',
      '帮助/自检页唯一下一步',
      '不会判断状态信息的长辈 / 小孩',
      [
        makeCheck('help_route', '帮助/自检页路由存在', sourceOk(contracts, 'tvBoxHelpRoute'), 'tv_box_help'),
        makeCheck('help_key_copy', '页面明示 6/0/菜单/信息/帮助键都能进入', has('src/pages/tv-box-help/index.vue', '6 或 0、菜单、信息或帮助键'), '帮助页提示文案'),
        makeCheck('primary_next_action', '帮助页有“现在下一步”唯一建议', sourceOk(contracts, 'helpPrimaryNextAction') && helpLabels.every((label) => has('src/pages/tv-box-help/index.vue', label)), helpLabels.join(' / ')),
        makeCheck('refresh_shortcut', '帮助页 6 键刷新自检状态', sourceOk(contracts, 'helpSixKeyRefresh'), 'remoteNumber === 6'),
        makeCheck('camera_shortcut', '帮助页可直接进入摄像头检查', has('src/pages/tv-box-help/index.vue', 'launch.launchCameraSetup'), '按 2 摄像头检查'),
        makeCheck('practice_shortcut', '帮助页可直接进入遥控练习', sourceOk(contracts, 'helpRemotePracticeShortcut'), '按 3 遥控练习'),
        makeCheck('home_shortcut', '帮助页可一键回首页', has('src/pages/tv-box-help/index.vue', 'launch.launchTvBoxHome'), '按 4 返回首页'),
        makeCheck('field_shortcut', '帮助页可直接进入现场验收', sourceOk(contracts, 'helpFieldGuideShortcut'), '按 5 现场验收'),
        makeCheck('support_code', '帮助页显示维护码并提示电话排障读给维护人员', has('src/pages/tv-box-help/index.vue', 'supportCodeText') && has('src/pages/tv-box-help/index.vue', '电话排障时读这一行'), 'supportCodeText')
      ],
      '确保帮助页始终有一个清晰下一步，不把判断压力留给现场。'
    ),
    makeArea(
      'remote_practice',
      '遥控器练习页',
      '儿童 / 第一次用遥控器的长辈',
      [
        makeCheck('practice_route', '遥控练习页路由存在', sourceOk(contracts, 'remotePracticeRoute'), 'tv_box_remote_practice'),
        makeCheck('elder_title', '页面用大白话提示跟着电视按三下就会用', has('src/pages/tv-box-remote-practice/index.vue', '跟着电视按三下就会用'), '练习页标题'),
        makeCheck('dpad_detection', '练习页检测方向键', sourceOk(contracts, 'remotePracticeDpad'), 'remoteMoveDirectionFromKeyCode'),
        makeCheck('confirm_detection', '练习页检测 OK/确认键', sourceOk(contracts, 'remotePracticeConfirm'), 'isRemoteConfirmKey'),
        makeCheck('key_code_feedback', '未知键显示 keyCode 并要求拍照', sourceOk(contracts, 'remotePracticeKeyCodeFeedback'), '未知键请拍照'),
        makeCheck('back_handling', '练习页处理返回键', has('src/pages/tv-box-remote-practice/index.vue', 'onBackPressed'), 'onBackPressed')
      ],
      '保留练习页 keyCode 反馈，方便适配非标准遥控器。'
    ),
    makeArea(
      'camera_microphone',
      '摄像头/麦克风自检',
      '现场安装人员 / 视频通话或拍照场景',
      [
        makeCheck('camera_route', '摄像头检查路由存在', sourceOk(contracts, 'cameraSetupRoute'), 'camera_setup'),
        makeCheck('numeric_camera_badges', '摄像头页按钮显示 1-5 数字快捷键', sourceOk(contracts, 'numericCameraBadges'), 'camera-setup-button-key'),
        makeCheck('camera_help_keys', '摄像头页支持 0/6/帮助键回自检', sourceOk(contracts, 'cameraHelpKeys') && sourceOk(contracts, 'cameraSixKeyHelp'), 'remoteNumber === 6 / isRemoteHelpKey'),
        makeCheck('media_permissions', '摄像头页可一键请求摄像头和录音权限', has('src/pages/camera-setup/index.vue', 'requestTvBoxMediaPermissions') && has('src/pages/camera-setup/index.vue', '摄像头和麦克风权限已允许'), 'requestTvBoxMediaPermissions'),
        makeCheck('preview_test', '摄像头页有“测试摄像头”入口', has('src/pages/camera-setup/index.vue', '测试摄像头'), '测试摄像头'),
        makeCheck('phone_camera_shortcut', '摄像头页有手机摄像头保底入口', sourceOk(contracts, 'cameraPagePhoneCameraShortcut'), 'launchPhoneCameraPair / 手机摄像头'),
        makeCheck('microphone_status', '摄像头页显示麦克风/音频输入状态', sourceOk(contracts, 'cameraPageMicrophoneStatus') && sourceOk(contracts, 'frontEndAudioInputDetection'), 'audioInputDeviceCount'),
        makeCheck('native_bridge', '原生桥检测 Camera2、USB 视频、音频输入和权限', sourceOk(contracts, 'nativeTvBoxModule') && sourceOk(contracts, 'nativeCameraPreviewActivity') && sourceOk(contracts, 'nativeAudioInputDetection'), 'TvBoxModule / CameraPreviewActivity'),
        makeCheck('optional_manifest', '摄像头、麦克风、USB Host、触屏均为可选能力，不阻塞安装', sourceOk(contracts, 'optionalExternalCamera') && sourceOk(contracts, 'optionalMicrophone') && sourceOk(contracts, 'optionalUsbHost') && sourceOk(contracts, 'optionalTouchscreen'), 'AndroidManifest optional features'),
        makeCheck('support_code_audio', '维护码包含音频输入状态', sourceOk(contracts, 'supportCodeAudioInput'), '音频输入')
      ],
      '真实预览和热插拔仍需 BOX_IP=<盒子IP> RUN_CAMERA_SMOKE=true npm run tv-box:easy。'
    ),
    makeArea(
      'phone_camera_pairing',
      '手机摄像头配对入口',
      '没有实体摄像头或临时互动课的家庭用户',
      [
        makeCheck('phone_pair_route', '手机摄像头配对页路由存在', sourceOk(contracts, 'phoneCameraPairRoute'), 'phone_camera_pair'),
        makeCheck('phone_pair_page', '配对页源码存在', sourceOk(contracts, 'phoneCameraPairPage'), 'src/pages/phone-camera-pair/index.vue'),
        makeCheck('phone_pair_qr', '配对页显示二维码内容和扫码入口', sourceOk(contracts, 'phoneCameraPairQrCode'), 'qt-qr-code / pairUrl'),
        makeCheck('phone_pair_room_code', '配对页生成 6 位房间码并提示过期时间', sourceOk(contracts, 'phoneCameraPairRoomCode'), 'generateRoomCode / ttlMinutes'),
        makeCheck('phone_pair_config', '配对页手机入口和信令地址可配置、可从同一个房间码派生', sourceOk(contracts, 'phoneCameraPairConfigurableBaseUrl') && sourceOk(contracts, 'phoneCameraPairSignalingUrl'), 'VITE_PHONE_CAMERA_PAIR_BASE_URL / buildSignalingUrl'),
        makeCheck('phone_pair_receiver_options', '打开电视接收端时传入房间码、信令地址、手机入口和媒体档位', sourceOk(contracts, 'phoneCameraPairReceiverOptions') && sourceOk(contracts, 'nativePhoneCameraReceiverOptions'), 'openPhoneCameraReceiverWithValues / roomCode / signalingUrl'),
        makeCheck('phone_pair_signaling_room', '信令服务和电视接收端使用同一个 6 位房间码创建 TV 房间', sourceOk(contracts, 'phoneCameraSignalingCreatesTvRoomCode') && sourceOk(contracts, 'nativePhoneCameraSignalingClient'), 'room.create roomCode / PhoneCameraSignalingClient'),
        makeCheck('phone_pair_native_media_engine', '实验包可选接入原生 WebRTC 媒体引擎并发送 answer/ICE/stats', sourceOk(contracts, 'nativePhoneCameraMediaEngine'), 'PhoneCameraMediaEngine / PhoneCameraNativeWebRtcEngine'),
        makeCheck('phone_pair_four_actions', '配对页只暴露打开接收端、重新生成、返回摄像头、帮助自检四个遥控动作', sourceOk(contracts, 'phoneCameraPairRemoteActions'), '打开接收端 / 重新生成 / 返回摄像头 / 帮助自检'),
        makeCheck('phone_pair_help_keys', '配对页支持 0/6/帮助键救援', sourceOk(contracts, 'phoneCameraPairHelpKeys'), 'remoteNumber === 6 / isRemoteHelpKey'),
        makeCheck('phone_pair_privacy', '配对页明示默认不录制和小程序资质门禁', sourceOk(contracts, 'phoneCameraPairPrivacyBoundary'), '默认不录制 / 微信小程序推流'),
        makeCheck('phone_pair_receiver_readiness', '配对页显示接收端准备度并从原生状态区分 SDK/媒体验收', sourceOk(contracts, 'phoneCameraPairReceiverReadiness'), '接收端准备度 / phoneCameraReceiverStage'),
        makeCheck('phone_pair_boundary', '配对页不把手机摄像头误说成系统 Camera2，并明确 WebRTC SDK/首帧未闭环边界', sourceOk(contracts, 'phoneCameraPairNativeWebRtcBoundary'), '接收入口已接入 APK / WebRTC SDK / 不伪装')
      ],
      '后续需要用 ENABLE_PHONE_CAMERA_WEBRTC=true 实验包在真实盒子上拿到首帧、音频和 stats；本页仍不替代现场音视频证据。'
    ),
    makeArea(
      'field_acceptance',
      '电视端现场验收指引',
      '现场安装人员 / 远程维护人员',
      [
        makeCheck('field_route', '现场验收页路由存在', sourceOk(contracts, 'fieldGuideRoute'), 'tv_box_field_guide'),
        makeCheck('field_title', '现场验收页标题清晰，按顺序测完再交付', has('src/pages/tv-box-field-guide/index.vue', '按顺序测完，就能放心交付'), '现场验收标题'),
        makeCheck('remote_first_step', '验收顺序先测遥控器', has('src/pages/tv-box-field-guide/index.vue', '先测遥控器'), '先测遥控器'),
        makeCheck('live_step', '验收包含看电视/直播播放', has('src/pages/tv-box-field-guide/index.vue', '再测看电视'), '再测看电视'),
        makeCheck('search_history_step', '验收包含搜索/继续看救援', has('src/pages/tv-box-field-guide/index.vue', '补测找节目'), '补测找节目'),
        makeCheck('camera_step', '验收包含摄像头/麦克风', has('src/pages/tv-box-field-guide/index.vue', '再测摄像头'), '再测摄像头'),
        makeCheck('evidence_step', '验收要求最后留证据', has('src/pages/tv-box-field-guide/index.vue', '最后留证据'), '最后留证据'),
        makeCheck('no_unknown_boundary', '无摄像头/麦克风要写不适用，不能留 unknown', sourceOk(contracts, 'fieldGuideHardwareBoundary'), '不能留未知'),
        makeCheck('support_bundle_evidence', '失败时要求维护码照片、现场 JSON 和 support zip', sourceOk(contracts, 'fieldGuideRecordEvidence'), '维护码照片 / 现场验收 JSON / tv-box-support-latest.zip')
      ],
      '现场发回前先跑 tv-box:return-inbox 质检证据完整度。'
    ),
    makeArea(
      'live_and_rescue',
      '直播与复杂页面救援',
      '误入二级页面的家庭用户',
      [
        makeCheck('live_numeric', '直播页 1-9 数字键直达频道', sourceOk(contracts, 'liveNumericChannelShortcuts') && sourceOk(contracts, 'liveNumericChannelHelper'), 'playMediaByRemoteNumberKey'),
        makeCheck('live_media_keys', '直播页播放/暂停物理键可暂停或继续播放', sourceOk(contracts, 'liveMediaKeyShortcuts'), 'handleRemoteMediaKey'),
        makeCheck('live_help', '直播页 0/菜单/信息/帮助键进入自检', sourceOk(contracts, 'liveHelpShortcut'), 'launchTvBoxHelp'),
        makeCheck('live_home_back', '直播返回最终回到简易首页', sourceOk(contracts, 'liveBackToSimpleHome'), 'launchTvBoxHome'),
        makeCheck('live_favorites', '频道列表支持收藏和只看收藏', sourceOk(contracts, 'liveFavoriteShortcut') && sourceOk(contracts, 'liveFavoriteOnlyShortcut') && sourceOk(contracts, 'liveFavoriteStorage'), '7 收藏 / 8 只看收藏'),
        makeCheck('classic_home_rescue', '误入全部内容原始首页可 0/6/帮助键救援并返回简易首页', sourceOk(contracts, 'classicHomeHelpRescue') && sourceOk(contracts, 'classicHomeBackToSimpleHome'), 'classic home rescue'),
        makeCheck('history_rescue', '继续看页面可帮助救援并返回简易首页', sourceOk(contracts, 'historyRouteUsesRawPage') && sourceOk(contracts, 'historyHelpRescue') && sourceOk(contracts, 'historyBackToSimpleHome'), 'history rescue'),
        makeCheck('search_rescue', '搜索页可帮助救援并返回简易首页', sourceOk(contracts, 'searchHelpRescue') && sourceOk(contracts, 'searchBackToSimpleHome'), 'search rescue'),
        makeCheck('remote_test_live', '无盒子自测覆盖直播数字键和收藏 helper', has('scripts/tv-box-remote-test.ts', 'testLiveNumericChannelShortcuts') && has('scripts/tv-box-remote-test.ts', 'testLiveFavoriteHelpers'), 'remote-test live coverage')
      ],
      '保留所有复杂页的帮助键和返回首页兜底。'
    ),
    makeArea(
      'exit_guard',
      '防误退出确认',
      '小孩 / 容易误按返回键的长辈',
      [
        makeCheck('exit_route', '退出确认页路由存在', sourceOk(contracts, 'tvBoxExitRoute'), 'tv_box_exit'),
        makeCheck('exit_page', '退出确认页存在', sourceOk(contracts, 'tvBoxExitPage'), 'src/pages/tv-box-exit/index.vue'),
        makeCheck('elder_title', '退出页用“要不要继续看”大字问题', has('src/pages/tv-box-exit/index.vue', '要不要继续看'), '要不要继续看'),
        makeCheck('continue_default', '默认安全动作是继续看', sourceOk(contracts, 'tvBoxExitContinueDefault'), '继续看'),
        makeCheck('explicit_exit', '退出应用必须明确选择', sourceOk(contracts, 'tvBoxExitConfirm'), '退出应用'),
        makeCheck('numeric_exit', '退出页支持数字键明确选择退出', has('src/pages/tv-box-exit/index.vue', 'remoteNumber === 2'), 'remoteNumber === 2'),
        makeCheck('confirm_exit', '退出页支持 OK 确认当前选择', has('src/pages/tv-box-exit/index.vue', 'isRemoteConfirmKey'), 'isRemoteConfirmKey')
      ],
      '不要把首页返回键改回直接退出。'
    ),
    makeArea(
      'handoff_cards',
      '可打印傻瓜化交付卡片',
      '现场安装人员 / 家庭成员 / 采购',
      [
        makeCheck('start_here_source', '交付脚本生成 START_HERE.html 大字入口', handoffScript.includes('START_HERE.html'), 'tv-box-handoff.sh'),
        makeCheck('operation_card_source', '交付脚本生成电视旁操作卡', handoffScript.includes('OPERATION_CARD.html'), 'OPERATION_CARD.html'),
        makeCheck('hardware_card_source', '交付脚本生成硬件选型卡', handoffScript.includes('HARDWARE_SELECTION_CARD.html'), 'HARDWARE_SELECTION_CARD.html'),
        makeCheck('field_return_card_source', '交付脚本生成现场回传卡', handoffScript.includes('FIELD_RETURN_CARD.html'), 'FIELD_RETURN_CARD.html'),
        makeCheck('return_packers_source', '交付脚本生成 Windows/macOS 回传打包器', handoffScript.includes('PACK_FIELD_RETURN_ON_WINDOWS.bat') && handoffScript.includes('PACK_FIELD_RETURN_ON_MAC.command'), 'PACK_FIELD_RETURN_ON_*'),
        makeCheck('operation_card_content', 'README 说明操作卡覆盖看电视、直播数字键、摄像头检查和排障', operationCardSignals.every((signal) => has('README.md', signal)), operationCardSignals.join(' / ')),
        makeCheck('latest_start_here', '当前 reports 里已有 START_HERE.html', fs.existsSync(path.join(handoffDir, 'START_HERE.html')), path.join(handoffDir, 'START_HERE.html')),
        makeCheck('latest_operation_card', '当前 reports 里已有 OPERATION_CARD.html', fs.existsSync(path.join(handoffDir, 'OPERATION_CARD.html')), path.join(handoffDir, 'OPERATION_CARD.html'))
      ],
      '运行 npm run tv-box:handoff 重新生成交付包，再运行 npm run tv-box:handoff-html-smoke。'
    ),
    makeArea(
      'no_fake_closure',
      '不伪造真实盒子完成态',
      '项目负责人 / 交付负责人',
      [
        makeCheck('completion_remote_gate', '完成度审计保留真实遥控器严格门禁', has('scripts/tv-box-completion-audit.js', 'realRemoteAcceptanceProven'), 'realRemoteAcceptanceProven'),
        makeCheck('completion_camera_gate', '完成度审计保留真实摄像头/麦克风门禁', has('scripts/tv-box-completion-audit.js', 'realCameraAcceptanceProven'), 'realCameraAcceptanceProven'),
        makeCheck('needs_box_status', '无授权盒子时 readiness 保持 handoff_ready_needs_box', inspection?.readiness?.level === 'handoff_ready_needs_box' || inspection?.deviceEvidence?.status === 'selected', inspection?.readiness?.level || 'readiness missing'),
        makeCheck('device_status_recorded', '报告记录当前 ADB 设备状态', Boolean(inspection?.deviceEvidence?.status), inspection?.deviceEvidence?.status || 'missing'),
        makeCheck('hardware_no_fake_closure', '硬件画像保留 noFakeClosure 规则', has('scripts/tv-box-hardware-profile.js', 'noFakeClosure'), 'noFakeClosure'),
        makeCheck('field_unknown_boundary', '现场验收明确 unknown 不可关闭', sourceOk(contracts, 'fieldGuideHardwareBoundary'), '不能留未知')
      ],
      '拿到真实盒子证据前只允许 handoff，不允许 close。'
    )
  ]
}

function main() {
  fs.mkdirSync(reportDir, { recursive: true })
  const inspection = readJson(inspectionPath)
  const areas = buildAreas(inspection)
  const counts = statusCounts(areas)
  const failedAreas = areas.filter((area) => area.status !== 'pass')
  const artifactStates = {
    inspection: fileState(inspectionPath),
    handoffDirectory: fileState(handoffDir),
    startHereHtml: fileState(path.join(handoffDir, 'START_HERE.html')),
    operationCardHtml: fileState(path.join(handoffDir, 'OPERATION_CARD.html')),
    fieldReturnCardHtml: fileState(path.join(handoffDir, 'FIELD_RETURN_CARD.html')),
    hardwareSelectionCardHtml: fileState(path.join(handoffDir, 'HARDWARE_SELECTION_CARD.html'))
  }

  const result = {
    generatedAtUtc: new Date().toISOString(),
    projectRoot: rootDir,
    reportDir,
    handoffDir,
    summary: {
      overall: failedAreas.length === 0 ? 'pass' : 'fail',
      pass: counts.pass || 0,
      fail: counts.fail || 0,
      totalAreas: areas.length,
      totalChecks: areas.reduce((sum, area) => sum + area.checks.length, 0),
      failedChecks: areas.reduce((sum, area) => sum + area.missingChecks.length, 0)
    },
    realBoxBoundary: {
      status: inspection?.deviceEvidence?.status === 'selected' ? 'selected_device_needs_field_acceptance' : 'needs_box',
      message: '本 UX 审计只证明源码、交付卡和本地自动化没有漂移；真实遥控器焦点、Camera2 预览、麦克风和 USB 热插拔仍需现场盒子验收。'
    },
    readiness: inspection?.readiness || null,
    deviceEvidence: inspection?.deviceEvidence ? {
      status: inspection.deviceEvidence.status || 'unknown',
      selectedSerial: inspection.deviceEvidence.selectedSerial || '',
      devices: inspection.deviceEvidence.devices || []
    } : null,
    artifacts: artifactStates,
    areas
  }

  fs.writeFileSync(outputJsonPath, `${JSON.stringify(result, null, 2)}\n`)

  const markdown = `# HelloTV 长辈/小孩遥控器 UX 独立审计

- 生成时间 UTC: \`${result.generatedAtUtc}\`
- overall: \`${result.summary.overall}\`
- 通过区域: \`${result.summary.pass}\`
- 失败区域: \`${result.summary.fail}\`
- 检查项: \`${result.summary.totalChecks}\`
- 失败检查项: \`${result.summary.failedChecks}\`
- readiness: \`${result.readiness?.level || 'unknown'}\`
- 设备证据: \`${result.deviceEvidence?.status || 'unknown'}\`

## 结论

${result.summary.overall === 'pass'
  ? '源码、交付脚本和当前报告证明：简易首页、帮助/自检、遥控练习、现场验收、摄像头检查、直播救援、复杂页救援和防误退出这几条长辈/小孩路径仍然完整。'
  : '有长辈/小孩关键 UX 路径缺失，先修复失败检查项再发交付包。'}

${result.realBoxBoundary.message}

## 区域结果

| 区域 | 使用者 | 状态 | 缺失检查项 | 下一步 |
| --- | --- | --- | --- | --- |
${areas.map(markdownAreaRow).join('\n')}

## 检查项明细

| 区域 | 检查项 | 结果 | 要求 | 证据 |
| --- | --- | --- | --- | --- |
${areas.map(markdownCheckRows).join('\n')}
`

  fs.writeFileSync(outputMarkdownPath, markdown)
  console.log(`TV-box UX audit written to: ${outputMarkdownPath}`)
  console.log(`Machine-readable UX audit: ${outputJsonPath}`)

  if (result.summary.overall !== 'pass') {
    process.exitCode = 1
  }
}

main()
