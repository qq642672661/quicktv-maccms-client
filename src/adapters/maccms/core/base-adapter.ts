import { MacCMSBaseResponse } from '../types'

export abstract class BaseAdapter<TSource, TTarget> {
  abstract adapt(source: TSource): TTarget
  
  adaptList(sourceList: TSource[]): TTarget[] {
    return sourceList.map(item => this.adapt(item))
  }
  
  adaptResponse<T>(response: MacCMSBaseResponse<TSource>, adaptFn?: (item: TSource) => T): MacCMSBaseResponse<T> {
    return {
      ...response,
      list: response.list ? (adaptFn ? response.list.map(adaptFn) : response.list as any) : undefined
    }
  }
}

export interface PaginationParams {
  page: number
  limit: number
}

export interface PaginationResult<T> {
  data: T[]
  total: number
  page: number
  pageCount: number
  hasMore: boolean
}

export abstract class BasePaginationAdapter<TSource, TTarget> extends BaseAdapter<TSource, TTarget> {
  adaptPagination(response: MacCMSBaseResponse<TSource>): PaginationResult<TTarget> {
    const list = response.list || []
    const total = response.total || 0
    const page = response.page || 1
    const limit = parseInt(response.limit || '20')
    const pageCount = response.pagecount || Math.ceil(total / limit)
    
    return {
      data: this.adaptList(list),
      total,
      page,
      pageCount,
      hasMore: page < pageCount
    }
  }
}
