import BuildConfig from '../../../config/build-config'

export const historyRecordsUrl =
  BuildConfig.requestBaseUrl + '/records?id=${deviceId}&type=${type}&page=${page}&limit=${limit}&sort=${sort}'
export const DelHistoryRecordsUrl = BuildConfig.requestBaseUrl + '/records/${deviceId}?recordId=${recordId}&recordType=${type}'
export const generateRecordsUrl = BuildConfig.requestBaseUrl + '/records/generate'

export const addPlayHistoryUrl = BuildConfig.requestBaseUrl + '/api/play-history/add'
export const getPlayHistoryUrl = BuildConfig.requestBaseUrl + '/api/play-history/${deviceId}?page=${page}&limit=${limit}'
export const clearPlayHistoryUrl = BuildConfig.requestBaseUrl + '/api/play-history/${deviceId}/clear'
export const deletePlayHistoryItemUrl = BuildConfig.requestBaseUrl + '/api/play-history/${deviceId}/item/${recordId}'
export const getContinuePlayInfoUrl = BuildConfig.requestBaseUrl + '/api/play-history/${deviceId}/continue/${videoId}'
export const updatePlayProgressUrl = BuildConfig.requestBaseUrl + '/api/play-history/${deviceId}/progress/${recordId}'
