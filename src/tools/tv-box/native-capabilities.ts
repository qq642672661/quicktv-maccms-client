import { Native } from '@extscreen/es3-vue'

export interface TvBoxCapabilities {
  success: boolean
  source: 'native' | 'fallback'
  message: string
  hasAnyCamera: boolean | null
  hasExternalCamera: boolean | null
  hasMicrophone: boolean | null
  hasAudioInput: boolean | null
  hasUsbHost: boolean | null
  hasCameraPermission: boolean | null
  hasRecordAudioPermission: boolean | null
  hasPhoneCameraReceiver: boolean | null
  hasNativeWebRtcSdk: boolean | null
  phoneCameraReceiverReady: boolean | null
  cameraCount: number | null
  externalCameraCount: number | null
  usbDeviceCount: number | null
  usbVideoDeviceCount: number | null
  audioInputDeviceCount: number | null
  usbAudioInputDeviceCount: number | null
  isTvDevice: boolean | null
  isLeanbackLauncher: boolean | null
  androidSdk: number | null
  buildModel: string
  appVersionName: string
  appVersionCode: number | null
}

export interface TvBoxNativeResult {
  success: boolean
  message: string
}

const fallbackCapabilities: TvBoxCapabilities = {
  success: false,
  source: 'fallback',
  message: '当前运行环境暂未提供电视盒子原生能力检测',
  hasAnyCamera: null,
  hasExternalCamera: null,
  hasMicrophone: null,
  hasAudioInput: null,
  hasUsbHost: null,
  hasCameraPermission: null,
  hasRecordAudioPermission: null,
  hasPhoneCameraReceiver: null,
  hasNativeWebRtcSdk: null,
  phoneCameraReceiverReady: null,
  cameraCount: null,
  externalCameraCount: null,
  usbDeviceCount: null,
  usbVideoDeviceCount: null,
  audioInputDeviceCount: null,
  usbAudioInputDeviceCount: null,
  isTvDevice: null,
  isLeanbackLauncher: null,
  androidSdk: null,
  buildModel: '',
  appVersionName: '',
  appVersionCode: null
}

function toNullableBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  if (value === 'true') return true
  if (value === 'false') return false
  return null
}

function toNullableNumber(value: unknown): number | null {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

function normalizeCapabilities(result: any): TvBoxCapabilities {
  const data = result?.data || result || {}
  return {
    success: data.success !== false,
    source: 'native',
    message: data.message || '',
    hasAnyCamera: toNullableBoolean(data.hasAnyCamera),
    hasExternalCamera: toNullableBoolean(data.hasExternalCamera),
    hasMicrophone: toNullableBoolean(data.hasMicrophone),
    hasAudioInput: toNullableBoolean(data.hasAudioInput),
    hasUsbHost: toNullableBoolean(data.hasUsbHost),
    hasCameraPermission: toNullableBoolean(data.hasCameraPermission),
    hasRecordAudioPermission: toNullableBoolean(data.hasRecordAudioPermission),
    hasPhoneCameraReceiver: toNullableBoolean(data.hasPhoneCameraReceiver),
    hasNativeWebRtcSdk: toNullableBoolean(data.hasNativeWebRtcSdk),
    phoneCameraReceiverReady: toNullableBoolean(data.phoneCameraReceiverReady),
    cameraCount: toNullableNumber(data.cameraCount),
    externalCameraCount: toNullableNumber(data.externalCameraCount),
    usbDeviceCount: toNullableNumber(data.usbDeviceCount),
    usbVideoDeviceCount: toNullableNumber(data.usbVideoDeviceCount),
    audioInputDeviceCount: toNullableNumber(data.audioInputDeviceCount),
    usbAudioInputDeviceCount: toNullableNumber(data.usbAudioInputDeviceCount),
    isTvDevice: toNullableBoolean(data.isTvDevice),
    isLeanbackLauncher: toNullableBoolean(data.isLeanbackLauncher),
    androidSdk: toNullableNumber(data.androidSdk),
    buildModel: data.buildModel || '',
    appVersionName: data.appVersionName || '',
    appVersionCode: toNullableNumber(data.appVersionCode)
  }
}

async function callTvBoxModule(methodName: string): Promise<any> {
  const nativeBridge = Native as any
  if (!nativeBridge?.callNativeWithPromise) {
    throw new Error('callNativeWithPromise is unavailable')
  }

  try {
    return await nativeBridge.callNativeWithPromise('TvBoxModule', methodName, [])
  } catch {
    return nativeBridge.callNativeWithPromise('TvBoxModule', methodName)
  }
}

export async function getTvBoxCapabilities(): Promise<TvBoxCapabilities> {
  try {
    return normalizeCapabilities(await callTvBoxModule('getCapabilities'))
  } catch {
    return { ...fallbackCapabilities }
  }
}

export async function openTvBoxAppSettings(): Promise<boolean> {
  try {
    const result = await callTvBoxModule('openAppSettings')
    return result?.success !== false
  } catch {
    return false
  }
}

export async function openTvBoxSystemCamera(): Promise<TvBoxNativeResult> {
  try {
    const result = await callTvBoxModule('openSystemCamera')
    const data = result?.data || result || {}
    return {
      success: data.success !== false,
      message: data.message || ''
    }
  } catch {
    return {
      success: false,
      message: '当前设备暂不支持自动打开摄像头预览'
    }
  }
}

export async function openPhoneCameraReceiver(): Promise<TvBoxNativeResult> {
  try {
    const result = await callTvBoxModule('openPhoneCameraReceiver')
    const data = result?.data || result || {}
    return {
      success: data.success !== false,
      message: data.message || ''
    }
  } catch {
    return {
      success: false,
      message: '当前设备暂不支持打开手机摄像头电视接收端'
    }
  }
}

export async function requestTvBoxMediaPermissions(): Promise<TvBoxCapabilities> {
  try {
    return normalizeCapabilities(await callTvBoxModule('requestMediaPermissions'))
  } catch {
    try {
      return normalizeCapabilities(await callTvBoxModule('requestCameraPermission'))
    } catch {
      return { ...fallbackCapabilities }
    }
  }
}

export const requestTvBoxCameraPermission = requestTvBoxMediaPermissions
