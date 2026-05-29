import assert from 'node:assert/strict'
import {
  isRemoteChannelDownKey,
  isRemoteChannelUpKey,
  isRemoteConfirmKey,
  isRemoteHelpKey,
  isRemoteMediaKey,
  remoteKeyLabelFromKeyCode,
  remoteMediaActionFromKeyCode,
  moveGridSelection,
  moveLinearSelection,
  remoteChannelIndexFromKeyCode,
  remoteNumberFromKeyCode,
  TV_REMOTE_KEY
} from '../src/tools/tv-box/remote-control'
import {
  decorateLiveFavorites,
  filterLiveFavorites,
  firstPlayableLiveIndex,
  liveChannelId,
  parseLiveFavoriteIds,
  serializeLiveFavoriteIds,
  toggleLiveFavoriteId
} from '../src/tools/tv-box/live-favorites'
import { formatTvBoxSupportCode } from '../src/tools/tv-box/support-code'

function testSimpleHomeGrid() {
  const itemCount = 6
  const columnCount = 3

  assert.equal(moveGridSelection(0, itemCount, columnCount, TV_REMOTE_KEY.DPAD_RIGHT), 1)
  assert.equal(moveGridSelection(1, itemCount, columnCount, TV_REMOTE_KEY.DPAD_RIGHT), 2)
  assert.equal(moveGridSelection(2, itemCount, columnCount, TV_REMOTE_KEY.DPAD_RIGHT), 2)
  assert.equal(moveGridSelection(0, itemCount, columnCount, TV_REMOTE_KEY.DPAD_LEFT), 0)
  assert.equal(moveGridSelection(1, itemCount, columnCount, TV_REMOTE_KEY.DPAD_LEFT), 0)
  assert.equal(moveGridSelection(0, itemCount, columnCount, TV_REMOTE_KEY.DPAD_DOWN), 3)
  assert.equal(moveGridSelection(1, itemCount, columnCount, TV_REMOTE_KEY.DPAD_DOWN), 4)
  assert.equal(moveGridSelection(2, itemCount, columnCount, TV_REMOTE_KEY.DPAD_DOWN), 5)
  assert.equal(moveGridSelection(3, itemCount, columnCount, TV_REMOTE_KEY.DPAD_UP), 0)
  assert.equal(moveGridSelection(4, itemCount, columnCount, TV_REMOTE_KEY.DPAD_UP), 1)
  assert.equal(moveGridSelection(5, itemCount, columnCount, TV_REMOTE_KEY.DPAD_UP), 2)
}

function testCameraActionRow() {
  const itemCount = 5

  assert.equal(moveLinearSelection(0, itemCount, TV_REMOTE_KEY.DPAD_LEFT), 0)
  assert.equal(moveLinearSelection(0, itemCount, TV_REMOTE_KEY.DPAD_RIGHT), 1)
  assert.equal(moveLinearSelection(2, itemCount, TV_REMOTE_KEY.DPAD_RIGHT), 3)
  assert.equal(moveLinearSelection(3, itemCount, TV_REMOTE_KEY.DPAD_RIGHT), 4)
  assert.equal(moveLinearSelection(4, itemCount, TV_REMOTE_KEY.DPAD_RIGHT), 4)
  assert.equal(moveLinearSelection(4, itemCount, TV_REMOTE_KEY.DPAD_LEFT), 3)
  assert.equal(moveLinearSelection(1, itemCount, TV_REMOTE_KEY.DPAD_UP), 0)
  assert.equal(moveLinearSelection(1, itemCount, TV_REMOTE_KEY.DPAD_DOWN), 2)
}

function testHelpActionRow() {
  const itemCount = 5

  assert.equal(moveLinearSelection(0, itemCount, TV_REMOTE_KEY.DPAD_LEFT), 0)
  assert.equal(moveLinearSelection(0, itemCount, TV_REMOTE_KEY.DPAD_RIGHT), 1)
  assert.equal(moveLinearSelection(1, itemCount, TV_REMOTE_KEY.DPAD_RIGHT), 2)
  assert.equal(moveLinearSelection(2, itemCount, TV_REMOTE_KEY.DPAD_RIGHT), 3)
  assert.equal(moveLinearSelection(3, itemCount, TV_REMOTE_KEY.DPAD_RIGHT), 4)
  assert.equal(moveLinearSelection(4, itemCount, TV_REMOTE_KEY.DPAD_RIGHT), 4)
  assert.equal(moveLinearSelection(4, itemCount, TV_REMOTE_KEY.DPAD_LEFT), 3)
  assert.equal(moveLinearSelection(3, itemCount, TV_REMOTE_KEY.DPAD_LEFT), 2)
  assert.equal(moveLinearSelection(1, itemCount, TV_REMOTE_KEY.DPAD_LEFT), 0)
}

function testFieldGuideActionRow() {
  const itemCount = 5

  assert.equal(moveLinearSelection(0, itemCount, TV_REMOTE_KEY.DPAD_LEFT), 0)
  assert.equal(moveLinearSelection(0, itemCount, TV_REMOTE_KEY.DPAD_RIGHT), 1)
  assert.equal(moveLinearSelection(2, itemCount, TV_REMOTE_KEY.DPAD_RIGHT), 3)
  assert.equal(moveLinearSelection(3, itemCount, TV_REMOTE_KEY.DPAD_RIGHT), 4)
  assert.equal(moveLinearSelection(4, itemCount, TV_REMOTE_KEY.DPAD_RIGHT), 4)
  assert.equal(moveLinearSelection(4, itemCount, TV_REMOTE_KEY.DPAD_LEFT), 3)
  assert.equal(moveLinearSelection(1, itemCount, TV_REMOTE_KEY.DPAD_UP), 0)
  assert.equal(moveLinearSelection(1, itemCount, TV_REMOTE_KEY.DPAD_DOWN), 2)
}

function testPracticeActionRow() {
  const itemCount = 3

  assert.equal(moveLinearSelection(0, itemCount, TV_REMOTE_KEY.DPAD_LEFT), 0)
  assert.equal(moveLinearSelection(0, itemCount, TV_REMOTE_KEY.DPAD_RIGHT), 1)
  assert.equal(moveLinearSelection(1, itemCount, TV_REMOTE_KEY.DPAD_RIGHT), 2)
  assert.equal(moveLinearSelection(2, itemCount, TV_REMOTE_KEY.DPAD_RIGHT), 2)
  assert.equal(moveLinearSelection(2, itemCount, TV_REMOTE_KEY.DPAD_LEFT), 1)
  assert.equal(moveLinearSelection(1, itemCount, TV_REMOTE_KEY.DPAD_LEFT), 0)
}

function testExitActionRow() {
  const itemCount = 2

  assert.equal(moveLinearSelection(0, itemCount, TV_REMOTE_KEY.DPAD_LEFT), 0)
  assert.equal(moveLinearSelection(0, itemCount, TV_REMOTE_KEY.DPAD_RIGHT), 1)
  assert.equal(moveLinearSelection(1, itemCount, TV_REMOTE_KEY.DPAD_RIGHT), 1)
  assert.equal(moveLinearSelection(1, itemCount, TV_REMOTE_KEY.DPAD_LEFT), 0)
  assert.equal(moveLinearSelection(0, itemCount, TV_REMOTE_KEY.DPAD_DOWN), 1)
  assert.equal(moveLinearSelection(1, itemCount, TV_REMOTE_KEY.DPAD_UP), 0)
}

function testRemoteKeyHelpers() {
  assert.equal(isRemoteConfirmKey(TV_REMOTE_KEY.DPAD_CENTER), true)
  assert.equal(isRemoteConfirmKey(TV_REMOTE_KEY.ENTER), true)
  assert.equal(isRemoteConfirmKey(TV_REMOTE_KEY.NUMPAD_ENTER), true)
  assert.equal(isRemoteConfirmKey(TV_REMOTE_KEY.BUTTON_A), true)
  assert.equal(isRemoteConfirmKey(TV_REMOTE_KEY.SPACE), true)
  assert.equal(isRemoteConfirmKey(TV_REMOTE_KEY.DPAD_RIGHT), false)
  assert.equal(isRemoteHelpKey(TV_REMOTE_KEY.MENU), true)
  assert.equal(isRemoteHelpKey(TV_REMOTE_KEY.INFO), true)
  assert.equal(isRemoteHelpKey(TV_REMOTE_KEY.GUIDE), true)
  assert.equal(isRemoteHelpKey(TV_REMOTE_KEY.SETTINGS), true)
  assert.equal(isRemoteHelpKey(TV_REMOTE_KEY.HELP), true)
  assert.equal(isRemoteHelpKey(TV_REMOTE_KEY.TV_CONTENTS_MENU), true)
  assert.equal(isRemoteHelpKey(TV_REMOTE_KEY.TV_MEDIA_CONTEXT_MENU), true)
  assert.equal(isRemoteHelpKey(TV_REMOTE_KEY.DPAD_RIGHT), false)
  assert.equal(isRemoteChannelUpKey(TV_REMOTE_KEY.CHANNEL_UP), true)
  assert.equal(isRemoteChannelDownKey(TV_REMOTE_KEY.CHANNEL_DOWN), true)
  assert.equal(isRemoteMediaKey(TV_REMOTE_KEY.MEDIA_PLAY_PAUSE), true)
  assert.equal(isRemoteMediaKey(TV_REMOTE_KEY.MEDIA_PLAY), true)
  assert.equal(isRemoteMediaKey(TV_REMOTE_KEY.MEDIA_PAUSE), true)
  assert.equal(isRemoteMediaKey(TV_REMOTE_KEY.MEDIA_STOP), true)
  assert.equal(isRemoteMediaKey(TV_REMOTE_KEY.NUM_1), false)
  assert.equal(remoteMediaActionFromKeyCode(TV_REMOTE_KEY.MEDIA_PLAY_PAUSE), 'toggle')
  assert.equal(remoteMediaActionFromKeyCode(TV_REMOTE_KEY.MEDIA_PLAY), 'play')
  assert.equal(remoteMediaActionFromKeyCode(TV_REMOTE_KEY.MEDIA_PAUSE), 'pause')
  assert.equal(remoteMediaActionFromKeyCode(TV_REMOTE_KEY.MEDIA_STOP), 'stop')
  assert.equal(remoteMediaActionFromKeyCode(TV_REMOTE_KEY.DPAD_CENTER), null)
  assert.equal(remoteNumberFromKeyCode(TV_REMOTE_KEY.NUM_1), 1)
  assert.equal(remoteNumberFromKeyCode(TV_REMOTE_KEY.NUM_5), 5)
  assert.equal(remoteNumberFromKeyCode(TV_REMOTE_KEY.NUM_6), 6)
  assert.equal(remoteNumberFromKeyCode(TV_REMOTE_KEY.NUM_0), 0)
  assert.equal(remoteNumberFromKeyCode(TV_REMOTE_KEY.NUMPAD_0), 0)
  assert.equal(remoteNumberFromKeyCode(TV_REMOTE_KEY.NUMPAD_1), 1)
  assert.equal(remoteNumberFromKeyCode(TV_REMOTE_KEY.NUMPAD_5), 5)
  assert.equal(remoteNumberFromKeyCode(TV_REMOTE_KEY.NUMPAD_6), 6)
  assert.equal(remoteNumberFromKeyCode(TV_REMOTE_KEY.DPAD_CENTER), null)
  assert.equal(remoteKeyLabelFromKeyCode(TV_REMOTE_KEY.DPAD_UP), '方向上')
  assert.equal(remoteKeyLabelFromKeyCode(TV_REMOTE_KEY.DPAD_CENTER), 'OK/确认')
  assert.equal(remoteKeyLabelFromKeyCode(TV_REMOTE_KEY.NUM_5), '数字 5')
  assert.equal(remoteKeyLabelFromKeyCode(TV_REMOTE_KEY.MENU), '菜单')
  assert.equal(remoteKeyLabelFromKeyCode(TV_REMOTE_KEY.CHANNEL_UP), '频道+')
  assert.equal(remoteKeyLabelFromKeyCode(TV_REMOTE_KEY.MEDIA_PLAY_PAUSE), '播放/暂停')
  assert.equal(remoteKeyLabelFromKeyCode(TV_REMOTE_KEY.MEDIA_PLAY), '播放')
  assert.equal(remoteKeyLabelFromKeyCode(TV_REMOTE_KEY.MEDIA_PAUSE), '暂停')
  assert.equal(remoteKeyLabelFromKeyCode(999), '未知键')
}

function testLiveNumericChannelShortcuts() {
  assert.equal(remoteChannelIndexFromKeyCode(TV_REMOTE_KEY.NUM_1, 9), 0)
  assert.equal(remoteChannelIndexFromKeyCode(TV_REMOTE_KEY.NUM_6, 9), 5)
  assert.equal(remoteChannelIndexFromKeyCode(TV_REMOTE_KEY.NUMPAD_9, 9), 8)
  assert.equal(remoteChannelIndexFromKeyCode(TV_REMOTE_KEY.NUM_0, 9), null)
  assert.equal(remoteChannelIndexFromKeyCode(TV_REMOTE_KEY.NUM_9, 5), null)
  assert.equal(remoteChannelIndexFromKeyCode(TV_REMOTE_KEY.DPAD_CENTER, 9), null)
}

function testSupportCodeFormatting() {
  const supportCode = formatTvBoxSupportCode({
    success: true,
    source: 'native',
    message: '',
    hasAnyCamera: true,
    hasExternalCamera: true,
    hasMicrophone: true,
    hasAudioInput: true,
    hasUsbHost: true,
    hasCameraPermission: false,
    hasRecordAudioPermission: false,
    cameraCount: 2,
    externalCameraCount: 1,
    usbDeviceCount: 3,
    usbVideoDeviceCount: 1,
    audioInputDeviceCount: 1,
    usbAudioInputDeviceCount: 1,
    isTvDevice: true,
    isLeanbackLauncher: true,
    androidSdk: 31,
    buildModel: 'Living Room TV/Box',
    appVersionName: '1.0.5',
    appVersionCode: 105
  })

  assert.equal(supportCode, '电视模式 / Living-Room-TV-Box / 1.0.5(105) / SDK31 / 摄像头2 / USB视频1 / 音频输入1 / 权限未允许 / 录音未允')
}

function testLiveFavoriteHelpers() {
  const channels = [
    { channelId: '001', channelName: 'CCTV-1' },
    { id: '002', name: 'CCTV-2' },
    { name: 'CCTV-3' }
  ]

  assert.equal(liveChannelId(channels[0], 0), '001')
  assert.equal(liveChannelId(channels[1], 1), '002')
  assert.equal(liveChannelId(channels[2], 2), 'CCTV-3')
  assert.deepEqual(parseLiveFavoriteIds('["001","001","002"]'), ['001', '002'])
  assert.deepEqual(parseLiveFavoriteIds('not-json'), [])
  assert.equal(serializeLiveFavoriteIds(['001', '001', '002']), '["001","002"]')

  const added = toggleLiveFavoriteId(['001'], '002')
  assert.deepEqual(added.ids, ['001', '002'])
  assert.equal(added.isFavorite, true)

  const removed = toggleLiveFavoriteId(added.ids, '001')
  assert.deepEqual(removed.ids, ['002'])
  assert.equal(removed.isFavorite, false)
  assert.equal(filterLiveFavorites(channels, ['002']).length, 1)
  assert.equal(decorateLiveFavorites(channels, ['002'])[1].isFavorite, true)
  assert.equal(firstPlayableLiveIndex(channels, '002'), 1)
  assert.equal(firstPlayableLiveIndex(channels, 'missing'), 0)
}

testSimpleHomeGrid()
testCameraActionRow()
testHelpActionRow()
testFieldGuideActionRow()
testPracticeActionRow()
testExitActionRow()
testRemoteKeyHelpers()
testLiveNumericChannelShortcuts()
testSupportCodeFormatting()
testLiveFavoriteHelpers()

console.log('TV-box remote navigation self-test passed.')
