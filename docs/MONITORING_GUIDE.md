# QuickTV-MacCMS 监控运维指南

## 目录

1. [监控体系概述](#监控体系概述)
2. [Prometheus 监控配置](#prometheus-监控配置)
3. [Grafana 可视化配置](#grafana-可视化配置)
4. [日志管理系统](#日志管理系统)
5. [告警系统配置](#告警系统配置)
6. [性能监控指标](#性能监控指标)
7. [应用性能监控 APM](#应用性能监控-apm)
8. [链路追踪系统](#链路追踪系统)
9. [运维自动化](#运维自动化)
10. [故障处理流程](#故障处理流程)

---

## 监控体系概述

### 监控架构

```
┌─────────────────────────────────────────────────────────────┐
│                        监控数据采集层                          │
├─────────────────────────────────────────────────────────────┤
│  Node Exporter  │  PostgreSQL  │  Redis  │  Nginx  │  App   │
│   (系统指标)     │   Exporter   │ Exporter│ Exporter│ Metrics│
└────────┬────────┴──────┬───────┴────┬────┴────┬────┴────┬───┘
         │               │            │         │         │
         └───────────────┴────────────┴─────────┴─────────┘
                              │
                    ┌─────────▼─────────┐
                    │    Prometheus     │
                    │   (时序数据库)      │
                    └─────────┬─────────┘
                              │
                    ┌─────────▼─────────┐
                    │     Grafana       │
                    │   (可视化展示)      │
                    └───────────────────┘
                              │
                    ┌─────────▼─────────┐
                    │   AlertManager    │
                    │   (告警管理)        │
                    └─────────┬─────────┘
                              │
         ┌────────────────────┼────────────────────┐
         │                    │                    │
    ┌────▼────┐         ┌────▼────┐         ┌────▼────┐
    │  Email  │         │ WeChat  │         │  Slack  │
    └─────────┘         └─────────┘         └─────────┘
```

### 监控维度

1. **基础设施监控**
   - 服务器 CPU、内存、磁盘、网络
   - 容器资源使用情况
   - 网络连通性和延迟

2. **应用监控**
   - API 响应时间
   - 请求成功率
   - 并发连接数
   - 业务指标（用户数、播放次数等）

3. **数据库监控**
   - 连接数
   - 查询性能
   - 慢查询
   - 复制延迟

4. **缓存监控**
   - Redis 内存使用
   - 命中率
   - 键空间统计

5. **日志监控**
   - 错误日志
   - 访问日志
   - 业务日志

---

## Prometheus 监控配置

### 1. Prometheus 安装与配置

#### Docker Compose 部署

```yaml
version: '3.8'

services:
  prometheus:
    image: prom/prometheus:latest
    container_name: prometheus
    volumes:
      - ./prometheus/prometheus.yml:/etc/prometheus/prometheus.yml
      - ./prometheus/rules:/etc/prometheus/rules
      - prometheus-data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--storage.tsdb.retention.time=30d'
      - '--web.console.libraries=/usr/share/prometheus/console_libraries'
      - '--web.console.templates=/usr/share/prometheus/consoles'
      - '--web.enable-lifecycle'
    ports:
      - '9090:9090'
    networks:
      - monitoring
    restart: unless-stopped

  node-exporter:
    image: prom/node-exporter:latest
    container_name: node-exporter
    command:
      - '--path.procfs=/host/proc'
      - '--path.sysfs=/host/sys'
      - '--path.rootfs=/rootfs'
      - '--collector.filesystem.mount-points-exclude=^/(sys|proc|dev|host|etc)($$|/)'
    volumes:
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
      - /:/rootfs:ro
    ports:
      - '9100:9100'
    networks:
      - monitoring
    restart: unless-stopped

  postgres-exporter:
    image: prometheuscommunity/postgres-exporter:latest
    container_name: postgres-exporter
    environment:
      DATA_SOURCE_NAME: 'postgresql://quicktv_user:password@postgres:5432/quicktv?sslmode=disable'
    ports:
      - '9187:9187'
    networks:
      - monitoring
    restart: unless-stopped

  redis-exporter:
    image: oliver006/redis_exporter:latest
    container_name: redis-exporter
    environment:
      REDIS_ADDR: 'redis:6379'
    ports:
      - '9121:9121'
    networks:
      - monitoring
    restart: unless-stopped

  nginx-exporter:
    image: nginx/nginx-prometheus-exporter:latest
    container_name: nginx-exporter
    command:
      - '-nginx.scrape-uri=http://nginx:8080/stub_status'
    ports:
      - '9113:9113'
    networks:
      - monitoring
    restart: unless-stopped

volumes:
  prometheus-data:

networks:
  monitoring:
    driver: bridge
```

#### Prometheus 配置文件

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s
  external_labels:
    cluster: 'quicktv-production'
    environment: 'production'

alerting:
  alertmanagers:
    - static_configs:
        - targets:
            - 'alertmanager:9093'

rule_files:
  - '/etc/prometheus/rules/*.yml'

scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  - job_name: 'node-exporter'
    static_configs:
      - targets:
          - 'node-exporter:9100'
        labels:
          instance: 'server-1'
      - targets:
          - '192.168.1.11:9100'
        labels:
          instance: 'server-2'
      - targets:
          - '192.168.1.12:9100'
        labels:
          instance: 'server-3'

  - job_name: 'quicktv-api'
    metrics_path: '/metrics'
    static_configs:
      - targets:
          - '192.168.1.11:3000'
          - '192.168.1.12:3000'
          - '192.168.1.13:3000'

  - job_name: 'postgres'
    static_configs:
      - targets:
          - 'postgres-exporter:9187'

  - job_name: 'redis'
    static_configs:
      - targets:
          - 'redis-exporter:9121'

  - job_name: 'nginx'
    static_configs:
      - targets:
          - 'nginx-exporter:9113'

  - job_name: 'rabbitmq'
    static_configs:
      - targets:
          - 'rabbitmq:15692'
```

### 2. 应用指标暴露

#### Node.js 应用集成 Prometheus

```typescript
import express from 'express'
import promClient from 'prom-client'

const app = express()
const register = new promClient.Registry()

promClient.collectDefaultMetrics({ register })

const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5, 10]
})

const httpRequestTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code']
})

const activeConnections = new promClient.Gauge({
  name: 'active_connections',
  help: 'Number of active connections'
})

const videoPlayCount = new promClient.Counter({
  name: 'video_play_total',
  help: 'Total number of video plays',
  labelNames: ['video_id', 'category']
})

const userOnline = new promClient.Gauge({
  name: 'users_online',
  help: 'Number of users currently online'
})

register.registerMetric(httpRequestDuration)
register.registerMetric(httpRequestTotal)
register.registerMetric(activeConnections)
register.registerMetric(videoPlayCount)
register.registerMetric(userOnline)

app.use((req, res, next) => {
  const start = Date.now()

  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000
    const route = req.route?.path || req.path

    httpRequestDuration.observe({ method: req.method, route, status_code: res.statusCode }, duration)

    httpRequestTotal.inc({
      method: req.method,
      route,
      status_code: res.statusCode
    })
  })

  next()
})

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType)
  res.end(await register.metrics())
})

export { videoPlayCount, userOnline, activeConnections }
```

### 3. 告警规则配置

创建 `prometheus/rules/alerts.yml`:

```yaml
groups:
  - name: system_alerts
    interval: 30s
    rules:
      - alert: HighCPUUsage
        expr: 100 - (avg by(instance) (irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 80
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: 'High CPU usage on {{ $labels.instance }}'
          description: 'CPU usage is above 80% (current value: {{ $value }}%)'

      - alert: HighMemoryUsage
        expr: (1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100 > 85
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: 'High memory usage on {{ $labels.instance }}'
          description: 'Memory usage is above 85% (current value: {{ $value }}%)'

      - alert: DiskSpaceLow
        expr: (node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"}) * 100 < 15
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: 'Low disk space on {{ $labels.instance }}'
          description: 'Disk space is below 15% (current value: {{ $value }}%)'

  - name: application_alerts
    interval: 30s
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status_code=~"5.."}[5m]) / rate(http_requests_total[5m]) > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: 'High error rate detected'
          description: 'Error rate is above 5% (current value: {{ $value }}%)'

      - alert: SlowAPIResponse
        expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 2
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: 'Slow API response time'
          description: '95th percentile response time is above 2s (current value: {{ $value }}s)'

      - alert: APIDown
        expr: up{job="quicktv-api"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: 'API service is down'
          description: '{{ $labels.instance }} has been down for more than 1 minute'

  - name: database_alerts
    interval: 30s
    rules:
      - alert: PostgreSQLDown
        expr: pg_up == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: 'PostgreSQL is down'
          description: 'PostgreSQL instance {{ $labels.instance }} is down'

      - alert: HighDatabaseConnections
        expr: pg_stat_database_numbackends / pg_settings_max_connections * 100 > 80
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: 'High database connection usage'
          description: 'Database connections are above 80% (current value: {{ $value }}%)'

      - alert: SlowQuery
        expr: rate(pg_stat_statements_mean_time_seconds[5m]) > 1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: 'Slow database queries detected'
          description: 'Average query time is above 1s'

  - name: redis_alerts
    interval: 30s
    rules:
      - alert: RedisDown
        expr: redis_up == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: 'Redis is down'
          description: 'Redis instance {{ $labels.instance }} is down'

      - alert: RedisHighMemory
        expr: redis_memory_used_bytes / redis_memory_max_bytes * 100 > 90
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: 'Redis memory usage is high'
          description: 'Redis memory usage is above 90% (current value: {{ $value }}%)'

      - alert: RedisLowHitRate
        expr: rate(redis_keyspace_hits_total[5m]) / (rate(redis_keyspace_hits_total[5m]) + rate(redis_keyspace_misses_total[5m])) < 0.8
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: 'Redis cache hit rate is low'
          description: 'Cache hit rate is below 80% (current value: {{ $value }}%)'
```

---

## Grafana 可视化配置

### 1. Grafana 安装

```bash
docker run -d \
  --name=grafana \
  -p 3001:3000 \
  -v grafana-data:/var/lib/grafana \
  -e "GF_SECURITY_ADMIN_PASSWORD=admin" \
  -e "GF_INSTALL_PLUGINS=grafana-piechart-panel" \
  --network monitoring \
  grafana/grafana:latest
```

### 2. 配置数据源

访问 `http://localhost:3001`，添加 Prometheus 数据源：

```yaml
Name: Prometheus
Type: Prometheus
URL: http://prometheus:9090
Access: Server
```

### 3. 导入预设 Dashboard

推荐的 Dashboard ID：

1. **Node Exporter Full** - ID: 1860
   - 系统资源监控（CPU、内存、磁盘、网络）

2. **PostgreSQL Database** - ID: 9628
   - 数据库性能监控

3. **Redis Dashboard** - ID: 11835
   - Redis 性能监控

4. **Nginx Overview** - ID: 12708
   - Nginx 性能监控

### 4. 自定义 Dashboard

#### QuickTV 业务监控面板

```json
{
  "dashboard": {
    "title": "QuickTV Business Metrics",
    "panels": [
      {
        "title": "API Request Rate",
        "targets": [
          {
            "expr": "rate(http_requests_total[5m])"
          }
        ],
        "type": "graph"
      },
      {
        "title": "API Response Time (P95)",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))"
          }
        ],
        "type": "graph"
      },
      {
        "title": "Error Rate",
        "targets": [
          {
            "expr": "rate(http_requests_total{status_code=~\"5..\"}[5m]) / rate(http_requests_total[5m]) * 100"
          }
        ],
        "type": "graph"
      },
      {
        "title": "Active Users",
        "targets": [
          {
            "expr": "users_online"
          }
        ],
        "type": "stat"
      },
      {
        "title": "Video Play Count",
        "targets": [
          {
            "expr": "rate(video_play_total[5m])"
          }
        ],
        "type": "graph"
      },
      {
        "title": "Top 10 Popular Videos",
        "targets": [
          {
            "expr": "topk(10, rate(video_play_total[1h]))"
          }
        ],
        "type": "table"
      }
    ]
  }
}
```

---

## 日志管理系统

### ELK Stack 部署

#### Docker Compose 配置

```yaml
version: '3.8'

services:
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.10.0
    container_name: elasticsearch
    environment:
      - discovery.type=single-node
      - 'ES_JAVA_OPTS=-Xms2g -Xmx2g'
      - xpack.security.enabled=false
    volumes:
      - elasticsearch-data:/usr/share/elasticsearch/data
    ports:
      - '9200:9200'
    networks:
      - logging
    restart: unless-stopped

  logstash:
    image: docker.elastic.co/logstash/logstash:8.10.0
    container_name: logstash
    volumes:
      - ./logstash/pipeline:/usr/share/logstash/pipeline
      - ./logstash/config/logstash.yml:/usr/share/logstash/config/logstash.yml
    ports:
      - '5044:5044'
      - '9600:9600'
    depends_on:
      - elasticsearch
    networks:
      - logging
    restart: unless-stopped

  kibana:
    image: docker.elastic.co/kibana/kibana:8.10.0
    container_name: kibana
    environment:
      - ELASTICSEARCH_HOSTS=http://elasticsearch:9200
    ports:
      - '5601:5601'
    depends_on:
      - elasticsearch
    networks:
      - logging
    restart: unless-stopped

  filebeat:
    image: docker.elastic.co/beats/filebeat:8.10.0
    container_name: filebeat
    user: root
    volumes:
      - ./filebeat/filebeat.yml:/usr/share/filebeat/filebeat.yml:ro
      - /var/lib/docker/containers:/var/lib/docker/containers:ro
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./logs:/logs:ro
    depends_on:
      - logstash
    networks:
      - logging
    restart: unless-stopped

volumes:
  elasticsearch-data:

networks:
  logging:
    driver: bridge
```

#### Filebeat 配置

```yaml
filebeat.inputs:
  - type: log
    enabled: true
    paths:
      - /logs/api/*.log
    fields:
      service: quicktv-api
      environment: production
    multiline.pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
    multiline.negate: true
    multiline.match: after

  - type: log
    enabled: true
    paths:
      - /logs/nginx/access.log
    fields:
      service: nginx
      log_type: access

  - type: log
    enabled: true
    paths:
      - /logs/nginx/error.log
    fields:
      service: nginx
      log_type: error

output.logstash:
  hosts: ['logstash:5044']

processors:
  - add_host_metadata: ~
  - add_cloud_metadata: ~
  - add_docker_metadata: ~
```

#### Logstash Pipeline 配置

```conf
input {
  beats {
    port => 5044
  }
}

filter {
  if [fields][service] == "quicktv-api" {
    json {
      source => "message"
    }

    date {
      match => ["timestamp", "ISO8601"]
      target => "@timestamp"
    }
  }

  if [fields][service] == "nginx" and [fields][log_type] == "access" {
    grok {
      match => { "message" => "%{COMBINEDAPACHELOG}" }
    }

    geoip {
      source => "clientip"
    }
  }
}

output {
  elasticsearch {
    hosts => ["elasticsearch:9200"]
    index => "%{[fields][service]}-%{+YYYY.MM.dd}"
  }
}
```

---

## 告警系统配置

### AlertManager 配置

```yaml
global:
  resolve_timeout: 5m
  smtp_smarthost: 'smtp.gmail.com:587'
  smtp_from: 'alerts@yourdomain.com'
  smtp_auth_username: 'alerts@yourdomain.com'
  smtp_auth_password: 'your_password'

route:
  group_by: ['alertname', 'cluster', 'service']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 12h
  receiver: 'default'
  routes:
    - match:
        severity: critical
      receiver: 'critical-alerts'
      continue: true
    - match:
        severity: warning
      receiver: 'warning-alerts'

receivers:
  - name: 'default'
    email_configs:
      - to: 'team@yourdomain.com'
        headers:
          Subject: '[QuickTV] {{ .GroupLabels.alertname }}'

  - name: 'critical-alerts'
    email_configs:
      - to: 'oncall@yourdomain.com'
        headers:
          Subject: '[CRITICAL] {{ .GroupLabels.alertname }}'
    webhook_configs:
      - url: 'https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK'
        send_resolved: true

  - name: 'warning-alerts'
    email_configs:
      - to: 'team@yourdomain.com'
        headers:
          Subject: '[WARNING] {{ .GroupLabels.alertname }}'

inhibit_rules:
  - source_match:
      severity: 'critical'
    target_match:
      severity: 'warning'
    equal: ['alertname', 'instance']
```

---

## 性能监控指标

### 关键性能指标 (KPI)

#### 1. 系统层面

| 指标       | 正常范围 | 告警阈值 | 说明                        |
| ---------- | -------- | -------- | --------------------------- |
| CPU 使用率 | < 70%    | > 80%    | 持续高 CPU 可能导致响应变慢 |
| 内存使用率 | < 80%    | > 85%    | 内存不足会触发 OOM          |
| 磁盘使用率 | < 80%    | > 85%    | 磁盘满会导致服务异常        |
| 磁盘 I/O   | < 80%    | > 90%    | 高 I/O 影响数据库性能       |
| 网络带宽   | < 70%    | > 80%    | 带宽不足影响用户体验        |

#### 2. 应用层面

| 指标               | 正常范围 | 告警阈值 | 说明                   |
| ------------------ | -------- | -------- | ---------------------- |
| API 响应时间 (P95) | < 500ms  | > 1s     | 响应慢影响用户体验     |
| API 错误率         | < 1%     | > 5%     | 高错误率表示服务异常   |
| QPS                | -        | -        | 监控流量趋势           |
| 并发连接数         | < 1000   | > 5000   | 连接数过多可能耗尽资源 |

#### 3. 数据库层面

| 指标         | 正常范围 | 告警阈值 | 说明                   |
| ------------ | -------- | -------- | ---------------------- |
| 连接数       | < 80%    | > 90%    | 连接池耗尽会拒绝新连接 |
| 查询响应时间 | < 100ms  | > 500ms  | 慢查询影响整体性能     |
| 慢查询数量   | < 10/min | > 50/min | 需要优化 SQL           |
| 复制延迟     | < 1s     | > 10s    | 主从延迟影响数据一致性 |

#### 4. 缓存层面

| 指标       | 正常范围 | 告警阈值 | 说明                   |
| ---------- | -------- | -------- | ---------------------- |
| 缓存命中率 | > 80%    | < 70%    | 低命中率增加数据库压力 |
| 内存使用率 | < 80%    | > 90%    | 内存不足会触发淘汰策略 |
| 连接数     | < 100    | > 500    | 连接数过多可能有泄漏   |

---

## 应用性能监控 APM

### 使用 New Relic / Datadog

#### Node.js 集成示例

```typescript
import newrelic from 'newrelic'

newrelic.setTransactionName('GET /api/videos/:id')

async function getVideoDetail(req, res) {
  const segment = newrelic.startSegment('database-query', true, async () => {
    return await db.query('SELECT * FROM videos WHERE id = $1', [req.params.id])
  })

  const video = await segment

  newrelic.recordMetric('Custom/VideoViews', 1)

  res.json(video)
}
```

---

## 链路追踪系统

### Jaeger 部署

```yaml
version: '3.8'

services:
  jaeger:
    image: jaegertracing/all-in-one:latest
    container_name: jaeger
    environment:
      - COLLECTOR_ZIPKIN_HOST_PORT=:9411
    ports:
      - '5775:5775/udp'
      - '6831:6831/udp'
      - '6832:6832/udp'
      - '5778:5778'
      - '16686:16686'
      - '14268:14268'
      - '14250:14250'
      - '9411:9411'
    networks:
      - tracing
    restart: unless-stopped

networks:
  tracing:
    driver: bridge
```

---

## 运维自动化

### 自动化脚本

#### 健康检查脚本

```bash
#!/bin/bash

check_service() {
    local service=$1
    local url=$2

    response=$(curl -s -o /dev/null -w "%{http_code}" $url)

    if [ $response -eq 200 ]; then
        echo "✓ $service is healthy"
        return 0
    else
        echo "✗ $service is unhealthy (HTTP $response)"
        return 1
    fi
}

check_service "API Server" "http://localhost:3000/health"
check_service "Admin Panel" "http://localhost:8080/health"
check_service "Prometheus" "http://localhost:9090/-/healthy"
check_service "Grafana" "http://localhost:3001/api/health"
```

---

## 故障处理流程

### 1. 故障分级

- **P0 (Critical)**: 服务完全不可用，影响所有用户
- **P1 (High)**: 核心功能受影响，影响大部分用户
- **P2 (Medium)**: 部分功能异常，影响少部分用户
- **P3 (Low)**: 非核心功能问题，用户体验轻微下降

### 2. 应急响应流程

```
告警触发 → 确认故障 → 评估影响 → 启动应急预案 → 故障恢复 → 复盘总结
```

### 3. 常见故障处理

#### API 服务不可用

```bash
pm2 status
pm2 logs quicktv-api --lines 100
pm2 restart quicktv-api
```

#### 数据库连接数耗尽

```sql
SELECT count(*) FROM pg_stat_activity;
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'idle' AND state_change < now() - interval '10 minutes';
```

#### Redis 内存不足

```bash
redis-cli INFO memory
redis-cli FLUSHDB
```

---

**最后更新**: 2026-05-09
