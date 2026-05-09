# QuickTV MacCMS 企业级架构设计方案

## 目录

- [架构概述](#架构概述)
- [系统架构](#系统架构)
- [技术选型](#技术选型)
- [数据库设计](#数据库设计)
- [高并发方案](#高并发方案)
- [部署架构](#部署架构)
- [监控告警](#监控告警)
- [安全方案](#安全方案)
- [实施路线](#实施路线)

---

## 架构概述

### 设计目标

1. **高并发**：支持 10万+ 并发用户
2. **高可用**：99.9% 可用性保证
3. **可扩展**：水平扩展能力
4. **低延迟**：CDN 加速，响应时间 < 100ms
5. **易维护**：微服务架构，独立部署
6. **数据安全**：多重备份，容灾机制

### 核心指标

| 指标 | 目标值 | 说明 |
|------|--------|------|
| 并发用户 | 100,000+ | 同时在线用户数 |
| QPS | 50,000+ | 每秒请求数 |
| 响应时间 | < 100ms | API 平均响应时间 |
| 可用性 | 99.9% | 年度停机时间 < 8.76 小时 |
| 数据可靠性 | 99.999% | 数据不丢失 |
| 视频加载 | < 2s | 视频首屏加载时间 |

---

## 系统架构

### 整体架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                          用户层                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ 电视盒子  │  │ Android TV│  │  智能投影 │  │  Web管理  │       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                        CDN 层                                     │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  阿里云 CDN / 腾讯云 CDN / 七牛云 CDN                      │   │
│  │  - 静态资源加速                                            │   │
│  │  - 视频流加速                                              │   │
│  │  - 智能调度                                                │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      负载均衡层                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Nginx / HAProxy                                          │   │
│  │  - 负载均衡                                                │   │
│  │  - SSL 终止                                                │   │
│  │  - 限流熔断                                                │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      API 网关层                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Kong / Traefik                                           │   │
│  │  - 路由转发                                                │   │
│  │  - 认证鉴权                                                │   │
│  │  - 限流降级                                                │   │
│  │  - 日志监控                                                │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      微服务层                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ 用户服务  │  │ 内容服务  │  │ 播放服务  │  │ 统计服务  │       │
│  │ User     │  │ Content  │  │ Player   │  │ Analytics│       │
│  │ Service  │  │ Service  │  │ Service  │  │ Service  │       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ 直播服务  │  │ 点播服务  │  │ 搜索服务  │  │ 推荐服务  │       │
│  │ Live     │  │ VOD      │  │ Search   │  │ Recommend│       │
│  │ Service  │  │ Service  │  │ Service  │  │ Service  │       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      缓存层                                       │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Redis Cluster                                            │   │
│  │  - 热点数据缓存                                            │   │
│  │  - Session 存储                                            │   │
│  │  - 分布式锁                                                │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      数据层                                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │  MySQL   │  │ MongoDB  │  │Elasticsearch│ │  MinIO   │       │
│  │  主从复制 │  │  文档存储 │  │  全文搜索  │  │ 对象存储  │       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      监控层                                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │Prometheus│  │ Grafana  │  │  ELK     │  │ Sentry   │       │
│  │  指标监控 │  │  可视化   │  │  日志    │  │  错误追踪 │       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
└─────────────────────────────────────────────────────────────────┘
```

### 微服务划分

#### 1. 用户服务 (User Service)
- 用户注册/登录
- 用户信息管理
- 会员管理
- 权限控制

#### 2. 内容服务 (Content Service)
- 视频内容管理
- 分类管理
- 标签管理
- 内容审核

#### 3. 播放服务 (Player Service)
- 播放地址解析
- 播放权限验证
- 播放记录
- 断点续播

#### 4. 直播服务 (Live Service)
- 直播源管理
- 直播流推送
- 直播间管理
- 弹幕系统

#### 5. 点播服务 (VOD Service)
- 点播内容管理
- 视频转码
- 视频切片
- 多清晰度支持

#### 6. 搜索服务 (Search Service)
- 全文搜索
- 智能推荐
- 热词统计
- 搜索建议

#### 7. 统计服务 (Analytics Service)
- 用户行为分析
- 播放统计
- 热度排行
- 数据报表

#### 8. 推荐服务 (Recommend Service)
- 个性化推荐
- 协同过滤
- 内容推荐
- 热门推荐

---

## 技术选型

### 前端技术栈

#### 电视端 (quicktv-maccms-client)
```
- 框架：Vue 3.4 + QuickTVUI 1.2
- 渲染：Hippy 3.x
- 语言：TypeScript 5.x
- 状态管理：Pinia
- 路由：Vue Router
- 构建：Webpack 5
- 打包：Android APK
```

#### 管理后台 (quicktv-maccms-admin)
```
- 框架：Vue 3.4 + Vite 5.x
- UI 库：Element Plus 2.x
- 语言：TypeScript 5.x
- 状态管理：Pinia
- 路由：Vue Router 4.x
- 图表：ECharts 5.x
- 请求：Axios
- 构建：Vite
```

### 后端技术栈

#### API 服务 (quicktv-maccms-server)
```
- 运行时：Node.js 20 LTS
- 框架：Express 4.x / Fastify 4.x
- 语言：TypeScript 5.x
- ORM：Prisma / TypeORM
- 验证：Joi / Zod
- 认证：JWT + Passport
- 文档：Swagger / OpenAPI
- 测试：Jest + Supertest
```

### 数据库技术栈

#### 关系型数据库
```
- MySQL 8.0
  - 用户数据
  - 内容元数据
  - 订单数据
  - 主从复制
  - 分库分表
```

#### 缓存数据库
```
- Redis 7.x Cluster
  - 热点数据缓存
  - Session 存储
  - 分布式锁
  - 消息队列
  - 排行榜
```

#### 文档数据库
```
- MongoDB 7.x
  - 播放记录
  - 用户行为日志
  - 评论数据
  - 灵活数据存储
```

#### 搜索引擎
```
- Elasticsearch 8.x
  - 全文搜索
  - 日志分析
  - 实时统计
```

### 中间件技术栈

#### 消息队列
```
- RabbitMQ / Kafka
  - 异步任务
  - 事件驱动
  - 削峰填谷
```

#### 对象存储
```
- MinIO / 阿里云 OSS
  - 视频文件存储
  - 图片存储
  - 静态资源
```

#### 视频处理
```
- FFmpeg
  - 视频转码
  - 视频切片
  - 截图生成
```

---

## 数据库设计

### MySQL 数据库设计

#### 用户表 (users)
```sql
CREATE TABLE users (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(50) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  email VARCHAR(100),
  phone VARCHAR(20),
  avatar VARCHAR(255),
  vip_level INT DEFAULT 0,
  vip_expire_time DATETIME,
  status TINYINT DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_username (username),
  INDEX idx_phone (phone),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

#### 视频表 (videos)
```sql
CREATE TABLE videos (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  cover VARCHAR(255),
  category_id INT,
  tags VARCHAR(255),
  duration INT,
  play_count BIGINT DEFAULT 0,
  like_count INT DEFAULT 0,
  status TINYINT DEFAULT 1,
  vip_only TINYINT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_category (category_id),
  INDEX idx_status (status),
  INDEX idx_play_count (play_count),
  FULLTEXT idx_title (title)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

#### 播放记录表 (play_history)
```sql
CREATE TABLE play_history (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  video_id BIGINT NOT NULL,
  play_time INT DEFAULT 0,
  duration INT,
  device_type VARCHAR(50),
  ip VARCHAR(50),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user_video (user_id, video_id),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

#### 直播源表 (live_sources)
```sql
CREATE TABLE live_sources (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100),
  stream_url VARCHAR(500) NOT NULL,
  backup_url VARCHAR(500),
  logo VARCHAR(255),
  sort_order INT DEFAULT 0,
  status TINYINT DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_category (category),
  INDEX idx_status (status),
  INDEX idx_sort (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### Redis 缓存设计

#### 缓存键设计
```
# 用户信息
user:info:{user_id}                    # TTL: 1小时
user:session:{session_id}              # TTL: 7天

# 视频信息
video:info:{video_id}                  # TTL: 1小时
video:hot:list                         # TTL: 5分钟
video:recommend:{user_id}              # TTL: 30分钟

# 播放统计
video:play:count:{video_id}            # 永久
video:play:rank:daily                  # TTL: 1天
video:play:rank:weekly                 # TTL: 7天

# 直播源
live:sources:all                       # TTL: 10分钟
live:sources:category:{category}       # TTL: 10分钟

# 限流
rate:limit:{user_id}:{api}             # TTL: 1分钟
```

---

## 高并发方案

### 1. 缓存策略

#### 多级缓存
```
浏览器缓存 (1小时)
  ↓
CDN 缓存 (1天)
  ↓
Redis 缓存 (1小时)
  ↓
本地缓存 (5分钟)
  ↓
数据库
```

#### 缓存更新策略
- **Cache Aside**：读取时缓存，更新时删除
- **Write Through**：写入时同步更新缓存
- **Write Behind**：异步更新缓存

### 2. 数据库优化

#### 读写分离
```
写操作 → 主库 (Master)
读操作 → 从库 (Slave 1, Slave 2, Slave 3)
```

#### 分库分表
```
# 用户表按 user_id 分表
users_0, users_1, ..., users_99

# 播放记录按日期分表
play_history_202601, play_history_202602, ...
```

### 3. 负载均衡

#### Nginx 配置
```nginx
upstream api_servers {
    least_conn;
    server api1.example.com:3000 weight=3;
    server api2.example.com:3000 weight=3;
    server api3.example.com:3000 weight=2;
    server api4.example.com:3000 weight=2 backup;
}

server {
    listen 80;
    server_name api.example.com;
    
    location / {
        proxy_pass http://api_servers;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        
        # 限流
        limit_req zone=api burst=20 nodelay;
        
        # 超时
        proxy_connect_timeout 5s;
        proxy_send_timeout 10s;
        proxy_read_timeout 10s;
    }
}
```

### 4. 限流降级

#### 限流策略
```typescript
// 令牌桶算法
class TokenBucket {
  private tokens: number
  private capacity: number
  private refillRate: number
  
  async acquire(): Promise<boolean> {
    if (this.tokens > 0) {
      this.tokens--
      return true
    }
    return false
  }
}

// API 限流
@RateLimit({ points: 100, duration: 60 })
async getVideoList() {
  // ...
}
```

#### 熔断降级
```typescript
// Circuit Breaker
class CircuitBreaker {
  private failureCount = 0
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED'
  
  async execute(fn: Function) {
    if (this.state === 'OPEN') {
      throw new Error('Circuit breaker is OPEN')
    }
    
    try {
      const result = await fn()
      this.onSuccess()
      return result
    } catch (error) {
      this.onFailure()
      throw error
    }
  }
}
```

---

## 部署架构

### Docker 容器化

#### docker-compose.yml
```yaml
version: '3.8'

services:
  # API 服务
  api:
    image: quicktv-api:latest
    deploy:
      replicas: 4
      resources:
        limits:
          cpus: '2'
          memory: 2G
    environment:
      - NODE_ENV=production
      - DB_HOST=mysql
      - REDIS_HOST=redis
    ports:
      - "3000-3003:3000"
    networks:
      - quicktv-network
  
  # MySQL
  mysql:
    image: mysql:8.0
    volumes:
      - mysql-data:/var/lib/mysql
    environment:
      - MYSQL_ROOT_PASSWORD=${MYSQL_ROOT_PASSWORD}
    networks:
      - quicktv-network
  
  # Redis Cluster
  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis-data:/data
    networks:
      - quicktv-network
  
  # Nginx
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
    networks:
      - quicktv-network

volumes:
  mysql-data:
  redis-data:

networks:
  quicktv-network:
    driver: bridge
```

### Kubernetes 部署

#### deployment.yaml
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: quicktv-api
spec:
  replicas: 10
  selector:
    matchLabels:
      app: quicktv-api
  template:
    metadata:
      labels:
        app: quicktv-api
    spec:
      containers:
      - name: api
        image: quicktv-api:latest
        ports:
        - containerPort: 3000
        resources:
          requests:
            memory: "1Gi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "2000m"
        env:
        - name: NODE_ENV
          value: "production"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: quicktv-api-service
spec:
  selector:
    app: quicktv-api
  ports:
  - protocol: TCP
    port: 80
    targetPort: 3000
  type: LoadBalancer
```

---

## 监控告警

### Prometheus 监控

#### 监控指标
```yaml
# API 性能指标
- http_request_duration_seconds
- http_request_total
- http_request_errors_total

# 系统指标
- cpu_usage_percent
- memory_usage_bytes
- disk_usage_percent

# 业务指标
- active_users_total
- video_play_total
- video_play_duration_seconds
```

### Grafana 可视化

#### 仪表盘
1. **系统概览**
   - CPU/内存/磁盘使用率
   - 网络流量
   - 服务状态

2. **API 性能**
   - QPS
   - 响应时间
   - 错误率

3. **业务指标**
   - 在线用户数
   - 播放量
   - 热门视频

### 告警规则

```yaml
groups:
- name: api_alerts
  rules:
  - alert: HighErrorRate
    expr: rate(http_request_errors_total[5m]) > 0.05
    for: 5m
    annotations:
      summary: "API 错误率过高"
      
  - alert: HighResponseTime
    expr: http_request_duration_seconds > 1
    for: 5m
    annotations:
      summary: "API 响应时间过长"
      
  - alert: HighCPUUsage
    expr: cpu_usage_percent > 80
    for: 10m
    annotations:
      summary: "CPU 使用率过高"
```

---

## 安全方案

### 1. 认证授权

#### JWT Token
```typescript
// Token 生成
const token = jwt.sign(
  { userId, role },
  process.env.JWT_SECRET,
  { expiresIn: '7d' }
)

// Token 验证
const decoded = jwt.verify(token, process.env.JWT_SECRET)
```

#### RBAC 权限控制
```typescript
enum Role {
  ADMIN = 'admin',
  VIP = 'vip',
  USER = 'user'
}

const permissions = {
  admin: ['*'],
  vip: ['video:play:vip', 'video:download'],
  user: ['video:play:free']
}
```

### 2. 数据加密

- **传输加密**：HTTPS/TLS 1.3
- **存储加密**：AES-256
- **密码加密**：bcrypt + salt

### 3. 防护措施

- **DDoS 防护**：CDN + 限流
- **SQL 注入防护**：参数化查询
- **XSS 防护**：输入过滤 + CSP
- **CSRF 防护**：Token 验证

---

## 实施路线

### 第一阶段：基础设施（2周）

- [x] 设计整体架构
- [ ] 搭建开发环境
- [ ] 配置 CI/CD
- [ ] 部署基础服务（MySQL, Redis, MongoDB）

### 第二阶段：后端服务（4周）

- [ ] 创建 quicktv-maccms-server 仓库
- [ ] 实现用户服务
- [ ] 实现内容服务
- [ ] 实现播放服务
- [ ] 实现直播服务
- [ ] 实现统计服务

### 第三阶段：管理后台（3周）

- [ ] 创建 quicktv-maccms-admin 仓库
- [ ] 实现用户管理
- [ ] 实现内容管理
- [ ] 实现直播源管理
- [ ] 实现数据统计

### 第四阶段：优化部署（2周）

- [ ] 性能优化
- [ ] 压力测试
- [ ] 监控告警
- [ ] 文档完善

### 第五阶段：上线运维（持续）

- [ ] 灰度发布
- [ ] 生产部署
- [ ] 监控运维
- [ ] 持续优化

---

## 成本估算

### 服务器成本（月）

| 服务 | 配置 | 数量 | 单价 | 小计 |
|------|------|------|------|------|
| API 服务器 | 4核8G | 4 | ¥300 | ¥1,200 |
| 数据库服务器 | 8核16G | 2 | ¥600 | ¥1,200 |
| Redis 服务器 | 4核8G | 2 | ¥300 | ¥600 |
| 负载均衡 | - | 1 | ¥200 | ¥200 |
| CDN 流量 | 10TB | - | ¥0.2/GB | ¥2,000 |
| 对象存储 | 5TB | - | ¥0.1/GB | ¥500 |
| **总计** | - | - | - | **¥5,700** |

### 开发成本

- 后端开发：4周 × 2人 = 8人周
- 前端开发：3周 × 1人 = 3人周
- 测试运维：2周 × 1人 = 2人周
- **总计**：13人周

---

## 总结

这是一个**企业级、高并发、可扩展**的完整解决方案，具备：

1. ✅ **微服务架构**：易于扩展和维护
2. ✅ **高并发支持**：10万+ 并发用户
3. ✅ **高可用性**：99.9% 可用性保证
4. ✅ **完整监控**：实时监控和告警
5. ✅ **安全可靠**：多重安全防护
6. ✅ **易于部署**：Docker + K8s

现在开始实施第一步：创建后端服务仓库！

---

**文档版本**：1.0.0  
**最后更新**：2026-05-09  
**维护者**：qq642672661
