<template>
  <qt-view class="remote-practice-page">
      <qt-view class="remote-practice-header" :focusable="false">
      <qt-text class="remote-practice-kicker" text="遥控器练习" :focusable="false" />
      <qt-text class="remote-practice-title" text="跟着电视按三下就会用" :focusable="false" />
      <qt-text class="remote-practice-subtitle" text="先按方向键，再按 OK；屏幕会显示按键码，遇到不认识的遥控器就拍照发维护人员。" :focusable="false" />
    </qt-view>

    <qt-view class="remote-practice-step" :focusable="false">
      <qt-text class="remote-practice-step-label" text="现在练习" :focusable="false" />
      <qt-text class="remote-practice-step-title" :text="stepTitle" :focusable="false" />
      <qt-text class="remote-practice-step-hint" :text="stepHint" :focusable="false" />
    </qt-view>

    <qt-view class="remote-practice-pad" :focusable="false">
      <qt-view
        v-for="(item, index) in padCells"
        :key="index"
        :class="['remote-practice-pad-cell', item.tone, { active: activePadIndex === index }]"
        :focusable="false"
      >
        <qt-text class="remote-practice-pad-text" :text="item.label" gravity="center" :focusable="false" />
      </qt-view>
    </qt-view>

    <qt-view class="remote-practice-feedback" :focusable="false">
      <qt-text class="remote-practice-feedback-label" text="刚刚按键" :focusable="false" />
      <qt-text class="remote-practice-feedback-text" :text="lastKeyText" :focusable="false" />
      <qt-text class="remote-practice-progress" :text="progressText" :focusable="false" />
    </qt-view>

    <qt-view class="remote-practice-actions" :focusable="false">
      <qt-view class="remote-practice-action" :focusable="false">
        <qt-text class="remote-practice-action-key" text="1" gravity="center" :focusable="false" />
        <qt-text class="remote-practice-action-text" text="重新开始" :focusable="false" />
      </qt-view>
      <qt-view class="remote-practice-action secondary" :focusable="false">
        <qt-text class="remote-practice-action-key" text="2" gravity="center" :focusable="false" />
        <qt-text class="remote-practice-action-text" text="返回首页" :focusable="false" />
      </qt-view>
      <qt-view class="remote-practice-action secondary" :focusable="false">
        <qt-text class="remote-practice-action-key" text="3" gravity="center" :focusable="false" />
        <qt-text class="remote-practice-action-text" text="帮助自检" :focusable="false" />
      </qt-view>
    </qt-view>
  </qt-view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { ESKeyEvent } from '@extscreen/es3-core'
import launch from '../../tools/launch'
import {
  isRemoteConfirmKey,
  isRemoteHelpKey,
  remoteKeyLabelFromKeyCode,
  remoteMoveDirectionFromKeyCode,
  remoteNumberFromKeyCode,
  type RemoteMoveDirection
} from '../../tools/tv-box/remote-control'

type PracticeStage = 'move' | 'confirm' | 'ready'

interface PadCell {
  label: string
  tone: string
}

const padCells: PadCell[] = [
  { label: '', tone: 'empty' },
  { label: '上', tone: 'move' },
  { label: '', tone: 'empty' },
  { label: '左', tone: 'move' },
  { label: 'OK', tone: 'confirm' },
  { label: '右', tone: 'move' },
  { label: '', tone: 'empty' },
  { label: '下', tone: 'move' },
  { label: '', tone: 'empty' }
]

const stage = ref<PracticeStage>('move')
const activePadIndex = ref(4)
const moveCount = ref(0)
const confirmCount = ref(0)
const lastKeyText = ref('还没有按键，请先试方向键。')

const stepTitle = computed(() => {
  if (stage.value === 'move') return '按任意方向键'
  if (stage.value === 'confirm') return '按 OK'
  return '已经会基本操作'
})

const stepHint = computed(() => {
  if (stage.value === 'move') return '按上、下、左、右任意一个键，屏幕会亮起对应方向。'
  if (stage.value === 'confirm') return '按 OK 或确认键，屏幕中间会亮起。'
  return '日常只记住方向键移动、OK 进入、返回回上一步。'
})

const progressText = computed(() => `方向键 ${moveCount.value} 次 / OK ${confirmCount.value} 次`)

function resetPractice() {
  stage.value = 'move'
  activePadIndex.value = 4
  moveCount.value = 0
  confirmCount.value = 0
  lastKeyText.value = '已重新开始，请先试方向键。'
}

function padIndexForDirection(direction: RemoteMoveDirection): number {
  switch (direction) {
    case 'up':
      return 1
    case 'left':
      return 3
    case 'right':
      return 5
    case 'down':
      return 7
  }
}

function formatKeyCodeText(keyCode: number): string {
  return `${remoteKeyLabelFromKeyCode(keyCode)} / keyCode ${keyCode}`
}

function recordMove(direction: RemoteMoveDirection, keyCode: number) {
  activePadIndex.value = padIndexForDirection(direction)
  moveCount.value += 1
  lastKeyText.value = `方向键 ${directionText(direction)} 成功：${formatKeyCodeText(keyCode)}。`
  if (stage.value === 'move') {
    stage.value = 'confirm'
  }
}

function recordConfirm(keyCode: number) {
  activePadIndex.value = 4
  confirmCount.value += 1
  lastKeyText.value = `OK / 确认键成功：${formatKeyCodeText(keyCode)}。`
  stage.value = 'ready'
}

function directionText(direction: RemoteMoveDirection): string {
  switch (direction) {
    case 'up':
      return '上'
    case 'left':
      return '左'
    case 'right':
      return '右'
    case 'down':
      return '下'
  }
}

function onKeyDown(keyEvent: ESKeyEvent) {
  const keyCode = Number(keyEvent.keyCode)
  const remoteNumber = remoteNumberFromKeyCode(keyCode)
  if (remoteNumber === 0 || remoteNumber === 6 || isRemoteHelpKey(keyCode)) {
    launch.launchTvBoxHelp()
    return
  }
  if (remoteNumber === 1) {
    resetPractice()
    return
  }
  if (remoteNumber === 2) {
    launch.launchTvBoxHome()
    return
  }
  if (remoteNumber === 3) {
    launch.launchTvBoxHelp()
    return
  }

  const direction = remoteMoveDirectionFromKeyCode(keyCode)
  if (direction) {
    recordMove(direction, keyCode)
    return
  }

  if (isRemoteConfirmKey(keyCode)) {
    recordConfirm(keyCode)
    return
  }

  lastKeyText.value = `识别到 ${formatKeyCodeText(keyCode)}，请试方向键、OK 或返回；未知键请拍照。`
}

function onBackPressed() {
  lastKeyText.value = `返回键成功：${formatKeyCodeText(4)}，正在回首页。`
  launch.launchTvBoxHome()
}

defineExpose({ onKeyDown, onBackPressed })
</script>

<style scoped>
.remote-practice-page {
  width: 1920px;
  height: 1080px;
  background-color: #15191f;
}

.remote-practice-header {
  position: absolute;
  left: 96px;
  top: 72px;
  width: 1728px;
  height: 196px;
  background-color: transparent;
}

.remote-practice-kicker {
  width: 520px;
  height: 46px;
  color: rgba(255, 255, 255, 0.64);
  font-size: 34px;
  background-color: transparent;
}

.remote-practice-title {
  width: 980px;
  height: 86px;
  color: #ffffff;
  font-size: 66px;
  font-weight: bold;
  background-color: transparent;
}

.remote-practice-subtitle {
  width: 1280px;
  height: 54px;
  margin-top: 16px;
  color: rgba(255, 255, 255, 0.72);
  font-size: 32px;
  background-color: transparent;
}

.remote-practice-step {
  position: absolute;
  left: 96px;
  top: 292px;
  width: 700px;
  height: 390px;
  padding-left: 44px;
  justify-content: center;
  border-radius: 8px;
  background-color: rgba(241, 200, 76, 0.16);
}

.remote-practice-step-label {
  width: 280px;
  height: 44px;
  color: #f1c84c;
  font-size: 30px;
  font-weight: bold;
  background-color: transparent;
}

.remote-practice-step-title {
  width: 600px;
  height: 82px;
  color: #ffffff;
  font-size: 60px;
  font-weight: bold;
  background-color: transparent;
}

.remote-practice-step-hint {
  width: 600px;
  height: 96px;
  margin-top: 18px;
  color: rgba(255, 255, 255, 0.78);
  font-size: 30px;
  background-color: transparent;
}

.remote-practice-pad {
  position: absolute;
  left: 900px;
  top: 270px;
  width: 780px;
  height: 468px;
  flex-direction: row;
  flex-wrap: wrap;
  background-color: transparent;
}

.remote-practice-pad-cell {
  width: 220px;
  height: 130px;
  margin-right: 24px;
  margin-bottom: 24px;
  justify-content: center;
  border-radius: 8px;
  background-color: rgba(255, 255, 255, 0.1);
}

.remote-practice-pad-cell.empty {
  background-color: rgba(255, 255, 255, 0.04);
}

.remote-practice-pad-cell.active {
  background-color: #f1c84c;
}

.remote-practice-pad-text {
  width: 180px;
  height: 70px;
  color: #ffffff;
  font-size: 48px;
  font-weight: bold;
  background-color: transparent;
}

.active .remote-practice-pad-text {
  color: #11151a;
}

.remote-practice-feedback {
  position: absolute;
  left: 96px;
  top: 782px;
  width: 1728px;
  height: 72px;
  padding-left: 30px;
  flex-direction: row;
  align-items: center;
  border-radius: 8px;
  background-color: rgba(255, 255, 255, 0.08);
}

.remote-practice-feedback-label {
  width: 150px;
  height: 42px;
  color: #f1c84c;
  font-size: 28px;
  font-weight: bold;
  background-color: transparent;
}

.remote-practice-feedback-text {
  width: 1040px;
  height: 42px;
  color: rgba(255, 255, 255, 0.84);
  font-size: 30px;
  background-color: transparent;
}

.remote-practice-progress {
  width: 420px;
  height: 42px;
  color: rgba(255, 255, 255, 0.62);
  font-size: 26px;
  background-color: transparent;
}

.remote-practice-actions {
  position: absolute;
  left: 96px;
  top: 892px;
  width: 1728px;
  height: 110px;
  flex-direction: row;
  background-color: transparent;
}

.remote-practice-action {
  width: 330px;
  height: 96px;
  margin-right: 28px;
  flex-direction: row;
  justify-content: center;
  align-items: center;
  border-radius: 8px;
  background-color: #f1c84c;
}

.remote-practice-action.secondary {
  background-color: rgba(255, 255, 255, 0.12);
}

.remote-practice-action-key {
  width: 42px;
  height: 42px;
  margin-right: 12px;
  color: #11151a;
  font-size: 28px;
  font-weight: bold;
  background-color: rgba(17, 21, 26, 0.12);
  border-radius: 8px;
}

.secondary .remote-practice-action-key {
  color: #ffffff;
  background-color: rgba(255, 255, 255, 0.16);
}

.remote-practice-action-text {
  width: 210px;
  height: 50px;
  color: #11151a;
  font-size: 34px;
  font-weight: bold;
  background-color: transparent;
}

.secondary .remote-practice-action-text {
  color: #ffffff;
}
</style>
