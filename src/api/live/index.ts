import { replacePlaceholders } from '../../tools/common'
import { 
  LiveApi, 
  LiveChannel, 
  LiveChannelListResponse, 
  LiveStreamInfo, 
  LiveViewStats,
  LiveCategory
} from './interface'
import {
  getChannelListUrl,
  getChannelDetailUrl,
  getStreamInfoUrl,
  updateChannelStatusUrl,
  getViewStatsUrl,
  recordViewUrl,
  getCategoryListUrl
} from './request-url'
import requestManager from '../../tools/request'

class LiveManager implements LiveApi {
  getChannelList(category?: string, page: number = 1, limit: number = 20): Promise<LiveChannelListResponse> {
    return requestManager.get(
      replacePlaceholders(getChannelListUrl, {
        category: category || '',
        page,
        limit
      })
    )
  }

  getChannelDetail(channelId: string): Promise<LiveChannel> {
    return requestManager.get(
      replacePlaceholders(getChannelDetailUrl, {
        channelId
      })
    )
  }

  getStreamInfo(channelId: string, quality?: string): Promise<LiveStreamInfo> {
    return requestManager.get(
      replacePlaceholders(getStreamInfoUrl, {
        channelId,
        quality: quality || 'auto'
      })
    )
  }

  updateChannelStatus(channelId: string, status: 'online' | 'offline' | 'maintenance'): Promise<any> {
    return requestManager.post(
      replacePlaceholders(updateChannelStatusUrl, {
        channelId
      }),
      { status }
    )
  }

  getViewStats(channelId: string): Promise<LiveViewStats> {
    return requestManager.get(
      replacePlaceholders(getViewStatsUrl, {
        channelId
      })
    )
  }

  recordView(channelId: string, deviceId: string): Promise<any> {
    return requestManager.post(
      replacePlaceholders(recordViewUrl, {
        channelId
      }),
      { deviceId, timestamp: Date.now() }
    )
  }

  getCategoryList(): Promise<LiveCategory[]> {
    return requestManager.get(getCategoryListUrl)
  }
}

const liveManager = new LiveManager()
export default liveManager
