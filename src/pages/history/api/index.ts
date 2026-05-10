import { replacePlaceholders } from '../../../tools/common'
import { HistoryApi, Records, PlayHistoryRecord, ContinuePlayInfo } from './interface'
import { 
  DelHistoryRecordsUrl, 
  generateRecordsUrl, 
  historyRecordsUrl,
  addPlayHistoryUrl,
  getPlayHistoryUrl,
  clearPlayHistoryUrl,
  deletePlayHistoryItemUrl,
  getContinuePlayInfoUrl,
  updatePlayProgressUrl
} from './request-url'
import requestManager from '../../../tools/request'

class HistoryManager implements HistoryApi {
  getRecords(deviceId: string, type: 'history' | 'favorite', page?: number, limit?: number): Promise<Records> {
    return requestManager.get(
      replacePlaceholders(historyRecordsUrl, {
        deviceId,
        type,
        page,
        limit
      })
    )
  }

  delRecords(deviceId: string, type: 'history' | 'favorite', recordId?: string): Promise<any> {
    return requestManager.delete(
      replacePlaceholders(DelHistoryRecordsUrl, {
        deviceId,
        type,
        recordId
      })
    )
  }

  generateRecords(deviceId: string, type: 'history' | 'favorite'): Promise<any> {
    return requestManager.post(generateRecordsUrl, { deviceId, recordType: type })
  }

  addPlayHistory(deviceId: string, record: Partial<PlayHistoryRecord>): Promise<any> {
    return requestManager.post(addPlayHistoryUrl, { 
      deviceId, 
      ...record,
      lastPlayTime: Date.now()
    })
  }

  getPlayHistory(deviceId: string, page: number = 1, limit: number = 20): Promise<{ total: number; items: PlayHistoryRecord[] }> {
    return requestManager.get(
      replacePlaceholders(getPlayHistoryUrl, {
        deviceId,
        page,
        limit
      })
    )
  }

  clearPlayHistory(deviceId: string): Promise<any> {
    return requestManager.delete(
      replacePlaceholders(clearPlayHistoryUrl, {
        deviceId
      })
    )
  }

  deletePlayHistoryItem(deviceId: string, recordId: string): Promise<any> {
    return requestManager.delete(
      replacePlaceholders(deletePlayHistoryItemUrl, {
        deviceId,
        recordId
      })
    )
  }

  getContinuePlayInfo(deviceId: string, videoId: string): Promise<ContinuePlayInfo> {
    return requestManager.get(
      replacePlaceholders(getContinuePlayInfoUrl, {
        deviceId,
        videoId
      })
    )
  }

  updatePlayProgress(deviceId: string, recordId: string, progress: number, duration: number): Promise<any> {
    return requestManager.post(
      replacePlaceholders(updatePlayProgressUrl, {
        deviceId,
        recordId
      }),
      { progress, duration }
    )
  }
}

const historyManager = new HistoryManager()
export default historyManager
