<template>
  <qt-view class="tv-box-exit-page">
    <qt-view class="tv-box-exit-panel" :focusable="false">
      <qt-text class="tv-box-exit-kicker" text="退出确认" :focusable="false" />
      <qt-text class="tv-box-exit-title" text="要不要继续看？" :focusable="false" />
      <qt-text class="tv-box-exit-subtitle" text="按 OK 默认继续看；只有选“退出应用”才会关闭。" :focusable="false" />

      <qt-view class="tv-box-exit-actions" :focusable="false">
        <qt-view
          :class="['tv-box-exit-button', { active: activeIndex === 0 }]"
          :focusable="true"
          :requestFocus="true"
          :enableFocusBorder="true"
          :listenHasFocusChange="true"
          eventFocus
          eventClick
          @focus="setActiveIndex(0)"
          @click="continueWatching"
        >
          <qt-text class="tv-box-exit-button-key" text="1" gravity="center" :focusable="false" />
          <qt-text class="tv-box-exit-button-text" text="继续看" :focusable="false" />
        </qt-view>
        <qt-view
          :class="['tv-box-exit-button danger', { active: activeIndex === 1 }]"
          :focusable="true"
          :enableFocusBorder="true"
          :listenHasFocusChange="true"
          eventFocus
          eventClick
          @focus="setActiveIndex(1)"
          @click="exitApp"
        >
          <qt-text class="tv-box-exit-button-key" text="2" gravity="center" :focusable="false" />
          <qt-text class="tv-box-exit-button-text" text="退出应用" :focusable="false" />
        </qt-view>
      </qt-view>

      <qt-text class="tv-box-exit-footer" text="返回键也会继续看；按 6 或 0 打开帮助自检。" :focusable="false" />
    </qt-view>
  </qt-view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ESKeyCode, ESKeyEvent } from '@extscreen/es3-core'
import launch from '../../tools/launch'
import { isRemoteConfirmKey, isRemoteHelpKey, moveLinearSelection, remoteNumberFromKeyCode } from '../../tools/tv-box/remote-control'

const activeIndex = ref(0)

const actionHandlers = [
  continueWatching,
  exitApp
]

function setActiveIndex(index: number) {
  activeIndex.value = Math.max(0, Math.min(index, actionHandlers.length - 1))
}

function continueWatching() {
  launch.launchTvBoxHome()
}

function exitApp() {
  launch.launchGo()
}

function runActiveAction() {
  const handler = actionHandlers[activeIndex.value]
  if (handler) handler()
}

function onKeyDown(keyEvent: ESKeyEvent) {
  const keyCode = Number(keyEvent.keyCode)
  const remoteNumber = remoteNumberFromKeyCode(keyCode)
  if (remoteNumber === 0 || remoteNumber === 6 || isRemoteHelpKey(keyCode)) {
    launch.launchTvBoxHelp()
    return
  }
  if (remoteNumber === 1) {
    setActiveIndex(0)
    continueWatching()
    return
  }
  if (remoteNumber === 2) {
    setActiveIndex(1)
    exitApp()
    return
  }

  const nextIndex = moveLinearSelection(activeIndex.value, actionHandlers.length, keyCode)
  if (nextIndex !== activeIndex.value) {
    setActiveIndex(nextIndex)
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

function onBackPressed() {
  continueWatching()
}

defineExpose({ onKeyDown, onBackPressed })
</script>

<style scoped>
.tv-box-exit-page {
  width: 1920px;
  height: 1080px;
  background-color: rgba(15, 18, 23, 0.96);
}

.tv-box-exit-panel {
  position: absolute;
  left: 360px;
  top: 190px;
  width: 1200px;
  height: 700px;
  padding-left: 72px;
  padding-right: 72px;
  justify-content: center;
  border-radius: 8px;
  background-color: #1d232c;
}

.tv-box-exit-kicker {
  width: 360px;
  height: 48px;
  color: #f1c84c;
  font-size: 34px;
  font-weight: bold;
  background-color: transparent;
}

.tv-box-exit-title {
  width: 880px;
  height: 96px;
  margin-top: 16px;
  color: #ffffff;
  font-size: 74px;
  font-weight: bold;
  background-color: transparent;
}

.tv-box-exit-subtitle {
  width: 980px;
  height: 58px;
  margin-top: 18px;
  color: rgba(255, 255, 255, 0.76);
  font-size: 34px;
  background-color: transparent;
}

.tv-box-exit-actions {
  width: 1056px;
  height: 150px;
  margin-top: 78px;
  flex-direction: row;
  background-color: transparent;
}

.tv-box-exit-button {
  width: 490px;
  height: 132px;
  margin-right: 36px;
  flex-direction: row;
  justify-content: center;
  align-items: center;
  border-radius: 8px;
  background-color: #f1c84c;
  focus-background-color: #ffffff;
}

.tv-box-exit-button.danger {
  background-color: rgba(255, 255, 255, 0.12);
}

.tv-box-exit-button.active {
  background-color: #f1c84c;
}

.tv-box-exit-button-key {
  width: 54px;
  height: 54px;
  margin-right: 16px;
  color: #11151a;
  focus-color: #11151a;
  font-size: 34px;
  font-weight: bold;
  background-color: rgba(17, 21, 26, 0.12);
  border-radius: 8px;
}

.danger .tv-box-exit-button-key {
  color: #ffffff;
  focus-color: #11151a;
  background-color: rgba(255, 255, 255, 0.16);
}

.active .tv-box-exit-button-key {
  color: #11151a;
  background-color: rgba(17, 21, 26, 0.12);
}

.tv-box-exit-button-text {
  width: 250px;
  height: 64px;
  color: #11151a;
  focus-color: #11151a;
  font-size: 44px;
  font-weight: bold;
  background-color: transparent;
}

.danger .tv-box-exit-button-text {
  color: #ffffff;
  focus-color: #11151a;
}

.active .tv-box-exit-button-text {
  color: #11151a;
}

.tv-box-exit-footer {
  width: 960px;
  height: 46px;
  margin-top: 58px;
  color: rgba(255, 255, 255, 0.62);
  font-size: 30px;
  background-color: transparent;
}
</style>
