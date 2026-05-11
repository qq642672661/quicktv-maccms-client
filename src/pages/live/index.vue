<template>
  <qt-view class="live">
    <!-- 全屏播放 -->
    <player-live ref="playerRef" @closeMenu="closeMenu" />
    <!-- 频道列表 -->
    <channel-menu
      v-show="showMenu"
      ref="menuRef"
      @loadPrograms="loadPrograms"
      @playMediaByIndex="playMediaByIndex"
      @closeMenu="closeMenu"
    />
    <!-- 占位填充 -->
    <qt-view style="width: 1920px; height: 1080px; background-color: transparent" :focusable="false"></qt-view>
  </qt-view>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ESKeyEvent, ESKeyCode, useESToast } from '@extscreen/es3-core'
import { useESRouter } from '@extscreen/es3-router'
import { mockMediaList, mockCategories, mockChannels, mockPrograms } from './mock/index'
import liveManager from '../../api/live'
import playerLive from './components/player/index.vue'
import channelMenu from './components/menu/index.vue'

const toast = useESToast()
const router = useESRouter()
const playerRef = ref()
const menuRef = ref()
const showMenu = ref(false)

onMounted(async () => {
  try {
    const channelsData = await liveManager.getChannelList('', 1, 50)
    const categories = await liveManager.getCategoryList()
    
    if (channelsData && channelsData.data && channelsData.data.items) {
      const channels = channelsData.data.items.map((ch: any) => ({
        id: ch.id,
        name: ch.name,
        logo: ch.logo,
        url: ch.stream_url,
        category: ch.category,
        status: ch.status,
        viewerCount: ch.viewer_count
      }))
      
      playerRef.value?.init({ mediaList: channels })
      menuRef.value?.init({ categories: categories || mockCategories, channels })
      
      toast.showToast(`已加载 ${channels.length} 个真实频道`)
    } else {
      playerRef.value?.init({ mediaList: mockMediaList })
      menuRef.value?.init({ categories: mockCategories, channels: mockChannels })
      toast.showToast('使用 Mock 数据')
    }
  } catch (error) {
    console.error('加载频道失败:', error)
    playerRef.value?.init({ mediaList: mockMediaList })
    menuRef.value?.init({ categories: mockCategories, channels: mockChannels })
    toast.showToast('加载失败，使用 Mock 数据')
  }
})

function loadPrograms(channelId: string, callback: (channelId: string) => object) {
  callback(mockPrograms[channelId])
}

function playMediaByIndex(index: number) {
  playerRef.value?.playMediaByIndex(index)
}

function closeMenu() {
  showMenu.value = false
  menuRef.value?.onBackPressed()
}

function onKeyDown(keyEvent: ESKeyEvent) {
  switch (keyEvent.keyCode) {
    case ESKeyCode.ES_KEYCODE_DPAD_UP:
      if (!showMenu.value) {
        playerRef.value.onKeyDown(keyEvent)
      }
      break
    case ESKeyCode.ES_KEYCODE_DPAD_DOWN:
      if (!showMenu.value) {
        playerRef.value.onKeyDown(keyEvent)
      }
      break
    case ESKeyCode.ES_KEYCODE_DPAD_LEFT:
      break
    case ESKeyCode.ES_KEYCODE_DPAD_RIGHT:
      if (showMenu.value) {
        menuRef.value.onKeyDown(keyEvent)
      } else {
        toast.showToast('打开支付页')
      }
      break
    case ESKeyCode.ES_KEYCODE_DPAD_CENTER:
      if (!showMenu.value) {
        showMenu.value = true
      }
      break
  }
}

function onKeyUp(keyEvent: ESKeyEvent) {
  if (keyEvent.keyCode != ESKeyCode.ES_KEYCODE_BACK) {
    isBack = false
  }
}

let isBack = false
function onBackPressed() {
  if (showMenu.value) {
    isBack = false
    closeMenu()
  } else {
    if (isBack) {
      router.back()
    } else {
      isBack = true
      toast.showToast('再按一次返回退出')
    }
  }
}

function onESResume() {
  playerRef.value?.resume()
}

function onESDestroy() {
  playerRef.value?.stop()
}

defineExpose({ onKeyDown, onKeyUp, onBackPressed, onESResume, onESDestroy })
</script>

<style scoped>
.live {
  width: 1920px;
  height: 1080px;
  background-color: transparent;
}
</style>
