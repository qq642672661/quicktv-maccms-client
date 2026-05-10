import { replacePlaceholders } from '../../tools/common'
import { CommentApi, Comment, CommentListResponse, CommentLikeResponse } from './interface'
import {
  addCommentUrl,
  replyCommentUrl,
  deleteCommentUrl,
  likeCommentUrl,
  unlikeCommentUrl,
  getCommentListUrl,
  getCommentRepliesUrl
} from './request-url'
import requestManager from '../../tools/request'

class CommentManager implements CommentApi {
  addComment(videoId: string, userId: string, content: string, parentId?: string): Promise<Comment> {
    return requestManager.post(addCommentUrl, {
      videoId,
      userId,
      content,
      parentId,
      createTime: Date.now()
    })
  }

  replyComment(commentId: string, userId: string, content: string): Promise<Comment> {
    return requestManager.post(
      replacePlaceholders(replyCommentUrl, {
        commentId
      }),
      {
        userId,
        content,
        createTime: Date.now()
      }
    )
  }

  deleteComment(commentId: string, userId: string): Promise<any> {
    return requestManager.delete(
      replacePlaceholders(deleteCommentUrl, {
        commentId,
        userId
      })
    )
  }

  likeComment(commentId: string, userId: string): Promise<CommentLikeResponse> {
    return requestManager.post(
      replacePlaceholders(likeCommentUrl, {
        commentId
      }),
      {
        userId
      }
    )
  }

  unlikeComment(commentId: string, userId: string): Promise<CommentLikeResponse> {
    return requestManager.post(
      replacePlaceholders(unlikeCommentUrl, {
        commentId
      }),
      {
        userId
      }
    )
  }

  getCommentList(videoId: string, page: number = 1, limit: number = 20, sortBy: 'time' | 'hot' = 'time'): Promise<CommentListResponse> {
    return requestManager.get(
      replacePlaceholders(getCommentListUrl, {
        videoId,
        page,
        limit,
        sortBy
      })
    )
  }

  getCommentReplies(commentId: string, page: number = 1, limit: number = 10): Promise<CommentListResponse> {
    return requestManager.get(
      replacePlaceholders(getCommentRepliesUrl, {
        commentId,
        page,
        limit
      })
    )
  }
}

const commentManager = new CommentManager()
export default commentManager
