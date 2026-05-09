# QuickTV MacCMS Client

[![License](https://img.shields.io/badge/license-Apache2.0-blue.svg)](https://opensource.org/licenses/apache-2-0)
[![Vue](https://img.shields.io/badge/vue-3.4-green.svg)](https://github.com/vuejs/core)
[![QuickTVUI](https://img.shields.io/badge/@quicktvui/quicktvui3-1.2.0-green.svg)](https://www.npmjs.com/package/@quicktvui/quicktvui3)
[![MacCMS](https://img.shields.io/badge/MacCMS-10.x-orange.svg)](https://github.com/magicblack/maccms10)

> 基于 QuickTVUI 框架和 MacCMS 后端的智能电视应用客户端

这是一个专业的电视端影视应用，整合了 [QuickTVUI](http://v3.quicktvui.com/zh/) 前端框架和 [MacCMS](https://github.com/magicblack/maccms10) 内容管理系统，为智能电视、盒子、投影仪等大屏设备提供完整的影视点播解决方案。

## ✨ 特性

- 🎬 **完整的影视功能** - 点播、直播、搜索、筛选、详情、历史记录
- 🚀 **快速开发** - 基于 HelloTV 模板，开箱即用
- 🔌 **MacCMS 集成** - 无缝对接 MacCMS API，支持多资源站
- 📱 **多设备支持** - 适配小米盒子、Android TV、智能投影等设备
- 🎨 **精美界面** - 瀑布流首页、沉浸式播放、流畅动画
- ⚡ **热更新** - 前端代码实时更新，无需重新安装
- 🔧 **易于定制** - 模块化架构，方便扩展和修改

## 📸 界面预览

<table>
  <tr>
    <td><img src="https://extcdn.hsrc.tv/extend_screen/images/example_app/bgplay.png" alt="瀑布流首页"/><br/><center>瀑布流首页</center></td>
    <td><img src="https://extcdn.hsrc.tv/extend_screen/images/example_app/search.png" alt="搜索页面"/><br/><center>搜索页面</center></td>
  </tr>
  <tr>
    <td><img src="https://extcdn.hsrc.tv/extend_screen/images/example_app/filter.png" alt="筛选页面"/><br/><center>筛选页面</center></td>
    <td><img src="https://extcdn.hsrc.tv/extend_screen/images/example_app/detail.png" alt="详情页面"/><br/><center>详情页面</center></td>
  </tr>
</table>

## 🏗️ 架构说明

本项目是多仓库架构的一部分：

```
quicktv-maccms 生态系统
├── quicktv-maccms-client (本仓库)    # 前端应用
├── quicktv-maccms-adapter             # MacCMS 数据适配器 (开发中)
├── quicktv-maccms-server              # 后端服务 (可选)
└── quicktv-maccms-docs                # 文档站点 (计划中)
```

### 上游依赖追踪

本项目追踪以下上游仓库的更新：

- **HelloTV**: https://github.com/quicktvui/hellotv (基础框架)
- **MacCMS**: https://github.com/magicblack/maccms10 (后端 CMS)
- **QuickTVUI**: https://github.com/quicktvui/quicktvui3 (UI 组件库，通过 npm)

## 🚀 快速开始

### 环境要求

- **Node.js**: 16.20.2 (推荐)
- **npm**: 8.10+
- **操作系统**: Windows / macOS / Linux

### 1. 安装依赖

```bash
npm install --legacy-peer-deps
```

### 2. 配置 MacCMS 后端

编辑 `src/config/build-config.ts`：

```typescript
export default {
  // MacCMS API 地址
  requestBaseUrl: 'http://your-maccms-api.com/api',
  
  // 应用包名
  packageName: 'es.tv.huan.hellotv',
  
  // 是否使用模拟数据
  useMockData: false,
}
```

### 3. 启动开发服务器

```bash
npm run dev
```

服务器将在 `http://0.0.0.0:38989` 启动。

### 4. 配置设备连接

#### 方式一：通过 ADB 配置

```bash
# 连接设备
adb connect <设备IP>:5555

# 配置调试服务器地址
adb shell am broadcast -a com.extscreen.runtime.ACTION_CHANGE_DEBUG_SERVER --es ip <你的电脑IP>

# 触发代码更新
adb shell am broadcast -a eskit.sdk.action.CODE_CHANGED -f 32
```

#### 方式二：在设备上手动配置

1. 在设备上安装 [QuickTVUI Runtime](http://v3.quicktvui.com/zh/resource/runtime.html)
2. 打开 Runtime 应用
3. 点击"加载测试代码"
4. 输入电脑 IP 地址（如 `192.168.10.133`）
5. 点击加载

### 5. 查看效果

应用会自动从开发服务器加载代码，修改源码后会实时更新。

## 📦 打包发布

### 生成 APK

```bash
# Debug 包
npm run build-apk-debug

# Release 包
npm run build-apk-release
```

APK 文件位于 `./android/app/build/outputs/apk/`

### 配置签名

编辑 `android/app/build.gradle`，配置签名信息。详见 [Android 配置文档](android/README.md)。

## 🔧 MacCMS 对接

### API 端点映射

本项目通过统一的 API 适配层对接 MacCMS：

| 功能 | 端点 | MacCMS 对应 |
|------|------|-------------|
| 首页导航 | `/home/tabs` | 分类列表 |
| 内容列表 | `/home/tabs/{id}` | 视频列表 |
| 搜索 | `/search` | 搜索接口 |
| 详情 | `/album/details/{id}` | 视频详情 |
| 筛选 | `/filter/{id}/contents` | 筛选接口 |
| 播放地址 | `/streams/{id}` | 播放地址解析 |

### 数据适配

所有 MacCMS 数据通过适配器层转换为标准格式，适配器代码位于：

- `src/pages/*/api/` - 各页面的 API 调用
- `src/pages/*/adapter/` - 数据转换逻辑
- `src/tools/request/` - 统一请求管理

## 📁 项目结构

```
quicktv-maccms-client/
├── src/
│   ├── pages/              # 页面
│   │   ├── home/          # 首页
│   │   ├── detail/        # 详情页
│   │   ├── search/        # 搜索页
│   │   ├── filter/        # 筛选页
│   │   └── ...
│   ├── components/        # 公共组件
│   ├── config/           # 配置文件
│   │   └── build-config.ts  # 主配置
│   ├── tools/            # 工具类
│   │   └── request/      # 请求管理
│   ├── api/              # 全局 API
│   └── assets/           # 资源文件
├── scripts/              # 构建脚本
│   ├── dev.ts           # 开发脚本
│   ├── build.ts         # 构建脚本
│   └── quicktvui-webpack.dev.ts  # Webpack 配置
├── android/              # Android 配置
└── package.json
```

详细说明请查看 [PROJECT-README.md](PROJECT-README.md)

## 🔄 同步上游更新

### 同步 HelloTV 更新

```bash
git fetch upstream-hellotv
git merge upstream-hellotv/dev-1.5-standard
```

### 同步 MacCMS 更新

MacCMS 主要是后端系统，前端只需关注 API 变化。如果 MacCMS API 有更新，需要相应调整适配器代码。

### 更新 QuickTVUI

```bash
npm update @quicktvui/quicktvui3
```

## 🛠️ 开发指南

### 添加新页面

1. 在 `src/pages/` 创建页面目录
2. 创建 `api/`、`adapter/`、`components/` 子目录
3. 在 `src/routes.ts` 注册路由
4. 参考现有页面的结构和命名规范

### 修改 API 对接

1. 编辑 `src/config/build-config.ts` 修改 API 地址
2. 在对应页面的 `api/request-url.ts` 修改端点
3. 在 `adapter/index.ts` 调整数据转换逻辑

### 自定义样式

每个页面的样式文件位于 `src/pages/*/scss/`，可以自由修改。

## 📚 相关文档

- [QuickTVUI 官方文档](http://v3.quicktvui.com/zh/)
- [MacCMS 官方文档](https://www.maccms.la/)
- [Hippy 框架文档](https://hippyjs.org/)
- [Vue 3 文档](https://cn.vuejs.org/)

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

在提交 PR 前，请确保：

1. 代码通过 ESLint 检查：`npm run lint`
2. 遵循现有的代码风格和目录结构
3. 添加必要的注释和文档

## 📄 许可证

本项目基于 [Apache 2.0](LICENSE) 许可证开源。

## 🙏 致谢

- [QuickTVUI](https://github.com/quicktvui) - 提供优秀的 TV 开发框架
- [HelloTV](https://github.com/quicktvui/hellotv) - 提供项目模板
- [MacCMS](https://github.com/magicblack/maccms10) - 提供内容管理系统
- [Hippy](https://github.com/Tencent/Hippy) - 提供跨平台框架

## 📮 联系方式

- 项目主页：https://github.com/qq642672661/quicktv-maccms-client
- 问题反馈：https://github.com/qq642672661/quicktv-maccms-client/issues

---

**注意**：本项目仅供学习交流使用，请遵守相关法律法规，不得用于非法用途。
