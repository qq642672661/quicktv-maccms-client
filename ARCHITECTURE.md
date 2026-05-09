# QuickTV MacCMS 项目架构文档

## 📋 目录

- [概述](#概述)
- [技术栈](#技术栈)
- [多仓库架构](#多仓库架构)
- [项目结构](#项目结构)
- [数据流](#数据流)
- [MacCMS 集成](#maccms-集成)
- [开发规范](#开发规范)
- [演进路线](#演进路线)

---

## 概述

QuickTV MacCMS 是一个基于 QuickTVUI 框架和 MacCMS 后端的智能电视应用解决方案。项目采用多仓库架构，支持模块化开发和独立维护。

### 核心特性

- **跨平台**：基于 Hippy 框架，支持 Android TV、小米盒子等设备
- **组件化**：使用 Vue 3 + QuickTVUI 组件库
- **数据适配**：统一的 MacCMS API 适配层
- **热更新**：支持前端代码实时更新
- **可扩展**：模块化架构，易于定制和扩展

---

## 技术栈

### 前端框架

| 技术 | 版本 | 用途 |
|------|------|------|
| Vue | 3.4.21 | 核心框架 |
| QuickTVUI | 1.2.0 | TV 端 UI 组件库 |
| Hippy | 3.x | 跨平台渲染引擎 |
| TypeScript | 5.x | 类型系统 |
| Sass | 1.x | 样式预处理 |

### 构建工具

| 工具 | 版本 | 用途 |
|------|------|------|
| Webpack | 5.106.2 | 模块打包 |
| @extscreen/es3-debug-server | 2.x | 开发调试服务器 |
| tsx | 4.x | TypeScript 执行器 |

### 后端集成

| 系统 | 版本 | 用途 |
|------|------|------|
| MacCMS | 10.x | 内容管理系统 |
| MacCMS API | v1 | 数据接口 |

---

## 多仓库架构

### 仓库规划

```
quicktv-maccms 生态系统
│
├── quicktv-maccms-client (本仓库)
│   ├── 职责：前端应用
│   ├── 技术：Vue 3 + QuickTVUI + Hippy
│   ├── 依赖：@quicktv-maccms/adapter (未来)
│   └── 仓库：https://github.com/qq642672661/quicktv-maccms-client
│
├── quicktv-maccms-adapter (计划中)
│   ├── 职责：MacCMS 数据适配层
│   ├── 技术：TypeScript
│   ├── 发布：npm 包
│   └── 状态：当前在 client 仓库内部重构中
│
├── quicktv-maccms-server (可选)
│   ├── 职责：后端服务（API 代理、缓存、认证）
│   ├── 技术：Node.js / Python
│   └── 状态：未来规划
│
└── quicktv-maccms-docs (计划中)
    ├── 职责：文档站点
    ├── 技术：VitePress / Docusaurus
    └── 状态：未来规划
```

### 上游依赖追踪

本项目追踪以下上游仓库：

```bash
# HelloTV - 基础框架
upstream-hellotv → https://github.com/quicktvui/hellotv

# MacCMS - 后端 CMS
upstream-maccms → https://github.com/magicblack/maccms10

# QuickTVUI - UI 组件库（通过 npm）
@quicktvui/quicktvui3
```

### 同步策略

```bash
# 同步 HelloTV 更新
git fetch upstream-hellotv
git merge upstream-hellotv/dev-1.5-standard

# 同步 QuickTVUI 更新
npm update @quicktvui/quicktvui3

# MacCMS 更新
# 关注 API 变化，手动调整适配器代码
```

---

## 项目结构

### 目录结构

```
quicktv-maccms-client/
├── src/                          # 源代码
│   ├── pages/                    # 页面
│   │   ├── home/                # 首页
│   │   │   ├── api/             # API 调用
│   │   │   ├── adapter/         # 数据适配
│   │   │   ├── components/      # 页面组件
│   │   │   ├── scss/            # 样式
│   │   │   └── index.vue        # 页面入口
│   │   ├── detail/              # 详情页
│   │   ├── search/              # 搜索页
│   │   ├── filter/              # 筛选页
│   │   ├── history/             # 历史记录
│   │   ├── my/                  # 我的
│   │   └── activity/            # 活动页
│   │
│   ├── components/              # 公共组件
│   │   ├── qt-header/          # 头部组件
│   │   ├── qt-loading/         # 加载组件
│   │   └── ...
│   │
│   ├── config/                  # 配置
│   │   ├── build-config.ts     # 构建配置（MacCMS API 地址）
│   │   └── theme-config.ts     # 主题配置
│   │
│   ├── tools/                   # 工具类
│   │   ├── request/            # 请求管理
│   │   │   ├── index.ts        # 请求封装
│   │   │   └── request-url.ts  # URL 管理
│   │   ├── storage/            # 本地存储
│   │   └── utils/              # 工具函数
│   │
│   ├── api/                     # 全局 API
│   ├── assets/                  # 资源文件
│   ├── app.vue                  # 应用入口
│   ├── main.ts                  # 主入口
│   └── routes.ts                # 路由配置
│
├── scripts/                     # 构建脚本
│   ├── dev.ts                  # 开发脚本
│   ├── build.ts                # 构建脚本
│   ├── pack.ts                 # 打包脚本
│   ├── quicktvui-webpack.dev.ts    # Webpack 开发配置
│   └── quicktvui-webpack.prod.ts   # Webpack 生产配置
│
├── android/                     # Android 配置
│   ├── app/
│   │   ├── build.gradle        # 构建配置
│   │   └── src/                # Android 源码
│   └── build.gradle            # 项目配置
│
├── build/                       # 构建配置
│   └── build-flavor.ts         # 多渠道配置
│
├── docs/                        # 文档（未来）
├── tests/                       # 测试（未来）
│
├── README.md                    # 项目说明
├── ARCHITECTURE.md              # 架构文档（本文件）
├── CHANGELOG.md                 # 更新日志
├── package.json                 # 依赖配置
└── tsconfig.json               # TypeScript 配置
```

### 核心模块说明

#### 1. 页面模块 (src/pages/*)

每个页面遵循统一的目录结构：

```
page-name/
├── api/              # API 调用层
│   ├── index.ts      # API 接口定义
│   └── request-url.ts # 请求 URL
├── adapter/          # 数据适配层
│   ├── index.ts      # 数据转换逻辑
│   └── interface.ts  # 类型定义
├── components/       # 页面组件
├── scss/            # 样式文件
└── index.vue        # 页面入口
```

#### 2. 配置模块 (src/config/)

- `build-config.ts`：核心配置，包含 MacCMS API 地址
- `theme-config.ts`：主题配置，包含颜色、字体等

#### 3. 工具模块 (src/tools/)

- `request/`：统一的 HTTP 请求管理
- `storage/`：本地存储封装
- `utils/`：通用工具函数

---

## 数据流

### 请求流程

```
用户操作
  ↓
页面组件 (*.vue)
  ↓
API 层 (api/index.ts)
  ↓
请求管理 (tools/request/index.ts)
  ↓
MacCMS API
  ↓
数据适配 (adapter/index.ts)
  ↓
组件渲染
```

### 数据适配流程

```typescript
// 1. API 调用
const response = await getMediaDetail(id)

// 2. 原始数据（MacCMS 格式）
{
  vod_id: 123,
  vod_name: "电影名称",
  vod_pic: "http://...",
  vod_play_url: "播放地址$url1#播放地址2$url2"
}

// 3. 适配转换
const media = adaptMediaDetail(response)

// 4. 标准格式（QuickTVUI 格式）
{
  id: "123",
  title: "电影名称",
  cover: "http://...",
  playUrls: [
    { title: "播放地址", url: "url1" },
    { title: "播放地址2", url: "url2" }
  ]
}

// 5. 组件使用
<MediaPlayer :media="media" />
```

---

## MacCMS 集成

### API 端点映射

| 功能 | 前端路由 | MacCMS API | 适配器位置 |
|------|---------|-----------|----------|
| 首页导航 | `/home` | `/api.php/provide/vod?ac=list` | `src/pages/home/adapter/` |
| 内容列表 | `/home/tabs/:id` | `/api.php/provide/vod?ac=list&t=:id` | `src/pages/home/adapter/` |
| 搜索 | `/search` | `/api.php/provide/vod?ac=list&wd=:keyword` | `src/pages/search/adapter/` |
| 详情 | `/detail/:id` | `/api.php/provide/vod?ac=detail&ids=:id` | `src/pages/detail/adapter/` |
| 筛选 | `/filter/:id` | `/api.php/provide/vod?ac=list&t=:id&...` | `src/pages/filter/adapter/` |

### 配置方式

在 `src/config/build-config.ts` 中配置 MacCMS API 地址：

```typescript
export default {
  // MacCMS API 基础地址
  requestBaseUrl: 'http://your-maccms-api.com/api.php/provide/vod',
  
  // 应用包名
  packageName: 'es.tv.huan.hellotv',
  
  // 是否使用模拟数据
  useMockData: false,
}
```

### 数据适配规范

所有 MacCMS 数据必须通过适配器转换为标准格式：

```typescript
// adapter/interface.ts - 定义标准接口
export interface IMedia {
  id: string
  title: string
  cover: string
  // ...
}

// adapter/index.ts - 实现转换逻辑
export function adaptMediaDetail(data: any): IMedia {
  return {
    id: data.vod_id.toString(),
    title: data.vod_name,
    cover: data.vod_pic,
    // ...
  }
}
```

---

## 开发规范

### 代码规范

1. **TypeScript 优先**：所有新代码使用 TypeScript
2. **组件化**：页面拆分为可复用的组件
3. **类型定义**：在 `adapter/interface.ts` 中定义类型
4. **命名规范**：
   - 组件：PascalCase（如 `MediaPlayer`）
   - 文件：kebab-case（如 `media-player.vue`）
   - 变量：camelCase（如 `mediaList`）
   - 常量：UPPER_SNAKE_CASE（如 `API_BASE_URL`）

### Git 提交规范

使用 Conventional Commits 规范：

```bash
feat: 新功能
fix: 修复 bug
docs: 文档更新
style: 代码格式调整
refactor: 重构
perf: 性能优化
test: 测试相关
chore: 构建/工具相关
```

示例：
```bash
git commit -m "feat: 添加历史记录页面"
git commit -m "fix: 修复详情页播放器崩溃问题"
git commit -m "docs: 更新 README 中的 MacCMS 配置说明"
```

### 分支策略

```
main (保护分支)
  ↑
dev-1.5-standard (开发分支)
  ↑
feature/* (功能分支)
  ↑
hotfix/* (紧急修复)
```

---

## 演进路线

### 第一阶段：当前状态 ✅

- [x] 基于 HelloTV 搭建项目
- [x] 集成 MacCMS API
- [x] 实现核心页面（首页、详情、搜索、筛选）
- [x] 配置多仓库架构
- [x] 完善文档

### 第二阶段：内部重构 🔄

- [ ] 统一适配器接口
- [ ] 提取公共适配逻辑到 `src/adapters/maccms/`
- [ ] 添加单元测试
- [ ] 优化性能和用户体验
- [ ] 完善错误处理

### 第三阶段：模块化 📦

- [ ] 将适配器提取为独立 npm 包 `@quicktv-maccms/adapter`
- [ ] 发布到 npm
- [ ] 在 client 中通过 npm 依赖使用

### 第四阶段：生态完善 🌟

- [ ] 创建 `quicktv-maccms-server` 后端服务
- [ ] 创建 `quicktv-maccms-docs` 文档站点
- [ ] 支持更多资源站（不仅限于 MacCMS）
- [ ] 提供可视化配置工具

### 第五阶段：社区化 🚀

- [ ] 开源社区运营
- [ ] 插件系统
- [ ] 主题市场
- [ ] 在线演示

---

## 技术决策记录

### 为什么选择多仓库架构？

**优点：**
- 模块独立维护和版本管理
- 适配器可以被其他项目复用
- 清晰的职责边界
- 便于团队协作

**缺点：**
- 初期维护成本较高
- 需要管理多个仓库

**决策：** 采用渐进式策略，先在单仓库内重构，待接口稳定后再拆分。

### 为什么不立即提取适配器？

**原因：**
1. 适配器与 QuickTVUI 组件深度耦合
2. 接口尚未标准化
3. 过早抽象会增加维护成本

**策略：** 先在 `src/adapters/maccms/` 内部重构，待接口稳定后再发布为 npm 包。

### 为什么选择 TypeScript？

**优点：**
- 类型安全，减少运行时错误
- 更好的 IDE 支持
- 便于重构和维护
- 自文档化

---

## 参考资料

- [QuickTVUI 官方文档](http://v3.quicktvui.com/zh/)
- [HelloTV 项目](https://github.com/quicktvui/hellotv)
- [MacCMS 官方文档](https://www.maccms.la/)
- [Hippy 框架文档](https://hippyjs.org/)
- [Vue 3 文档](https://cn.vuejs.org/)

---

**文档版本：** 1.0.0  
**最后更新：** 2026-05-09  
**维护者：** qq642672661
