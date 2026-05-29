<template>
  <qt-view class="tv-box-help-page">
    <qt-view class="tv-box-help-header" :focusable="false">
      <qt-text class="tv-box-help-kicker" text="帮助 / 自检" :focusable="false" />
      <qt-text class="tv-box-help-title" text="遥控器会用，摄像头不慌" :focusable="false" />
      <qt-text class="tv-box-help-subtitle" text="看不懂时按 6 或 0、菜单、信息或帮助键进来，照着大字提示一步步做。" :focusable="false" />
      <qt-view class="tv-box-help-next-card" :focusable="false">
        <qt-text class="tv-box-help-next-label" text="现在下一步" :focusable="false" />
        <qt-text class="tv-box-help-next-title" :text="primaryNextTitle" :focusable="false" />
        <qt-text class="tv-box-help-next-hint" :text="primaryNextHint" :focusable="false" />
      </qt-view>
    </qt-view>

    <qt-view class="tv-box-help-status-row" :focusable="false">
      <qt-view class="tv-box-help-status-card" :focusable="false">
        <qt-text class="tv-box-help-status-name" text="电视环境" :focusable="false" />
        <qt-text class="tv-box-help-status-value" :text="tvStateText" :focusable="false" />
        <qt-text class="tv-box-help-status-hint" :text="deviceHintText" :focusable="false" />
      </qt-view>
      <qt-view class="tv-box-help-status-card" :focusable="false">
        <qt-text class="tv-box-help-status-name" text="摄像头" :focusable="false" />
        <qt-text class="tv-box-help-status-value" :text="cameraStateText" :focusable="false" />
        <qt-text class="tv-box-help-status-hint" :text="cameraHintText" :focusable="false" />
      </qt-view>
      <qt-view class="tv-box-help-status-card" :focusable="false">
        <qt-text class="tv-box-help-status-name" text="权限" :focusable="false" />
        <qt-text class="tv-box-help-status-value" :text="permissionStateText" :focusable="false" />
        <qt-text class="tv-box-help-status-hint" :text="permissionHintText" :focusable="false" />
      </qt-view>
      <qt-view class="tv-box-help-status-card" :focusable="false">
        <qt-text class="tv-box-help-status-name" text="麦克风" :focusable="false" />
        <qt-text class="tv-box-help-status-value" :text="microphoneStateText" :focusable="false" />
        <qt-text class="tv-box-help-status-hint" :text="microphoneHintText" :focusable="false" />
      </qt-view>
    </qt-view>

    <qt-view class="tv-box-help-guide-grid" :focusable="false">
      <qt-view v-for="item in helpItems" :key="item.title" class="tv-box-help-guide-card" :focusable="false">
        <qt-text class="tv-box-help-guide-title" :text="item.title" :focusable="false" />
        <qt-text class="tv-box-help-guide-text" :text="item.text" :focusable="false" />
      </qt-view>
    </qt-view>

    <qt-view class="tv-box-help-support-strip" :focusable="false">
      <qt-text class="tv-box-help-support-label" text="维护码" :focusable="false" />
      <qt-text class="tv-box-help-support-code" :text="supportCodeText" :focusable="false" />
      <qt-text class="tv-box-help-support-hint" text="电话排障时读这一行" :focusable="false" />
    </qt-view>

    <qt-view class="tv-box-help-actions" :focusable="false">
      <qt-view
        :class="['tv-box-help-button', { active: activeActionIndex === 0 }]"
        :focusable="true"
        :requestFocus="true"
        :enableFocusBorder="true"
        :listenHasFocusChange="true"
        eventFocus
        eventClick
        @focus="setActiveAction(0)"
        @click="refreshCapabilities"
      >
        <qt-text class="tv-box-help-button-key" text="1" gravity="center" :focusable="false" />
        <qt-text class="tv-box-help-button-text" text="重新自检" :focusable="false" />
      </qt-view>
      <qt-view
        :class="['tv-box-help-button secondary', { active: activeActionIndex === 1 }]"
        :focusable="true"
        :enableFocusBorder="true"
        :listenHasFocusChange="true"
        eventFocus
        eventClick
        @focus="setActiveAction(1)"
        @click="launch.launchCameraSetup()"
      >
        <qt-text class="tv-box-help-button-key" text="2" gravity="center" :focusable="false" />
        <qt-text class="tv-box-help-button-text" text="摄像头检查" :focusable="false" />
      </qt-view>
      <qt-view
        :class="['tv-box-help-button secondary', { active: activeActionIndex === 2 }]"
        :focusable="true"
        :enableFocusBorder="true"
        :listenHasFocusChange="true"
        eventFocus
        eventClick
        @focus="setActiveAction(2)"
        @click="launch.launchTvBoxRemotePractice()"
      >
        <qt-text class="tv-box-help-button-key" text="3" gravity="center" :focusable="false" />
        <qt-text class="tv-box-help-button-text" text="遥控练习" :focusable="false" />
      </qt-view>
      <qt-view
        :class="['tv-box-help-button secondary', { active: activeActionIndex === 3 }]"
        :focusable="true"
        :enableFocusBorder="true"
        :listenHasFocusChange="true"
        eventFocus
        eventClick
        @focus="setActiveAction(3)"
        @click="launch.launchTvBoxHome()"
      >
        <qt-text class="tv-box-help-button-key" text="4" gravity="center" :focusable="false" />
        <qt-text class="tv-box-help-button-text" text="返回首页" :focusable="false" />
      </qt-view>
      <qt-view
        :class="['tv-box-help-button secondary', { active: activeActionIndex === 4 }]"
        :focusable="true"
        :enableFocusBorder="true"
        :listenHasFocusChange="true"
        eventFocus
        eventClick
        @focus="setActiveAction(4)"
        @click="launch.launchTvBoxFieldGuide()"
      >
        <qt-text class="tv-box-help-button-key" text="5" gravity="center" :focusable="false" />
        <qt-text class="tv-box-help-button-text" text="现场验收" :focusable="false" />
      </qt-view>
    </qt-view>
  </qt-view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ESKeyCode, ESKeyEvent } from '@extscreen/es3-core'
import launch from '../../tools/launch'
import { getTvBoxCapabilities, TvBoxCapabilities } from '../../tools/tv-box/native-capabilities'
import { isRemoteConfirmKey, isRemoteHelpKey, moveLinearSelection, remoteNumberFromKeyCode } from '../../tools/tv-box/remote-control'
import { formatTvBoxSupportCode } from '../../tools/tv-box/support-code'

interface HelpItem {
  title: string
  text: string
}

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

const helpItems: HelpItem[] = [
  { title: '看电视', text: '首页默认选中看电视，按 OK 进入；直播里按上/下或频道 +/- 换台。' },
  { title: '找节目', text: '首页按 2 直接搜索；迷路了多按一次返回。' },
  { title: '遥控练习', text: '帮助页按 3，跟着屏幕试方向键、OK 和返回。' },
  { title: '摄像头', text: '帮助页按 2 或首页按 4 检查；没有摄像头也能看电视。' }
]

const tvStateText = computed(() => formatFlag(capabilities.value.isTvDevice || capabilities.value.isLeanbackLauncher, '电视模式', '待实机确认'))
const deviceHintText = computed(() => {
  if (capabilities.value.buildModel) return capabilities.value.buildModel
  if (capabilities.value.source === 'fallback') return '打包安装到盒子后可读取'
  return '遥控器优先适配'
})
const cameraStateText = computed(() => {
  if (capabilities.value.hasAnyCamera === true) return '可识别'
  if ((capabilities.value.usbVideoDeviceCount || 0) > 0) return 'USB 已接入'
  if (capabilities.value.hasAnyCamera === false) return '未检测到'
  return '未知'
})
const cameraHintText = computed(() => {
  const cameraCount = capabilities.value.cameraCount
  const usbVideoCount = capabilities.value.usbVideoDeviceCount || 0
  if (cameraCount !== null && usbVideoCount > 0) return `系统 ${cameraCount} / USB ${usbVideoCount}`
  if (cameraCount !== null) return `系统 ${cameraCount} 个`
  if (usbVideoCount > 0) return `USB 视频 ${usbVideoCount} 个`
  return '可到摄像头页重新检测'
})
const permissionStateText = computed(() => formatFlag(capabilities.value.hasCameraPermission, '已允许', '未允许'))
const permissionHintText = computed(() => {
  if (capabilities.value.hasCameraPermission === true) return '可以测试摄像头'
  if (capabilities.value.hasCameraPermission === false) return '到摄像头页按一键授权'
  return '等待系统返回权限'
})
const microphoneStateText = computed(() => {
  if ((capabilities.value.audioInputDeviceCount || 0) > 0) return '有输入'
  return formatFlag(capabilities.value.hasMicrophone, '有麦克风', '未检测到')
})
const microphoneHintText = computed(() => {
  const audioInputCount = capabilities.value.audioInputDeviceCount
  const usbAudioCount = capabilities.value.usbAudioInputDeviceCount || 0
  if (audioInputCount === null) return '通话/语音预检测'
  if (usbAudioCount > 0) return `音频 ${audioInputCount} / USB ${usbAudioCount}`
  if (audioInputCount > 0) return `音频输入 ${audioInputCount} 个`
  return '不影响看电视'
})
const supportCodeText = computed(() => formatTvBoxSupportCode(capabilities.value))
const primaryNextTitle = computed(() => {
  if (capabilities.value.source === 'fallback') return '按 4 回首页看电视'
  if (capabilities.value.hasCameraPermission === false || capabilities.value.hasRecordAudioPermission === false) return '按 2 处理权限'
  if (capabilities.value.hasAnyCamera === true && capabilities.value.hasCameraPermission === true) return '按 2 测摄像头'
  if ((capabilities.value.usbVideoDeviceCount || 0) > 0) return '按 2 试 USB 摄像头'
  if (capabilities.value.hasAnyCamera === false && capabilities.value.hasMicrophone === false) return '按 4 直接看电视'
  return '不会操作按 3 练遥控'
})
const primaryNextHint = computed(() => {
  if (capabilities.value.source === 'fallback') return '装到盒子后会显示真实状态'
  if (capabilities.value.hasCameraPermission === false || capabilities.value.hasRecordAudioPermission === false) return '摄像头页有一键授权和设置入口'
  if (capabilities.value.hasAnyCamera === true && capabilities.value.hasCameraPermission === true) return '摄像头页按 3 打开预览测试'
  if ((capabilities.value.usbVideoDeviceCount || 0) > 0) return '能看到 USB 硬件，先做预览测试'
  if (capabilities.value.hasAnyCamera === false && capabilities.value.hasMicrophone === false) return '没有外设也不影响直播和点播'
  return '跟着屏幕按方向键、OK 和返回'
})

const actionHandlers = [
  refreshCapabilities,
  launch.launchCameraSetup.bind(launch),
  launch.launchTvBoxRemotePractice.bind(launch),
  launch.launchTvBoxHome.bind(launch),
  launch.launchTvBoxFieldGuide.bind(launch)
]

function formatFlag(value: boolean | null, yesText: string, noText: string): string {
  if (value === true) return yesText
  if (value === false) return noText
  return '未知'
}

function setActiveAction(index: number) {
  activeActionIndex.value = Math.max(0, Math.min(index, actionHandlers.length - 1))
}

function runActiveAction() {
  const handler = actionHandlers[activeActionIndex.value]
  if (handler) handler()
}

async function refreshCapabilities() {
  capabilities.value = await getTvBoxCapabilities()
}

function onBackPressed() {
  launch.launchTvBoxHome()
}

function onKeyDown(keyEvent: ESKeyEvent) {
  const keyCode = Number(keyEvent.keyCode)
  const remoteNumber = remoteNumberFromKeyCode(keyCode)
  if (remoteNumber === 0 || remoteNumber === 6 || isRemoteHelpKey(keyCode)) {
    setActiveAction(0)
    refreshCapabilities()
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
.tv-box-help-page {
  width: 1920px;
  height: 1080px;
  background-color: #15191f;
}

.tv-box-help-header {
  position: absolute;
  left: 96px;
  top: 72px;
  width: 1728px;
  height: 220px;
  background-color: transparent;
}

.tv-box-help-kicker {
  width: 520px;
  height: 46px;
  color: rgba(255, 255, 255, 0.64);
  font-size: 34px;
  background-color: transparent;
}

.tv-box-help-title {
  width: 980px;
  height: 86px;
  color: #ffffff;
  font-size: 66px;
  font-weight: bold;
  background-color: transparent;
}

.tv-box-help-subtitle {
  width: 1280px;
  height: 54px;
  margin-top: 16px;
  color: rgba(255, 255, 255, 0.72);
  font-size: 32px;
  background-color: transparent;
}

.tv-box-help-next-card {
  position: absolute;
  left: 1120px;
  top: 0;
  width: 608px;
  height: 190px;
  padding-left: 32px;
  justify-content: center;
  border-radius: 8px;
  background-color: rgba(241, 200, 76, 0.16);
}

.tv-box-help-next-label {
  width: 520px;
  height: 38px;
  color: #f1c84c;
  font-size: 28px;
  font-weight: bold;
  background-color: transparent;
}

.tv-box-help-next-title {
  width: 520px;
  height: 58px;
  color: #ffffff;
  font-size: 46px;
  font-weight: bold;
  background-color: transparent;
}

.tv-box-help-next-hint {
  width: 520px;
  height: 42px;
  color: rgba(255, 255, 255, 0.76);
  font-size: 26px;
  background-color: transparent;
}

.tv-box-help-status-row {
  position: absolute;
  left: 96px;
  top: 318px;
  width: 1728px;
  height: 214px;
  flex-direction: row;
  background-color: transparent;
}

.tv-box-help-status-card {
  width: 402px;
  height: 190px;
  margin-right: 24px;
  padding-left: 32px;
  justify-content: center;
  border-radius: 8px;
  background-color: rgba(255, 255, 255, 0.1);
}

.tv-box-help-status-name {
  width: 320px;
  height: 42px;
  color: rgba(255, 255, 255, 0.62);
  font-size: 28px;
  background-color: transparent;
}

.tv-box-help-status-value {
  width: 320px;
  height: 58px;
  color: #ffffff;
  font-size: 46px;
  font-weight: bold;
  background-color: transparent;
}

.tv-box-help-status-hint {
  width: 320px;
  height: 42px;
  color: rgba(255, 255, 255, 0.6);
  font-size: 26px;
  background-color: transparent;
}

.tv-box-help-guide-grid {
  position: absolute;
  left: 96px;
  top: 558px;
  width: 1728px;
  height: 232px;
  flex-direction: row;
  flex-wrap: wrap;
  background-color: transparent;
}

.tv-box-help-guide-card {
  width: 820px;
  height: 104px;
  margin-right: 36px;
  margin-bottom: 24px;
  padding-left: 34px;
  justify-content: center;
  border-radius: 8px;
  background-color: rgba(241, 200, 76, 0.14);
}

.tv-box-help-guide-title {
  width: 720px;
  height: 42px;
  color: #f1c84c;
  font-size: 30px;
  font-weight: bold;
  background-color: transparent;
}

.tv-box-help-guide-text {
  width: 740px;
  height: 42px;
  color: rgba(255, 255, 255, 0.82);
  font-size: 26px;
  background-color: transparent;
}

.tv-box-help-support-strip {
  position: absolute;
  left: 96px;
  top: 812px;
  width: 1728px;
  height: 58px;
  padding-left: 30px;
  flex-direction: row;
  align-items: center;
  border-radius: 8px;
  background-color: rgba(255, 255, 255, 0.08);
}

.tv-box-help-support-label {
  width: 116px;
  height: 38px;
  color: #f1c84c;
  font-size: 28px;
  font-weight: bold;
  background-color: transparent;
}

.tv-box-help-support-code {
  width: 1320px;
  height: 38px;
  color: rgba(255, 255, 255, 0.82);
  font-size: 26px;
  background-color: transparent;
}

.tv-box-help-support-hint {
  width: 190px;
  height: 38px;
  color: rgba(255, 255, 255, 0.58);
  font-size: 24px;
  background-color: transparent;
}

.tv-box-help-actions {
  position: absolute;
  left: 96px;
  top: 892px;
  width: 1728px;
  height: 110px;
  flex-direction: row;
  background-color: transparent;
}

.tv-box-help-button {
  width: 316px;
  height: 96px;
  margin-right: 22px;
  flex-direction: row;
  justify-content: center;
  align-items: center;
  border-radius: 8px;
  background-color: #f1c84c;
  focus-background-color: #ffffff;
}

.tv-box-help-button.secondary {
  background-color: rgba(255, 255, 255, 0.12);
}

.tv-box-help-button.active {
  background-color: #f1c84c;
}

.tv-box-help-button-key {
  width: 42px;
  height: 42px;
  margin-right: 12px;
  color: #11151a;
  focus-color: #11151a;
  font-size: 28px;
  font-weight: bold;
  background-color: rgba(17, 21, 26, 0.12);
  border-radius: 8px;
}

.secondary .tv-box-help-button-key {
  color: #ffffff;
  focus-color: #11151a;
  background-color: rgba(255, 255, 255, 0.16);
}

.active .tv-box-help-button-key {
  color: #11151a;
  background-color: rgba(17, 21, 26, 0.12);
}

.tv-box-help-button-text {
  width: 218px;
  height: 50px;
  color: #11151a;
  focus-color: #11151a;
  font-size: 34px;
  font-weight: bold;
  background-color: transparent;
}

.secondary .tv-box-help-button-text {
  color: #ffffff;
  focus-color: #11151a;
}

.active .tv-box-help-button-text {
  color: #11151a;
}
</style>
