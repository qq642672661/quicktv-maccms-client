export const TV_BOX_LIVE_FAVORITES_STORAGE_KEY = 'tv_box_live_favorite_channel_ids'
export const LIVE_FAVORITE_TOGGLE_NUMBER = 7
export const LIVE_FAVORITE_FILTER_NUMBER = 8

export type LiveFavoriteChannel = Record<string, any>

export function liveChannelId(channel: LiveFavoriteChannel | null | undefined, fallbackIndex = 0): string {
  const rawId = channel?.channelId ?? channel?.id ?? channel?.code ?? channel?.name ?? fallbackIndex + 1
  return String(rawId)
}

export function parseLiveFavoriteIds(rawValue: string): string[] {
  try {
    const parsed = JSON.parse(rawValue || '[]')
    if (!Array.isArray(parsed)) return []
    return Array.from(new Set(parsed.map((item) => String(item)).filter(Boolean)))
  } catch {
    return []
  }
}

export function serializeLiveFavoriteIds(ids: string[]): string {
  return JSON.stringify(Array.from(new Set(ids.map((item) => String(item)).filter(Boolean))))
}

export function toggleLiveFavoriteId(ids: string[], channelId: string): { ids: string[]; isFavorite: boolean } {
  const safeChannelId = String(channelId || '')
  if (!safeChannelId) return { ids, isFavorite: false }

  const uniqueIds = Array.from(new Set(ids.map((item) => String(item)).filter(Boolean)))
  if (uniqueIds.includes(safeChannelId)) {
    return {
      ids: uniqueIds.filter((item) => item !== safeChannelId),
      isFavorite: false
    }
  }

  return {
    ids: [...uniqueIds, safeChannelId],
    isFavorite: true
  }
}

export function decorateLiveFavorites<T extends LiveFavoriteChannel>(channels: T[], favoriteIds: string[]): T[] {
  const favoriteSet = new Set(favoriteIds.map((item) => String(item)))
  return channels.map((channel, index) => {
    const isFavorite = favoriteSet.has(liveChannelId(channel, index))
    return {
      ...channel,
      isFavorite,
      favoriteLabel: isFavorite ? '收藏' : ''
    }
  })
}

export function filterLiveFavorites<T extends LiveFavoriteChannel>(channels: T[], favoriteIds: string[]): T[] {
  const favoriteSet = new Set(favoriteIds.map((item) => String(item)))
  return channels.filter((channel, index) => favoriteSet.has(liveChannelId(channel, index)))
}

export function firstPlayableLiveIndex(channels: LiveFavoriteChannel[], preferredChannelId = ''): number {
  if (channels.length <= 0) return 0
  if (preferredChannelId) {
    const preferredIndex = channels.findIndex((channel, index) => liveChannelId(channel, index) === preferredChannelId)
    if (preferredIndex >= 0) return preferredIndex
  }
  return 0
}

