import { QTWaterfallItem } from '@quicktvui/quicktvui3'
import { BasePaginationAdapter } from '../core/base-adapter'
import { MacCMSVideo, MacCMSPlaySource } from '../types'

export interface VideoItem extends QTWaterfallItem {
  id: string
  title: string
  subTitle?: string
  cover: string
  score?: string
  remarks?: string
  year?: string
  area?: string
  type?: string
  actor?: string
  director?: string
  description?: string
  playUrl?: string
  playSources?: MacCMSPlaySource[]
}

export class VideoAdapter extends BasePaginationAdapter<MacCMSVideo, VideoItem> {
  adapt(source: MacCMSVideo): VideoItem {
    return {
      id: String(source.vod_id),
      title: source.vod_name,
      subTitle: source.vod_sub || source.vod_remarks,
      cover: this.normalizeCoverUrl(source.vod_pic),
      score: source.vod_score || source.vod_douban_score,
      remarks: source.vod_remarks,
      year: source.vod_year,
      area: source.vod_area,
      type: source.type_name,
      actor: source.vod_actor,
      director: source.vod_director,
      description: this.stripHtml(source.vod_content || source.vod_blurb),
      playSources: this.parsePlaySources(source),
      imageUrl: this.normalizeCoverUrl(source.vod_pic),
      text: source.vod_name,
      focusImageUrl: this.normalizeCoverUrl(source.vod_pic)
    }
  }

  private normalizeCoverUrl(url: string): string {
    if (!url) return ''
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url
    }
    return url
  }

  private stripHtml(html: string): string {
    if (!html) return ''
    return html.replace(/<[^>]*>/g, '').trim()
  }

  private parsePlaySources(video: MacCMSVideo): MacCMSPlaySource[] {
    const sources: MacCMSPlaySource[] = []
    
    if (!video.vod_play_from || !video.vod_play_url) {
      return sources
    }

    const fromList = video.vod_play_from.split('$$$')
    const urlList = video.vod_play_url.split('$$$')

    fromList.forEach((from, index) => {
      if (urlList[index]) {
        const urls = urlList[index].split('#').map(item => {
          const [title, url] = item.split('$')
          return { title: title || '', url: url || '' }
        }).filter(item => item.url)

        if (urls.length > 0) {
          sources.push({
            name: from,
            urls
          })
        }
      }
    })

    return sources
  }

  adaptToDetail(source: MacCMSVideo): VideoItem {
    const baseItem = this.adapt(source)
    return {
      ...baseItem,
      description: this.stripHtml(source.vod_content),
      playSources: this.parsePlaySources(source)
    }
  }
}

export const videoAdapter = new VideoAdapter()
