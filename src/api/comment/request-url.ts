import BuildConfig from '../../config/build-config'

export const addCommentUrl = BuildConfig.requestBaseUrl + '/api/comment/add'
export const replyCommentUrl = BuildConfig.requestBaseUrl + '/api/comment/${commentId}/reply'
export const deleteCommentUrl = BuildConfig.requestBaseUrl + '/api/comment/${commentId}?userId=${userId}'
export const likeCommentUrl = BuildConfig.requestBaseUrl + '/api/comment/${commentId}/like'
export const unlikeCommentUrl = BuildConfig.requestBaseUrl + '/api/comment/${commentId}/unlike'
export const getCommentListUrl = BuildConfig.requestBaseUrl + '/api/comment/${videoId}?page=${page}&limit=${limit}&sortBy=${sortBy}'
export const getCommentRepliesUrl = BuildConfig.requestBaseUrl + '/api/comment/${commentId}/replies?page=${page}&limit=${limit}'
