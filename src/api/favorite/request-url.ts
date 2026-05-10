import BuildConfig from '../../config/build-config'

export const addFavoriteUrl = BuildConfig.requestBaseUrl + '/api/favorite/add'
export const removeFavoriteUrl = BuildConfig.requestBaseUrl + '/api/favorite/${deviceId}/remove/${favoriteId}'
export const getFavoriteListUrl = BuildConfig.requestBaseUrl + '/api/favorite/${deviceId}?page=${page}&limit=${limit}&category=${category}'
export const checkFavoriteStatusUrl = BuildConfig.requestBaseUrl + '/api/favorite/${deviceId}/status/${videoId}'
export const clearFavoritesUrl = BuildConfig.requestBaseUrl + '/api/favorite/${deviceId}/clear'
