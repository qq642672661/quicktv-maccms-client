<template>
  <qt-view class="live">
    <!-- 全屏播放 -->
    <player-live ref="playerRef" @closeMenu="closeMenu" />
    <qt-view v-show="favoriteOnly" class="live-favorite-mode" :focusable="false">
      <qt-text class="live-favorite-mode-text" text="只看收藏频道" gravity="center" :focusable="false"></qt-text>
    </qt-view>
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
import { ESKeyEvent, ESKeyCode, useESLocalStorage, useESToast } from '@extscreen/es3-core'
import { mockMediaList, mockCategories, mockChannels, mockPrograms } from './mock/index'
import liveManager from '../../api/live'
import playerLive from './components/player/index.vue'
import channelMenu from './components/menu/index.vue'
import launch from '../../tools/launch'
import { isRemoteConfirmKey, isRemoteHelpKey, isRemoteMediaKey, remoteNumberFromKeyCode } from '../../tools/tv-box/remote-control'
import {
  decorateLiveFavorites,
  filterLiveFavorites,
  firstPlayableLiveIndex,
  liveChannelId,
  LIVE_FAVORITE_FILTER_NUMBER,
  LIVE_FAVORITE_TOGGLE_NUMBER,
  parseLiveFavoriteIds,
  serializeLiveFavoriteIds,
  toggleLiveFavoriteId,
  TV_BOX_LIVE_FAVORITES_STORAGE_KEY
} from '../../tools/tv-box/live-favorites'

const toast = useESToast()
const localStore = useESLocalStorage()
const playerRef = ref()
const menuRef = ref()
const showMenu = ref(false)
const favoriteOnly = ref(false)
const favoriteIds = ref<string[]>([])

let allMediaList: any[] = []
let allCategories: any[] = []
let allChannels: any[] = []
let currentMediaList: any[] = []
let currentChannels: any[] = []

onMounted(async () => {
  favoriteIds.value = await loadFavoriteIds()

  try {
    const channelsData = await liveManager.getChannelList('', 1, 50)
    const categories = await liveManager.getCategoryList()

    if (channelsData && channelsData.items) {
      const mediaList = channelsData.items.map(normalizeMediaChannel)
      const menuChannels = channelsData.items.map((channel: any, index: number) => normalizeMenuChannel(channel, index, categories || []))
      const categoryList = normalizeCategories(categories || channelsData.categories || [], menuChannels)
      setLiveData({ mediaList, categories: categoryList, channels: menuChannels })
      toast.showToast(`已加载 ${mediaList.length} 个真实频道`)
    } else {
      setMockLiveData()
      toast.showToast('使用 Mock 数据')
    }
  } catch (error) {
    console.error('加载频道失败:', error)
    setMockLiveData()
    toast.showToast('加载失败，使用 Mock 数据')
  }
})

async function loadFavoriteIds(): Promise<string[]> {
  try {
    const rawValue = await localStore.getItem(TV_BOX_LIVE_FAVORITES_STORAGE_KEY, '[]')
    return parseLiveFavoriteIds(rawValue)
  } catch {
    return []
  }
}

async function saveFavoriteIds(ids: string[]) {
  try {
    await localStore.setItem(TV_BOX_LIVE_FAVORITES_STORAGE_KEY, serializeLiveFavoriteIds(ids))
  } catch {
    toast.showToast('收藏保存失败，请稍后再试')
  }
}

function normalizeMediaChannel(channel: any, index: number) {
  const channelId = liveChannelId(channel, index)
  const channelName = channel.channelName || channel.name || `频道${index + 1}`
  const streamUrl = channel.mediaSourceList?.list?.[0]?.uri || channel.streamUrl || channel.stream_url || channel.url || ''
  return {
    ...channel,
    id: channelId,
    name: channelName,
    channelId,
    channelName,
    program: channel.program || channel.description || '直播中',
    nextProgram: channel.nextProgram || '',
    isVip: Boolean(channel.isVip || channel.vip),
    mediaSourceList: channel.mediaSourceList || {
      index: 0,
      list: streamUrl ? [{ uri: streamUrl }] : []
    }
  }
}

function normalizeMenuChannel(channel: any, index: number, categories: any[]) {
  const mediaChannel = normalizeMediaChannel(channel, index)
  return {
    ...mediaChannel,
    type: 1,
    categoryIndex: resolveCategoryIndex(channel, categories)
  }
}

function resolveCategoryIndex(channel: any, categories: any[]) {
  if (typeof channel.categoryIndex === 'number') return channel.categoryIndex
  if (!categories.length || categories[0]?.type) return 0

  const matchedIndex = categories.findIndex((category: any) => (
    category.id === channel.category ||
    category.id === channel.categoryId ||
    category.name === channel.category ||
    category.name === channel.categoryName
  ))
  return matchedIndex >= 0 ? matchedIndex : 0
}

function normalizeCategories(categories: any[], channels: any[]) {
  if (!categories.length) {
    return [{ type: 2, name: '全部频道', startIndex: 0 }]
  }
  if (categories[0]?.type) return categories

  return categories.map((category: any, index: number) => {
    const startIndex = channels.findIndex((channel) => channel.categoryIndex === index)
    return {
      ...category,
      type: 2,
      name: category.name || `分类${index + 1}`,
      startIndex: startIndex >= 0 ? startIndex : 0
    }
  })
}

function setMockLiveData() {
  const mediaList = mockMediaList.map(normalizeMediaChannel)
  const playableChannelIds = new Set(mediaList.map((channel, index) => liveChannelId(channel, index)))
  const channels = mockChannels
    .filter((channel, index) => playableChannelIds.has(liveChannelId(channel, index)))
    .map((channel, index) => normalizeMenuChannel(channel, index, mockCategories))
  setLiveData({ mediaList, categories: mockCategories, channels })
}

function setLiveData(params: { mediaList: any[]; categories: any[]; channels: any[] }) {
  allMediaList = params.mediaList
  allCategories = params.categories
  allChannels = params.channels
  applyLiveView()
}

function favoriteCategory() {
  return [{ type: 2, name: '我的收藏', startIndex: 0 }]
}

function applyLiveView(preferredChannelId = '') {
  let nextMediaList = favoriteOnly.value ? filterLiveFavorites(allMediaList, favoriteIds.value) : allMediaList
  let nextChannels = favoriteOnly.value ? filterLiveFavorites(allChannels, favoriteIds.value) : allChannels

  if (favoriteOnly.value && nextMediaList.length <= 0) {
    favoriteOnly.value = false
    nextMediaList = allMediaList
    nextChannels = allChannels
    toast.showToast('还没有收藏频道，已显示全部频道')
  }

  currentMediaList = decorateLiveFavorites(nextMediaList, favoriteIds.value)
  currentChannels = decorateLiveFavorites(nextChannels, favoriteIds.value).map((channel) => ({
    ...channel,
    categoryIndex: favoriteOnly.value ? 0 : channel.categoryIndex
  }))

  const initialIndex = firstPlayableLiveIndex(currentMediaList, preferredChannelId)
  const categories = favoriteOnly.value ? favoriteCategory() : allCategories
  playerRef.value?.init({ mediaList: currentMediaList, initialIndex })
  menuRef.value?.init({ categories, channels: currentChannels, playIndex: initialIndex })
}

function findChannelName(channelId: string) {
  const channel = allMediaList.find((item, index) => liveChannelId(item, index) === channelId)
  return channel?.channelName || channel?.name || `频道 ${channelId}`
}

function activeChannelId() {
  if (showMenu.value) {
    return menuRef.value?.getFocusedChannelId?.() || playerRef.value?.getCurrentMediaId?.() || ''
  }
  return playerRef.value?.getCurrentMediaId?.() || ''
}

async function toggleFavoriteForActiveChannel() {
  const channelId = activeChannelId()
  if (!channelId) {
    toast.showToast('还没有可收藏的频道')
    return
  }
  const playingChannelId = playerRef.value?.getCurrentMediaId?.() || channelId

  const result = toggleLiveFavoriteId(favoriteIds.value, channelId)
  favoriteIds.value = result.ids
  await saveFavoriteIds(favoriteIds.value)

  if (favoriteOnly.value && !result.isFavorite && favoriteIds.value.length <= 0) {
    favoriteOnly.value = false
  }

  applyLiveView(playingChannelId)
  toast.showToast(`${findChannelName(channelId)}${result.isFavorite ? '已加入收藏' : '已取消收藏'}`)
}

function toggleFavoriteOnlyMode() {
  if (!favoriteOnly.value && favoriteIds.value.length <= 0) {
    toast.showToast('先打开频道列表，按 7 收藏一个频道')
    return
  }

  favoriteOnly.value = !favoriteOnly.value
  applyLiveView(playerRef.value?.getCurrentMediaId?.())
  toast.showToast(favoriteOnly.value ? '只看收藏频道' : '已显示全部频道')
}

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

function handleRemoteMediaKey(keyCode: number): boolean {
  if (!isRemoteMediaKey(keyCode)) return false
  const result = playerRef.value?.handleRemoteMediaKey?.(keyCode)
  if (result === 'paused') {
    toast.showToast('已暂停，按播放键继续')
    return true
  }
  if (result === 'played') {
    toast.showToast('继续播放')
    return true
  }
  return false
}

function onKeyDown(keyEvent: ESKeyEvent) {
  const keyCode = Number(keyEvent.keyCode)
  const remoteNumber = remoteNumberFromKeyCode(keyCode)
  if (remoteNumber === 0 || isRemoteHelpKey(keyCode)) {
    showMenu.value = false
    launch.launchTvBoxHelp()
    return
  }

  if (handleRemoteMediaKey(keyCode)) {
    return
  }

  if (showMenu.value && remoteNumber === LIVE_FAVORITE_TOGGLE_NUMBER) {
    toggleFavoriteForActiveChannel()
    return
  }

  if (showMenu.value && remoteNumber === LIVE_FAVORITE_FILTER_NUMBER) {
    toggleFavoriteOnlyMode()
    return
  }

  if (!showMenu.value && remoteNumber !== null && remoteNumber > 0) {
    const didPlay = playerRef.value?.playMediaByRemoteNumberKey?.(keyCode)
    const channelCount = playerRef.value?.getMediaCount?.() || 0
    toast.showToast(didPlay ? `已切到第 ${remoteNumber} 个频道` : `当前只有 ${channelCount} 个频道`)
    return
  }

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
      if (!showMenu.value) {
        showMenu.value = true
      }
      break
    case ESKeyCode.ES_KEYCODE_DPAD_RIGHT:
      if (showMenu.value) {
        menuRef.value.onKeyDown(keyEvent)
      } else {
        showMenu.value = true
        toast.showToast('已打开频道列表')
      }
      break
    case ESKeyCode.ES_KEYCODE_ENTER:
    case ESKeyCode.ES_KEYCODE_DPAD_CENTER:
      if (!showMenu.value) {
        showMenu.value = true
      }
      break
    default:
      if (isRemoteConfirmKey(Number(keyEvent.keyCode)) && !showMenu.value) {
        showMenu.value = true
      }
      break
  }
}

function onBackPressed() {
  if (showMenu.value) {
    closeMenu()
  } else {
    launch.launchTvBoxHome()
  }
}

function onESResume() {
  playerRef.value?.resume()
}

function onESDestroy() {
  playerRef.value?.stop()
}

defineExpose({ onKeyDown, onBackPressed, onESResume, onESDestroy })
</script>

<style scoped>
.live {
  width: 1920px;
  height: 1080px;
  background-color: transparent;
}

.live-favorite-mode {
  width: 260px;
  height: 64px;
  background-color: #ffd24a;
  border-radius: 32px;
  position: absolute;
  top: 54px;
  right: 72px;
  align-items: center;
  justify-content: center;
}

.live-favorite-mode-text {
  width: 220px;
  height: 64px;
  background-color: transparent;
  color: #1b1b1b;
  font-size: 30px;
}
</style>
