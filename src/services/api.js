/**
 * API服务模块
 * 提供与后端服务器通信的所有API接口
 * 功能：
 * 1. 统一的HTTP请求封装
 * 2. Token认证管理
 * 3. 视频相关API（列表、详情、搜索）
 * 4. 直播相关API（频道列表、搜索）
 * 5. 管理后台API（登录、统计、同步）
 */

// API基础URL：后端服务器地址
const API_BASE_URL = 'http://192.168.10.133:3000/api'

export default {
  /**
   * 统一的HTTP请求方法
   * 封装fetch API，添加认证、错误处理等功能
   * @param {String} url - 请求路径（相对于API_BASE_URL）
   * @param {Object} options - 请求选项（method、headers、body等）
   * @returns {Promise} 返回解析后的JSON数据
   */
  async request(url, options = {}) {
    // 获取当前用户的认证Token
    const token = this.getToken()
    // 设置请求头：默认JSON格式，合并自定义headers
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    }

    // 如果Token存在，添加到请求头中
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    try {
      // 发送HTTP请求
      const response = await fetch(`${API_BASE_URL}${url}`, {
        ...options,
        headers
      })

      // 解析响应JSON数据
      const data = await response.json()

      // 检查HTTP状态码，非2xx状态抛出错误
      if (!response.ok) {
        throw new Error(data.message || '请求失败')
      }

      return data
    } catch (error) {
      console.error('API请求错误:', error)
      throw error
    }
  },

  /**
   * 获取认证Token
   * 从全局应用数据中读取Token
   * @returns {String} 认证Token字符串
   */
  getToken() {
    return global.$app.$def.dataApp.token || ''
  },

  /**
   * 设置认证Token
   * 将Token保存到全局应用数据中
   * @param {String} token - 认证Token
   */
  setToken(token) {
    global.$app.$def.dataApp.token = token
  },

  /**
   * 清除认证Token
   * 用于用户登出时清除认证信息
   */
  clearToken() {
    global.$app.$def.dataApp.token = ''
  },

  // ==================== 视频相关API ====================

  /**
   * 获取视频列表
   * 支持分页和分类筛选
   * @param {Number} page - 页码，默认1
   * @param {Number} limit - 每页数量，默认20
   * @param {Number|null} typeId - 分类ID，null表示全部
   * @returns {Promise} 返回视频列表数据
   */
  async getVideos(page = 1, limit = 20, typeId = null) {
    let url = `/vod/content?page=${page}&limit=${limit}`
    // 如果指定了分类，添加分类参数
    if (typeId) {
      url += `&category=${typeId}`
    }
    return this.request(url)
  },

  /**
   * 获取视频详情
   * 根据视频ID获取完整的视频信息
   * @param {Number} id - 视频ID
   * @returns {Promise} 返回视频详情数据
   */
  async getVideoDetail(id) {
    return this.request(`/vod/content/${id}`)
  },

  /**
   * 搜索视频
   * 根据关键词搜索视频，支持分页
   * @param {String} keyword - 搜索关键词
   * @param {Number} page - 页码，默认1
   * @param {Number} limit - 每页数量，默认20
   * @returns {Promise} 返回搜索结果
   */
  async searchVideos(keyword, page = 1, limit = 20) {
    return this.request(`/vod/content?keyword=${encodeURIComponent(keyword)}&page=${page}&limit=${limit}`)
  },

  /**
   * 获取视频分类列表
   * 获取所有可用的视频分类
   * @returns {Promise} 返回分类列表
   */
  async getVideoTypes() {
    return this.request('/vod/categories')
  },

  // ==================== 直播相关API ====================

  /**
   * 获取直播频道列表
   * 支持按分类筛选和分页
   * @param {String|null} category - 频道分类，null表示全部
   * @param {Number} page - 页码，默认1
   * @param {Number} limit - 每页数量，默认20
   * @returns {Promise} 返回频道列表数据
   */
  async getLiveChannels(category = null, page = 1, limit = 20) {
    let url = `/live/channels?page=${page}&limit=${limit}`
    // 如果指定了分类，添加分类参数
    if (category) {
      url += `&category=${category}`
    }
    return this.request(url)
  },

  /**
   * 获取直播频道详情
   * 根据频道ID获取频道的详细信息
   * @param {String} channelId - 频道ID
   * @returns {Promise} 返回频道详情数据
   */
  async getLiveChannelDetail(channelId) {
    return this.request(`/live/channels/${channelId}`)
  },

  /**
   * 搜索直播频道
   * 根据关键词搜索频道，支持分页
   * @param {String} keyword - 搜索关键词
   * @param {Number} page - 页码，默认1
   * @param {Number} limit - 每页数量，默认20
   * @returns {Promise} 返回搜索结果
   */
  async searchLiveChannels(keyword, page = 1, limit = 20) {
    return this.request(`/live/channels?keyword=${encodeURIComponent(keyword)}&page=${page}&limit=${limit}`)
  },

  /**
   * 获取直播分类列表
   * 获取所有可用的直播频道分类
   * @returns {Promise} 返回分类列表
   */
  async getLiveCategories() {
    return this.request('/live/categories')
  },

  /**
   * 记录直播观看
   * 记录用户观看某个直播频道的行为，用于统计
   * @param {String} channelId - 频道ID
   * @param {String} deviceId - 设备ID
   * @returns {Promise} 返回记录结果
   */
  async recordLiveView(channelId, deviceId) {
    return this.request(`/live/channels/${channelId}/view`, {
      method: 'POST',
      body: JSON.stringify({ deviceId })
    })
  },

  /**
   * 记录视频观看
   * 记录用户观看某个视频的行为，用于统计
   * @param {String} contentId - 视频ID
   * @param {String} deviceId - 设备ID
   * @returns {Promise} 返回记录结果
   */
  async recordVodView(contentId, deviceId) {
    return this.request(`/vod/content/${contentId}/view`, {
      method: 'POST',
      body: JSON.stringify({ deviceId })
    })
  },

  // ==================== 管理后台API ====================

  /**
   * 管理员登录
   * 使用用户名和密码进行登录认证
   * @param {String} username - 用户名
   * @param {String} password - 密码
   * @returns {Promise} 返回登录结果，包含Token
   */
  async login(username, password) {
    return this.request('/admin/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    })
  },

  /**
   * 获取管理后台统计数据
   * 获取视频数量、频道数量、观看统计等信息
   * @returns {Promise} 返回统计数据
   */
  async getAdminStats() {
    return this.request('/admin/stats')
  },

  /**
   * 更新视频信息
   * 管理员更新视频的元数据
   * @param {Number} id - 视频ID
   * @param {Object} data - 要更新的数据
   * @returns {Promise} 返回更新结果
   */
  async updateVideo(id, data) {
    return this.request(`/admin/videos/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    })
  },

  /**
   * 删除视频
   * 管理员删除指定的视频
   * @param {Number} id - 视频ID
   * @returns {Promise} 返回删除结果
   */
  async deleteVideo(id) {
    return this.request(`/admin/videos/${id}`, {
      method: 'DELETE'
    })
  },

  /**
   * 同步视频数据
   * 从MacCMS资源站同步最新的视频数据
   * @returns {Promise} 返回同步结果
   */
  async syncVideos() {
    return this.request('/admin/sync', {
      method: 'POST'
    })
  }
}
