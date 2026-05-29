export const TV_REMOTE_KEY = {
  BACK: 4,
  DPAD_UP: 19,
  DPAD_DOWN: 20,
  DPAD_LEFT: 21,
  DPAD_RIGHT: 22,
  DPAD_CENTER: 23,
  SPACE: 62,
  ENTER: 66,
  NUM_0: 7,
  NUM_1: 8,
  NUM_2: 9,
  NUM_3: 10,
  NUM_4: 11,
  NUM_5: 12,
  NUM_6: 13,
  NUM_7: 14,
  NUM_8: 15,
  NUM_9: 16,
  BUTTON_A: 96,
  NUMPAD_0: 144,
  NUMPAD_1: 145,
  NUMPAD_2: 146,
  NUMPAD_3: 147,
  NUMPAD_4: 148,
  NUMPAD_5: 149,
  NUMPAD_6: 150,
  NUMPAD_7: 151,
  NUMPAD_8: 152,
  NUMPAD_9: 153,
  NUMPAD_ENTER: 160,
  MENU: 82,
  INFO: 165,
  GUIDE: 172,
  SETTINGS: 176,
  HELP: 259,
  TV_CONTENTS_MENU: 256,
  TV_MEDIA_CONTEXT_MENU: 257,
  MEDIA_PLAY_PAUSE: 85,
  MEDIA_STOP: 86,
  MEDIA_PLAY: 126,
  MEDIA_PAUSE: 127,
  CHANNEL_UP: 166,
  CHANNEL_DOWN: 167
} as const

const REMOTE_CONFIRM_KEYS = new Set<number>([
  TV_REMOTE_KEY.DPAD_CENTER,
  TV_REMOTE_KEY.SPACE,
  TV_REMOTE_KEY.ENTER,
  TV_REMOTE_KEY.BUTTON_A,
  TV_REMOTE_KEY.NUMPAD_ENTER
])

const REMOTE_HELP_KEYS = new Set<number>([
  TV_REMOTE_KEY.MENU,
  TV_REMOTE_KEY.INFO,
  TV_REMOTE_KEY.GUIDE,
  TV_REMOTE_KEY.SETTINGS,
  TV_REMOTE_KEY.HELP,
  TV_REMOTE_KEY.TV_CONTENTS_MENU,
  TV_REMOTE_KEY.TV_MEDIA_CONTEXT_MENU
])

const REMOTE_MEDIA_KEYS = new Set<number>([
  TV_REMOTE_KEY.MEDIA_PLAY_PAUSE,
  TV_REMOTE_KEY.MEDIA_STOP,
  TV_REMOTE_KEY.MEDIA_PLAY,
  TV_REMOTE_KEY.MEDIA_PAUSE
])

export type RemoteMoveDirection = 'left' | 'right' | 'up' | 'down'
export type RemoteMediaAction = 'toggle' | 'play' | 'pause' | 'stop'

export function normalizeSelectionIndex(index: number, itemCount: number): number {
  if (itemCount <= 0) return 0
  if (index < 0) return 0
  if (index >= itemCount) return itemCount - 1
  return index
}

export function remoteMoveDirectionFromKeyCode(keyCode: number): RemoteMoveDirection | null {
  switch (Number(keyCode)) {
    case TV_REMOTE_KEY.DPAD_LEFT:
      return 'left'
    case TV_REMOTE_KEY.DPAD_RIGHT:
      return 'right'
    case TV_REMOTE_KEY.DPAD_UP:
      return 'up'
    case TV_REMOTE_KEY.DPAD_DOWN:
      return 'down'
    default:
      return null
  }
}

export function isRemoteConfirmKey(keyCode: number): boolean {
  const normalizedKeyCode = Number(keyCode)
  return REMOTE_CONFIRM_KEYS.has(normalizedKeyCode)
}

export function isRemoteHelpKey(keyCode: number): boolean {
  const normalizedKeyCode = Number(keyCode)
  return REMOTE_HELP_KEYS.has(normalizedKeyCode)
}

export function isRemoteChannelUpKey(keyCode: number): boolean {
  return Number(keyCode) === TV_REMOTE_KEY.CHANNEL_UP
}

export function isRemoteChannelDownKey(keyCode: number): boolean {
  return Number(keyCode) === TV_REMOTE_KEY.CHANNEL_DOWN
}

export function remoteMediaActionFromKeyCode(keyCode: number): RemoteMediaAction | null {
  switch (Number(keyCode)) {
    case TV_REMOTE_KEY.MEDIA_PLAY_PAUSE:
      return 'toggle'
    case TV_REMOTE_KEY.MEDIA_PLAY:
      return 'play'
    case TV_REMOTE_KEY.MEDIA_PAUSE:
      return 'pause'
    case TV_REMOTE_KEY.MEDIA_STOP:
      return 'stop'
    default:
      return null
  }
}

export function isRemoteMediaKey(keyCode: number): boolean {
  return REMOTE_MEDIA_KEYS.has(Number(keyCode))
}

export function remoteKeyLabelFromKeyCode(keyCode: number): string {
  const normalizedKeyCode = Number(keyCode)
  const direction = remoteMoveDirectionFromKeyCode(normalizedKeyCode)
  if (direction) {
    switch (direction) {
      case 'up':
        return '方向上'
      case 'left':
        return '方向左'
      case 'right':
        return '方向右'
      case 'down':
        return '方向下'
    }
  }

  const remoteNumber = remoteNumberFromKeyCode(normalizedKeyCode)
  if (remoteNumber !== null) return `数字 ${remoteNumber}`
  if (isRemoteConfirmKey(normalizedKeyCode)) return 'OK/确认'
  if (normalizedKeyCode === TV_REMOTE_KEY.BACK) return '返回'
  if (isRemoteChannelUpKey(normalizedKeyCode)) return '频道+'
  if (isRemoteChannelDownKey(normalizedKeyCode)) return '频道-'
  const mediaAction = remoteMediaActionFromKeyCode(normalizedKeyCode)
  if (mediaAction === 'toggle') return '播放/暂停'
  if (mediaAction === 'play') return '播放'
  if (mediaAction === 'pause') return '暂停'
  if (mediaAction === 'stop') return '停止'

  switch (normalizedKeyCode) {
    case TV_REMOTE_KEY.MENU:
      return '菜单'
    case TV_REMOTE_KEY.INFO:
      return '信息'
    case TV_REMOTE_KEY.GUIDE:
      return '指南'
    case TV_REMOTE_KEY.SETTINGS:
      return '设置'
    case TV_REMOTE_KEY.HELP:
      return '帮助'
    case TV_REMOTE_KEY.TV_CONTENTS_MENU:
      return '电视内容菜单'
    case TV_REMOTE_KEY.TV_MEDIA_CONTEXT_MENU:
      return '电视媒体菜单'
    default:
      return '未知键'
  }
}

export function remoteNumberFromKeyCode(keyCode: number): number | null {
  const normalizedKeyCode = Number(keyCode)
  if (normalizedKeyCode >= TV_REMOTE_KEY.NUM_0 && normalizedKeyCode <= TV_REMOTE_KEY.NUM_9) {
    return normalizedKeyCode - TV_REMOTE_KEY.NUM_0
  }
  if (normalizedKeyCode >= TV_REMOTE_KEY.NUMPAD_0 && normalizedKeyCode <= TV_REMOTE_KEY.NUMPAD_9) {
    return normalizedKeyCode - TV_REMOTE_KEY.NUMPAD_0
  }
  return null
}

export function remoteChannelIndexFromKeyCode(keyCode: number, itemCount: number): number | null {
  const remoteNumber = remoteNumberFromKeyCode(keyCode)
  if (remoteNumber === null || remoteNumber <= 0 || itemCount <= 0) return null

  const channelIndex = remoteNumber - 1
  return channelIndex < itemCount ? channelIndex : null
}

export function moveGridSelection(currentIndex: number, itemCount: number, columnCount: number, keyCode: number): number {
  if (itemCount <= 0 || columnCount <= 0) return 0

  const safeIndex = normalizeSelectionIndex(currentIndex, itemCount)
  const direction = remoteMoveDirectionFromKeyCode(keyCode)
  if (!direction) return safeIndex

  if (direction === 'left' || direction === 'right') {
    const offset = direction === 'left' ? -1 : 1
    const nextIndex = safeIndex + offset
    const currentRow = Math.floor(safeIndex / columnCount)
    const nextRow = Math.floor(nextIndex / columnCount)
    if (nextIndex < 0 || nextIndex >= itemCount || currentRow !== nextRow) return safeIndex
    return nextIndex
  }

  const rowOffset = direction === 'up' ? -1 : 1
  const nextIndex = safeIndex + rowOffset * columnCount
  if (nextIndex < 0) return safeIndex
  if (nextIndex >= itemCount) return itemCount - 1
  return nextIndex
}

export function moveLinearSelection(currentIndex: number, itemCount: number, keyCode: number): number {
  if (itemCount <= 0) return 0

  const safeIndex = normalizeSelectionIndex(currentIndex, itemCount)
  const direction = remoteMoveDirectionFromKeyCode(keyCode)
  if (!direction) return safeIndex

  const offset = direction === 'left' || direction === 'up' ? -1 : 1
  return normalizeSelectionIndex(safeIndex + offset, itemCount)
}
