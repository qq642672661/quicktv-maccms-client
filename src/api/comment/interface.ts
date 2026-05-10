export interface Comment {
  id: string
  videoId: string
  userId: string
  userName: string
  userAvatar?: string
  content: string
  createTime: number
  likeCount: number
  replyCount: number
  parentId?: string
  isLiked?: boolean
  replies?: Comment[]
}

export interface CommentListResponse {
  total: number
  items: Comment[]
}

export interface CommentLikeResponse {
  success: boolean
  likeCount: number
}

export interface CommentApi {
  addComment(videoId: string, userId: string, content: string, parentId?: string): Promise<Comment>
  replyComment(commentId: string, userId: string, content: string): Promise<Comment>
  deleteComment(commentId: string, userId: string): Promise<any>
  likeComment(commentId: string, userId: string): Promise<CommentLikeResponse>
  unlikeComment(commentId: string, userId: string): Promise<CommentLikeResponse>
  getCommentList(videoId: string, page?: number, limit?: number, sortBy?: 'time' | 'hot'): Promise<CommentListResponse>
  getCommentReplies(commentId: string, page?: number, limit?: number): Promise<CommentListResponse>
}
