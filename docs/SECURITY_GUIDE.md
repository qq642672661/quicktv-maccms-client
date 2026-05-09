# QuickTV-MacCMS 安全加固指南

## 目录

1. [安全架构概述](#安全架构概述)
2. [网络安全](#网络安全)
3. [应用安全](#应用安全)
4. [数据库安全](#数据库安全)
5. [身份认证与授权](#身份认证与授权)
6. [数据加密](#数据加密)
7. [API 安全](#api-安全)
8. [容器安全](#容器安全)
9. [日志审计](#日志审计)
10. [安全合规](#安全合规)
11. [应急响应](#应急响应)
12. [安全检查清单](#安全检查清单)

---

## 安全架构概述

### 纵深防御架构

```
┌─────────────────────────────────────────────────────────────┐
│                        外部防护层                             │
│  WAF │ DDoS防护 │ CDN │ 防火墙 │ IDS/IPS                    │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                      网络安全层                               │
│  VPC隔离 │ 安全组 │ ACL │ VPN │ 堡垒机                      │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                      应用安全层                               │
│  认证授权 │ 输入验证 │ CSRF防护 │ XSS防护 │ SQL注入防护      │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                      数据安全层                               │
│  加密存储 │ 传输加密 │ 数据脱敏 │ 备份加密 │ 访问控制        │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                      监控审计层                               │
│  日志审计 │ 异常检测 │ 入侵检测 │ 安全告警                    │
└─────────────────────────────────────────────────────────────┘
```

### 安全原则

1. **最小权限原则**: 用户和服务只拥有完成任务所需的最小权限
2. **纵深防御**: 多层安全防护，单点失效不会导致整体失陷
3. **默认拒绝**: 除非明确允许，否则默认拒绝所有访问
4. **安全设计**: 从设计阶段就考虑安全性，而非事后补救
5. **持续监控**: 实时监控系统状态，及时发现和响应安全事件

---

## 网络安全

### 1. 防火墙配置

#### UFW 防火墙规则

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing

sudo ufw allow 22/tcp comment 'SSH'
sudo ufw allow 80/tcp comment 'HTTP'
sudo ufw allow 443/tcp comment 'HTTPS'

sudo ufw allow from 192.168.1.0/24 to any port 5432 comment 'PostgreSQL internal'
sudo ufw allow from 192.168.1.0/24 to any port 6379 comment 'Redis internal'
sudo ufw allow from 192.168.1.0/24 to any port 3000 comment 'API internal'

sudo ufw enable
sudo ufw status numbered
```

#### iptables 规则

```bash
iptables -A INPUT -i lo -j ACCEPT
iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A INPUT -p tcp --dport 22 -j ACCEPT
iptables -A INPUT -p tcp --dport 80 -j ACCEPT
iptables -A INPUT -p tcp --dport 443 -j ACCEPT

iptables -A INPUT -p tcp --dport 5432 -s 192.168.1.0/24 -j ACCEPT
iptables -A INPUT -p tcp --dport 6379 -s 192.168.1.0/24 -j ACCEPT

iptables -A INPUT -m limit --limit 25/minute --limit-burst 100 -j ACCEPT

iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT ACCEPT

iptables-save > /etc/iptables/rules.v4
```

### 2. DDoS 防护

#### Nginx 限流配置

```nginx
http {
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=login_limit:10m rate=5r/m;
    limit_conn_zone $binary_remote_addr zone=conn_limit:10m;
    
    server {
        location /api/ {
            limit_req zone=api_limit burst=20 nodelay;
            limit_conn conn_limit 10;
            
            proxy_pass http://backend;
        }
        
        location /api/auth/login {
            limit_req zone=login_limit burst=5 nodelay;
            
            proxy_pass http://backend;
        }
    }
}
```

#### Fail2Ban 配置

```ini
[nginx-limit-req]
enabled = true
filter = nginx-limit-req
action = iptables-multiport[name=ReqLimit, port="http,https", protocol=tcp]
logpath = /var/log/nginx/error.log
findtime = 600
bantime = 7200
maxretry = 10

[nginx-noscript]
enabled = true
filter = nginx-noscript
action = iptables-multiport[name=NoScript, port="http,https", protocol=tcp]
logpath = /var/log/nginx/access.log
maxretry = 6
bantime = 86400

[nginx-badbots]
enabled = true
filter = nginx-badbots
action = iptables-multiport[name=BadBots, port="http,https", protocol=tcp]
logpath = /var/log/nginx/access.log
maxretry = 2
bantime = 86400
```

### 3. VPC 网络隔离

```
┌─────────────────────────────────────────────────────────┐
│                      VPC (10.0.0.0/16)                  │
│                                                         │
│  ┌──────────────────┐  ┌──────────────────┐           │
│  │  Public Subnet   │  │  Private Subnet  │           │
│  │  (10.0.1.0/24)   │  │  (10.0.2.0/24)   │           │
│  │                  │  │                  │           │
│  │  - Load Balancer │  │  - API Servers   │           │
│  │  - NAT Gateway   │  │  - App Servers   │           │
│  │  - Bastion Host  │  │                  │           │
│  └──────────────────┘  └──────────────────┘           │
│                                                         │
│  ┌──────────────────┐  ┌──────────────────┐           │
│  │  Database Subnet │  │  Cache Subnet    │           │
│  │  (10.0.3.0/24)   │  │  (10.0.4.0/24)   │           │
│  │                  │  │                  │           │
│  │  - PostgreSQL    │  │  - Redis         │           │
│  │  - MongoDB       │  │  - Memcached     │           │
│  └──────────────────┘  └──────────────────┘           │
└─────────────────────────────────────────────────────────┘
```

---

## 应用安全

### 1. 输入验证

#### 使用 Joi 进行数据验证

```typescript
import Joi from 'joi';

const userSchema = Joi.object({
  username: Joi.string()
    .alphanum()
    .min(3)
    .max(30)
    .required(),
  
  email: Joi.string()
    .email()
    .required(),
  
  password: Joi.string()
    .pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]{8,}$'))
    .required()
    .messages({
      'string.pattern.base': 'Password must contain at least 8 characters, one uppercase, one lowercase, one number and one special character'
    }),
  
  phone: Joi.string()
    .pattern(/^[0-9]{11}$/)
    .optional()
});

export const validateUser = (req, res, next) => {
  const { error } = userSchema.validate(req.body);
  
  if (error) {
    return res.status(400).json({
      error: 'Validation failed',
      details: error.details.map(d => d.message)
    });
  }
  
  next();
};
```

### 2. XSS 防护

#### 使用 Helmet 和 DOMPurify

```typescript
import helmet from 'helmet';
import DOMPurify from 'isomorphic-dompurify';

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  noSniff: true,
  xssFilter: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

export const sanitizeInput = (input: string): string => {
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a'],
    ALLOWED_ATTR: ['href']
  });
};
```

### 3. CSRF 防护

```typescript
import csrf from 'csurf';
import cookieParser from 'cookie-parser';

app.use(cookieParser());

const csrfProtection = csrf({
  cookie: {
    httpOnly: true,
    secure: true,
    sameSite: 'strict'
  }
});

app.get('/api/csrf-token', csrfProtection, (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

app.post('/api/sensitive-action', csrfProtection, (req, res) => {
  res.json({ success: true });
});
```

### 4. SQL 注入防护

```typescript
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: true }
});

export const getUserById = async (userId: string) => {
  const query = 'SELECT * FROM users WHERE id = $1';
  const values = [userId];
  
  try {
    const result = await pool.query(query, values);
    return result.rows[0];
  } catch (error) {
    console.error('Database query error:', error);
    throw new Error('Database operation failed');
  }
};

export const searchUsers = async (searchTerm: string) => {
  const query = `
    SELECT id, username, email 
    FROM users 
    WHERE username ILIKE $1 OR email ILIKE $1
    LIMIT 50
  `;
  const values = [`%${searchTerm}%`];
  
  const result = await pool.query(query, values);
  return result.rows;
};
```

---

## 数据库安全

### 1. PostgreSQL 安全配置

#### postgresql.conf 安全设置

```conf
listen_addresses = '127.0.0.1,192.168.1.10'
port = 5432
max_connections = 100

ssl = on
ssl_cert_file = '/etc/ssl/certs/server.crt'
ssl_key_file = '/etc/ssl/private/server.key'
ssl_ca_file = '/etc/ssl/certs/ca.crt'
ssl_ciphers = 'HIGH:MEDIUM:+3DES:!aNULL'
ssl_prefer_server_ciphers = on

password_encryption = scram-sha-256

log_connections = on
log_disconnections = on
log_duration = on
log_line_prefix = '%t [%p]: [%l-1] user=%u,db=%d,app=%a,client=%h '
log_statement = 'ddl'
log_min_duration_statement = 1000

shared_preload_libraries = 'pg_stat_statements'
```

#### pg_hba.conf 访问控制

```conf
local   all             postgres                                peer
local   all             all                                     scram-sha-256

host    all             all             127.0.0.1/32            scram-sha-256
host    all             all             ::1/128                 scram-sha-256

host    quicktv         quicktv_user    192.168.1.0/24          scram-sha-256

host    all             all             0.0.0.0/0               reject
host    all             all             ::/0                    reject
```

#### 数据库用户权限管理

```sql
CREATE ROLE quicktv_readonly;
GRANT CONNECT ON DATABASE quicktv TO quicktv_readonly;
GRANT USAGE ON SCHEMA public TO quicktv_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO quicktv_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO quicktv_readonly;

CREATE ROLE quicktv_readwrite;
GRANT CONNECT ON DATABASE quicktv TO quicktv_readwrite;
GRANT USAGE, CREATE ON SCHEMA public TO quicktv_readwrite;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO quicktv_readwrite;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO quicktv_readwrite;

CREATE USER quicktv_app WITH PASSWORD 'strong_password_here';
GRANT quicktv_readwrite TO quicktv_app;

CREATE USER quicktv_report WITH PASSWORD 'strong_password_here';
GRANT quicktv_readonly TO quicktv_report;

REVOKE ALL ON SCHEMA public FROM PUBLIC;
```

### 2. 数据加密

#### 敏感字段加密

```typescript
import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const IV_LENGTH = 16;

export const encrypt = (text: string): string => {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(
    'aes-256-cbc',
    Buffer.from(ENCRYPTION_KEY, 'hex'),
    iv
  );
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  return iv.toString('hex') + ':' + encrypted;
};

export const decrypt = (text: string): string => {
  const parts = text.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encryptedText = parts[1];
  
  const decipher = crypto.createDecipheriv(
    'aes-256-cbc',
    Buffer.from(ENCRYPTION_KEY, 'hex'),
    iv
  );
  
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
};

export const hashPassword = async (password: string): Promise<string> => {
  const bcrypt = require('bcrypt');
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
};

export const verifyPassword = async (
  password: string,
  hash: string
): Promise<boolean> => {
  const bcrypt = require('bcrypt');
  return await bcrypt.compare(password, hash);
};
```

---

## 身份认证与授权

### 1. JWT 认证实现

```typescript
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = '24h';
const REFRESH_TOKEN_EXPIRES_IN = '7d';

interface TokenPayload {
  userId: string;
  username: string;
  role: string;
}

export const generateAccessToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
    issuer: 'quicktv-api',
    audience: 'quicktv-client'
  });
};

export const generateRefreshToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: REFRESH_TOKEN_EXPIRES_IN,
    issuer: 'quicktv-api',
    audience: 'quicktv-client'
  });
};

export const verifyToken = (token: string): TokenPayload => {
  try {
    return jwt.verify(token, JWT_SECRET, {
      issuer: 'quicktv-api',
      audience: 'quicktv-client'
    }) as TokenPayload;
  } catch (error) {
    throw new Error('Invalid token');
  }
};

export const authMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  const token = authHeader.substring(7);
  
  try {
    const payload = verifyToken(token);
    req.user = payload;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

export const requireRole = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    
    next();
  };
};
```

### 2. RBAC 权限控制

```typescript
enum Permission {
  READ_VIDEOS = 'read:videos',
  WRITE_VIDEOS = 'write:videos',
  DELETE_VIDEOS = 'delete:videos',
  MANAGE_USERS = 'manage:users',
  VIEW_ANALYTICS = 'view:analytics',
  MANAGE_SYSTEM = 'manage:system'
}

const rolePermissions = {
  user: [
    Permission.READ_VIDEOS
  ],
  vip: [
    Permission.READ_VIDEOS
  ],
  editor: [
    Permission.READ_VIDEOS,
    Permission.WRITE_VIDEOS
  ],
  admin: [
    Permission.READ_VIDEOS,
    Permission.WRITE_VIDEOS,
    Permission.DELETE_VIDEOS,
    Permission.MANAGE_USERS,
    Permission.VIEW_ANALYTICS
  ],
  superadmin: Object.values(Permission)
};

export const hasPermission = (role: string, permission: Permission): boolean => {
  return rolePermissions[role]?.includes(permission) || false;
};

export const requirePermission = (permission: Permission) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    if (!hasPermission(req.user.role, permission)) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        required: permission
      });
    }
    
    next();
  };
};
```

---

## API 安全

### 1. API 密钥管理

```typescript
import crypto from 'crypto';

export const generateApiKey = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

export const hashApiKey = (apiKey: string): string => {
  return crypto
    .createHash('sha256')
    .update(apiKey)
    .digest('hex');
};

export const apiKeyMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const apiKey = req.headers['x-api-key'] as string;
  
  if (!apiKey) {
    return res.status(401).json({ error: 'API key required' });
  }
  
  const hashedKey = hashApiKey(apiKey);
  
  const keyRecord = await db.query(
    'SELECT * FROM api_keys WHERE key_hash = $1 AND is_active = true',
    [hashedKey]
  );
  
  if (keyRecord.rows.length === 0) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  
  const key = keyRecord.rows[0];
  
  if (key.expires_at && new Date(key.expires_at) < new Date()) {
    return res.status(401).json({ error: 'API key expired' });
  }
  
  await db.query(
    'UPDATE api_keys SET last_used_at = NOW(), usage_count = usage_count + 1 WHERE id = $1',
    [key.id]
  );
  
  req.apiKey = key;
  next();
};
```

### 2. 请求签名验证

```typescript
export const generateSignature = (
  method: string,
  path: string,
  timestamp: number,
  body: any,
  secret: string
): string => {
  const payload = `${method}${path}${timestamp}${JSON.stringify(body)}`;
  
  return crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
};

export const verifySignature = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const signature = req.headers['x-signature'] as string;
  const timestamp = parseInt(req.headers['x-timestamp'] as string);
  
  if (!signature || !timestamp) {
    return res.status(401).json({ error: 'Missing signature or timestamp' });
  }
  
  const now = Date.now();
  if (Math.abs(now - timestamp) > 300000) {
    return res.status(401).json({ error: 'Request expired' });
  }
  
  const expectedSignature = generateSignature(
    req.method,
    req.path,
    timestamp,
    req.body,
    process.env.API_SECRET
  );
  
  if (signature !== expectedSignature) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  
  next();
};
```

---

## 容器安全

### 1. Docker 安全配置

#### Dockerfile 最佳实践

```dockerfile
FROM node:18-alpine AS builder

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production && \
    npm cache clean --force

COPY --chown=nodejs:nodejs . .

RUN npm run build

FROM node:18-alpine

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./

USER nodejs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "dist/server.js"]
```

### 2. Docker Compose 安全配置

```yaml
version: '3.8'

services:
  api:
    image: quicktv-api:latest
    read_only: true
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    cap_add:
      - NET_BIND_SERVICE
    tmpfs:
      - /tmp
    environment:
      - NODE_ENV=production
    secrets:
      - db_password
      - jwt_secret
    networks:
      - backend
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '1'
          memory: 1G

secrets:
  db_password:
    external: true
  jwt_secret:
    external: true

networks:
  backend:
    driver: bridge
    internal: true
```

---

## 日志审计

### 1. 审计日志记录

```typescript
import winston from 'winston';

const auditLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ 
      filename: 'logs/audit.log',
      maxsize: 10485760,
      maxFiles: 30
    })
  ]
});

export const logAuditEvent = (
  userId: string,
  action: string,
  resource: string,
  details: any,
  ipAddress: string
) => {
  auditLogger.info({
    timestamp: new Date().toISOString(),
    userId,
    action,
    resource,
    details,
    ipAddress,
    userAgent: details.userAgent
  });
};

export const auditMiddleware = (action: string, resource: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const originalSend = res.send;
    
    res.send = function(data) {
      logAuditEvent(
        req.user?.userId || 'anonymous',
        action,
        resource,
        {
          method: req.method,
          path: req.path,
          query: req.query,
          body: req.body,
          statusCode: res.statusCode,
          userAgent: req.headers['user-agent']
        },
        req.ip
      );
      
      return originalSend.call(this, data);
    };
    
    next();
  };
};
```

---

## 安全合规

### GDPR 合规

1. **数据最小化**: 只收集必要的用户数据
2. **用户同意**: 明确获取用户同意
3. **数据可携带**: 提供数据导出功能
4. **被遗忘权**: 提供账户删除功能
5. **数据泄露通知**: 72小时内通知用户

### 等保合规

1. **身份鉴别**: 强密码策略、多因素认证
2. **访问控制**: RBAC权限管理
3. **安全审计**: 完整的审计日志
4. **数据完整性**: 数据校验和备份
5. **数据保密性**: 敏感数据加密

---

## 应急响应

### 安全事件响应流程

```
发现 → 确认 → 遏制 → 根除 → 恢复 → 总结
```

### 常见安全事件处理

#### 1. 账户被盗

```bash
UPDATE users SET is_locked = true WHERE id = $1;
DELETE FROM sessions WHERE user_id = $1;
INSERT INTO security_events (user_id, event_type, details) 
VALUES ($1, 'account_compromised', $2);
```

#### 2. SQL注入攻击

```bash
grep -i "union.*select" /var/log/nginx/access.log
iptables -A INPUT -s <攻击IP> -j DROP
```

#### 3. DDoS攻击

```bash
fail2ban-client set nginx-limit-req banip <攻击IP>
cloudflare-cli firewall add-rule --mode block --ip <攻击IP>
```

---

## 安全检查清单

### 日常检查

- [ ] 检查失败登录尝试
- [ ] 审查访问日志异常
- [ ] 检查系统更新
- [ ] 验证备份完整性
- [ ] 检查SSL证书有效期

### 每周检查

- [ ] 审查用户权限
- [ ] 检查安全补丁
- [ ] 分析安全日志
- [ ] 测试备份恢复
- [ ] 检查防火墙规则

### 每月检查

- [ ] 漏洞扫描
- [ ] 渗透测试
- [ ] 安全培训
- [ ] 应急演练
- [ ] 安全审计

---

**最后更新**: 2026-05-09
