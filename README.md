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
- 📺 **电视盒子简易模式** - 默认大字大按钮入口，遥控器方向键移动，OK 进入
- 📷 **摄像头能力检测** - 检测 USB/外接摄像头与权限状态，无摄像头时自动降级
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

### 4. 电视盒子简易模式

默认启动页是 `tv_box_home`，首页只保留“看电视 / 找节目 / 继续看 / 摄像头 / 全部内容 / 帮助自检”六个大入口：

- 方向键移动焦点，OK/Enter/小键盘 Enter/蓝牙确认键进入。
- 首页按钮会显示 1-6，摄像头页按钮会显示 1-5；有数字键的遥控器可直接按数字进入对应入口。
- 首页、直播页、搜索页、继续看页、全部内容页和摄像头页按 0、菜单、信息、指南、设置或帮助键可打开“帮助/自检”；首页、全部内容页和摄像头页按 6 也能进入自检。
- 帮助页会用“现在下一步”大字卡片给出唯一建议，例如按 2 处理权限、按 3 练遥控、按 4 回首页看电视，避免长辈在多块状态信息里自己判断。
- 帮助页新增“遥控练习”：按 3 后跟着屏幕试方向键、OK 和返回键，长辈小孩可以先练会再看电视。
- 首页返回键新增“退出确认”：默认焦点是继续看，只有选“退出应用”才会关闭，避免长辈小孩误退出。
- 帮助页和摄像头页会显示“维护码”，包含 App 版本、设备型号、SDK、摄像头、USB 视频、音频输入和权限状态，电话排障时可直接读给维护人员。
- 首页有显式遥控器兜底：上/下/左/右会移动黄色选中态，OK 执行当前入口。
- 直播页 OK、左键、右键都会先打开频道列表；上/下键和频道 +/- 键切台；有数字键的遥控器可按 1-9 直达对应频道，有播放/暂停键的遥控器可直接暂停或继续播放，0 则回到帮助/自检。
- 直播页返回键优先关闭频道列表，再按返回到简易首页；首页再按返回会出现大字退出确认。
- 搜索页、继续看页和“全部内容”原始首页在简易模式下都保留救援路径：按 0、菜单、信息、指南、设置或帮助键进入“帮助/自检”，“全部内容”页也支持 6 键自检，按返回最终回到简易首页。
- 摄像头页支持能力检测、一键授权摄像头/麦克风、内置 Camera2 预览测试和系统权限入口，会显示真实摄像头数量、USB/UVC 视频设备数量、麦克风/音频输入数量；预览测试会优先选择可预览的外接摄像头，再回退到后置/前置/任意摄像头；没有摄像头或麦克风也不影响看电视。
- 官方 QuickTVUI 仓库暂未提供手机摄像头 WebRTC 示例；“手机当电视摄像头”按 `docs/TV_BOX_REMOTE_CAMERA_PLAN.zh-CN.md` 的分层路线推进：默认推荐手机采集 + 电视端原生 WebRTC 接收，RTSP/RTMP + IJK 只作为同网预览 MVP，USB/UVC/Camera2 继续作为实体摄像头保底。电视端已经有 `phone_camera_pair` 配对入口，摄像头页按 4 可显示二维码和 6 位房间码；接入真实信令和 Android 原生 WebRTC 接收端前，这个入口只证明配对与验收边界，不证明真实首帧已经通过。微信小程序 `live-pusher` 可作为手机侧免安装入口，但需要服务类目、主体资质和接口权限审核，不能作为默认无门槛承诺。

如需恢复原瀑布流首页启动，把 `.env.production` 或 `.env.local` 里的 `VITE_TV_BOX_SIMPLE_MODE=false`。

最傻瓜化的电视盒子安装验收：

```bash
BOX_IP=<盒子IP> npm run tv-box:next
BOX_IP=<盒子IP> npm run tv-box:easy
```

优先跑 `tv-box:next`，它会先判断 ADB/RSA 授权；盒子已授权时自动执行 `tv-box:easy` 安装验收，未授权时自动刷新预检、现场开工卡、交付总控和 `reports/tv-box-next-latest.md/json`，把下一步压成一页。`tv-box:easy` 会用中文提示构建 Debug APK、连接盒子、安装、启动，自动跑一次遥控器基础冒烟，并生成交付报告、兼容性 latest 记录、兼容性自动汇总、`reports/tv-box-easy-run-latest.md/json` 一键安装自动沉淀摘要和交付目录；如果安装或验收中断，会自动生成 `reports/tv-box-support-latest.zip` 排障包。如果已经构建过 APK，只想重装：

```bash
BOX_IP=<盒子IP> SKIP_BUILD=true npm run tv-box:install-debug
```

如果你已经熟悉 ADB，也可以直接用安装脚本：

```bash
BOX_IP=<盒子IP> npm run tv-box:install-debug
```

如果已经安装好，只想跑基础验收：

```bash
adb connect <盒子IP>:5555
PACKAGE_NAME=com.quicktvui.hellotv npm run tv-box:smoke
```

基础验收会清空并抓取交互期间日志；发现 `AndroidRuntime` 或 `FATAL EXCEPTION` 会直接失败。

如果要专门验证摄像头按钮会不会崩溃、能否打开 App 内置摄像头预览：

```bash
BOX_IP=<盒子IP> npm run tv-box:camera-smoke
```

摄像头冒烟会尝试通过 ADB 授予摄像头和录音权限，点击“测试摄像头”后读取当前前台 Activity，必须看到 `CameraPreviewActivity`，再按返回确认可退出；这比只抓日志更适合判断电视盒子摄像头链路是否真正打开。

Logitech C920 PRO / C920 Pro HD 到货后，优先跑专用接入验收。它会先做遥控器基础冒烟，再跑摄像头冒烟、刷新 `inspect`、写入兼容性矩阵、硬件画像、完成度审计和交付总控；电视上是否看到真实画面、C920 自带麦克风是否可用、拔插后是否稳定，仍会保留人工确认结果，不能用自动 Activity 打开冒充摄像头通过。

```bash
BOX_IP=192.168.10.122 npm run tv-box:c920-acceptance
```

C920 验收报告还会生成“到货判定卡”，直接区分“USB 没看到视频设备”“USB 有线索但 Camera2 没枚举”“预览页已打开但需要看电视确认”“画面已确认但音频/热插拔未闭环”等状态，并汇总 ADB 离线/未授权设备、`/dev/video*`、`/dev/snd`、USB 视频/音频线索和 App 原生能力计数；首次未插摄像头运行时会保存 `reports/tv-box-c920-pro-baseline.json` 到货前基线，后续插上 C920 会自动对比是否新增 USB 视频、Camera2 摄像头和 USB 音频。上述证据用于排障，不替代 Camera2/CameraService 枚举和电视真实画面确认。

`npm run tv-box:c920-arrival-card` 会把最新 C920 验收报告转成 `reports/tv-box-c920-arrival-card-latest.md/json` 和可打印的 `reports/tv-box-c920-arrival-card.html`，给现场人员按“直插 C920 -> 运行验收命令 -> 电视真实画面确认 -> C920 自带麦克风/独立 USB 麦克风 -> USB 热插拔 -> 回传 support zip”顺序处理。它会明确写出：只有电视上看到 C920 PRO 真实画面，`FIELD_CAMERA_PREVIEW` 才能记 `pass`；只看到 USB 线索、Activity 打开或音频线索都不能冒充业务通过。

想在一键安装后顺手跑摄像头冒烟，可以打开开关：

```bash
BOX_IP=<盒子IP> RUN_CAMERA_SMOKE=true npm run tv-box:easy
```

不确定是电脑环境、APK、ADB 连接还是盒子权限问题时，先跑体检：

```bash
npm run tv-box:next
BOX_IP=<盒子IP> npm run tv-box:next
npm run tv-box:authorize
BOX_IP=<盒子IP> npm run tv-box:authorize
npm run tv-box:preflight
BOX_IP=<盒子IP> npm run tv-box:preflight
npm run tv-box:site-readiness
npm run tv-box:doctor
BOX_IP=<盒子IP> npm run tv-box:doctor
BOX_IP=<盒子IP> npm run tv-box:inspect
```

`tv-box:authorize` 是 ADB/RSA 授权助手，会生成 `reports/tv-box-authorization-latest.md` 和 `reports/tv-box-authorization-latest.json`，把现场状态压成 `adb_missing`、`no_box_target`、`target_not_visible`、`needs_rsa_authorization`、`needs_device_selection` 或 `ready_for_install`；报告没有变成 `ready_for_install` 前不要反复安装，先按报告处理同网、盒子 IP、电视屏幕 RSA 弹窗或 `DEVICE_SERIAL`。

`tv-box:next` 是现场唯一下一步入口，会生成 `reports/tv-box-next-latest.md` 和 `reports/tv-box-next-latest.json`。它先运行授权助手；如果状态是 `ready_for_install` 且未禁用自动安装，就继续执行安装、启动、遥控器冒烟、摄像头/麦克风冒烟和交付沉淀；如果未授权，就刷新 preflight、site readiness 和 command center，只告诉现场先授权、先发包、先补工具链还是先等真实盒子。需要只生成报告不安装时可设置 `NEXT_ALLOW_INSTALL=false`，需要禁止自动补交付包时可设置 `NEXT_BUILD_DELIVERY=false`。

`tv-box:next-scenarios-test` 会生成 `reports/tv-box-next-scenarios-test-latest.md/json`，用假 npm/假报告回归 `tv-box:next` 的 6 类分支：未授权不安装、已授权但禁用安装、已授权自动安装、缺交付包但禁用补齐、缺交付包自动补齐、工具链阻断。它不连接真实盒子，专门防止唯一入口未来误安装、误跳过授权或漏跑 `tv-box:check`。

`tv-box:preflight` 是安装前自动预检，会生成 `reports/tv-box-preflight-latest.md` 和 `reports/tv-box-preflight-latest.json`，自动判断电脑工具链、遥控器逻辑自测、Debug APK、交付压缩包 SHA256、ADB 授权状态和下一步动作；没有实机时会明确提示“可交付给现场但还需真实盒子验收”。

`tv-box:site-readiness` 会生成 `reports/tv-box-site-readiness-latest.md/json` 和可双击打印的 `reports/tv-box-site-readiness-card.html`。它把现场下一步压成“可发包 / 需授权 / 可安装 / 需补证据 / 需修复”，给项目负责人、现场安装人员和工程维护人员各一组动作；如果 ADB 显示 unauthorized/offline，它会明确要求先处理网络调试和 RSA 授权，不会让现场反复安装。

`tv-box:completion-audit` 默认生成 `final_delivery` 范围的 `reports/tv-box-completion-audit-latest.md/json`，把简易首页、遥控器逻辑、摄像头/麦克风可选能力、Debug APK、交付包、离线验收表、现场验收场景回归、现场回传收件箱场景回归、兼容性矩阵、排障包、ADB/RSA 授权和真实盒子安装逐项标成 `proven`、`needs_box`、`missing` 或 `failed`，方便区分“已经有自动化证据”和“必须等真实盒子验收”的边界。交付 zip 内也会带一份 `handoff_package` 随包快照，排障包内会带一份 `support_bundle` 随包快照；外层 zip 的最终 SHA256 以根目录 `final_delivery` 审计和 `tv-box:audit` 为准，避免随包文件自我引用外层压缩包。

`tv-box:ux-audit` 会生成 `reports/tv-box-ux-audit-latest.md/json`，独立扫描长辈/小孩使用路径：六入口简易首页、遥控器方向键/OK/数字/播放暂停/帮助键、帮助页“现在下一步”、遥控练习、摄像头/麦克风自检、电视端现场验收、直播数字键/播放暂停/收藏/帮助救援、复杂页救援和防误退出确认。它只证明源码、交付卡和本地自动化没有漂移；真实遥控器焦点、Camera2 预览、麦克风和 USB 热插拔仍按现场盒子验收闭环。

直播页已经按电视盒子简化：全屏时 1-9 直达频道、播放/暂停物理键暂停或继续播放、0/菜单/信息进帮助；打开频道列表后，OK 播放，7 收藏/取消收藏，8 在“全部频道/只看收藏”间切换，返回先收起列表、再回简易首页。收藏写入盒子本地存储，适合给长辈预先整理常看频道。

搜索页、继续看页和“全部内容”原始首页也按电视盒子兜底：不管是否正在输入、浏览结果、管理记录或误入复杂首页，按 0、菜单/信息/帮助键都能进帮助/自检，“全部内容”页还能按 6 求助，按返回最终回到简易首页，避免长辈和小孩困在二级页面。

`tv-box:release-ledger` 会生成 `reports/tv-box-release-ledger-latest.md/json`，并追加 `reports/tv-box-release-ledger.jsonl` 台账；每条记录集中保存 releaseId、APK SHA、交付包 SHA、排障包 SHA、readiness、完成度统计、兼容性样本数、Git 分支/提交和下一步动作，方便长期追踪“哪一版发给了现场、那一版还缺哪些实机证据”。

`tv-box:command-center` 会生成 `reports/tv-box-command-center-latest.md/json` 交付总控，把 releaseId、readiness、ADB/RSA 授权、APK/交付包/排障包 SHA、离线网页 smoke、现场验收场景回归、现场回传收件箱场景回归、现场回传收件箱、现场 JSON 收件箱、未闭环证据和“现场/工程/负责人下一步”集中到一页。给非技术安装人员或远程维护时，优先看这份总控，再按里面的 `START_HERE.html`、`FIELD_WIZARD_OFFLINE.html`、`FIELD_RETURN_CARD.html`、`npm run tv-box:return-inbox -- <现场回传目录或zip>`、`npm run tv-box:field-inbox`、`BOX_IP=<盒子IP> npm run tv-box:authorize`、`BOX_IP=<盒子IP> RUN_CAMERA_SMOKE=true npm run tv-box:easy` 执行。

`tv-box:hardware-profile` 会生成 `reports/tv-box-hardware-profile-latest.md/json` 硬件兼容性画像，把当前 ADB/USB/Camera/Audio 证据、现场兼容性记录、推荐盒子/遥控器/USB 摄像头/麦克风规格和“未实机不可关闭”的判定规则放在一页。给采购或现场人员选盒子、摄像头、麦克风前，优先看这份画像和 `docs/TV_BOX_AV_TEST_HARDWARE.zh-CN.md`；当前建议用 Logitech C920s/C920 Pro HD 做主摄像头、Logitech C270 做低规格备机、Jabra Speak 510 UC / Speak2 40/55 或同类免驱 USB Audio Class 设备做音频输入、带独立供电 USB Hub 排除盒子供电问题。没有真实盒子时它会保持 `needs_real_box`，不会假装实机遥控器或摄像头已经验收。

`tv-box:phone-camera-contract` 会生成 `reports/tv-box-phone-camera-contract-latest.md/json`，把“手机采集 + 电视端原生 WebRTC 接收”的房间码、信令消息、状态机、媒体档位、隐私边界、降级路线和现场验收证据固化成机器可读合同；`tv-box:phone-camera-signaling` 可在同网电脑上启动局域网 WebSocket 信令服务，默认监听 `0.0.0.0:17891`，手机采集端和电视接收端后续都接这个 `/phone-camera/signaling` 入口；`tv-box:phone-camera-signaling-test` 会启动本地局域网 WebSocket 信令服务并生成 `reports/tv-box-phone-camera-signaling-test-latest.md/json`，验证房间创建、无效房间拒绝、一台电视配一台手机、`offer` / `answer` / `ice-candidate` / `keepalive` 转发、`session.stats` 接收和挂断关闭房间；`tv-box:phone-camera-scenarios-test` 会生成 `reports/tv-box-phone-camera-scenarios-test-latest.md/json`，用合成信令回归扫码首帧、房间过期、手机权限失败、弱网降级、断线重连、隐私停止和微信小程序资质门禁。交付包会同时带 `TV_BOX_PHONE_CAMERA_CONTRACT.zh-CN.md`。电视端 `phone_camera_pair` 页面已经把二维码、6 位房间码、重新生成、返回摄像头、帮助自检、默认不录制和小程序资质门禁固化进源码审计；连上真实盒子后可运行 `BOX_IP=<盒子IP> npm run tv-box:phone-camera-pair-smoke`，自动从首页按 4 到摄像头页、再按 4 到配对页，抓取截图和 UI XML，验证页面文案、房间码、三步流程、隐私和验收边界。后续做 Android WebRTC 接收端、手机采集端或小程序入口，都按这份合同和场景回归验收，不把手机误说成系统 Camera2 摄像头；信令测试只证明 M2，不证明真实首帧已经通过。

体检会检查遥控器导航自测、JDK/Android SDK、最新 APK 包信息、Leanback/摄像头/麦克风声明；连上盒子后还会检查设备型号、Android 版本、电视/摄像头/音频 feature、App 安装、摄像头与录音权限声明、Camera/Record audio appops、当前前台窗口和 resumed Activity。`tv-box:inspect` 会把同类证据写成机器可读 JSON，并额外输出 `readiness` 就绪度结论，说明当前是否可交付、是否还缺真实盒子验收、下一步该做什么，方便远程排障和 CI artifact 留存。

连上真实盒子时，`tv-box:smoke` 会自动按一轮遥控器路径：首页帮助、直播帮助、直播频道列表、全部内容 0/6 键救援、搜索页 0 键救援、继续看页菜单键救援、摄像头页帮助和返回。它仍不能替代人工看画面，但能快速发现二级页面卡死、返回不到首页或按键触发崩溃。

连上盒子时，体检、验收报告和摄像头冒烟还会抓取系统 USB 快照；摄像头页能力检测会在日志里输出 `cameraCount`、`externalCameraCount`、`usbDeviceCount`、`usbVideoDeviceCount`、`audioInputDeviceCount`、`usbAudioInputDeviceCount`，便于排查 USB/UVC 摄像头和外接麦克风是否被系统识别。

没有盒子时也可以先跑遥控器核心路径自测：

```bash
npm run tv-box:remote-test
npm run tv-box:easy-failure-test
npm run tv-box:handoff-standalone-test
npm run tv-box:field-return-packer-test
npm run tv-box:return-inbox-scenarios-test
npm run tv-box:field-scenarios-test
npm run tv-box:ux-audit
```

`tv-box:easy-failure-test` 会用隔离临时目录模拟安装失败，验证 `tv-box:easy` 能返回失败状态、自动生成排障压缩包，并把正确的排障包路径打印给现场人员；它不会安装到真实设备。
`tv-box:handoff-standalone-test` 会把最新交付压缩包解到临时目录，验证 APK、`SHA256SUMS`、`MANIFEST.json`、macOS/Windows 双击安装脚本和离线首页在脱离源码仓库后仍然自洽。
`tv-box:field-return-packer-test` 会把最新交付压缩包解到临时目录，先静态验证 Windows 回传打包器的 PowerShell 压缩、标准 zip 命名、`FIELD_RETURN`、`INSTALL_LOG.txt`、排障包和打包日志保护项，再模拟现场把全通过 JSON、维护码照片和 `INSTALL_LOG.txt` 放进 `FIELD_RETURN/`，运行随包的 `PACK_FIELD_RETURN_ON_MAC.command` 生成回传 zip，最后用 `tv-box:return-inbox` 质检到 `ready_for_engineering_import` 和 `ready_to_close`；这能防止现场回传打包链路在后续改动中悄悄失效。
`tv-box:return-inbox-scenarios-test` 会用隔离临时目录生成 5 类现场回传：证据齐全、缺维护码照片、照片命名不确定、unknown 未闭环、失败但带异常证据；它会验证 `tv-box:return-inbox` 的 readiness、`closure.status`、strict 退出码和关键证据检查不会漂移。`closure.status` 只输出三类：`ready_to_close` 表示证据具备关闭条件，`needs_site_follow_up` 表示要现场补发/补测，`needs_fix` 表示证据齐全但已有 fail，需要工程修复或复测。
`tv-box:field-scenarios-test` 会用隔离临时目录生成 4 份合成现场验收 JSON，分别覆盖“盒子/遥控器/摄像头/麦克风全部通过”“没有摄像头/麦克风但核心看电视可用”“遥控器焦点失败必须 needs_fix”“仍有 unknown 不能关闭”，并输出 `reports/tv-box-field-scenarios-test-latest.md/json`。

交付前建议跑完整本地验收：

```bash
npm run tv-box:check
```

它会同时生成交付目录 `reports/tv-box-handoff/` 和可直接发送给现场人员的 `reports/tv-box-handoff-latest.zip`，并为压缩包生成 `reports/tv-box-handoff-latest.zip.sha256`，便于远程确认文件没传坏、没拿错版本。交付包里面包含 `HelloTV-debug.apk`、离线大字入口 `START_HERE.html`、ADB/RSA 授权报告、现场开工判定卡 `SITE_READINESS_CARD.html`、可双击打印的 `OPERATION_CARD.html`、现场回传卡 `FIELD_RETURN_CARD.html`、现场回传文件夹 `FIELD_RETURN/`、回传证据一键打包脚本 `PACK_FIELD_RETURN_ON_MAC.command` / `PACK_FIELD_RETURN_ON_WINDOWS.bat`、不用 npm 的离线现场验收表 `FIELD_WIZARD_OFFLINE.html`、离线 JSON 导入记录、现场 JSON 收件箱记录、现场验收场景回归、长辈/小孩遥控器 UX 审计、纯文本入口 `README_FIRST.txt`、3 步安装说明 `QUICK_START.zh-CN.md`、安装前自检卡 `PRE_INSTALL_CHECKLIST.zh-CN.md`、现场验收清单 `FIELD_ACCEPTANCE_CHECKLIST.zh-CN.md`、现场验收向导记录、验收报告、机器检查 JSON、一键安装自动沉淀摘要、现场开工判定报告、完成度证据审计、中文安装说明、macOS 可双击安装脚本 `INSTALL_ON_MAC.command`、Windows 可双击安装脚本 `INSTALL_ON_WINDOWS.bat`、安装失败信息清单 `INSTALL_SUPPORT.zh-CN.md`、Windows 错误代码排障卡 `WINDOWS_HELP.zh-CN.md`、`MANIFEST.json` 交付清单、失败排障自测命令、离线交付包自测命令、现场回传打包器自测命令和 SHA256。现场人员解压后优先双击 `START_HERE.html`；安装前先双击 `SITE_READINESS_CARD.html` 看当前应先发包、授权、安装、补证据还是修复；工程人员先跑 `BOX_IP=<盒子IP> npm run tv-box:authorize`，看到授权报告是 `ready_for_install` 后再安装；只需要教家人怎么用时双击 `OPERATION_CARD.html` 打印贴在电视旁；如果电脑打不开网页文件，就打开 `README_FIRST.txt`。安装前先按 `PRE_INSTALL_CHECKLIST.zh-CN.md` 确认同网、网络调试、盒子 IP、RSA 授权和文件完整性；安装完成后按 `FIELD_ACCEPTANCE_CHECKLIST.zh-CN.md` 逐项打勾，不满足清单时不要标记交付完成；测过真实盒子后打开 `FIELD_WIZARD_OFFLINE.html`，可先点一键模板再修正不符合项，然后下载 JSON/Markdown/env 交给工程人员，发回前再打开 `FIELD_RETURN_CARD.html` 核对现场 JSON、维护码照片、`INSTALL_LOG.txt` 或 `tv-box-support-latest.zip`、异常按键/摄像头照片是否齐全；不会压缩时把这些文件放进 `FIELD_RETURN/`，双击回传打包脚本生成 `HelloTV-field-return-*.zip`；工程人员收到现场文件夹或 zip 后先跑 `npm run tv-box:return-inbox -- <现场回传目录或zip>` 做证据质检，确认是真实盒子验收后再加 `--append` 写入累计矩阵；只拿到单份 JSON 时用 `npm run tv-box:field-import -- <现场下载的JSON>` 导入，多份 JSON 放进 `reports/tv-box-field-inbox/` 后用 `npm run tv-box:field-inbox` 批量导入兼容性矩阵。macOS/Windows 双击脚本都会先校验 `HelloTV-debug.apk` 和 `SHA256SUMS` 是否匹配，再自动搜索常见 adb 安装路径，安装后抓取包路径、前台窗口、当前 Activity 和最近 HelloTV/崩溃日志，并在本目录写入 `INSTALL_LOG.txt`，尽量减少坏包、错包、PATH 配置和远程排障沟通问题；Windows 脚本失败时会显示 `E10-E99` 错误代码，现场人员按排障卡处理即可。`tv-box:handoff` 每次都会重新生成机器检查 JSON、授权助手报告、兼容性记录、现场验收向导示例、离线验收表、现场回传卡、离线导入记录、现场 JSON 收件箱记录、现场验收场景回归、兼容性自动汇总、一键安装自动沉淀摘要、现场开工判定卡、长辈/小孩 UX 审计和完成度证据审计；`npm run tv-box:field-return-packer-test` 会用最新交付包演练“现场回传 zip -> 工程质检 ready_for_engineering_import”；`npm run tv-box:field-scenarios-test` 会验证现场验收分类规则没有漂移；`npm run tv-box:ux-audit` 会验证遥控器 UX 路径没有漂移；`npm run tv-box:site-readiness` 会验证现场下一步判定没有丢失；`npm run tv-box:release-ledger` 会把本次 APK/zip/SHA/readiness 写入交付台账；`npm run tv-box:audit` 会自动核对入口、Manifest、APK、报告、交付包、交付压缩包、安装前自检卡、现场开工判定卡、现场验收清单、现场回传卡、现场回传打包器自测、现场验收场景回归、音频输入字段、UX 审计、完成度证据审计、交付台账、压缩包 sidecar SHA256，以及 APK 在 `MANIFEST.json`、`tv-box-inspection-latest.json`、`SHA256SUMS` 里的大小和 SHA256 是否一致。

遇到现场问题时，生成一份可直接发给维护人员的排障包：

```bash
npm run tv-box:support
BOX_IP=<盒子IP> npm run tv-box:support
```

排障包默认写入 `reports/tv-box-support/`，并生成 `reports/tv-box-support-latest.zip` 和 `reports/tv-box-support-latest.zip.sha256`。里面包含授权助手、preflight/doctor 输出、机器检查 JSON、一键安装自动沉淀摘要、现场开工判定卡、完成度证据审计、现场验收向导记录、现场回传收件箱质检、现场验收场景回归、ADB 设备状态、设备能力/USB/摄像头/麦克风线索、当前前台窗口、Camera/Record audio appops、最近日志、3 步安装说明、安装前自检卡、现场验收清单、现场回传卡、当前交付清单和 `handoff-standalone-test.txt` 离线交付包自检结果；`.sha256` 用于确认远程排障包没有传坏。

交付目录还会生成 `OPERATION_CARD.html`、`OPERATION_CARD.zh-CN.md`、`FIELD_RETURN_CARD.html`、`FIELD_RETURN_CARD.zh-CN.md`、`FIELD_RETURN/README.zh-CN.txt`、`PACK_FIELD_RETURN_ON_MAC.command`、`PACK_FIELD_RETURN_ON_WINDOWS.bat`、`PRE_INSTALL_CHECKLIST.zh-CN.md`、`FIELD_ACCEPTANCE_CHECKLIST.zh-CN.md`、`INSTALL_SUPPORT.zh-CN.md` 和 `WINDOWS_HELP.zh-CN.md`。HTML 操作卡可双击打开并打印，Markdown 操作卡可直接发给家人或贴在电视旁，说明日常看电视、直播数字键 1-9 换台、播放/暂停键、直播 0/菜单/信息/帮助键自检、找节目、继续看、首页退出确认、摄像头检查和现场排障；现场回传卡会要求现场发回 JSON、维护码照片、`INSTALL_LOG.txt` 或 `tv-box-support-latest.zip`、异常 `keyCode`/摄像头/权限照片，并明确提醒不要把应补测项留成 `unknown`；回传打包脚本会把 `FIELD_RETURN/` 内证据和根目录 `INSTALL_LOG.txt` 自动打成 `HelloTV-field-return-*.zip`；工程人员收到后先看 `tv-box:return-inbox` 的 `closure.status`，只有 `ready_to_close` 且写入兼容性矩阵后才能进入关闭复核，`needs_site_follow_up` 要现场补发/补测，`needs_fix` 要工程修复；安装前自检卡让现场人员先确认网络、IP、RSA 授权和交付文件完整；现场验收清单让安装人员按安装、遥控器、直播、帮助/自检、摄像头、失败证据逐项确认；安装失败清单会告诉现场人员发送 `INSTALL_LOG.txt`、盒子型号、IP、电视屏幕照片和维护码；Windows 排障卡让现场安装人员按错误代码处理，不需要理解命令行。

多款盒子、遥控器和 USB 摄像头复测时，生成标准化实机兼容性记录：

```bash
BOX_IP=<盒子IP> npm run tv-box:field-wizard
npm run tv-box:field-wizard-html
npm run tv-box:field-import -- ~/Downloads/tv-box-field-wizard-offline-20260528-120000.json
npm run tv-box:field-inbox -- ~/Downloads/hellotv-field-json
npm run tv-box:return-inbox -- ~/Downloads/hellotv-field-return.zip
FIELD_OPERATOR=张三 FIELD_BOX_BRAND=小米 FIELD_ZERO_KEY_HELP=pass FIELD_HELP_KEY_SHORTCUTS=pass FIELD_REMOTE_PRACTICE=pass FIELD_EXIT_CONFIRM=pass FIELD_LIVE_NUMERIC_CHANNELS=pass FIELD_CAMERA_MODEL="Logitech C270" FIELD_AUDIO_INPUT=pass BOX_IP=<盒子IP> npm run tv-box:field-record
```

优先使用交付包里的 `FIELD_WIZARD_OFFLINE.html` 或源码里的 `tv-box:field-wizard`。离线 HTML 不用联网、不用 npm，现场可先点一键模板：“只验收看电视通过”“摄像头/麦克风通过”“没有摄像头/麦克风”“全部通过”，再把少数不符合的项目改成失败或未知；也可以逐项按大按钮选择“通过/失败/跳过/不适用/未知”，下载 JSON、Markdown 和 `tv-box-field-wizard-latest.env`。现场发回前先打开 `FIELD_RETURN_CARD.html`，确认 JSON、维护码照片、日志/排障包和异常照片齐全；工程人员收到整个现场文件夹或 zip 后先运行 `tv-box:return-inbox`，它会生成 `reports/tv-box-return-inbox-latest.md/json`，检查“四样证据”是否齐全，并默认用 dry-run 验证 JSON 可导入但不写矩阵；确认是真实盒子验收后再加 `--append`。`tv-box:return-inbox-scenarios-test` 会持续验证缺维护码照片、照片命名不确定、unknown 未闭环、失败带证据这几类工程收件箱规则，防止不完整现场证据被误收。只拿到单份 JSON 时用 `tv-box:field-import` 一步导入，多份 JSON 直接放进 `reports/tv-box-field-inbox/` 后运行 `tv-box:field-inbox`，它会生成 `reports/tv-box-field-inbox-latest.md/json` 和单条导入归档，再调用 `tv-box:field-import`、`tv-box:field-record` 和 `tv-box:compatibility-summary`。命令行向导会基于 `tv-box:inspect` 的 ADB/USB/Camera/Record audio appops 证据，输出 `reports/tv-box-field-wizard-latest.md/json/env`、`reports/tv-box-field-record-latest.md`、`reports/tv-box-field-record-latest.json`，并把确认追加的结果写入 `reports/tv-box-field-matrix.csv`。交付包里也会带 `FIELD_COMPATIBILITY_MATRIX.zh-CN.md`，用于统一填写遥控器、直播、直播数字键 1-9 换台、播放/暂停键、0/菜单/信息/帮助键自检、遥控器练习、首页退出确认、摄像头权限、预览、音频输入、录音权限和 USB 热插拔结果。

本地或 CI 没接盒子、也没填写现场字段时，`tv-box:field-record` 只刷新 latest 记录，不会把空白 `needs_box` 行追加进累计 CSV；需要强制追加时可设置 `FIELD_APPEND_MATRIX=true`。

仓库也提供 GitHub Actions 工作流 `.github/workflows/tv-box-check.yml`，会在 PR、main/master/codex 分支推送或手动触发时用 `package-lock.json` 执行 `npm ci --legacy-peer-deps`，再运行 `npm run tv-box:check`，并上传 `reports/tv-box-handoff/`、`reports/tv-box-handoff-latest.zip`、`reports/tv-box-field-wizard-latest.*`、`reports/tv-box-field-wizard-offline.html`、`reports/tv-box-field-import-latest.*`、`reports/tv-box-field-inbox-latest.*`、`reports/tv-box-field-inbox-imports/`、`reports/tv-box-return-inbox-latest.*`、`reports/tv-box-return-inbox-json/`、`reports/tv-box-return-inbox-scenarios-test-latest.*`、`reports/tv-box-field-scenarios-test-latest.*`、`reports/tv-box-hardware-profile-latest.*`、`reports/tv-box-easy-run-latest.*`、`reports/tv-box-next-latest.*`、`reports/tv-box-next-scenarios-test-latest.*`、`reports/tv-box-authorization-latest.*`、`reports/tv-box-ux-audit-latest.*`、`reports/tv-box-site-readiness-latest.*`、`reports/tv-box-site-readiness-card.html`、`reports/tv-box-completion-audit-latest.*`、`reports/tv-box-release-ledger-latest.*`、`reports/tv-box-release-ledger.jsonl` 和对应 `.sha256` 作为构建产物。

需要留存验收证据时，生成一份 Markdown 报告：

```bash
npm run tv-box:report
BOX_IP=<盒子IP> npm run tv-box:report
```

报告默认写入 `reports/tv-box-acceptance-latest.md`，包含工具链、APK Manifest、设备连接、安装状态和人工实机验收清单。

### 5. 配置设备连接

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

### 6. 查看效果

应用会自动从开发服务器加载代码，修改源码后会实时更新。

## 📦 打包发布

### 生成 APK

```bash
# 首次在 macOS 验证 Android 编译，可先安装工具链：
# brew install openjdk@11 openjdk@17 android-commandlinetools android-platform-tools

# 安装 Android SDK 31（sdkmanager 需要 JDK 17）
# JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home sdkmanager --sdk_root=/opt/homebrew/share/android-commandlinetools "platforms;android-31" "build-tools;31.0.0" "platform-tools"

# Java/Android 原生编译冒烟
./scripts/android-verify.sh

# Debug 包
npm run build-apk-debug

# 这条命令会自动识别常见 Homebrew JDK/Android SDK 路径

# Debug 包一键安装验收到电视盒子
BOX_IP=<盒子IP> npm run tv-box:easy

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
