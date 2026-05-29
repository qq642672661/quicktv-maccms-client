import { 
  MacCMSBaseResponse, 
  MacCMSVideo, 
  MacCMSCategory, 
  MacCMSFilterParams,
  MacCMSSearchParams,
  MacCMSApiAction 
} from '../types'
import { videoAdapter, VideoItem } from '../video/video-adapter'
import { categoryAdapter, CategoryItem } from '../category/category-adapter'
import { PaginationResult } from '../core/base-adapter'

export class MacCMSApi {
  private baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
  }

  setBaseUrl(url: string) {
    this.baseUrl = url.replace(/\/$/, '')
  }

  getBaseUrl(): string {
    return this.baseUrl
  }

  private buildUrl(endpoint: string, params?: Record<string, any>): string {
    const url = new URL(`${this.baseUrl}${endpoint}`)
    if (params) {
      Object.keys(params).forEach(key => {
        const value = params[key]
        if (value !== undefined && value !== null && value !== '') {
          url.searchParams.append(key, String(value))
        }
      })
    }
    return url.toString()
  }

  private async request<T>(url: string): Promise<MacCMSBaseResponse<T>> {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    const data = await response.json()
    return data
  }

  async getVideoList(params: MacCMSFilterParams = {}): Promise<PaginationResult<VideoItem>> {
    const url = this.buildUrl('/api.php/provide/vod/', {
      ac: params.ac || MacCMSApiAction.LIST,
      t: params.t,
      pg: params.pg || 1,
      h: params.h,
      wd: params.wd,
      ids: params.ids,
      at: params.at,
      ct: params.ct,
      year: params.year,
      area: params.area,
      lang: params.lang,
      letter: params.letter,
      by: params.by,
      sort: params.sort,
      limit: params.limit
    })

    const response = await this.request<MacCMSVideo>(url)
    return videoAdapter.adaptPagination(response)
  }

  async getVideoDetail(id: string | number): Promise<VideoItem | null> {
    const url = this.buildUrl('/api.php/provide/vod/', {
      ac: MacCMSApiAction.DETAIL,
      ids: id
    })

    const response = await this.request<MacCMSVideo>(url)
    if (response.list && response.list.length > 0) {
      return videoAdapter.adaptToDetail(response.list[0])
    }
    return null
  }

  async searchVideos(params: MacCMSSearchParams): Promise<PaginationResult<VideoItem>> {
    const url = this.buildUrl('/api.php/provide/vod/', {
      ac: params.ac || MacCMSApiAction.LIST,
      wd: params.wd,
      t: params.t,
      pg: params.pg || 1,
      limit: params.limit
    })

    const response = await this.request<MacCMSVideo>(url)
    return videoAdapter.adaptPagination(response)
  }

  async getCategoryList(): Promise<CategoryItem[]> {
    const url = this.buildUrl('/api.php/provide/vod/', {
      ac: 'list'
    })

    const response = await this.request<MacCMSCategory>(url)
    if (response.class) {
      return categoryAdapter.adaptList(response.class)
    }
    return []
  }

  async getVideosByCategory(
    categoryId: number | string, 
    page: number = 1, 
    limit: number = 20
  ): Promise<PaginationResult<VideoItem>> {
    return this.getVideoList({
      t: categoryId,
      pg: page,
      limit
    })
  }

  async getRecommendVideos(limit: number = 10): Promise<VideoItem[]> {
    const result = await this.getVideoList({
      by: 'hits',
      sort: 'desc',
      limit
    })
    return result.data
  }

  async getLatestVideos(limit: number = 10): Promise<VideoItem[]> {
    const result = await this.getVideoList({
      by: 'time',
      sort: 'desc',
      limit
    })
    return result.data
  }
}

export const createMacCMSApi = (baseUrl: string) => new MacCMSApi(baseUrl)
