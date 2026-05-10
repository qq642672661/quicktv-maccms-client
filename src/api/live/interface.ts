export interface LiveChannel {
  id: string
  name: string
  logo: string
  streamUrl: string
  category: string
  status: 'online' | 'offline' | 'maintenance'
  viewerCount: number
  quality: string[]
  description?: string
  tags?: string[]
  sortOrder: number
}

export interface LiveCategory {
  id: string
  name: string
  icon?: string
  channelCount: number
}

export interface LiveChannelListResponse {
  total: number
  items: LiveChannel[]
  categories: LiveCategory[]
}

export interface LiveStreamInfo {
  channelId: string
  streamUrl: string
  quality: string
  protocol: string
  bitrate?: number
}

export interface LiveViewStats {
  channelId: string
  viewerCount: number
  peakViewers: number
  totalViews: number
  avgWatchTime: number
}

export interface LiveApi {
  getChannelList(category?: string, page?: number, limit?: number): Promise<LiveChannelListResponse>
  getChannelDetail(channelId: string): Promise<LiveChannel>
  getStreamInfo(channelId: string, quality?: string): Promise<LiveStreamInfo>
  updateChannelStatus(channelId: string, status: 'online' | 'offline' | 'maintenance'): Promise<any>
  getViewStats(channelId: string): Promise<LiveViewStats>
  recordView(channelId: string, deviceId: string): Promise<any>
  getCategoryList(): Promise<LiveCategory[]>
}
