<template>
  <qt-view class="phone-camera-page">
    <qt-view class="phone-camera-header" :focusable="false">
      <qt-text class="phone-camera-kicker" text="手机当电视摄像头" :focusable="false" />
      <qt-text class="phone-camera-title" text="扫码连接手机摄像头" :focusable="false" />
      <qt-text class="phone-camera-subtitle" text="手机负责拍摄和收音，电视盒子只接收 WebRTC 画面；不会把手机伪装成系统摄像头。" :focusable="false" />
    </qt-view>

    <qt-view class="phone-camera-qr-card" :focusable="false">
      <qt-qr-code class="phone-camera-qr" :content="pairUrl" :optimize="true" />
      <qt-text class="phone-camera-qr-caption" text="手机扫码" gravity="center" :focusable="false" />
    </qt-view>

    <qt-view class="phone-camera-room" :focusable="false">
      <qt-text class="phone-camera-room-label" text="房间码" :focusable="false" />
      <qt-text class="phone-camera-room-code" :text="roomCode" :focusable="false" />
      <qt-text class="phone-camera-room-hint" :text="roomHintText" :focusable="false" />
    </qt-view>

    <qt-view class="phone-camera-steps" :focusable="false">
      <qt-text class="phone-camera-step-title" text="现在只做三步" :focusable="false" />
      <qt-text class="phone-camera-step" text="1. 手机扫码或输入房间码" :focusable="false" />
      <qt-text class="phone-camera-step" text="2. 手机上允许摄像头和麦克风" :focusable="false" />
      <qt-text class="phone-camera-step" text="3. 电视出现首帧后再记为通过" :focusable="false" />
    </qt-view>

    <qt-view class="phone-camera-boundary" :focusable="false">
      <qt-text class="phone-camera-boundary-title" text="验收边界" :focusable="false" />
      <qt-text class="phone-camera-boundary-text" text="电视端接收入口已接入 APK；WebRTC SDK 和真实首帧未闭环前，仍不能记为通过。" :focusable="false" />
      <qt-text class="phone-camera-boundary-text" text="手机端必须有明显停止按钮，默认不录制；微信小程序推流要等资质和权限通过。" :focusable="false" />
    </qt-view>

    <qt-view class="phone-camera-actions" :focusable="false">
      <qt-view
        :class="['phone-camera-button', { active: activeActionIndex === 0 }]"
        :focusable="true"
        :requestFocus="true"
        :enableFocusBorder="true"
        :listenHasFocusChange="true"
        eventFocus
        eventClick
        @focus="setActiveAction(0)"
        @click="openReceiver"
      >
        <qt-text class="phone-camera-button-key" text="1" gravity="center" :focusable="false" />
        <qt-text class="phone-camera-button-text" text="打开接收端" :focusable="false" />
      </qt-view>
      <qt-view
        :class="['phone-camera-button secondary', { active: activeActionIndex === 1 }]"
        :focusable="true"
        :enableFocusBorder="true"
        :listenHasFocusChange="true"
        eventFocus
        eventClick
        @focus="setActiveAction(1)"
        @click="regenerateRoom"
      >
        <qt-text class="phone-camera-button-key" text="2" gravity="center" :focusable="false" />
        <qt-text class="phone-camera-button-text" text="重新生成" :focusable="false" />
      </qt-view>
      <qt-view
        :class="['phone-camera-button secondary', { active: activeActionIndex === 2 }]"
        :focusable="true"
        :enableFocusBorder="true"
        :listenHasFocusChange="true"
        eventFocus
        eventClick
        @focus="setActiveAction(2)"
        @click="launch.launchCameraSetup()"
      >
        <qt-text class="phone-camera-button-key" text="3" gravity="center" :focusable="false" />
        <qt-text class="phone-camera-button-text" text="返回摄像头" :focusable="false" />
      </qt-view>
      <qt-view
        :class="['phone-camera-button secondary', { active: activeActionIndex === 3 }]"
        :focusable="true"
        :enableFocusBorder="true"
        :listenHasFocusChange="true"
        eventFocus
        eventClick
        @focus="setActiveAction(3)"
        @click="launch.launchTvBoxHelp()"
      >
        <qt-text class="phone-camera-button-key" text="4" gravity="center" :focusable="false" />
        <qt-text class="phone-camera-button-text" text="帮助自检" :focusable="false" />
      </qt-view>
    </qt-view>
  </qt-view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { ESKeyCode, ESKeyEvent, useESToast } from '@extscreen/es3-core'
import launch from '../../tools/launch'
import { openPhoneCameraReceiver } from '../../tools/tv-box/native-capabilities'
import { isRemoteConfirmKey, isRemoteHelpKey, moveLinearSelection, remoteNumberFromKeyCode } from '../../tools/tv-box/remote-control'

const toast = useESToast()
const activeActionIndex = ref(0)
const roomCode = ref(generateRoomCode())
const ttlMinutes = 10
const pairBaseUrl = 'https://quicktv.local/phone-camera'

const pairUrl = computed(() => `${pairBaseUrl}?room=${roomCode.value}&role=phone`)
const roomHintText = computed(() => `一次性房间码，约 ${ttlMinutes} 分钟内有效`)
const actionHandlers = [openReceiver, regenerateRoom, launch.launchCameraSetup.bind(launch), launch.launchTvBoxHelp.bind(launch)]

function generateRoomCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}

function regenerateRoom() {
  roomCode.value = generateRoomCode()
  toast.showToast('已重新生成手机摄像头房间码')
}

async function openReceiver() {
  const result = await openPhoneCameraReceiver()
  toast.showToast(result.message || (result.success ? '已打开电视接收端' : '暂无法打开电视接收端'))
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

function onBackPressed() {
  launch.launchCameraSetup()
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

defineExpose({ onKeyDown, onBackPressed })
</script>

<style scoped>
.phone-camera-page {
  width: 1920px;
  height: 1080px;
  background-color: #121820;
}

.phone-camera-header {
  position: absolute;
  left: 96px;
  top: 70px;
  width: 1728px;
  height: 210px;
  background-color: transparent;
}

.phone-camera-kicker {
  width: 560px;
  height: 46px;
  color: rgba(255, 255, 255, 0.62);
  font-size: 34px;
  background-color: transparent;
}

.phone-camera-title {
  width: 900px;
  height: 86px;
  color: #ffffff;
  font-size: 64px;
  font-weight: bold;
  background-color: transparent;
}

.phone-camera-subtitle {
  width: 1540px;
  height: 54px;
  margin-top: 18px;
  color: rgba(255, 255, 255, 0.72);
  font-size: 30px;
  background-color: transparent;
}

.phone-camera-qr-card {
  position: absolute;
  left: 96px;
  top: 320px;
  width: 520px;
  height: 590px;
  align-items: center;
  border-radius: 8px;
  background-color: #ffffff;
}

.phone-camera-qr {
  width: 440px;
  height: 440px;
  margin-top: 36px;
}

.phone-camera-qr-caption {
  width: 440px;
  height: 58px;
  margin-top: 24px;
  color: #11151a;
  font-size: 34px;
  font-weight: bold;
  background-color: transparent;
}

.phone-camera-room {
  position: absolute;
  left: 660px;
  top: 320px;
  width: 1164px;
  height: 180px;
  padding-left: 40px;
  justify-content: center;
  border-radius: 8px;
  background-color: rgba(255, 255, 255, 0.1);
}

.phone-camera-room-label {
  width: 240px;
  height: 42px;
  color: rgba(255, 255, 255, 0.62);
  font-size: 30px;
  background-color: transparent;
}

.phone-camera-room-code {
  width: 480px;
  height: 74px;
  color: #f1c84c;
  font-size: 60px;
  font-weight: bold;
  background-color: transparent;
}

.phone-camera-room-hint {
  width: 960px;
  height: 40px;
  color: rgba(255, 255, 255, 0.62);
  font-size: 28px;
  background-color: transparent;
}

.phone-camera-steps {
  position: absolute;
  left: 660px;
  top: 530px;
  width: 560px;
  height: 260px;
  padding-left: 34px;
  justify-content: center;
  border-radius: 8px;
  background-color: rgba(77, 184, 148, 0.18);
}

.phone-camera-step-title {
  width: 460px;
  height: 46px;
  color: #79d6b8;
  font-size: 32px;
  font-weight: bold;
  background-color: transparent;
}

.phone-camera-step {
  width: 500px;
  height: 46px;
  margin-top: 12px;
  color: rgba(255, 255, 255, 0.82);
  font-size: 30px;
  background-color: transparent;
}

.phone-camera-boundary {
  position: absolute;
  left: 1250px;
  top: 530px;
  width: 574px;
  height: 260px;
  padding-left: 34px;
  justify-content: center;
  border-radius: 8px;
  background-color: rgba(241, 200, 76, 0.16);
}

.phone-camera-boundary-title {
  width: 460px;
  height: 46px;
  color: #f1c84c;
  font-size: 32px;
  font-weight: bold;
  background-color: transparent;
}

.phone-camera-boundary-text {
  width: 500px;
  height: 58px;
  margin-top: 12px;
  color: rgba(255, 255, 255, 0.8);
  font-size: 26px;
  background-color: transparent;
}

.phone-camera-actions {
  position: absolute;
  left: 660px;
  top: 826px;
  width: 1164px;
  height: 116px;
  flex-direction: row;
  background-color: transparent;
}

.phone-camera-button {
  width: 270px;
  height: 96px;
  margin-right: 21px;
  flex-direction: row;
  justify-content: center;
  align-items: center;
  border-radius: 8px;
  background-color: #ffffff;
  focus-background-color: #f1c84c;
}

.phone-camera-button.secondary {
  background-color: rgba(255, 255, 255, 0.12);
  focus-background-color: #ffffff;
}

.phone-camera-button.active {
  background-color: #f1c84c;
}

.phone-camera-button-key {
  width: 44px;
  height: 44px;
  margin-right: 14px;
  color: #11151a;
  focus-color: #11151a;
  font-size: 30px;
  font-weight: bold;
  background-color: rgba(17, 21, 26, 0.1);
  border-radius: 8px;
}

.secondary .phone-camera-button-key {
  color: #ffffff;
  focus-color: #11151a;
  background-color: rgba(255, 255, 255, 0.16);
}

.active .phone-camera-button-key {
  color: #11151a;
  background-color: rgba(17, 21, 26, 0.12);
}

.phone-camera-button-text {
  width: 188px;
  height: 50px;
  color: #11151a;
  focus-color: #11151a;
  font-size: 34px;
  font-weight: bold;
  background-color: transparent;
}

.secondary .phone-camera-button-text {
  color: #ffffff;
  focus-color: #11151a;
}

.active .phone-camera-button-text {
  color: #11151a;
}
</style>
