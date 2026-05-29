const textPrompts = [
  ['BOX_IP', '电视盒子 IP', ''],
  ['DEVICE_SERIAL', 'ADB 设备序列号；不知道可留空', ''],
  ['FIELD_OPERATOR', '安装/验收人员', ''],
  ['FIELD_LOCATION', '安装地点，例如 客厅A', ''],
  ['FIELD_BOX_BRAND', '盒子品牌，例如 小米/当贝/天猫魔盒', ''],
  ['FIELD_BOX_MODEL', '盒子型号', ''],
  ['FIELD_ANDROID_SDK', 'Android SDK；不知道可留空', ''],
  ['FIELD_REMOTE_MODEL', '遥控器型号；不知道可写 原装遥控器', '原装遥控器'],
  ['FIELD_CAMERA_MODEL', '摄像头型号；没有可留空', ''],
  ['FIELD_CAMERA_CONNECTION', '摄像头连接方式 usb/builtin/none/unknown', 'unknown'],
  ['FIELD_MICROPHONE_MODEL', '麦克风型号；没有可留空', ''],
  ['FIELD_MICROPHONE_CONNECTION', '麦克风连接方式 usb/builtin/none/unknown', 'unknown']
]

const resultPrompts = [
  ['FIELD_REMOTE_FOCUS', '遥控器方向键焦点移动'],
  ['FIELD_NUMERIC_SHORTCUTS', '数字键 1-6 快捷入口'],
  ['FIELD_ZERO_KEY_HELP', '6/0 键帮助/自检'],
  ['FIELD_HELP_KEY_SHORTCUTS', '菜单/信息/帮助键进入帮助/自检'],
  ['FIELD_REMOTE_PRACTICE', '帮助页遥控器练习'],
  ['FIELD_EXIT_CONFIRM', '首页返回退出确认'],
  ['FIELD_LIVE_PLAYBACK', '直播播放、换台和返回'],
  ['FIELD_LIVE_NUMERIC_CHANNELS', '直播页数字键 1-9 换台'],
  ['FIELD_LIVE_MEDIA_KEYS', '直播页播放/暂停物理键'],
  ['FIELD_LIVE_FAVORITES', '直播频道 7 收藏 / 8 只看收藏'],
  ['FIELD_CLASSIC_HOME_RESCUE', '全部内容页 0/6/菜单/信息/帮助键自检和返回首页'],
  ['FIELD_SEARCH_RESCUE', '搜索页 0/菜单/信息/帮助键自检和返回首页'],
  ['FIELD_HISTORY_RESCUE', '继续看页 0/菜单/信息/帮助键自检和返回首页'],
  ['FIELD_CAMERA_PERMISSION', '摄像头权限授权'],
  ['FIELD_CAMERA_PREVIEW', '摄像头预览画面'],
  ['FIELD_AUDIO_INPUT', '麦克风/音频输入识别'],
  ['FIELD_RECORD_AUDIO_PERMISSION', '录音权限授权'],
  ['FIELD_USB_HOTPLUG', 'USB 摄像头热插拔'],
  ['FIELD_SUPPORT_CODE', '维护码是否能读给维护人员']
]

const phoneCameraResultPrompts = [
  ['FIELD_PHONE_CAMERA_PAIRING', '手机摄像头扫码/房间码配对'],
  ['FIELD_PHONE_CAMERA_PERMISSION', '手机端摄像头权限授权'],
  ['FIELD_PHONE_MICROPHONE_PERMISSION', '手机端麦克风权限授权'],
  ['FIELD_PHONE_TV_FIRST_FRAME', '电视端手机摄像头首帧画面'],
  ['FIELD_PHONE_TV_AUDIO', '电视端手机麦克风声音'],
  ['FIELD_PHONE_SESSION_STATS', '手机摄像头 session.stats 证据'],
  ['FIELD_PHONE_RECONNECT', '手机摄像头断线重连'],
  ['FIELD_PHONE_PRIVACY_STOP', '手机停止按钮关闭采集']
]

const allResultPrompts = [...resultPrompts, ...phoneCameraResultPrompts]

const resultText = {
  pass: '通过',
  fail: '失败',
  skip: '跳过',
  na: '不适用',
  unknown: '未知'
}

const resultOptions = [
  ['pass', resultText.pass],
  ['fail', resultText.fail],
  ['skip', resultText.skip],
  ['na', resultText.na],
  ['unknown', resultText.unknown]
]

const quickPresets = [
  {
    key: 'tv_core_pass',
    title: '只验收看电视通过',
    description: '遥控器、直播、帮助、退出确认和维护码已测过；摄像头/麦克风先按不适用处理。',
    textDefaults: {
      FIELD_CAMERA_CONNECTION: 'none',
      FIELD_MICROPHONE_CONNECTION: 'none'
    },
    results: {
      FIELD_REMOTE_FOCUS: 'pass',
      FIELD_NUMERIC_SHORTCUTS: 'pass',
      FIELD_ZERO_KEY_HELP: 'pass',
      FIELD_HELP_KEY_SHORTCUTS: 'pass',
      FIELD_REMOTE_PRACTICE: 'pass',
      FIELD_EXIT_CONFIRM: 'pass',
      FIELD_LIVE_PLAYBACK: 'pass',
      FIELD_LIVE_NUMERIC_CHANNELS: 'pass',
      FIELD_LIVE_MEDIA_KEYS: 'pass',
      FIELD_LIVE_FAVORITES: 'pass',
      FIELD_CLASSIC_HOME_RESCUE: 'pass',
      FIELD_SEARCH_RESCUE: 'pass',
      FIELD_HISTORY_RESCUE: 'pass',
      FIELD_CAMERA_PERMISSION: 'na',
      FIELD_CAMERA_PREVIEW: 'na',
      FIELD_AUDIO_INPUT: 'na',
      FIELD_RECORD_AUDIO_PERMISSION: 'na',
      FIELD_USB_HOTPLUG: 'na',
      FIELD_PHONE_CAMERA_PAIRING: 'na',
      FIELD_PHONE_CAMERA_PERMISSION: 'na',
      FIELD_PHONE_MICROPHONE_PERMISSION: 'na',
      FIELD_PHONE_TV_FIRST_FRAME: 'na',
      FIELD_PHONE_TV_AUDIO: 'na',
      FIELD_PHONE_SESSION_STATS: 'na',
      FIELD_PHONE_RECONNECT: 'na',
      FIELD_PHONE_PRIVACY_STOP: 'na',
      FIELD_SUPPORT_CODE: 'pass'
    }
  },
  {
    key: 'camera_audio_pass',
    title: '摄像头/麦克风通过',
    description: '只快速补齐摄像头、麦克风、录音权限和 USB 热插拔结果。',
    textDefaults: {
      FIELD_CAMERA_CONNECTION: 'usb',
      FIELD_MICROPHONE_CONNECTION: 'usb'
    },
    results: {
      FIELD_CAMERA_PERMISSION: 'pass',
      FIELD_CAMERA_PREVIEW: 'pass',
      FIELD_AUDIO_INPUT: 'pass',
      FIELD_RECORD_AUDIO_PERMISSION: 'pass',
      FIELD_USB_HOTPLUG: 'pass'
    }
  },
  {
    key: 'no_camera_no_mic',
    title: '没有摄像头/麦克风',
    description: '明确记录外设缺失，避免把摄像头/麦克风项误判成失败。',
    textDefaults: {
      FIELD_CAMERA_CONNECTION: 'none',
      FIELD_MICROPHONE_CONNECTION: 'none'
    },
    results: {
      FIELD_CAMERA_PERMISSION: 'na',
      FIELD_CAMERA_PREVIEW: 'na',
      FIELD_AUDIO_INPUT: 'na',
      FIELD_RECORD_AUDIO_PERMISSION: 'na',
      FIELD_USB_HOTPLUG: 'na',
      FIELD_PHONE_CAMERA_PAIRING: 'na',
      FIELD_PHONE_CAMERA_PERMISSION: 'na',
      FIELD_PHONE_MICROPHONE_PERMISSION: 'na',
      FIELD_PHONE_TV_FIRST_FRAME: 'na',
      FIELD_PHONE_TV_AUDIO: 'na',
      FIELD_PHONE_SESSION_STATS: 'na',
      FIELD_PHONE_RECONNECT: 'na',
      FIELD_PHONE_PRIVACY_STOP: 'na'
    }
  },
  {
    key: 'phone_camera_pass',
    title: '手机摄像头通过',
    description: '只快速补齐手机扫码、权限、电视首帧、声音、stats、重连和停止证据。',
    textDefaults: {
      FIELD_CAMERA_CONNECTION: 'phone_webrtc',
      FIELD_MICROPHONE_CONNECTION: 'phone_webrtc'
    },
    results: Object.fromEntries(phoneCameraResultPrompts.map(([key]) => [key, 'pass']))
  },
  {
    key: 'all_pass',
    title: '全部通过',
    description: '只有现场逐项确认都正常时使用；会把全部验收结果置为通过。',
    textDefaults: {
      FIELD_CAMERA_CONNECTION: 'usb',
      FIELD_MICROPHONE_CONNECTION: 'usb'
    },
    results: Object.fromEntries(allResultPrompts.map(([key]) => [key, 'pass']))
  }
]

const schemaVersion = '2026-05-29.phone-camera-field-acceptance'

module.exports = {
  textPrompts,
  resultPrompts,
  phoneCameraResultPrompts,
  allResultPrompts,
  resultText,
  resultOptions,
  quickPresets,
  schemaVersion
}
