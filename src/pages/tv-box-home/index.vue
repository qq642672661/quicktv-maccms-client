<template>
  <qt-view class="tv-box-home-page">
    <qt-view class="tv-box-home-header" :focusable="false">
      <qt-text class="tv-box-home-kicker" text="HelloTV" :focusable="false" />
      <qt-text class="tv-box-home-title" text="电视盒子简易模式" :focusable="false" />
      <qt-text class="tv-box-home-subtitle" text="打开就是常用入口，遥控器方向键移动，OK 进入。" :focusable="false" />
    </qt-view>

    <qt-view class="tv-box-home-actions" :focusable="false">
      <qt-view
        v-for="(item, index) in actions"
        :key="item.action"
        :class="['tv-box-home-card', item.tone, { active: activeIndex === index }]"
        :focusable="true"
        :requestFocus="index === 0"
        :enableFocusBorder="true"
        :listenHasFocusChange="true"
        eventFocus
        eventClick
        @focus="onActionFocus(index)"
        @click="runAction(item.action)"
      >
        <qt-text class="tv-box-home-card-key" :text="item.shortKey" gravity="center" :focusable="false" />
        <qt-text class="tv-box-home-card-title" :text="item.title" :focusable="false" />
        <qt-text class="tv-box-home-card-hint" :text="item.hint" :focusable="false" />
      </qt-view>
    </qt-view>

    <qt-view class="tv-box-home-footer" :focusable="false">
      <qt-text class="tv-box-home-footer-text" text="数字键 1-6 直达常用入口；按 6 或 0、菜单、信息或帮助键查看自检。" :focusable="false" />
    </qt-view>
  </qt-view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ESKeyCode, ESKeyEvent } from '@extscreen/es3-core'
import { useESRouter } from '@extscreen/es3-router'
import launch from '../../tools/launch'
import { isRemoteConfirmKey, isRemoteHelpKey, moveGridSelection, remoteNumberFromKeyCode } from '../../tools/tv-box/remote-control'

type SimpleAction = 'live' | 'search' | 'history' | 'camera' | 'classic' | 'help'

interface SimpleHomeAction {
  shortKey: string
  title: string
  hint: string
  action: SimpleAction
  tone: string
}

const router = useESRouter()
const activeIndex = ref(0)
const columnCount = 3

const actions: SimpleHomeAction[] = [
  { shortKey: '1', title: '看电视', hint: '直接进入直播频道', action: 'live', tone: 'tone-live' },
  { shortKey: '2', title: '找节目', hint: '搜索片名和关键词', action: 'search', tone: 'tone-search' },
  { shortKey: '3', title: '继续看', hint: '打开最近观看记录', action: 'history', tone: 'tone-history' },
  { shortKey: '4', title: '摄像头', hint: '检测电视盒子摄像头', action: 'camera', tone: 'tone-camera' },
  { shortKey: '5', title: '全部内容', hint: '进入原完整首页', action: 'classic', tone: 'tone-classic' },
  { shortKey: '6', title: '帮助自检', hint: '看不懂就进这里', action: 'help', tone: 'tone-help' }
]

function onActionFocus(index: number) {
  setActiveIndex(index)
}

function setActiveIndex(index: number) {
  activeIndex.value = Math.max(0, Math.min(index, actions.length - 1))
}

function runAction(action: SimpleAction) {
  switch (action) {
    case 'live':
      launch.launchLive()
      break
    case 'search':
      launch.launchSearch()
      break
    case 'history':
      router.push({ name: 'history' })
      break
    case 'camera':
      launch.launchCameraSetup()
      break
    case 'classic':
      launch.launchHome()
      break
    case 'help':
      launch.launchTvBoxHelp()
      break
  }
}

function onKeyDown(keyEvent: ESKeyEvent) {
  const keyCode = Number(keyEvent.keyCode)
  const remoteNumber = remoteNumberFromKeyCode(keyCode)
  if (remoteNumber === 0 || isRemoteHelpKey(keyCode)) {
    launch.launchTvBoxHelp()
    return
  }
  if (remoteNumber !== null && remoteNumber >= 1 && remoteNumber <= actions.length) {
    const actionIndex = remoteNumber - 1
    setActiveIndex(actionIndex)
    runAction(actions[actionIndex].action)
    return
  }

  const nextIndex = moveGridSelection(activeIndex.value, actions.length, columnCount, keyCode)
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
      runAction(actions[activeIndex.value].action)
      break
  }
}

function onBackPressed() {
  launch.launchTvBoxExit()
}

defineExpose({ onKeyDown, onBackPressed })
</script>

<style scoped>
.tv-box-home-page {
  width: 1920px;
  height: 1080px;
  background-color: #171b20;
}

.tv-box-home-header {
  position: absolute;
  left: 96px;
  top: 70px;
  width: 1728px;
  height: 220px;
  background-color: transparent;
}

.tv-box-home-kicker {
  width: 420px;
  height: 42px;
  color: rgba(255, 255, 255, 0.62);
  font-size: 34px;
  background-color: transparent;
}

.tv-box-home-title {
  width: 850px;
  height: 92px;
  color: #ffffff;
  font-size: 72px;
  font-weight: bold;
  background-color: transparent;
}

.tv-box-home-subtitle {
  width: 1080px;
  height: 54px;
  color: rgba(255, 255, 255, 0.72);
  font-size: 34px;
  background-color: transparent;
}

.tv-box-home-actions {
  position: absolute;
  left: 96px;
  top: 314px;
  width: 1728px;
  height: 560px;
  flex-direction: row;
  flex-wrap: wrap;
  background-color: transparent;
}

.tv-box-home-card {
  width: 520px;
  height: 230px;
  margin-right: 36px;
  margin-bottom: 36px;
  padding-left: 42px;
  padding-right: 42px;
  justify-content: center;
  border-radius: 8px;
  background-color: rgba(255, 255, 255, 0.1);
  focus-background-color: #ffffff;
}

.tv-box-home-card-key {
  width: 56px;
  height: 42px;
  margin-bottom: 8px;
  color: rgba(255, 255, 255, 0.82);
  focus-color: #101419;
  font-size: 32px;
  font-weight: bold;
  background-color: rgba(255, 255, 255, 0.18);
  border-radius: 8px;
}

.tv-box-home-card.active {
  background-color: #f1c84c;
}

.active .tv-box-home-card-key {
  color: #101419;
  background-color: rgba(16, 20, 25, 0.12);
}

.tv-box-home-card-title {
  width: 420px;
  height: 70px;
  color: #ffffff;
  focus-color: #101419;
  font-size: 54px;
  font-weight: bold;
  background-color: transparent;
}

.active .tv-box-home-card-title {
  color: #101419;
}

.tv-box-home-card-hint {
  width: 420px;
  height: 48px;
  margin-top: 18px;
  color: rgba(255, 255, 255, 0.68);
  focus-color: rgba(16, 20, 25, 0.72);
  font-size: 30px;
  background-color: transparent;
}

.active .tv-box-home-card-hint {
  color: rgba(16, 20, 25, 0.72);
}

.tone-live {
  background-color: rgba(227, 66, 52, 0.32);
}

.tone-search {
  background-color: rgba(52, 122, 235, 0.28);
}

.tone-history {
  background-color: rgba(37, 151, 104, 0.28);
}

.tone-camera {
  background-color: rgba(232, 176, 50, 0.3);
}

.tone-classic {
  background-color: rgba(255, 255, 255, 0.12);
}

.tone-help {
  background-color: rgba(122, 94, 218, 0.28);
}

.tv-box-home-footer {
  position: absolute;
  left: 96px;
  bottom: 72px;
  width: 1728px;
  height: 74px;
  justify-content: center;
  background-color: rgba(255, 255, 255, 0.06);
  border-radius: 8px;
}

.tv-box-home-footer-text {
  width: 1600px;
  height: 48px;
  color: rgba(255, 255, 255, 0.72);
  font-size: 30px;
  background-color: transparent;
}
</style>
