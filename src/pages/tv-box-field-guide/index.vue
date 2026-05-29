<template>
  <qt-view class="tv-box-field-guide-page">
    <qt-view class="tv-box-field-guide-header" :focusable="false">
      <qt-text class="tv-box-field-guide-kicker" text="现场验收" :focusable="false" />
      <qt-text class="tv-box-field-guide-title" text="按顺序测完，就能放心交付" :focusable="false" />
      <qt-text class="tv-box-field-guide-subtitle" text="给安装人员和家人看的大字流程：先会用，再看电视，再测摄像头，最后留证据。" :focusable="false" />
    </qt-view>

    <qt-view class="tv-box-field-guide-steps" :focusable="false">
      <qt-view v-for="item in fieldSteps" :key="item.title" class="tv-box-field-guide-step" :focusable="false">
        <qt-text class="tv-box-field-guide-step-key" :text="item.key" gravity="center" :focusable="false" />
        <qt-text class="tv-box-field-guide-step-title" :text="item.title" :focusable="false" />
        <qt-text class="tv-box-field-guide-step-text" :text="item.text" :focusable="false" />
      </qt-view>
    </qt-view>

    <qt-view class="tv-box-field-guide-record" :focusable="false">
      <qt-text class="tv-box-field-guide-record-title" text="交付前必须留下这 3 样" :focusable="false" />
      <qt-text class="tv-box-field-guide-record-text" text="维护码照片 / 现场验收 JSON / 失败时的 tv-box-support-latest.zip。没有摄像头或麦克风就写不适用，不能留未知。" :focusable="false" />
    </qt-view>

    <qt-view class="tv-box-field-guide-support-strip" :focusable="false">
      <qt-text class="tv-box-field-guide-support-label" text="维护码" :focusable="false" />
      <qt-text class="tv-box-field-guide-support-code" :text="supportCodeText" :focusable="false" />
      <qt-text class="tv-box-field-guide-support-hint" text="拍照留存" :focusable="false" />
    </qt-view>

    <qt-view class="tv-box-field-guide-actions" :focusable="false">
      <qt-view
        v-for="(item, index) in actions"
        :key="item.title"
        :class="['tv-box-field-guide-button', { active: activeActionIndex === index }]"
        :focusable="true"
        :requestFocus="index === 0"
        :enableFocusBorder="true"
        :listenHasFocusChange="true"
        eventFocus
        eventClick
        @focus="setActiveAction(index)"
        @click="runAction(index)"
      >
        <qt-text class="tv-box-field-guide-button-key" :text="String(index + 1)" gravity="center" :focusable="false" />
        <qt-text class="tv-box-field-guide-button-text" :text="item.title" :focusable="false" />
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

interface FieldStep {
  key: string
  title: string
  text: string
}

interface FieldAction {
  title: string
  handler: () => void | Promise<void>
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

const fieldSteps: FieldStep[] = [
  { key: '1', title: '先测遥控器', text: '方向、OK、返回都能用；不会用就进遥控练习。' },
  { key: '2', title: '再测看电视', text: '直播能播放，换台和播放/暂停键都按实际结果记录。' },
  { key: '3', title: '补测找节目', text: '搜索和继续看迷路时，返回键能回简易首页。' },
  { key: '4', title: '再测摄像头', text: '有外设就测权限、预览、麦克风和 USB 热插拔。' },
  { key: '5', title: '最后留证据', text: '读维护码，填写离线验收表，失败就发排障包。' }
]

const actions: FieldAction[] = [
  { title: '遥控练习', handler: launch.launchTvBoxRemotePractice.bind(launch) },
  { title: '看电视', handler: launch.launchLive.bind(launch) },
  { title: '摄像头', handler: launch.launchCameraSetup.bind(launch) },
  { title: '帮助自检', handler: launch.launchTvBoxHelp.bind(launch) },
  { title: '返回首页', handler: launch.launchTvBoxHome.bind(launch) }
]

const supportCodeText = computed(() => formatTvBoxSupportCode(capabilities.value))

function setActiveAction(index: number) {
  activeActionIndex.value = Math.max(0, Math.min(index, actions.length - 1))
}

function runAction(index: number) {
  const action = actions[index]
  if (action) action.handler()
}

async function refreshCapabilities() {
  capabilities.value = await getTvBoxCapabilities()
}

function onBackPressed() {
  launch.launchTvBoxHelp()
}

function onKeyDown(keyEvent: ESKeyEvent) {
  const keyCode = Number(keyEvent.keyCode)
  const remoteNumber = remoteNumberFromKeyCode(keyCode)
  if (remoteNumber === 0 || remoteNumber === 6 || isRemoteHelpKey(keyCode)) {
    launch.launchTvBoxHelp()
    return
  }
  if (remoteNumber !== null && remoteNumber >= 1 && remoteNumber <= actions.length) {
    const actionIndex = remoteNumber - 1
    setActiveAction(actionIndex)
    runAction(actionIndex)
    return
  }

  const nextIndex = moveLinearSelection(activeActionIndex.value, actions.length, keyCode)
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
      runAction(activeActionIndex.value)
      break
  }
}

onMounted(refreshCapabilities)

defineExpose({ onKeyDown, onBackPressed })
</script>

<style scoped>
.tv-box-field-guide-page {
  width: 1920px;
  height: 1080px;
  background-color: #15191f;
}

.tv-box-field-guide-header {
  position: absolute;
  left: 96px;
  top: 72px;
  width: 1728px;
  height: 210px;
  background-color: transparent;
}

.tv-box-field-guide-kicker {
  width: 520px;
  height: 46px;
  color: rgba(255, 255, 255, 0.64);
  font-size: 34px;
  background-color: transparent;
}

.tv-box-field-guide-title {
  width: 1120px;
  height: 84px;
  color: #ffffff;
  font-size: 64px;
  font-weight: bold;
  background-color: transparent;
}

.tv-box-field-guide-subtitle {
  width: 1460px;
  height: 54px;
  margin-top: 14px;
  color: rgba(255, 255, 255, 0.72);
  font-size: 32px;
  background-color: transparent;
}

.tv-box-field-guide-steps {
  position: absolute;
  left: 96px;
  top: 304px;
  width: 1728px;
  height: 356px;
  flex-direction: row;
  flex-wrap: wrap;
  background-color: transparent;
}

.tv-box-field-guide-step {
  width: 544px;
  height: 154px;
  margin-right: 32px;
  margin-bottom: 24px;
  padding-left: 30px;
  padding-right: 24px;
  justify-content: center;
  border-radius: 8px;
  background-color: rgba(255, 255, 255, 0.1);
}

.tv-box-field-guide-step-key {
  width: 52px;
  height: 42px;
  color: #11151a;
  font-size: 28px;
  font-weight: bold;
  background-color: #f1c84c;
  border-radius: 8px;
}

.tv-box-field-guide-step-title {
  width: 460px;
  height: 44px;
  margin-top: 10px;
  color: #ffffff;
  font-size: 32px;
  font-weight: bold;
  background-color: transparent;
}

.tv-box-field-guide-step-text {
  width: 474px;
  height: 42px;
  margin-top: 8px;
  color: rgba(255, 255, 255, 0.74);
  font-size: 25px;
  background-color: transparent;
}

.tv-box-field-guide-record {
  position: absolute;
  left: 96px;
  top: 690px;
  width: 1728px;
  height: 112px;
  padding-left: 36px;
  justify-content: center;
  border-radius: 8px;
  background-color: rgba(241, 200, 76, 0.16);
}

.tv-box-field-guide-record-title {
  width: 520px;
  height: 42px;
  color: #f1c84c;
  font-size: 30px;
  font-weight: bold;
  background-color: transparent;
}

.tv-box-field-guide-record-text {
  width: 1580px;
  height: 42px;
  color: rgba(255, 255, 255, 0.84);
  font-size: 28px;
  background-color: transparent;
}

.tv-box-field-guide-support-strip {
  position: absolute;
  left: 96px;
  top: 824px;
  width: 1728px;
  height: 58px;
  padding-left: 30px;
  flex-direction: row;
  align-items: center;
  border-radius: 8px;
  background-color: rgba(255, 255, 255, 0.08);
}

.tv-box-field-guide-support-label {
  width: 116px;
  height: 38px;
  color: #f1c84c;
  font-size: 28px;
  font-weight: bold;
  background-color: transparent;
}

.tv-box-field-guide-support-code {
  width: 1320px;
  height: 38px;
  color: rgba(255, 255, 255, 0.82);
  font-size: 26px;
  background-color: transparent;
}

.tv-box-field-guide-support-hint {
  width: 190px;
  height: 38px;
  color: rgba(255, 255, 255, 0.58);
  font-size: 24px;
  background-color: transparent;
}

.tv-box-field-guide-actions {
  position: absolute;
  left: 96px;
  top: 904px;
  width: 1728px;
  height: 110px;
  flex-direction: row;
  background-color: transparent;
}

.tv-box-field-guide-button {
  width: 316px;
  height: 96px;
  margin-right: 22px;
  flex-direction: row;
  justify-content: center;
  align-items: center;
  border-radius: 8px;
  background-color: rgba(255, 255, 255, 0.12);
  focus-background-color: #ffffff;
}

.tv-box-field-guide-button.active {
  background-color: #f1c84c;
}

.tv-box-field-guide-button-key {
  width: 42px;
  height: 42px;
  margin-right: 12px;
  color: #ffffff;
  focus-color: #11151a;
  font-size: 28px;
  font-weight: bold;
  background-color: rgba(255, 255, 255, 0.16);
  border-radius: 8px;
}

.active .tv-box-field-guide-button-key {
  color: #11151a;
  background-color: rgba(17, 21, 26, 0.12);
}

.tv-box-field-guide-button-text {
  width: 218px;
  height: 50px;
  color: #ffffff;
  focus-color: #11151a;
  font-size: 34px;
  font-weight: bold;
  background-color: transparent;
}

.active .tv-box-field-guide-button-text {
  color: #11151a;
}
</style>
