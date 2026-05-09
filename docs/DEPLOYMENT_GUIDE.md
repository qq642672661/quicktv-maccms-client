# QuickTV-MacCMS 部署指南

## 目录

1. [环境准备](#环境准备)
2. [基础设施部署](#基础设施部署)
3. [数据库部署](#数据库部署)
4. [后端服务部署](#后端服务部署)
5. [前端应用部署](#前端应用部署)
6. [管理后台部署](#管理后台部署)
7. [监控系统部署](#监控系统部署)
8. [负载均衡配置](#负载均衡配置)
9. [CDN配置](#cdn配置)
10. [备份与恢复](#备份与恢复)

---

## 环境准备

### 服务器配置要求

#### 生产环境最低配置

**应用服务器（3台）**
- CPU: 8核
- 内存: 16GB
- 硬盘: 200GB SSD
- 网络: 100Mbps
- 操作系统: Ubuntu 22.04 LTS / CentOS 8

**数据库服务器（2台主从）**
- CPU: 16核
- 内存: 32GB
- 硬盘: 500GB SSD（数据盘）+ 100GB SSD（系统盘）
- 网络: 1Gbps
- 操作系统: Ubuntu 22.04 LTS

**缓存服务器（3台集群）**
- CPU: 4核
- 内存: 16GB
- 硬盘: 100GB SSD
- 网络: 1Gbps
- 操作系统: Ubuntu 22.04 LTS

**消息队列服务器（3台集群）**
- CPU: 8核
- 内存: 16GB
- 硬盘: 200GB SSD
- 网络: 1Gbps
- 操作系统: Ubuntu 22.04 LTS

### 软件依赖

```bash
# Node.js 18.x LTS
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# PostgreSQL 15
sudo apt-get install -y postgresql-15 postgresql-contrib-15

# Redis 7.x
sudo apt-get install -y redis-server

# Nginx 1.24
sudo apt-get install -y nginx

# Docker & Docker Compose
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo apt-get install -y docker-compose

# PM2 进程管理器
sudo npm install -g pm2

# Git
sudo apt-get install -y git
```

---

## 基础设施部署

### 1. Docker 容器化部署（推荐）

#### 创建 docker-compose.yml

```yaml
version: '3.8'

services:
  # PostgreSQL 主数据库
  postgres-master:
    image: postgres:15-alpine
    container_name: quicktv-postgres-master
    environment:
      POSTGRES_DB: quicktv
      POSTGRES_USER: quicktv_user
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_INITDB_ARGS: "-E UTF8 --locale=C"
    volumes:
      - postgres-master-data:/var/lib/postgresql/data
      - ./init-scripts:/docker-entrypoint-initdb.d
    ports:
      - "5432:5432"
    networks:
      - quicktv-network
    restart: unless-stopped
    command: >
      postgres
      -c max_connections=200
      -c shared_buffers=2GB
      -c effective_cache_size=6GB
      -c maintenance_work_mem=512MB
      -c checkpoint_completion_target=0.9
      -c wal_buffers=16MB
      -c default_statistics_target=100
      -c random_page_cost=1.1
      -c effective_io_concurrency=200
      -c work_mem=10MB
      -c min_wal_size=1GB
      -c max_wal_size=4GB

  # Redis 主节点
  redis-master:
    image: redis:7-alpine
    container_name: quicktv-redis-master
    command: >
      redis-server
      --maxmemory 4gb
      --maxmemory-policy allkeys-lru
      --appendonly yes
      --appendfsync everysec
    volumes:
      - redis-master-data:/data
    ports:
      - "6379:6379"
    networks:
      - quicktv-network
    restart: unless-stopped

  # RabbitMQ 消息队列
  rabbitmq:
    image: rabbitmq:3-management-alpine
    container_name: quicktv-rabbitmq
    environment:
      RABBITMQ_DEFAULT_USER: quicktv
      RABBITMQ_DEFAULT_PASS: ${RABBITMQ_PASSWORD}
    volumes:
      - rabbitmq-data:/var/lib/rabbitmq
    ports:
      - "5672:5672"
      - "15672:15672"
    networks:
      - quicktv-network
    restart: unless-stopped

  # MongoDB（用于日志存储）
  mongodb:
    image: mongo:6-jammy
    container_name: quicktv-mongodb
    environment:
      MONGO_INITDB_ROOT_USERNAME: quicktv
      MONGO_INITDB_ROOT_PASSWORD: ${MONGODB_PASSWORD}
    volumes:
      - mongodb-data:/data/db
    ports:
      - "27017:27017"
    networks:
      - quicktv-network
    restart: unless-stopped

  # 后端 API 服务
  api-server:
    build:
      context: ./quicktv-maccms-server
      dockerfile: Dockerfile
    container_name: quicktv-api-server
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://quicktv_user:${POSTGRES_PASSWORD}@postgres-master:5432/quicktv
      REDIS_URL: redis://redis-master:6379
      RABBITMQ_URL: amqp://quicktv:${RABBITMQ_PASSWORD}@rabbitmq:5672
      JWT_SECRET: ${JWT_SECRET}
      PORT: 3000
    depends_on:
      - postgres-master
      - redis-master
      - rabbitmq
    ports:
      - "3000:3000"
    networks:
      - quicktv-network
    restart: unless-stopped
    deploy:
      replicas: 3
      resources:
        limits:
          cpus: '2'
          memory: 4G

  # Nginx 反向代理
  nginx:
    image: nginx:alpine
    container_name: quicktv-nginx
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
      - ./logs/nginx:/var/log/nginx
    ports:
      - "80:80"
      - "443:443"
    depends_on:
      - api-server
    networks:
      - quicktv-network
    restart: unless-stopped

volumes:
  postgres-master-data:
  redis-master-data:
  rabbitmq-data:
  mongodb-data:

networks:
  quicktv-network:
    driver: bridge
```

#### 启动服务

```bash
# 创建环境变量文件
cat > .env << EOF
POSTGRES_PASSWORD=your_secure_postgres_password
RABBITMQ_PASSWORD=your_secure_rabbitmq_password
MONGODB_PASSWORD=your_secure_mongodb_password
JWT_SECRET=your_jwt_secret_key_min_32_chars
EOF

# 启动所有服务
docker-compose up -d

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f api-server
```

---

## 数据库部署

### PostgreSQL 主从复制配置

#### 主库配置（Master）

```bash
# 编辑 postgresql.conf
sudo nano /etc/postgresql/15/main/postgresql.conf
```

```conf
# 复制配置
wal_level = replica
max_wal_senders = 10
wal_keep_size = 1GB
hot_standby = on
archive_mode = on
archive_command = 'test ! -f /var/lib/postgresql/15/archive/%f && cp %p /var/lib/postgresql/15/archive/%f'
```

```bash
# 编辑 pg_hba.conf
sudo nano /etc/postgresql/15/main/pg_hba.conf
```

```conf
# 允许从库连接
host    replication     replicator      192.168.1.0/24          md5
```

```bash
# 创建复制用户
sudo -u postgres psql
CREATE USER replicator WITH REPLICATION ENCRYPTED PASSWORD 'replicator_password';
\q

# 重启 PostgreSQL
sudo systemctl restart postgresql
```

#### 从库配置（Slave）

```bash
# 停止 PostgreSQL
sudo systemctl stop postgresql

# 清空数据目录
sudo rm -rf /var/lib/postgresql/15/main/*

# 从主库复制数据
sudo -u postgres pg_basebackup -h 192.168.1.10 -D /var/lib/postgresql/15/main -U replicator -P -v -R -X stream -C -S slave1

# 启动 PostgreSQL
sudo systemctl start postgresql

# 验证复制状态
sudo -u postgres psql -c "SELECT * FROM pg_stat_replication;"
```

### 数据库初始化

```bash
# 克隆项目
git clone https://github.com/qq642672661/quicktv-maccms-server.git
cd quicktv-maccms-server

# 安装依赖
npm install

# 运行数据库迁移
npm run migrate:up

# 导入初始数据
npm run seed
```

---

## 后端服务部署

### 1. 构建后端应用

```bash
# 克隆后端仓库
git clone https://github.com/qq642672661/quicktv-maccms-server.git
cd quicktv-maccms-server

# 安装依赖
npm install

# 构建生产版本
npm run build

# 配置环境变量
cp .env.example .env.production
nano .env.production
```

### 2. PM2 部署配置

创建 `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [
    {
      name: 'quicktv-api',
      script: './dist/server.js',
      instances: 4,
      exec_mode: 'cluster',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_memory_restart: '1G',
      autorestart: true,
      watch: false,
      max_restarts: 10,
      min_uptime: '10s'
    },
    {
      name: 'quicktv-worker',
      script: './dist/worker.js',
      instances: 2,
      exec_mode: 'cluster',
      env_production: {
        NODE_ENV: 'production'
      },
      error_file: './logs/worker-err.log',
      out_file: './logs/worker-out.log',
      autorestart: true
    }
  ]
};
```

### 3. 启动服务

```bash
# 使用 PM2 启动
pm2 start ecosystem.config.js --env production

# 保存 PM2 配置
pm2 save

# 设置开机自启
pm2 startup

# 查看服务状态
pm2 status

# 查看日志
pm2 logs quicktv-api

# 监控
pm2 monit
```

---

## 前端应用部署

### 1. 构建 TV 应用

```bash
# 克隆前端仓库
git clone https://github.com/qq642672661/quicktv-maccms-client.git
cd quicktv-maccms-client

# 安装依赖
npm install

# 配置生产环境
cp .env.example .env.production
nano .env.production
```

```env
# .env.production
MACCMS_API_URL=https://api.yourdomain.com
ENABLE_CACHE=true
CACHE_EXPIRE_TIME=3600
```

```bash
# 构建生产版本
npm run build

# 构建产物在 dist/ 目录
ls -lh dist/
```

### 2. 部署到静态服务器

```bash
# 使用 Nginx 托管
sudo mkdir -p /var/www/quicktv
sudo cp -r dist/* /var/www/quicktv/

# 配置 Nginx
sudo nano /etc/nginx/sites-available/quicktv
```

```nginx
server {
    listen 80;
    server_name tv.yourdomain.com;
    
    root /var/www/quicktv;
    index index.html;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
    
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
}
```

```bash
# 启用站点
sudo ln -s /etc/nginx/sites-available/quicktv /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 管理后台部署

### 1. 构建管理后台

```bash
# 克隆管理后台仓库
git clone https://github.com/qq642672661/quicktv-maccms-admin.git
cd quicktv-maccms-admin

# 安装依赖
npm install

# 配置环境
cp .env.example .env.production
nano .env.production
```

```env
VITE_API_BASE_URL=https://api.yourdomain.com
VITE_APP_TITLE=QuickTV 管理后台
```

```bash
# 构建
npm run build

# 部署
sudo mkdir -p /var/www/quicktv-admin
sudo cp -r dist/* /var/www/quicktv-admin/
```

### 2. Nginx 配置

```nginx
server {
    listen 80;
    server_name admin.yourdomain.com;
    
    root /var/www/quicktv-admin;
    index index.html;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## 监控系统部署

### Prometheus + Grafana

#### 1. 安装 Prometheus

```bash
# 下载 Prometheus
wget https://github.com/prometheus/prometheus/releases/download/v2.45.0/prometheus-2.45.0.linux-amd64.tar.gz
tar xvfz prometheus-*.tar.gz
cd prometheus-*

# 配置 prometheus.yml
cat > prometheus.yml << EOF
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'quicktv-api'
    static_configs:
      - targets: ['localhost:3000']
  
  - job_name: 'node-exporter'
    static_configs:
      - targets: ['localhost:9100']
  
  - job_name: 'postgres'
    static_configs:
      - targets: ['localhost:9187']
  
  - job_name: 'redis'
    static_configs:
      - targets: ['localhost:9121']
EOF

# 启动 Prometheus
./prometheus --config.file=prometheus.yml
```

#### 2. 安装 Grafana

```bash
# 添加 Grafana 仓库
sudo apt-get install -y software-properties-common
sudo add-apt-repository "deb https://packages.grafana.com/oss/deb stable main"
wget -q -O - https://packages.grafana.com/gpg.key | sudo apt-key add -

# 安装
sudo apt-get update
sudo apt-get install grafana

# 启动
sudo systemctl start grafana-server
sudo systemctl enable grafana-server

# 访问 http://localhost:3000 (默认账号 admin/admin)
```

#### 3. 配置监控面板

导入预设的 Grafana Dashboard:
- Node Exporter Dashboard (ID: 1860)
- PostgreSQL Dashboard (ID: 9628)
- Redis Dashboard (ID: 11835)
- Nginx Dashboard (ID: 12708)

---

## 负载均衡配置

### Nginx 负载均衡

```nginx
upstream quicktv_backend {
    least_conn;
    server 192.168.1.11:3000 weight=3 max_fails=3 fail_timeout=30s;
    server 192.168.1.12:3000 weight=3 max_fails=3 fail_timeout=30s;
    server 192.168.1.13:3000 weight=2 max_fails=3 fail_timeout=30s;
    keepalive 32;
}

server {
    listen 80;
    server_name api.yourdomain.com;
    
    location / {
        proxy_pass http://quicktv_backend;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        proxy_connect_timeout 5s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        
        proxy_buffering on;
        proxy_buffer_size 4k;
        proxy_buffers 8 4k;
        proxy_busy_buffers_size 8k;
    }
    
    location /health {
        access_log off;
        return 200 "healthy\n";
    }
}
```

---

## CDN配置

### 阿里云 CDN 配置示例

```bash
# 1. 创建 CDN 加速域名
# 域名: cdn.yourdomain.com
# 源站: api.yourdomain.com

# 2. 配置缓存规则
# 静态资源: .js, .css, .png, .jpg, .gif - 缓存 7 天
# API 响应: /api/videos/list - 缓存 1 小时
# 动态内容: /api/user/* - 不缓存

# 3. 配置 HTTPS
# 上传 SSL 证书
# 强制 HTTPS 跳转

# 4. 配置回源 Host
# 回源 Host: api.yourdomain.com

# 5. 配置访问控制
# IP 黑白名单
# Referer 防盗链
# URL 鉴权
```

---

## 备份与恢复

### 数据库备份

```bash
# 创建备份脚本
cat > /opt/scripts/backup-postgres.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/backup/postgres"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/quicktv_$DATE.sql.gz"

mkdir -p $BACKUP_DIR

pg_dump -h localhost -U quicktv_user quicktv | gzip > $BACKUP_FILE

find $BACKUP_DIR -name "*.sql.gz" -mtime +7 -delete

echo "Backup completed: $BACKUP_FILE"
EOF

chmod +x /opt/scripts/backup-postgres.sh

# 添加定时任务
crontab -e
```

```cron
# 每天凌晨 2 点备份数据库
0 2 * * * /opt/scripts/backup-postgres.sh >> /var/log/backup.log 2>&1
```

### Redis 备份

```bash
# Redis 自动持久化配置
# 在 redis.conf 中配置
save 900 1
save 300 10
save 60 10000

# 手动备份
redis-cli BGSAVE

# 备份 RDB 文件
cp /var/lib/redis/dump.rdb /backup/redis/dump_$(date +%Y%m%d).rdb
```

### 应用代码备份

```bash
# 使用 Git 进行版本控制
cd /var/www/quicktv
git add .
git commit -m "Production deployment $(date +%Y%m%d)"
git push origin production

# 打包备份
tar -czf /backup/app/quicktv_$(date +%Y%m%d).tar.gz /var/www/quicktv
```

---

## 安全加固

### 1. 防火墙配置

```bash
# 使用 UFW
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### 2. SSL/TLS 配置

```bash
# 使用 Let's Encrypt
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
sudo certbot renew --dry-run
```

### 3. 应用安全

```bash
# 设置文件权限
sudo chown -R www-data:www-data /var/www/quicktv
sudo chmod -R 755 /var/www/quicktv

# 禁用目录浏览
# 在 Nginx 配置中添加
autoindex off;

# 隐藏版本信息
server_tokens off;
```

---

## 性能优化

### 1. Nginx 优化

```nginx
worker_processes auto;
worker_rlimit_nofile 65535;

events {
    worker_connections 4096;
    use epoll;
    multi_accept on;
}

http {
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;
    
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml text/javascript application/json application/javascript application/xml+rss application/rss+xml font/truetype font/opentype application/vnd.ms-fontobject image/svg+xml;
    
    open_file_cache max=10000 inactive=30s;
    open_file_cache_valid 60s;
    open_file_cache_min_uses 2;
    open_file_cache_errors on;
}
```

### 2. PostgreSQL 优化

```sql
-- 创建索引
CREATE INDEX idx_videos_category ON videos(category_id);
CREATE INDEX idx_videos_created ON videos(created_at DESC);
CREATE INDEX idx_play_history_user ON play_history(user_id, created_at DESC);

-- 分区表
CREATE TABLE play_history_2026_01 PARTITION OF play_history
    FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

-- 定期清理
VACUUM ANALYZE;
```

### 3. Redis 优化

```bash
# redis.conf
maxmemory 4gb
maxmemory-policy allkeys-lru
tcp-backlog 511
timeout 300
tcp-keepalive 300
```

---

## 故障排查

### 常见问题

#### 1. 服务无法启动

```bash
# 查看日志
pm2 logs quicktv-api --lines 100

# 检查端口占用
sudo netstat -tulpn | grep 3000

# 检查进程
ps aux | grep node
```

#### 2. 数据库连接失败

```bash
# 测试连接
psql -h localhost -U quicktv_user -d quicktv

# 查看连接数
SELECT count(*) FROM pg_stat_activity;

# 查看慢查询
SELECT * FROM pg_stat_statements ORDER BY total_time DESC LIMIT 10;
```

#### 3. Redis 连接问题

```bash
# 测试连接
redis-cli ping

# 查看连接数
redis-cli CLIENT LIST

# 查看内存使用
redis-cli INFO memory
```

---

## 运维检查清单

### 日常检查

- [ ] 检查服务状态 (`pm2 status`, `docker-compose ps`)
- [ ] 检查磁盘空间 (`df -h`)
- [ ] 检查内存使用 (`free -h`)
- [ ] 检查 CPU 负载 (`top`, `htop`)
- [ ] 检查日志错误 (`tail -f /var/log/nginx/error.log`)
- [ ] 检查数据库连接数
- [ ] 检查 Redis 内存使用

### 每周检查

- [ ] 审查监控告警
- [ ] 检查备份完整性
- [ ] 更新安全补丁
- [ ] 清理旧日志文件
- [ ] 检查 SSL 证书有效期

### 每月检查

- [ ] 数据库性能分析
- [ ] 容量规划评估
- [ ] 安全审计
- [ ] 灾难恢复演练

---

## 联系与支持

- GitHub Issues: https://github.com/qq642672661/quicktv-maccms-client/issues
- 文档: https://github.com/qq642672661/quicktv-maccms-client/docs

---

**最后更新**: 2026-05-09
