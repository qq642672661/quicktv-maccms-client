<template>
  <qt-view class="camera-setup-page">
    <qt-view class="camera-setup-header" :focusable="false">
      <qt-text class="camera-setup-kicker" text="电视盒子摄像头" :focusable="false" />
      <qt-text class="camera-setup-title" :text="cameraTitle" :focusable="false" />
      <qt-text class="camera-setup-subtitle" :text="cameraSubtitle" :focusable="false" />
    </qt-view>

    <qt-view class="camera-setup-status-row" :focusable="false">
      <qt-view class="camera-setup-status-card" :focusable="false">
        <qt-text class="camera-setup-status-name" text="摄像头" :focusable="false" />
        <qt-text class="camera-setup-status-value" :text="cameraStateText" :focusable="false" />
        <qt-text class="camera-setup-status-hint" :text="cameraCountText" :focusable="false" />
      </qt-view>
      <qt-view class="camera-setup-status-card" :focusable="false">
        <qt-text class="camera-setup-status-name" text="权限" :focusable="false" />
        <qt-text class="camera-setup-status-value" :text="permissionStateText" :focusable="false" />
        <qt-text class="camera-setup-status-hint" :text="permissionHintText" :focusable="false" />
      </qt-view>
      <qt-view class="camera-setup-status-card" :focusable="false">
        <qt-text class="camera-setup-status-name" text="麦克风" :focusable="false" />
        <qt-text class="camera-setup-status-value" :text="microphoneStateText" :focusable="false" />
        <qt-text class="camera-setup-status-hint" :text="microphoneHintText" :focusable="false" />
      </qt-view>
      <qt-view class="camera-setup-status-card" :focusable="false">
        <qt-text class="camera-setup-status-name" text="设备" :focusable="false" />
        <qt-text class="camera-setup-status-value" :text="deviceStateText" :focusable="false" />
        <qt-text class="camera-setup-status-hint" :text="deviceHintText" :focusable="false" />
      </qt-view>
    </qt-view>

    <qt-view class="camera-setup-guide" :focusable="false">
      <qt-text class="camera-setup-guide-title" text="下一步" :focusable="false" />
      <qt-text class="camera-setup-guide-text" :text="nextStepText" :focusable="false" />
    </qt-view>

    <qt-view class="camera-setup-support-strip" :focusable="false">
      <qt-text class="camera-setup-support-label" text="维护码" :focusable="false" />
      <qt-text class="camera-setup-support-code" :text="supportCodeText" :focusable="false" />
      <qt-text class="camera-setup-support-hint" text="读给维护人员" :focusable="false" />
    </qt-view>

    <qt-view class="camera-setup-actions" :focusable="false">
      <qt-view
        :class="['camera-setup-button', { active: activeActionIndex === 0 }]"
        :focusable="true"
        :requestFocus="true"
        :enableFocusBorder="true"
        :listenHasFocusChange="true"
        eventFocus
        eventClick
        @focus="setActiveAction(0)"
        @click="refreshCapabilities"
      >
        <qt-text class="camera-setup-button-key" text="1" gravity="center" :focusable="false" />
        <qt-text class="camera-setup-button-text" text="重新检测" :focusable="false" />
      </qt-view>
      <qt-view
        :class="['camera-setup-button secondary', { active: activeActionIndex === 1 }]"
        :focusable="true"
        :enableFocusBorder="true"
        :listenHasFocusChange="true"
        eventFocus
        eventClick
        @focus="setActiveAction(1)"
        @click="requestPermission"
      >
        <qt-text class="camera-setup-button-key" text="2" gravity="center" :focusable="false" />
        <qt-text class="camera-setup-button-text" text="一键授权" :focusable="false" />
      </qt-view>
      <qt-view
        :class="['camera-setup-button secondary', { active: activeActionIndex === 2 }]"
        :focusable="true"
        :enableFocusBorder="true"
        :listenHasFocusChange="true"
        eventFocus
        eventClick
        @focus="setActiveAction(2)"
        @click="openSystemCamera"
      >
        <qt-text class="camera-setup-button-key" text="3" gravity="center" :focusable="false" />
        <qt-text class="camera-setup-button-text" text="测试摄像头" :focusable="false" />
      </qt-view>
      <qt-view
        :class="['camera-setup-button secondary', { active: activeActionIndex === 3 }]"
        :focusable="true"
        :enableFocusBorder="true"
        :listenHasFocusChange="true"
        eventFocus
        eventClick
        @focus="setActiveAction(3)"
        @click="openSettings"
      >
        <qt-text class="camera-setup-button-key" text="4" gravity="center" :focusable="false" />
        <qt-text class="camera-setup-button-text" text="打开权限设置" :focusable="false" />
      </qt-view>
      <qt-view
        :class="['camera-setup-button secondary', { active: activeActionIndex === 4 }]"
        :focusable="true"
        :enableFocusBorder="true"
        :listenHasFocusChange="true"
        eventFocus
        eventClick
        @focus="setActiveAction(4)"
        @click="launch.launchTvBoxHome()"
      >
        <qt-text class="camera-setup-button-key" text="5" gravity="center" :focusable="false" />
        <qt-text class="camera-setup-button-text" text="返回首页" :focusable="false" />
      </qt-view>
    </qt-view>
  </qt-view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ESKeyCode, ESKeyEvent, useESToast } from '@extscreen/es3-core'
import launch from '../../tools/launch'
import { getTvBoxCapabilities, openTvBoxAppSettings, openTvBoxSystemCamera, requestTvBoxMediaPermissions, TvBoxCapabilities } from '../../tools/tv-box/native-capabilities'
import { isRemoteConfirmKey, isRemoteHelpKey, moveLinearSelection, remoteNumberFromKeyCode } from '../../tools/tv-box/remote-control'
import { formatTvBoxSupportCode } from '../../tools/tv-box/support-code'

const toast = useESToast()
const isChecking = ref(false)
const activeActionIndex = ref(0)
const capabilities = ref<TvBoxCapabilities>({
  success: false,
  source: 'fallback',
  message: '',
  hasAnyCamera: null,
  hasExternalCamera: null,
  hasMicrophone: null,
  hasAudioInput: null,
  hasUsbHost: null,
  hasCameraPermission: null,
  hasRecordAudioPermission: null,
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
})

const cameraTitle = computed(() => {
  if (isChecking.value) return '正在检测摄像头'
  if (capabilities.value.hasAnyCamera === true) return '摄像头已可识别'
  if (hasUsbVideoDevice.value) return 'USB 摄像头已接入'
  if (capabilities.value.hasAnyCamera === false) return '暂未检测到摄像头'
  return '等待电视盒子能力检测'
})

const cameraSubtitle = computed(() => {
  if (isChecking.value) return '请稍等，正在读取系统能力。'
  if (capabilities.value.hasAnyCamera === false && hasUsbVideoDevice.value) return '已识别 USB 视频设备，但系统暂未把它开放为摄像头。'
  if (capabilities.value.hasAnyCamera === false) return '请确认 USB 摄像头已插好，并在系统设置里允许摄像头权限。'
  if (capabilities.value.source === 'fallback') return capabilities.value.message
  return capabilities.value.buildModel ? `设备型号：${capabilities.value.buildModel}` : '检测完成。'
})

const hasUsbVideoDevice = computed(() => (capabilities.value.usbVideoDeviceCount || 0) > 0)
const hasAudioInput = computed(() => (capabilities.value.audioInputDeviceCount || 0) > 0)
const cameraStateText = computed(() => {
  if (capabilities.value.hasAnyCamera === false && hasUsbVideoDevice.value) return '待适配'
  return formatFlag(capabilities.value.hasAnyCamera, '可用', '未检测到')
})
const permissionStateText = computed(() => {
  if (capabilities.value.hasCameraPermission === true && capabilities.value.hasRecordAudioPermission === true) return '全允许'
  if (capabilities.value.hasCameraPermission === true && capabilities.value.hasRecordAudioPermission === false) return '缺录音'
  return formatFlag(capabilities.value.hasCameraPermission, '摄像头允许', '未允许')
})
const microphoneStateText = computed(() => {
  if (hasAudioInput.value) return '有输入'
  return formatFlag(capabilities.value.hasMicrophone, '有麦克风', '未检测到')
})
const deviceStateText = computed(() => formatFlag(capabilities.value.isTvDevice || capabilities.value.isLeanbackLauncher, '电视环境', '普通安卓环境'))
const cameraCountText = computed(() => {
  const usbVideoCount = capabilities.value.usbVideoDeviceCount || 0
  if (capabilities.value.cameraCount === null) {
    return usbVideoCount > 0 ? `USB 视频 ${usbVideoCount} 个` : '数量未知'
  }
  const externalCount = capabilities.value.externalCameraCount || 0
  if (externalCount > 0 && usbVideoCount > 0) return `系统 ${capabilities.value.cameraCount} / 外接 ${externalCount} / USB ${usbVideoCount}`
  if (usbVideoCount > 0) return `系统 ${capabilities.value.cameraCount} / USB ${usbVideoCount}`
  return externalCount > 0 ? `共 ${capabilities.value.cameraCount} 个，外接 ${externalCount} 个` : `共 ${capabilities.value.cameraCount} 个`
})
const permissionHintText = computed(() => {
  if (capabilities.value.hasCameraPermission === true && capabilities.value.hasRecordAudioPermission === true) return '可测试摄像头/麦克风'
  if (capabilities.value.hasCameraPermission === true && capabilities.value.hasRecordAudioPermission === false) return '语音/通话需录音授权'
  if (capabilities.value.hasCameraPermission === false) return '按 OK 可尝试一键授权'
  return '等待系统返回权限状态'
})
const microphoneHintText = computed(() => {
  const audioInputCount = capabilities.value.audioInputDeviceCount
  const usbAudioCount = capabilities.value.usbAudioInputDeviceCount || 0
  if (audioInputCount === null) return '语音功能预检测'
  if (usbAudioCount > 0) return `音频 ${audioInputCount} / USB ${usbAudioCount}`
  if (audioInputCount > 0) return `音频输入 ${audioInputCount} 个`
  if (capabilities.value.hasRecordAudioPermission === true) return '录音权限已允许'
  if (capabilities.value.hasRecordAudioPermission === false) return '语音功能再授权'
  return '不影响看电视'
})
const deviceHintText = computed(() => {
  if (hasUsbVideoDevice.value) return `USB 视频设备 ${capabilities.value.usbVideoDeviceCount} 个`
  if ((capabilities.value.isTvDevice || capabilities.value.isLeanbackLauncher) && capabilities.value.hasUsbHost) return '电视环境，支持 USB 外设'
  if (capabilities.value.isTvDevice || capabilities.value.isLeanbackLauncher) return '遥控器优先适配'
  if (capabilities.value.hasUsbHost) return '支持 USB 摄像头接入'
  return '仍可安装，建议实机复测焦点'
})
const nextStepText = computed(() => {
  if (isChecking.value) return '请先等检测完成。'
  if (capabilities.value.source === 'fallback') return '当前不是电视盒子原生运行环境，可先打包 APK 后在盒子上复测。'
  if (capabilities.value.hasAnyCamera === false && hasUsbVideoDevice.value) return '已看到 USB 摄像头硬件，先按“测试摄像头”；若打不开，换 UVC 摄像头或检查盒子固件。'
  if (capabilities.value.hasAnyCamera === false) return '把 USB 摄像头插到盒子上，再按“重新检测”；没有摄像头也可以正常看电视。'
  if (capabilities.value.hasCameraPermission === false || capabilities.value.hasRecordAudioPermission === false) return '按遥控器 OK 选择“一键授权”；如果系统没有弹窗，再打开权限设置手动允许。'
  return '摄像头和权限都已就绪，后续可接扫码登录、视频通话或体感互动。'
})
const supportCodeText = computed(() => formatTvBoxSupportCode(capabilities.value))

const actionHandlers = [refreshCapabilities, requestPermission, openSystemCamera, openSettings, launch.launchTvBoxHome.bind(launch)]

function formatFlag(value: boolean | null, yesText: string, noText: string): string {
  if (value === true) return yesText
  if (value === false) return noText
  return '未知'
}

async function refreshCapabilities() {
  isChecking.value = true
  capabilities.value = await getTvBoxCapabilities()
  isChecking.value = false
}

function setActiveAction(index: number) {
  activeActionIndex.value = Math.max(0, Math.min(index, actionHandlers.length - 1))
}

function runActiveAction() {
  const handler = actionHandlers[activeActionIndex.value]
  if (handler) {
    handler()
  }
}

async function openSettings() {
  const opened = await openTvBoxAppSettings()
  if (!opened) {
    toast.showToast('当前设备暂不支持自动打开权限设置')
  }
}

async function openSystemCamera() {
  const result = await openTvBoxSystemCamera()
  if (result.success) {
    toast.showToast(result.message || '已打开内置摄像头预览')
  } else {
    toast.showToast(result.message || '当前盒子无法打开摄像头预览')
  }
}

async function requestPermission() {
  const result = await requestTvBoxMediaPermissions()
  if (result.success) {
    await refreshCapabilities()
    if (result.hasCameraPermission && result.hasRecordAudioPermission) {
      toast.showToast('摄像头和麦克风权限已允许')
    } else if (result.hasCameraPermission) {
      toast.showToast('摄像头已允许，麦克风未允许')
    } else {
      toast.showToast(result.message || '媒体权限未全部允许')
    }
  } else {
    await refreshCapabilities()
    toast.showToast(result.message || '当前设备暂不支持一键授权')
  }
}

function onBackPressed() {
  launch.launchTvBoxHome()
}

function onKeyDown(keyEvent: ESKeyEvent) {
  const keyCode = Number(keyEvent.keyCode)
  const remoteNumber = remoteNumberFromKeyCode(keyCode)
  if (remoteNumber === 0 || remoteNumber === 6 || isRemoteHelpKey(keyCode)) {
    launch.launchTvBoxHelp()
    return
  }
  if (remoteNumber !== null && remoteNumber >= 1 && remoteNumber <= actionHandlers.length) {
    setActiveAction(remoteNumber - 1)
    runActiveAction()
    return
  }

  const nextIndex = moveLinearSelection(activeActionIndex.value, actionHandlers.length, keyCode)
  if (nextIndex !== activeActionIndex.value) {
    setActiveAction(nextIndex)
    return
  }

  switch (keyCode) {
    case ESKeyCode.ES_KEYCODE_DPAD_LEFT:
    case ESKeyCode.ES_KEYCODE_DPAD_RIGHT:
    case ESKeyCode.ES_KEYCODE_DPAD_UP:
    case ESKeyCode.ES_KEYCODE_DPAD_DOWN:
      break
    default:
      if (!isRemoteConfirmKey(keyCode)) return
      runActiveAction()
      break
  }
}

onMounted(refreshCapabilities)

defineExpose({ onKeyDown, onBackPressed })
</script>

<style scoped>
.camera-setup-page {
  width: 1920px;
  height: 1080px;
  background-color: #15191f;
}

.camera-setup-header {
  position: absolute;
  left: 96px;
  top: 82px;
  width: 1728px;
  height: 250px;
  background-color: transparent;
}

.camera-setup-kicker {
  width: 520px;
  height: 48px;
  color: rgba(255, 255, 255, 0.64);
  font-size: 34px;
  background-color: transparent;
}

.camera-setup-title {
  width: 920px;
  height: 88px;
  color: #ffffff;
  font-size: 66px;
  font-weight: bold;
  background-color: transparent;
}

.camera-setup-subtitle {
  width: 1260px;
  height: 56px;
  margin-top: 20px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 32px;
  background-color: transparent;
}

.camera-setup-status-row {
  position: absolute;
  left: 96px;
  top: 370px;
  width: 1728px;
  height: 250px;
  flex-direction: row;
  background-color: transparent;
}

.camera-setup-status-card {
  width: 402px;
  height: 220px;
  margin-right: 24px;
  padding-left: 32px;
  justify-content: center;
  border-radius: 8px;
  background-color: rgba(255, 255, 255, 0.1);
}

.camera-setup-status-name {
  width: 320px;
  height: 46px;
  color: rgba(255, 255, 255, 0.62);
  font-size: 30px;
  background-color: transparent;
}

.camera-setup-status-value {
  width: 320px;
  height: 62px;
  color: #ffffff;
  font-size: 48px;
  font-weight: bold;
  background-color: transparent;
}

.camera-setup-status-hint {
  width: 320px;
  height: 42px;
  color: rgba(255, 255, 255, 0.58);
  font-size: 26px;
  background-color: transparent;
}

.camera-setup-guide {
  position: absolute;
  left: 96px;
  top: 620px;
  width: 1728px;
  height: 128px;
  padding-left: 40px;
  justify-content: center;
  border-radius: 8px;
  background-color: rgba(241, 200, 76, 0.16);
}

.camera-setup-guide-title {
  width: 240px;
  height: 42px;
  color: #f1c84c;
  font-size: 30px;
  font-weight: bold;
  background-color: transparent;
}

.camera-setup-guide-text {
  width: 1580px;
  height: 48px;
  color: rgba(255, 255, 255, 0.82);
  font-size: 30px;
  background-color: transparent;
}

.camera-setup-actions {
  position: absolute;
  left: 96px;
  top: 844px;
  width: 1728px;
  height: 120px;
  flex-direction: row;
  background-color: transparent;
}

.camera-setup-support-strip {
  position: absolute;
  left: 96px;
  top: 766px;
  width: 1728px;
  height: 58px;
  padding-left: 30px;
  flex-direction: row;
  align-items: center;
  border-radius: 8px;
  background-color: rgba(255, 255, 255, 0.08);
}

.camera-setup-support-label {
  width: 116px;
  height: 38px;
  color: #f1c84c;
  font-size: 28px;
  font-weight: bold;
  background-color: transparent;
}

.camera-setup-support-code {
  width: 1320px;
  height: 38px;
  color: rgba(255, 255, 255, 0.82);
  font-size: 26px;
  background-color: transparent;
}

.camera-setup-support-hint {
  width: 190px;
  height: 38px;
  color: rgba(255, 255, 255, 0.58);
  font-size: 24px;
  background-color: transparent;
}

.camera-setup-button {
  width: 300px;
  height: 96px;
  margin-right: 22px;
  flex-direction: row;
  justify-content: center;
  align-items: center;
  border-radius: 8px;
  background-color: #ffffff;
  focus-background-color: #f1c84c;
}

.camera-setup-button.secondary {
  background-color: rgba(255, 255, 255, 0.12);
  focus-background-color: #ffffff;
}

.camera-setup-button.active {
  background-color: #f1c84c;
}

.camera-setup-button-key {
  width: 42px;
  height: 42px;
  margin-right: 12px;
  color: #11151a;
  focus-color: #11151a;
  font-size: 28px;
  font-weight: bold;
  background-color: rgba(17, 21, 26, 0.1);
  border-radius: 8px;
}

.secondary .camera-setup-button-key {
  color: #ffffff;
  focus-color: #11151a;
  background-color: rgba(255, 255, 255, 0.16);
}

.active .camera-setup-button-key {
  color: #11151a;
  background-color: rgba(17, 21, 26, 0.12);
}

.camera-setup-button-text {
  width: 210px;
  height: 50px;
  color: #11151a;
  focus-color: #11151a;
  font-size: 34px;
  font-weight: bold;
  background-color: transparent;
}

.secondary .camera-setup-button-text {
  color: #ffffff;
  focus-color: #11151a;
}

.active .camera-setup-button-text {
  color: #11151a;
}
</style>
