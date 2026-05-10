import BuildConfig from '../../config/build-config'

export const getChannelListUrl = BuildConfig.requestBaseUrl + '/api/live/channels?category=${category}&page=${page}&limit=${limit}'
export const getChannelDetailUrl = BuildConfig.requestBaseUrl + '/api/live/channels/${channelId}'
export const getStreamInfoUrl = BuildConfig.requestBaseUrl + '/api/live/channels/${channelId}/stream?quality=${quality}'
export const updateChannelStatusUrl = BuildConfig.requestBaseUrl + '/api/live/channels/${channelId}/status'
export const getViewStatsUrl = BuildConfig.requestBaseUrl + '/api/live/channels/${channelId}/stats'
export const recordViewUrl = BuildConfig.requestBaseUrl + '/api/live/channels/${channelId}/view'
export const getCategoryListUrl = BuildConfig.requestBaseUrl + '/api/live/categories'
