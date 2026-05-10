import { replacePlaceholders } from '../../tools/common'
import { FavoriteApi, FavoriteItem, FavoriteListResponse, FavoriteStatusResponse } from './interface'
import {
  addFavoriteUrl,
  removeFavoriteUrl,
  getFavoriteListUrl,
  checkFavoriteStatusUrl,
  clearFavoritesUrl
} from './request-url'
import requestManager from '../../tools/request'

class FavoriteManager implements FavoriteApi {
  addFavorite(deviceId: string, videoId: string, videoInfo: Partial<FavoriteItem>): Promise<any> {
    return requestManager.post(addFavoriteUrl, {
      deviceId,
      videoId,
      ...videoInfo,
      addTime: Date.now()
    })
  }

  removeFavorite(deviceId: string, favoriteId: string): Promise<any> {
    return requestManager.delete(
      replacePlaceholders(removeFavoriteUrl, {
        deviceId,
        favoriteId
      })
    )
  }

  getFavoriteList(deviceId: string, page: number = 1, limit: number = 20, category?: string): Promise<FavoriteListResponse> {
    return requestManager.get(
      replacePlaceholders(getFavoriteListUrl, {
        deviceId,
        page,
        limit,
        category: category || ''
      })
    )
  }

  checkFavoriteStatus(deviceId: string, videoId: string): Promise<FavoriteStatusResponse> {
    return requestManager.get(
      replacePlaceholders(checkFavoriteStatusUrl, {
        deviceId,
        videoId
      })
    )
  }

  clearFavorites(deviceId: string): Promise<any> {
    return requestManager.delete(
      replacePlaceholders(clearFavoritesUrl, {
        deviceId
      })
    )
  }
}

const favoriteManager = new FavoriteManager()
export default favoriteManager
