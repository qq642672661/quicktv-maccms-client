export interface FavoriteItem {
  id: string
  videoId: string
  videoTitle: string
  coverUrl: string
  episodeCount: number
  latestEpisode: string
  addTime: number
  deviceId: string
  category?: string
  tags?: string[]
}

export interface FavoriteListResponse {
  total: number
  items: FavoriteItem[]
}

export interface FavoriteStatusResponse {
  isFavorite: boolean
  favoriteId?: string
}

export interface FavoriteApi {
  addFavorite(deviceId: string, videoId: string, videoInfo: Partial<FavoriteItem>): Promise<any>
  removeFavorite(deviceId: string, favoriteId: string): Promise<any>
  getFavoriteList(deviceId: string, page?: number, limit?: number, category?: string): Promise<FavoriteListResponse>
  checkFavoriteStatus(deviceId: string, videoId: string): Promise<FavoriteStatusResponse>
  clearFavorites(deviceId: string): Promise<any>
}
