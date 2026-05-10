export interface Item {
  id: string
  title: string
  coverH: string
  coverV: string
  episodeId: string
  episode: number
  totalDuration: number
  viewedDuration: number
  jumpParams: {
    type: number
    options: object
  }

  _timestamp: number
  _type?: 'history' | 'favorite'
  _action?: 'add' | 'del'
  _delOptions?: { platformId: string; metaId: string; assetLongId: string }
}

export interface Records {
  total: number
  items: Item[]
}

export interface PlayHistoryRecord {
  id: string
  videoId: string
  videoTitle: string
  episodeId: string
  episodeTitle: string
  coverUrl: string
  playProgress: number
  totalDuration: number
  lastPlayTime: number
  deviceId: string
}

export interface ContinuePlayInfo {
  videoId: string
  episodeId: string
  playProgress: number
  canContinue: boolean
}

export interface HistoryApi {
  getRecords(deviceId: string, type: 'history' | 'favorite', page?: number, limit?: number): Promise<Records>
  delRecords(deviceId: string, type: 'history' | 'favorite', recordId?: string): Promise<any>
  addPlayHistory(deviceId: string, record: Partial<PlayHistoryRecord>): Promise<any>
  getPlayHistory(deviceId: string, page?: number, limit?: number): Promise<{ total: number; items: PlayHistoryRecord[] }>
  clearPlayHistory(deviceId: string): Promise<any>
  deletePlayHistoryItem(deviceId: string, recordId: string): Promise<any>
  getContinuePlayInfo(deviceId: string, videoId: string): Promise<ContinuePlayInfo>
  updatePlayProgress(deviceId: string, recordId: string, progress: number, duration: number): Promise<any>
}
