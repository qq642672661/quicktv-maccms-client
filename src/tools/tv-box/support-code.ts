import type { TvBoxCapabilities } from './native-capabilities'

function shortToken(value: unknown, fallback: string): string {
  const normalized = String(value || '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[\\/|]+/g, '-')

  return normalized.length > 0 ? normalized.slice(0, 24) : fallback
}

function numberToken(value: number | null, prefix: string): string {
  return value === null ? `${prefix}?` : `${prefix}${value}`
}

function permissionToken(value: boolean | null): string {
  if (value === true) return '权限已允许'
  if (value === false) return '权限未允许'
  return '权限未知'
}

function recordAudioPermissionToken(value: boolean | null): string {
  if (value === true) return '录音已允'
  if (value === false) return '录音未允'
  return '录音未知'
}

function versionToken(versionName: string, versionCode: number | null): string {
  const name = shortToken(versionName, '版本未知')
  return versionCode === null ? name : `${name}(${versionCode})`
}

export function formatTvBoxSupportCode(capabilities: TvBoxCapabilities): string {
  const tvToken = capabilities.isTvDevice || capabilities.isLeanbackLauncher ? '电视模式' : '安卓模式待确认'
  const modelToken = shortToken(capabilities.buildModel, '型号未知')
  const appToken = versionToken(capabilities.appVersionName, capabilities.appVersionCode)
  const sdkToken = capabilities.androidSdk === null ? 'SDK?' : `SDK${capabilities.androidSdk}`
  const cameraToken = numberToken(capabilities.cameraCount, '摄像头')
  const usbVideoToken = numberToken(capabilities.usbVideoDeviceCount, 'USB视频')
  const audioInputToken = numberToken(capabilities.audioInputDeviceCount, '音频输入')

  return `${tvToken} / ${modelToken} / ${appToken} / ${sdkToken} / ${cameraToken} / ${usbVideoToken} / ${audioInputToken} / ${permissionToken(capabilities.hasCameraPermission)} / ${recordAudioPermissionToken(capabilities.hasRecordAudioPermission)}`
}
