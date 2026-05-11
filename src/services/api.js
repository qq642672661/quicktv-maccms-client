import testLogger from './testLogger.js'

const API_BASE_URL = 'http://192.168.10.133:8080/api.php/provide/vod'

export default {
  async request(url, options = {}) {
    const startTime = Date.now()
    const token = this.getToken()
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    }
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    try {
      const response = await fetch(`${API_BASE_URL}${url}`, {
        ...options,
        headers
      })
      
      const data = await response.json()
      
      const duration = Date.now() - startTime
      testLogger.logApiCall(url, options.method || 'GET', duration, response.ok)
      
      if (!response.ok) {
        testLogger.logError(new Error(data.message || '请求失败'), `API: ${url}`)
        throw new Error(data.message || '请求失败')
      }
      
      return data
    } catch (error) {
      const duration = Date.now() - startTime
      testLogger.logApiCall(url, options.method || 'GET', duration, false)
      testLogger.logError(error, `API: ${url}`)
      console.error('API请求错误:', error)
      throw error
    }
  },

  getToken() {
    return global.$app.$def.dataApp.token || ''
  },

  setToken(token) {
    global.$app.$def.dataApp.token = token
  },

  clearToken() {
    global.$app.$def.dataApp.token = ''
  },

  async getVideos(page = 1, limit = 20, typeId = null) {
    let url = `/videos?page=${page}&limit=${limit}`
    if (typeId) {
      url += `&type_id=${typeId}`
    }
    return this.request(url)
  },

  async getVideoDetail(id) {
    return this.request(`/videos/${id}`)
  },

  async searchVideos(keyword, page = 1, limit = 20) {
    return this.request(`/videos/search?keyword=${encodeURIComponent(keyword)}&page=${page}&limit=${limit}`)
  },

  async getVideoTypes() {
    return this.request('/videos/types')
  },

  async getLiveChannels() {
    return this.request('/live/channels')
  },

  async login(username, password) {
    return this.request('/admin/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    })
  },

  async getAdminStats() {
    return this.request('/admin/stats')
  },

  async updateVideo(id, data) {
    return this.request(`/admin/videos/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    })
  },

  async deleteVideo(id) {
    return this.request(`/admin/videos/${id}`, {
      method: 'DELETE'
    })
  },

  async syncVideos() {
    return this.request('/admin/sync', {
      method: 'POST'
    })
  }
}
