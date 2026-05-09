# MacCMS 适配器使用示例

本文档提供 MacCMS 适配器的实际使用示例。

## 基础使用

### 1. 初始化 API 客户端

```typescript
import { createMacCMSApi } from '@/adapters/maccms'
import envManager from '@/config/env-manager'

const maccmsApi = createMacCMSApi(envManager.maccmsApiUrl)
```

### 2. 获取视频列表

```typescript
const result = await maccmsApi.getVideoList({
  t: 1,
  pg: 1,
  limit: 20
})

console.log('视频列表:', result.data)
console.log('总数:', result.total)
console.log('是否还有更多:', result.hasMore)
```

### 3. 获取视频详情

```typescript
const video = await maccmsApi.getVideoDetail('123')

if (video) {
  console.log('视频标题:', video.title)
  console.log('播放源:', video.playSources)
}
```

### 4. 搜索视频

```typescript
const searchResult = await maccmsApi.searchVideos({
  wd: '战狼',
  pg: 1,
  limit: 10
})

console.log('搜索结果:', searchResult.data)
```

### 5. 获取分类列表

```typescript
const categories = await maccmsApi.getCategoryList()

categories.forEach(cat => {
  console.log(`${cat.id}: ${cat.name}`)
})
```

## 在 Vue 组件中使用

### 首页视频列表

```vue
<template>
  <div class="home">
    <div v-for="video in videos" :key="video.id">
      <img :src="video.cover" />
      <h3>{{ video.title }}</h3>
      <p>{{ video.remarks }}</p>
    </div>
  </div>
</template>

<script>
import { createMacCMSApi } from '@/adapters/maccms'
import envManager from '@/config/env-manager'

export default {
  data() {
    return {
      videos: [],
      loading: false
    }
  },
  
  async mounted() {
    await this.loadVideos()
  },
  
  methods: {
    async loadVideos() {
      this.loading = true
      try {
        const api = createMacCMSApi(envManager.maccmsApiUrl)
        const result = await api.getVideoList({
          pg: 1,
          limit: 20,
          by: 'time',
          sort: 'desc'
        })
        this.videos = result.data
      } catch (error) {
        console.error('加载失败:', error)
      } finally {
        this.loading = false
      }
    }
  }
}
</script>
```

### 视频详情页

```vue
<template>
  <div class="detail" v-if="video">
    <img :src="video.cover" class="cover" />
    <h1>{{ video.title }}</h1>
    <p>{{ video.description }}</p>
    
    <div class="play-sources">
      <div v-for="source in video.playSources" :key="source.name">
        <h3>{{ source.name }}</h3>
        <button 
          v-for="(url, index) in source.urls" 
          :key="index"
          @click="play(url.url)"
        >
          {{ url.title }}
        </button>
      </div>
    </div>
  </div>
</template>

<script>
import { createMacCMSApi } from '@/adapters/maccms'
import envManager from '@/config/env-manager'

export default {
  data() {
    return {
      video: null
    }
  },
  
  async mounted() {
    const videoId = this.$route.params.id
    await this.loadVideoDetail(videoId)
  },
  
  methods: {
    async loadVideoDetail(id) {
      try {
        const api = createMacCMSApi(envManager.maccmsApiUrl)
        this.video = await api.getVideoDetail(id)
      } catch (error) {
        console.error('加载详情失败:', error)
      }
    },
    
    play(url) {
      console.log('播放:', url)
    }
  }
}
</script>
```

### 搜索页面

```vue
<template>
  <div class="search">
    <input 
      v-model="keyword" 
      @input="onSearch"
      placeholder="搜索视频..."
    />
    
    <div v-for="video in searchResults" :key="video.id">
      <img :src="video.cover" />
      <h3>{{ video.title }}</h3>
    </div>
  </div>
</template>

<script>
import { createMacCMSApi } from '@/adapters/maccms'
import envManager from '@/config/env-manager'

export default {
  data() {
    return {
      keyword: '',
      searchResults: [],
      searchTimer: null
    }
  },
  
  methods: {
    onSearch() {
      clearTimeout(this.searchTimer)
      this.searchTimer = setTimeout(() => {
        this.performSearch()
      }, 500)
    },
    
    async performSearch() {
      if (!this.keyword.trim()) {
        this.searchResults = []
        return
      }
      
      try {
        const api = createMacCMSApi(envManager.maccmsApiUrl)
        const result = await api.searchVideos({
          wd: this.keyword,
          pg: 1,
          limit: 20
        })
        this.searchResults = result.data
      } catch (error) {
        console.error('搜索失败:', error)
      }
    }
  }
}
</script>
```

## 高级用法

### 分页加载

```typescript
class VideoListManager {
  private api: MacCMSApi
  private currentPage = 1
  private videos: VideoItem[] = []
  private hasMore = true
  
  constructor(apiUrl: string) {
    this.api = createMacCMSApi(apiUrl)
  }
  
  async loadMore(categoryId?: number) {
    if (!this.hasMore) return
    
    const result = await this.api.getVideoList({
      t: categoryId,
      pg: this.currentPage,
      limit: 20
    })
    
    this.videos.push(...result.data)
    this.hasMore = result.hasMore
    this.currentPage++
    
    return this.videos
  }
  
  reset() {
    this.currentPage = 1
    this.videos = []
    this.hasMore = true
  }
}
```

### 缓存管理

```typescript
class CachedMacCMSApi {
  private api: MacCMSApi
  private cache = new Map<string, any>()
  private cacheDuration = 5 * 60 * 1000
  
  constructor(apiUrl: string) {
    this.api = createMacCMSApi(apiUrl)
  }
  
  async getVideoList(params: any) {
    const cacheKey = JSON.stringify(params)
    const cached = this.cache.get(cacheKey)
    
    if (cached && Date.now() - cached.timestamp < this.cacheDuration) {
      return cached.data
    }
    
    const data = await this.api.getVideoList(params)
    this.cache.set(cacheKey, {
      data,
      timestamp: Date.now()
    })
    
    return data
  }
  
  clearCache() {
    this.cache.clear()
  }
}
```

### 错误处理

```typescript
async function safeGetVideoList(api: MacCMSApi, params: any) {
  try {
    return await api.getVideoList(params)
  } catch (error) {
    if (error.message.includes('timeout')) {
      console.error('请求超时，请检查网络连接')
    } else if (error.message.includes('404')) {
      console.error('API 端点不存在')
    } else {
      console.error('未知错误:', error)
    }
    
    return {
      data: [],
      total: 0,
      page: 1,
      pageCount: 0,
      hasMore: false
    }
  }
}
```

## 与现有代码集成

### 替换现有 API 调用

**原代码：**
```typescript
import requestManager from '@/tools/request'

const response = await requestManager.get('/home/tabs/1')
```

**新代码：**
```typescript
import { createMacCMSApi } from '@/adapters/maccms'
import envManager from '@/config/env-manager'

const api = createMacCMSApi(envManager.maccmsApiUrl)
const result = await api.getVideosByCategory(1, 1, 20)
```

### 适配现有数据结构

如果现有代码依赖特定的数据结构，可以创建适配函数：

```typescript
function adaptToLegacyFormat(videos: VideoItem[]) {
  return videos.map(video => ({
    id: video.id,
    name: video.title,
    pic: video.cover,
    remarks: video.remarks,
    // ... 其他字段映射
  }))
}
```

## 测试

### 单元测试示例

```typescript
import { describe, it, expect, vi } from 'vitest'
import { createMacCMSApi } from '@/adapters/maccms'

describe('MacCMSApi', () => {
  it('should fetch video list', async () => {
    const api = createMacCMSApi('http://test-api.com')
    
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 1,
        list: [
          { vod_id: 1, vod_name: 'Test Video' }
        ],
        total: 1
      })
    })
    
    const result = await api.getVideoList({ pg: 1 })
    
    expect(result.data).toHaveLength(1)
    expect(result.data[0].title).toBe('Test Video')
  })
})
```

## 相关文档

- [MacCMS 对接指南](./MACCMS_INTEGRATION.md)
- [项目架构文档](./ARCHITECTURE.md)
