# 电视盒子遥控器与摄像头方案

## 目标

让 HelloTV 在小米盒子、Android TV、智能投影和常见安卓电视盒子上保持“打开就会用”的体验：

- 长辈和小孩只看到常用入口，不需要理解瀑布流、分类和复杂筛选。
- 全程可以用遥控器方向键、OK、返回、频道 +/- 完成主要操作。
- 支持电视盒子内置或 USB/UVC 摄像头、麦克风/音频输入的能力检测；没有摄像头或麦克风也不影响看片。

## 技术依据

- Android TV App Quality 对电视端输入有明确要求：`TV-DP` 要求 App 可通过方向键完成导航，`TV-DM` 要求 App 不依赖菜单键。对应到本方案，主路径必须用方向键、OK、返回完成；0/菜单/信息/帮助键只是救援入口，不能成为唯一入口：https://developer.android.com/docs/quality-guidelines/tv-app-quality
- Android TV 官方导航指南把方向键、确认、返回定义为电视端控制器的基础能力，因此本方案把主路径压缩成大按钮、显式焦点、方向键移动、OK 执行、返回兜底，不依赖触屏或复杂手势：https://developer.android.com/training/tv/start/navigation
- Android 官方 `<uses-feature>` 文档说明，`CAMERA`、`RECORD_AUDIO` 等权限可能影响设备过滤；如果 App 没有这些硬件也能工作，应显式声明对应 feature 为 `android:required="false"`。因此本方案把摄像头、麦克风、USB Host、触屏都作为 optional 能力，避免无外设电视盒子无法安装：https://developer.android.com/guide/topics/manifest/uses-feature-element
- Camera2 的 `CameraCharacteristics.LENS_FACING` 支持 `EXTERNAL`，但外接摄像头 feature 不保证每个 USB 设备都能被 Camera HAL 暴露给 App。因此本方案同时记录 Camera2 摄像头数量和 USB/UVC 设备数量，区分“系统摄像头可预览”和“USB 硬件已插入但 HAL 未开放”：https://developer.android.com/reference/android/hardware/camera2/CameraCharacteristics#LENS_FACING

## 技术质量门禁

`npm run tv-box:audit` 会把上面的规则变成可执行门禁：

- Manifest 必须有 `LEANBACK_LAUNCHER` 和电视横幅，保证电视盒子桌面可发现。
- `leanback`、触屏、摄像头、外接摄像头、麦克风、USB Host 必须全部是 `android:required="false"`，保证无摄像头/无触屏盒子仍可安装。
- 简易首页、直播、搜索、继续看、摄像头、帮助、自检和遥控器练习都必须有 D-pad / OK / 返回 / 0 键救援路径。
- 离线交付网页 smoke test 会检查 `START_HERE.html`、操作卡、硬件选型卡、现场回传卡和离线验收表的本地链接与核心文案，避免现场拿到断链或漏说明的包。

## 当前落地

- 默认启动页从原 `home` 改为 `tv_box_home`，由 `VITE_TV_BOX_SIMPLE_MODE` 控制。
- 新增 `src/pages/tv-box-home/index.vue`：六个大入口，看电视、找节目、继续看、摄像头、全部内容、帮助自检；每个入口直接显示 1-6 数字捷径。
- 新增 `src/pages/tv-box-help/index.vue`：帮助/自检页，集中展示遥控器规则、摄像头状态、权限状态和现场排障提示；6 键、0 键、菜单键、信息键、指南键、设置键或帮助键均可进入；页头会显示“现在下一步”唯一建议，把权限、摄像头、USB 外设和遥控练习收敛成可直接按的 2/3/4 号动作。
- 新增 `src/pages/tv-box-remote-practice/index.vue`：遥控器练习页，帮助页按 3 进入，长辈或小孩可按屏幕提示练方向键、OK 和返回键。
- 新增 `src/pages/tv-box-exit/index.vue`：电视盒子专用退出确认，首页按返回后默认“继续看”，只有明确选“退出应用”才关闭。
- 新增 `src/pages/camera-setup/index.vue`：检测摄像头、摄像头/录音权限、麦克风、电视环境，提供“重新检测”“一键授权”“测试摄像头”和“打开权限设置”；按钮同样显示 1-5，降低长辈和小孩记忆成本。
- 帮助页和摄像头页都会显示“维护码”，把 App 版本、型号、SDK、摄像头数量、USB 视频设备、音频输入和权限状态压成一行，方便长辈电话读给维护人员。
- 新增原生桥 `TvBoxModule`：通过 Android `PackageManager` 检测 camera/microphone/leanback/USB Host feature，用 Camera2 枚举真实摄像头数量与外接摄像头数量，用 USB Manager 统计 USB 设备与 USB Video Class 设备，并用 `AudioManager` 统计音频输入和 USB 音频输入设备，通过系统设置打开应用权限页。
- 新增原生 `CameraPreviewActivity`：用 App 内置 Camera2 全屏预览测试摄像头，避免电视盒子没有系统相机 App 时无法验证摄像头通路；预览选路会优先选择支持预览能力的外接摄像头，再回退到后置、前置或任意摄像头。
- `MainActivity` 对摄像头预览和权限设置这类外部 Activity 做保活处理，避免用户测试摄像头或打开系统设置后返回时 App 被直接关闭。
- `AndroidManifest.xml` 声明 `LEANBACK_LAUNCHER`、电视启动横幅、可选摄像头/麦克风/USB Host 能力和 `CAMERA`、`RECORD_AUDIO` 权限。摄像头、麦克风与 USB Host 均为 `required=false`，避免无外设盒子无法安装。
- 直播页遥控器策略改为：OK/左/右打开频道列表，上/下切台，频道 +/- 切台；有数字键的遥控器可按 1-9 直达对应频道，有播放/暂停物理键的遥控器可直接暂停或继续播放，频道列表里按 7 收藏/取消收藏、按 8 在“全部频道/只看收藏”间切换，0/菜单/信息/帮助键进入帮助/自检，返回先收起菜单、再回简易首页。
- 新增 `npm run tv-box:next`：现场唯一下一步入口，先判断 ADB/RSA 授权；已授权就继续跑一键安装、遥控器冒烟、摄像头/麦克风冒烟和交付沉淀，未授权就刷新 preflight、site readiness、command center 和 `reports/tv-box-next-latest.md/json`，把“先发包、先授权、先安装、先补工具链、先补现场证据”压成一页。
- 新增 `npm run tv-box:next-scenarios-test`：不用真实盒子，用假 npm/假报告回归唯一下一步入口的 6 类关键分支，证明未授权不会误安装、已授权才进 `tv-box:easy`、缺交付包时才按开关补 `tv-box:check`、工具链阻断不会被误判为可安装。
- 新增 `npm run tv-box:easy`：中文引导式一键安装验收，串起构建、连接、安装、启动、遥控器冒烟、验收报告、兼容性 latest 记录、兼容性自动汇总、一键安装自动沉淀摘要和交付目录。
- 新增 `npm run tv-box:install-debug`：构建 Debug APK、安装到盒子、启动 App，并可自动跑遥控器冒烟脚本。
- 新增 `npm run tv-box:camera-smoke`：连上盒子后自动授予摄像头和录音权限，进入摄像头页，触发“测试摄像头”，确认 `CameraPreviewActivity` 成为前台 Activity，再按返回验证可退出并抓取摄像头/音频/崩溃日志。
- 新增 `npm run tv-box:doctor`：先体检电脑工具链、APK Manifest、ADB 连接、盒子 feature 和 App 安装状态，便于普通用户把问题定位到“电脑环境 / 盒子连接 / App 安装 / 权限”。
- 新增 `npm run tv-box:inspect`：输出 `reports/tv-box-inspection-latest.json`，把工具链、源码合约、APK SHA256、遥控器自测、ADB/盒子/摄像头/麦克风线索、Camera/Record audio appops、当前前台窗口和下一步动作写成机器可读证据。
- `tv-box:inspect` 会输出 `readiness` 就绪度结论，把原始证据归纳成“可交付 / 可安装 / 已实机安装 / 阻断”，并给出现场下一步动作。
- 新增 `npm run tv-box:authorize`：生成 `reports/tv-box-authorization-latest.md/json`，专门处理 ADB/RSA 授权，把缺 adb、没给 IP、看不到目标、电视屏幕要点 RSA、多设备要选目标和 `ready_for_install` 分开，现场未授权时先看这份报告，不反复安装。
- 新增 `npm run tv-box:preflight`：安装前只读预检，生成 `reports/tv-box-preflight-latest.md/json`，自动判断电脑工具链、遥控器逻辑自测、Debug APK、交付压缩包 SHA256、ADB 授权状态和下一步动作；没有实机时明确给出“交付包可发现场，但仍需真实盒子验收”。
- 新增 `npm run tv-box:report`：生成 Markdown 验收报告，沉淀工具链、APK Manifest、设备连接、安装状态和人工实机验收清单。
- `tv-box:doctor`、`tv-box:report` 和 `tv-box:camera-smoke` 连上盒子后会抓取 `dumpsys usb` 关键行；`TvBoxModule` 能力检测也会写入 `usbDeviceCount` / `usbVideoDeviceCount` / `audioInputDeviceCount` / `usbAudioInputDeviceCount` 日志，便于判断 USB 摄像头和麦克风是否被系统识别。
- 新增 `npm run tv-box:remote-test`：不依赖电视盒子，自动验证简易首页 6 个入口和摄像头页按钮行的遥控器选中逻辑。
- 新增 `npm run tv-box:field-record`：每次实机复测后，把盒子型号、Android SDK、遥控器结果、遥控器练习页、首页退出确认、摄像头权限/预览/USB 热插拔、音频输入、录音权限、维护码可读性和 ADB/USB/Camera/Record audio appops 证据写入 Markdown、JSON 与 CSV，形成可横向比较的兼容性矩阵。
- 新增 `npm run tv-box:field-wizard`、`npm run tv-box:field-wizard-html`、`npm run tv-box:field-import` 和 `npm run tv-box:field-inbox`：命令行中文现场验收向导、交付包内的 `FIELD_WIZARD_OFFLINE.html` 离线表单、单份离线 JSON 导入器，以及多人多盒 JSON 收件箱批量导入；安装人员不用 npm 也能先点“只验收看电视通过 / 摄像头麦克风通过 / 没有摄像头麦克风 / 全部通过”一键模板，再按大按钮修正“通过/失败/跳过/不适用/未知”，下载 JSON/Markdown/env，工程人员直接导入 JSON 追加累计矩阵，避免手写一长串 `FIELD_*`。
- 新增 `npm run tv-box:field-scenarios-test`：用合成现场 JSON 回归验收分类，覆盖全部通过、无摄像头/麦克风但核心看电视可用、遥控器焦点失败、unknown 未闭环 4 类关键场景。
- 新增 `npm run tv-box:return-inbox-scenarios-test`：用合成现场回传目录回归工程收件箱质检，覆盖证据齐全、缺维护码照片、照片命名需人工确认、unknown 未闭环、失败但带异常证据 5 类关键场景，并校验 strict 模式退出码。
- 新增 `npm run tv-box:easy-summary`：把一键安装、验收报告、latest 兼容性记录、兼容性自动汇总、交付包、排障包和 readiness 汇成 `reports/tv-box-easy-run-latest.md/json`，现场只需要看“傻瓜化交付结论”和下一步动作。
- 新增 `npm run tv-box:completion-audit`：把源码合约、自动化报告、交付包、排障包、离线验收表和真实盒子验收状态汇成 `reports/tv-box-completion-audit-latest.md/json`，逐项标记 `proven`、`needs_box`、`missing` 或 `failed`，防止把“未接真实盒子”误说成“已完成实机验收”。默认 `final_delivery` 审计校验最终交付 zip 和排障 zip 的 SHA256；交付包和排障包内分别携带 `handoff_package`、`support_bundle` 随包快照，不自我引用尚未完成写入的外层压缩包。
- 新增 `npm run tv-box:release-ledger`：生成 `reports/tv-box-release-ledger-latest.md/json` 并追加 `reports/tv-box-release-ledger.jsonl`，沉淀每次发包的 releaseId、APK/交付包/排障包 SHA256、readiness、完成度统计、兼容性样本、Git 分支/提交和下一步动作，便于长期追踪现场版本。
- 新增 `npm run tv-box:audit`：自动核对简易入口、摄像头入口、Manifest、APK、验收报告、安装日志说明和交付包是否齐全。
- 新增 `.github/workflows/tv-box-check.yml`：在 PR、main/master/codex 分支推送或手动触发时基于 `package-lock.json` 执行 `npm ci --legacy-peer-deps`，再运行 `npm run tv-box:check`，并上传 `reports/tv-box-handoff/`、`reports/tv-box-handoff-latest.zip`、`reports/tv-box-field-wizard-latest.*`、`reports/tv-box-field-wizard-offline.html`、`reports/tv-box-field-import-latest.*`、`reports/tv-box-field-inbox-latest.*`、`reports/tv-box-field-inbox-imports/`、`reports/tv-box-return-inbox-scenarios-test-latest.*`、`reports/tv-box-field-scenarios-test-latest.*`、`reports/tv-box-easy-run-latest.*`、`reports/tv-box-next-latest.*`、`reports/tv-box-next-scenarios-test-latest.*`、`reports/tv-box-authorization-latest.*`、`reports/tv-box-completion-audit-latest.*`、`reports/tv-box-release-ledger-latest.*`、`reports/tv-box-release-ledger.jsonl` 与对应 `.sha256`，避免电视盒子方案只停留在单台电脑可用。
- 基础遥控器冒烟和摄像头冒烟都会抓取交互期间日志；出现 `E AndroidRuntime`、`FATAL EXCEPTION`、`reportException`、`render view exception` 或 `Uncaught` 会直接失败，避免“看起来按过键但实际崩过”的假通过，同时不过度误判 `adb shell input` 产生的普通 `D AndroidRuntime`。

## 遥控器交互规范

| 按键 | 简易首页 | 直播全屏 | 频道列表 | 摄像头页 | 遥控练习页 |
| --- | --- | --- | --- | --- | --- |
| 上/下/左/右 | 移动焦点 | 上/下切台，左/右打开频道列表 | 切换分类/频道/节目单 | 移动焦点 | 显示刚按的方向 |
| OK/Enter/确认 | 进入当前入口 | 打开频道列表 | 播放选中频道 | 执行按钮 | 显示 OK 成功 |
| 返回 | 大字退出确认 | 返回上一页或退出 | 收起频道列表 | 返回简易首页 | 返回简易首页 |
| 数字键 | 1-6 直达入口，0 帮助/自检 | 1-9 直达对应频道，0 帮助/自检 | 7 收藏/取消收藏，8 只看收藏/全部频道，0 帮助/自检 | 1-5 执行按钮，6/0 帮助/自检 | 1 重新开始，2 回首页，3 回帮助/自检 |
| 播放/暂停/停止 | 保持当前页 | 暂停或继续播放；停止键按暂停处理，避免误退出 | 暂停或继续播放，频道列表保留 | 保持当前页 | 保持当前页 |
| 频道 +/- | 无操作 | 切换频道 | 保持焦点不抢占 | 无操作 | 保持当前页 |
| 0/菜单/信息/帮助 | 首页也支持 6 进入帮助/自检 | 进入帮助/自检；6 按数字键规则切第 6 个频道 | 保持当前列表 | 摄像头页也支持 6 进入帮助/自检 | 进入帮助/自检 |

简易首页做了显式按键兜底：即使部分盒子的焦点事件不稳定，上/下/左/右也会在六个入口之间移动黄色选中态，OK/Enter/小键盘 Enter/蓝牙确认键会执行当前选中的入口。按钮上直接显示数字键 1-6，也可直接执行对应入口，适合有数字键的电视盒子遥控器。第 6 个入口是可见的“帮助自检”，同时按 6 或 0 也会进入帮助/自检页；没有数字键的遥控器可按菜单、信息、指南、设置或帮助键进入同一页。

搜索页、继续看页和“全部内容”原始首页保留同一条救援路径：简易模式下按 0、菜单、信息、指南、设置或帮助键进入帮助/自检；“全部内容”页额外支持 6 键救援，按返回最终回简易首页。这样老人和小孩进入二级页面或误入复杂首页后不用理解键盘、筛选、历史管理或瀑布流状态，只记“0 求助、返回回家”。

摄像头页额外做了显式按键兜底：即使部分盒子的焦点事件不稳定，上/下/左/右键也会在“重新检测 / 一键授权 / 测试摄像头 / 打开权限设置 / 返回首页”五个按钮之间移动内部选中态，OK 会执行当前选中按钮。按钮上直接显示数字键 1-5，可直接执行对应按钮；按 6、0、菜单、信息、指南、设置或帮助键进入帮助/自检页。

帮助/自检页会根据当前盒子状态给出“现在下一步”：权限未允许时提示按 2 处理权限，系统能识别摄像头时提示按 2 测摄像头，USB 视频设备已插入但 Camera HAL 未开放时提示按 2 试 USB 摄像头，无摄像头/麦克风时提示按 4 直接看电视，不会操作时提示按 3 练遥控。这样老人和小孩不用理解四个状态卡，只按屏幕上最大的一条建议继续。

遥控练习页把“教学”变成电视屏幕上的即时反馈：帮助页按 3 进入后，方向键会点亮对应方位，OK 会点亮中间，返回键直接回首页；数字键 1 可重新开始，2 返回首页，3 回帮助/自检。这个页面用于现场教会老人和小孩，也用于判断某些遥控器是否把方向键或确认键映射成非标准按键。

首页返回键使用电视盒子专用退出确认，不再进入原影视挽留弹窗。默认焦点是“继续看”，返回键也会继续看；数字键 2 或选中“退出应用”后按 OK 才走退出动作，降低误退出和看不懂弹窗的概率。

直播播放/暂停不新增浮层：有播放/暂停键的遥控器可在直播页直接暂停或继续播放；停止键按暂停处理，避免长辈误按后退出 App 或丢失当前位置。没有播放/暂停键的遥控器可在现场验收表把该项记为 `na`，不影响看电视核心链路。

直播收藏不新增复杂设置页：进入频道列表后，按 7 就把当前焦点频道加入或移出收藏，按 8 切换“只看收藏频道”和“全部频道”。收藏保存在本机电视盒子本地存储里，下一次打开仍然保留；没有收藏时按 8 会自动提示先收藏频道。

## 摄像头技术路线

### 手机当电视摄像头：官方证据与推荐架构

2026-05-29 已对官方 GitHub 仓库 `quicktvui/quicktvui`、`quicktvui/quicktvui-next`、`quicktvui/quicktvui-sdk`、`quicktvui/quicktvui-runtime-apk`、`quicktvui/quicktvui-api-demo-vue3`、`quicktvui/quicktvui-template` 和 `quicktvui/hellotv` 拉取最新远端引用并检索。当前没有发现官方提供的 `WebRTC`、`getUserMedia`、`RTCPeerConnection` 或“手机摄像头直连电视端”的示例代码。因此“手机当电视摄像头”不能理解成 QuickTVUI 已经把手机注册成 Android 系统 `Camera2` 设备；更科学的理解是：手机负责采集音视频，电视盒子 App 通过局域网信令和媒体通道接收、展示或用于业务。

官方仓库可利用的能力边界如下：

- `quicktvui-sdk` 提供 IJK 视频播放器，`IjkVideoView` 的协议白名单包含 `sdp`、`rtp`、`rtmp`、`rtsp`、`tcp`、`udp`，并支持播放器 option 下发；这适合把手机端推出来的 RTSP/RTMP/UDP 流作为电视端播放源。
- `quicktvui-next` 文档提供 `ESVideoPlayer` / `ESPlayerManager`，前端业务侧以 `ESMediaSource.uri` 设置播放地址；这可以承接 `rtsp://`、`rtmp://`、`http(s)://` 等媒体 URL，但实时通话级能力仍取决于底层播放器和盒子固件。
- `quicktvui-sdk` 提供 `webview` / `x5webview`，文档暴露 `loadUrl`、`evaluateJavascript`、`setMediaPlaybackRequiresUserGesture` 等 WebView API；但官方源码里未发现 WebRTC 权限请求、`onPermissionRequest` 或 WebRTC 示例，所以 WebView 方案必须先做实机兼容实验，不能作为默认承诺。
- `quicktvui-sdk` 提供 `websocket` / `socket-io` 支持，`quicktvui` 提供 `qt-qr-code` 组件；这适合做手机扫码配对、局域网发现和信令交换。
- `quicktvui-sdk` 提供 USB 设备枚举、USB 热插拔事件、设备信息里的 Camera 信息，以及 `audio-record`、音频播放/录音模块；这说明官方更偏向 Android 原生能力桥接，而不是把手机摄像头虚拟成系统摄像头。
- 微信小程序 `live-pusher` / `live-player` 可以作为“手机免安装入口”，但它不是 QuickTVUI/Android 盒子侧能力。开发者提供的类目说明显示，推流能力需要国内主体、类目审核和后台接口权限；教育类“在线视频课程”、IT 科技类“多方通信/音视频设备”等场景可能覆盖，但必须先完成主体资质、服务类目和审核确认，不能当作默认无门槛链路。

推荐把“手机当摄像头”拆成四条产品路线：

| 路线 | 适用目标 | 技术方案 | 优点 | 风险与限制 |
| --- | --- | --- | --- | --- |
| A. WebRTC 原生接入 | 视频通话、AI 看护、互动课、低延迟摄像头 | 手机 Web/PWA 或手机 App 采集摄像头和麦克风；电视盒子原生 Android 集成成熟 WebRTC SDK；QuickTVUI 负责二维码、状态页、遥控器操作和原生桥启动/停止 | 低延迟、音视频同步、拥塞控制、回声消除、后续可双向通话 | 需要新增原生 WebRTC 模块；信令服务必须可维护；旧盒子需限制 720p/15fps 或 480p/15fps |
| B. RTSP/RTMP 局域网投屏 | 只需要把手机画面显示到电视，不需要强互动 | 手机 App 推 RTSP/RTMP 或本地 HTTP-FLV/HLS；电视端用官方 IJK/ESVideoPlayer 播放 URL | 和现有 QuickTVUI 播放器体系贴合，MVP 快 | 延迟通常更高；浏览器手机端不一定能直接推 RTSP/RTMP；音频同步、断线重连和权限体验要额外做 |
| C. USB/UVC/Camera2 | 真正让电视盒子本机获得摄像头能力 | 外接 USB 摄像头或盒子内置摄像头走 Camera2/CameraX；当前 `CameraPreviewActivity` 已验证这条路 | 最接近 Android 系统摄像头，适合扫码、拍照、体感、离线能力 | 依赖盒子固件是否把 UVC 暴露给 Camera HAL；不同摄像头兼容性必须现场矩阵沉淀 |
| D. 微信小程序免安装推流 | 用户不愿安装手机 App，且主体资质能覆盖直播/实时音视频类目 | 手机端用小程序 `live-pusher` 采集摄像头/麦克风；电视端仍走 WebRTC/RTC 云或低延迟播放链路接收；QuickTVUI 显示二维码、配对状态和断线重试 | 手机侧入口最轻，适合公开课、线上课、售后演示和临时互动 | 需要服务类目、主体资质、接口权限和审核；审核周期、隐私合规、未成年人保护、直播监管和云服务成本都要提前评估 |

本项目默认推荐路线 A：电视端新增“手机摄像头配对”能力时，先实现局域网信令 + 原生 WebRTC 接收端，前端只做遥控器友好的配对、状态、重试和降级，不在 QuickTVUI 前端手写媒体传输。原因是 WebRTC 已经包含实时音视频必需的 jitter buffer、带宽自适应、NACK/PLI、音视频同步和回声处理，适合长辈小孩使用时“少等待、少配置、断了能重连”的目标。

路线 A 的最小闭环建议：

1. 电视端显示一个大二维码，内容为 `https://<局域网服务>/pair?room=<一次性房间码>`；遥控器只有“重新生成”“返回”“帮助”三个动作。
2. 手机扫码打开网页或 App，用户只点“允许摄像头/麦克风”和“开始连接”。
3. 局域网信令服务用 WebSocket 交换 offer/answer/ICE；同 Wi-Fi 优先 host candidate，跨网或复杂路由再配置 STUN/TURN。
4. 手机端默认 720p/15fps，低端盒子自动降到 480p/15fps；电视端只渲染远端流，不默认采集电视摄像头。
5. 断线后电视端显示“手机离线，按 OK 重新生成二维码”，手机端自动重连一次；超过 30 秒给出手动重连。
6. 音频策略默认使用手机麦克风；如果电视盒子已检测到本机麦克风，可在后续专业模式里切换，但长辈模式不暴露复杂选项。

路线 B 的 MVP 可作为快速验证：手机端使用成熟推流 App 或自研 Android 小 App 推 `rtsp://<phone-ip>:8554/live`，电视端把这个 URL 作为 `ESMediaSource.uri` 交给 IJK 播放。若现场只需要“远程看一眼手机摄像头画面”，这条路成本最低；若目标是视频通话、互动课或 AI 识别，仍应回到路线 A。

路线 C 保持为实体摄像头保底：当前系统已经做了 Camera2 能力检测、USB 视频设备识别、麦克风/录音权限检测和内置预览 Activity。手机当摄像头不会替代这条路线，因为 Android 盒子通常不能仅凭同 Wi-Fi 把手机变成系统级 `Camera2` 设备；除非未来引入厂家虚拟摄像头驱动、USB Gadget/UVC 模式或专用硬件，这不适合作为普通家庭交付默认路径。

路线 D 是合规后再打开的免安装入口，不建议放在第 1 个技术里程碑：小程序负责降低手机侧安装门槛，但电视端仍需要稳定的接收端、信令、房间码、权限提示和断线恢复。若业务场景是 Keep 直播课、幼儿园互动课或家庭远程陪伴，建议先准备三份材料再开发：主体/类目/资质清单，隐私与未成年人使用告知，音视频云或自建 RTC 的成本与日志留存方案。资质未确认前，产品文案只能写“可接入微信小程序推流方案”，不能承诺“扫码即用手机摄像头”。

### 第 1 阶段：能力检测

已完成。用于确认设备是否具备：

- `android.hardware.camera.any`
- `android.hardware.camera.external`
- `android.hardware.microphone`
- `android.hardware.usb.host`
- USB Video Class 设备数量
- 音频输入设备数量
- USB 音频输入设备数量
- `android.software.leanback`
- `android.permission.CAMERA` 当前授权状态
- `android.permission.RECORD_AUDIO` 当前授权状态

同时区分两种现场常见情况：

- 系统摄像头可用：Camera2 能枚举到摄像头，后续可以请求权限并进入扫码/视频能力。
- USB 视频设备已插入但系统摄像头不可用：盒子识别到了 USB/UVC 硬件，但 Android Camera HAL 暂未开放，需要打开内置摄像头预览测试、检查盒子固件或更换兼容摄像头。
- 音频输入可用或缺失：后续做语音搜索/视频通话时可直接判断是否存在内置麦、遥控器麦或 USB 麦克风；没有音频输入不影响看电视。

这一步适合“扫码登录前检测”“视频通话前检测”“售后远程排障”。

### 第 2 阶段：真实预览与扫码

建议优先走原生 Android 实现，再通过 QuickTVUI/Hippy bridge 暴露给前端：

- 摄像头预览：基础 Camera2 全屏预览测试已完成，用于验证盒子 Camera HAL 和 USB/UVC 通路；当前会优先选择支持 `REQUEST_AVAILABLE_CAPABILITIES_BACKWARD_COMPATIBLE` 的外接摄像头，再按后置、前置、任意摄像头回退。若后续做长期业务预览并升级 AndroidX，优先 CameraX，它对生命周期和设备兼容封装更好。
- 扫码：ZXing 或 ML Kit Barcode Scanning。电视盒子离屏扫码距离较远，建议做大框、强提示、超时回退。
- 权限：首次使用摄像头功能时请求权限；无权限或系统拦截时显示“打开权限设置”。
- 降级：未检测到摄像头时，显示手机扫码登录二维码或手动输入码，不阻塞播放。

### 第 3 阶段：视频通话或体感互动

如果摄像头用于视频通话，建议单独评估：

- 编解码能力：低端盒子常见 1GB 内存、旧 Android API，需限制分辨率和帧率。
- 麦克风：多数外接摄像头不一定带麦；当前已检测 `RECORD_AUDIO` 和音频输入，摄像头页“一键授权”会同时请求摄像头和录音权限；只有进入语音搜索/视频通话等业务时才把录音权限作为强验收项。
- 网络：优先 WebRTC 原生 SDK 或成熟三方 RTC SDK；不要在前端层手写 RTC 传输。

## 实机测试清单

### 本地 Android 编译验证

在 macOS 上可使用仓库脚本验证原生桥是否可编译：

```bash
brew install openjdk@11 openjdk@17 android-commandlinetools android-platform-tools
JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home sdkmanager --sdk_root=/opt/homebrew/share/android-commandlinetools "platforms;android-31" "build-tools;31.0.0" "platform-tools"
./scripts/android-verify.sh
```

说明：`sdkmanager` 当前需要 JDK 17；项目 Android Gradle Plugin 7.1.3 用 JDK 11 编译更稳，`android-verify.sh` 会优先选择 JDK 11。

### 电视盒子实机检查

1. 安装无摄像头盒子：应用可安装，可进入简易首页和直播页。
2. USB 摄像头热插拔：进入摄像头页后重新检测，状态有变化或给出清晰提示。
3. 未授权摄像头：摄像头页显示“未允许”，打开权限设置可进入系统设置。
4. 遥控器焦点：每个页面首屏都有默认焦点，焦点框明显，OK 能执行当前按钮；简易首页和摄像头页上/下/左/右都能移动黄色选中态。
5. 帮助/自检：首页、直播页、搜索页、继续看页、全部内容页和摄像头页按 0、菜单、信息、指南、设置或帮助键能进入帮助/自检页，首页、全部内容页和摄像头页按 6 也能进入，返回键回简易首页。
6. 摄像头实测：点击“测试摄像头”可打开 App 内置 Camera2 预览；盒子没有 Camera HAL 摄像头时给出清晰提示，不崩溃。
7. 麦克风实测：摄像头页能显示音频输入状态；没有麦克风或录音权限未允许时，不阻塞直播/点播。
8. 直播误触：直播页右键不再跳支付或无关页面。
9. 退出确认：首页按返回进入大字退出确认，默认 OK 继续看，只有选“退出应用”才关闭。
10. 返回路径：频道列表按返回回全屏，摄像头页按返回回简易首页。

### ADB 傻瓜验收脚本

不确定哪里没准备好时，先跑体检：

```bash
npm run tv-box:doctor
BOX_IP=<盒子IP> npm run tv-box:doctor
BOX_IP=<盒子IP> npm run tv-box:inspect
```

体检输出分四块：

- Host toolchain：电脑上的 Node、npm、JDK、Android SDK、ADB。
- Latest debug APK：最新 Debug APK 路径、体积、包名、启动 Activity、Leanback/摄像头声明。
- Connected devices：ADB 已授权设备列表。
- Device facts / App on device：盒子型号、Android SDK、电视/摄像头 feature、App 安装和摄像头权限声明。

`tv-box:inspect` 会额外生成 JSON，适合发给维护人员或由 CI/脚本读取，不需要人工从 Markdown 里复制证据；连上盒子时还会记录当前前台窗口、resumed Activity、Camera appops 和 Record audio appops，用于判断摄像头预览是否打开、权限是否被系统拦截。

`FIELD_REMOTE_PRACTICE` 专门记录帮助页“遥控器练习”是否通过；`FIELD_EXIT_CONFIRM` 专门记录首页返回后的大字退出确认是否默认继续看、是否能明确退出。这两个字段和遥控器焦点、数字键、自检键一起用于判断某个盒子/遥控器组合是否真的适合长辈和小孩。

每测一款盒子、遥控器或摄像头，都记录成同一套字段：

```bash
FIELD_OPERATOR=张三 \
FIELD_LOCATION=客厅A \
FIELD_BOX_BRAND=小米 \
FIELD_CAMERA_MODEL="Logitech C270" \
FIELD_MICROPHONE_MODEL="Logitech C270 Mic" \
FIELD_REMOTE_FOCUS=pass \
FIELD_NUMERIC_SHORTCUTS=pass \
FIELD_ZERO_KEY_HELP=pass \
FIELD_HELP_KEY_SHORTCUTS=pass \
FIELD_REMOTE_PRACTICE=pass \
FIELD_EXIT_CONFIRM=pass \
FIELD_LIVE_PLAYBACK=pass \
FIELD_LIVE_NUMERIC_CHANNELS=pass \
FIELD_LIVE_MEDIA_KEYS=pass \
FIELD_CAMERA_PERMISSION=pass \
FIELD_CAMERA_PREVIEW=pass \
FIELD_AUDIO_INPUT=pass \
FIELD_RECORD_AUDIO_PERMISSION=skip \
FIELD_USB_HOTPLUG=pass \
FIELD_SUPPORT_CODE=pass \
BOX_IP=<盒子IP> npm run tv-box:field-record
```

不想手写环境变量时，先运行：

```bash
BOX_IP=<盒子IP> npm run tv-box:field-wizard
npm run tv-box:field-wizard-html
npm run tv-box:field-import -- <现场下载的JSON>
npm run tv-box:return-inbox -- <现场回传目录或zip>
npm run tv-box:return-inbox-scenarios-test
npm run tv-box:field-inbox
```

命令行向导会输出 `reports/tv-box-field-wizard-latest.md/json/env`，并在你确认后调用 `tv-box:field-record`。离线 HTML 向导会输出 `reports/tv-box-field-wizard-offline.html`，交付包中命名为 `FIELD_WIZARD_OFFLINE.html`，现场人员双击即可填写并下载 JSON/Markdown/env；表单内置一键模板，可先快速套用“只验收看电视通过”“摄像头/麦克风通过”“没有摄像头/麦克风”或“全部通过”，再把少数不符合项改掉。交付包内置 `FIELD_RETURN/` 文件夹和 `PACK_FIELD_RETURN_ON_MAC.command` / `PACK_FIELD_RETURN_ON_WINDOWS.bat`，现场把 JSON、维护码照片、日志/排障包和异常照片放进去后双击即可生成 `HelloTV-field-return-*.zip`。`tv-box:return-inbox` 可直接扫描现场回传目录或 zip，检查 JSON、维护码照片、`INSTALL_LOG.txt`/`tv-box-support-latest.zip`、异常照片/日志是否齐全，默认只 dry-run 验证 JSON 可导入，确认是真实盒子验收后再加 `--append`；`tv-box:return-inbox-scenarios-test` 会用合成目录验证缺维护码照片、照片需人工确认、unknown 未闭环、失败带证据等规则不会漂移。`tv-box:field-import` 可直接读取单份现场下载的 JSON，生成 `reports/tv-box-field-import-latest.md/json/env`，再调用 `tv-box:field-record` 与 `tv-box:compatibility-summary`；多人多盒复测时把多份 JSON 放进 `reports/tv-box-field-inbox/`，运行 `tv-box:field-inbox` 后会生成 `reports/tv-box-field-inbox-latest.md/json` 和单条导入归档。`tv-box:field-record` 会输出 `reports/tv-box-field-record-latest.md`、`reports/tv-box-field-record-latest.json`，并把结果追加到 `reports/tv-box-field-matrix.csv`。交付包里的 `FIELD_COMPATIBILITY_MATRIX.zh-CN.md` 会说明字段和判定规则，适合长期沉淀“小米盒子 + 原装遥控器 + 某款 UVC 摄像头”这类组合的稳定性。

为避免本地或 CI 在未连接盒子时污染累计矩阵，`tv-box:field-record` 只有在检测到已授权实机，或本次提供了 `FIELD_*` / `BOX_IP` / `DEVICE_SERIAL` 字段时才追加 CSV 行；否则只刷新 latest Markdown/JSON。需要强制追加时设置 `FIELD_APPEND_MATRIX=true`，需要重建 CSV 表头时设置 `FIELD_RESET_MATRIX=true`。

需要交付或复盘时，生成验收报告：

```bash
npm run tv-box:report
BOX_IP=<盒子IP> npm run tv-box:report
```

报告默认输出到 `reports/tv-box-acceptance-latest.md`。没有连接盒子时也会写入电脑工具链、APK Manifest 和待完成的实机清单；连接盒子后会补充设备型号、Android 版本、feature、安装和权限声明证据。

没有实机时，先跑遥控器核心路径自测：

```bash
npm run tv-box:remote-test
```

它会覆盖：

- 简易首页 6 个入口的左/右/上/下边界。
- 摄像头页 5 个按钮的上/下/左/右边界。
- 帮助页和遥控练习页按钮行的边界。
- OK/Enter/小键盘 Enter/蓝牙确认键、首页/直播数字键、小键盘数字键、播放/暂停/停止键和频道 +/- 常见按键码识别。

交付前跑完整本地验收：

```bash
npm run tv-box:check
```

它会串起脚本语法、APK 构建器语法、遥控器自测、ESLint、Android Java 编译、Debug APK 构建、doctor、验收报告、现场验收场景回归、交付包、排障包、完成度证据审计、交付台账和自动化交付审计。

GitHub Actions 也会运行同一条总闸门，并把 `reports/tv-box-handoff/`、`reports/tv-box-handoff-latest.zip` 和对应 `.sha256` 上传为 artifact，方便 PR 审核、远程交付和传输完整性确认。`package-lock.json` 需要随同代码提交，保证远程 `npm ci` 有锁文件可用。

同时会生成 `reports/tv-box-handoff/` 交付目录、`reports/tv-box-handoff-latest.zip` 交付压缩包和 `reports/tv-box-handoff-latest.zip.sha256` 压缩包校验文件。交付目录包含：

- `HelloTV-debug.apk`
- `START_HERE.html`（现场人员双击打开的离线大字安装首页）
- `OPERATION_CARD.html`（可双击打开和打印的大字操作卡，适合贴在电视旁）
- `FIELD_WIZARD_OFFLINE.html`（不用 npm 的离线现场验收表，内置一键模板，支持下载 JSON/Markdown/env）
- `README_FIRST.txt`（文件管理器里最容易识别的纯文本入口，打不开网页时先看它）
- `QUICK_START.zh-CN.md`（只拿到交付目录时先看这份 3 步安装说明）
- `PRE_INSTALL_CHECKLIST.zh-CN.md`（安装前自检卡，确认同网、网络调试、IP、RSA 授权和交付文件完整）
- `FIELD_ACCEPTANCE_CHECKLIST.zh-CN.md`（现场安装后逐项打勾的验收清单，覆盖安装、遥控器、直播、帮助/自检、摄像头和失败证据）
- `FIELD_COMPATIBILITY_MATRIX.zh-CN.md`（多款电视盒子、遥控器和 USB 摄像头长期复测时使用的兼容性矩阵模板）
- `tv-box-field-wizard-latest.md` / `tv-box-field-wizard-latest.json` / `tv-box-field-wizard-latest.env`（现场验收中文问答向导记录）
- `tv-box-field-import-latest.md` / `tv-box-field-import-latest.json` / `tv-box-field-import-latest.env`（离线 JSON 导入记录）
- `tv-box-field-inbox-latest.md` / `tv-box-field-inbox-latest.json`（多人多盒现场 JSON 收件箱批量导入记录）
- `tv-box-field-scenarios-test-latest.md` / `tv-box-field-scenarios-test-latest.json`（现场验收场景回归，防止分类规则漂移）
- `tv-box-return-inbox-scenarios-test-latest.md` / `tv-box-return-inbox-scenarios-test-latest.json`（现场回传证据质检场景回归，防止缺证据被误收）
- `tv-box-field-record-latest.md` / `tv-box-field-record-latest.json` / `tv-box-field-matrix.csv`（最近一次兼容性记录和累计 CSV）
- `tv-box-easy-run-latest.md` / `tv-box-easy-run-latest.json`（一键安装自动沉淀摘要，集中列出 readiness、交付包、排障包、兼容性状态和下一步）
- `tv-box-authorization-latest.md` / `tv-box-authorization-latest.json`（ADB/RSA 授权助手，现场先解决网络调试、盒子 IP、RSA 弹窗和多设备选择）
- `tv-box-completion-audit-latest.md` / `tv-box-completion-audit-latest.json`（完成度证据审计，区分已有证据和仍需真实盒子验收的项目）
- `tv-box-release-ledger-latest.md` / `tv-box-release-ledger-latest.json` / `tv-box-release-ledger.jsonl`（长期交付台账，追踪每次发包产物、SHA、readiness 和待实机项）
- `tv-box-acceptance-latest.md`
- `tv-box-inspection-latest.json`
- `INSTALL.zh-CN.md`
- `INSTALL_SUPPORT.zh-CN.md`（只拿到交付包时，安装失败应发送 `INSTALL_LOG.txt`、盒子型号、IP、电视屏幕照片和维护码）
- `INSTALL_ON_MAC.command`（只拿到交付目录时可双击安装本目录 APK，会搜索常见 Homebrew / Android SDK adb 路径）
- `INSTALL_ON_WINDOWS.bat`（Windows 上只拿到交付目录时可双击安装本目录 APK；安装前会用 `certutil` 校验 `HelloTV-debug.apk` 和 `SHA256SUMS`，再搜索 PATH、交付目录、`ANDROID_HOME`、`ANDROID_SDK_ROOT` 和用户默认 Android SDK adb 路径；失败时显示 `E10-E99` 错误代码）
- `WINDOWS_HELP.zh-CN.md`（Windows 双击安装排障卡，按错误代码告诉现场人员下一步做什么、截图发什么）
- `OPERATION_CARD.zh-CN.md`（面向长辈、小孩和现场安装人员的一页 Markdown 操作卡）
- `MANIFEST.json`（机器可读交付清单，含 APK SHA256、大小、源码分支/提交、失败排障自测、离线交付包自测和推荐命令）
- `SHA256SUMS`（当前机器支持 `shasum` 时生成；macOS/Windows 双击安装脚本会用它做 APK 安装前校验）

macOS/Windows 双击安装脚本会在交付目录写入 `INSTALL_LOG.txt`，安装后自动记录包路径、当前前台窗口、当前 Activity 和最近 HelloTV/崩溃日志；失败时现场人员按 `INSTALL_SUPPORT.zh-CN.md` 发送日志、盒子型号、IP、电视屏幕照片和维护码，减少远程排障靠口述窗口文字的问题。

`tv-box:handoff` 每次都会重新生成 `tv-box-inspection-latest.json`、现场验收向导示例、离线现场验收表、离线导入记录、现场 JSON 收件箱记录、现场验收场景回归、兼容性记录、一键安装自动沉淀摘要、完成度证据审计、`reports/tv-box-handoff-latest.zip`、对应 `.sha256` 和 marker 文件；`tv-box:release-ledger` 会在最终交付和排障压缩包生成后写入台账；`tv-box:audit` 会校验交付 APK、压缩包、压缩包 sidecar SHA256、现场验收清单、兼容性矩阵、离线验收表、离线导入记录、现场 JSON 收件箱、现场验收场景回归、安装失败信息清单、完成度证据审计、交付台账、`MANIFEST.json`、机器检查 JSON、`readiness` 就绪度结论和 `SHA256SUMS` 的大小与 SHA256 一致，避免“新 APK + 旧检查报告”或“传坏 zip”的交付错配。

现场失败时运行：

```bash
BOX_IP=<盒子IP> npm run tv-box:support
```

它会生成 `reports/tv-box-support/`、`reports/tv-box-support-latest.zip` 和 `reports/tv-box-support-latest.zip.sha256`，集中保存 doctor 输出、机器检查 JSON、实机兼容性记录、现场验收向导记录、一键安装自动沉淀摘要、ADB 设备状态、设备能力、USB/摄像头/麦克风线索、Camera/Record audio appops、当前前台窗口、最近日志、3 步安装说明、现场验收清单、兼容性矩阵、交付清单和离线交付包自检结果，方便远程定位问题；`.sha256` 用于确认远程排障包没有传坏。

最省事的一条命令：让盒子打开“开发者选项 / 网络调试”后，在本仓库执行：

```bash
BOX_IP=<盒子IP> npm run tv-box:next
BOX_IP=<盒子IP> npm run tv-box:easy
```

优先用 `tv-box:next`，因为它会先处理“有没有授权、该不该安装、要不要先补交付包”。当盒子已授权时，安装脚本会自动完成：

- 构建 Debug APK。
- `adb connect <盒子IP>:5555`。
- 安装最新 APK。
- 启动 HelloTV。
- 执行一轮遥控器 OK、返回、右键等基础冒烟。
- 执行一轮搜索页和继续看页救援冒烟：从首页按 2 进搜索、按 0 进帮助、返回首页；再按 3 进继续看、按菜单键进帮助、返回首页。
- 生成验收报告、latest 兼容性记录、兼容性自动汇总、`reports/tv-box-easy-run-latest.md/json` 一键安装自动沉淀摘要和 `reports/tv-box-handoff/` 交付目录。

如果 APK 已经构建好，只想重装：

```bash
BOX_IP=<盒子IP> SKIP_BUILD=true npm run tv-box:install-debug
```

如果你已经熟悉 ADB，也可以跳过中文引导，直接执行：

```bash
BOX_IP=<盒子IP> npm run tv-box:install-debug
```

如果已经手动安装 APK 并连接盒子，也可以只跑冒烟：

```bash
adb connect <盒子IP>:5555
PACKAGE_NAME=com.quicktvui.hellotv npm run tv-box:smoke
```

如果要专门验证摄像头页“测试摄像头”按钮：

```bash
BOX_IP=<盒子IP> npm run tv-box:camera-smoke
```

也可以让一键安装在基础冒烟后继续跑摄像头冒烟：

```bash
BOX_IP=<盒子IP> RUN_CAMERA_SMOKE=true npm run tv-box:easy
```

脚本会自动检查：

- ADB 是否连接到授权设备。
- 设备是否声明电视/摄像头相关 feature。
- App 是否已安装且包含摄像头权限声明。
- App 是否能启动。
- `dumpsys usb` 是否能看到 USB 摄像头/视频设备线索。
- `TvBoxModule` 日志里的 `cameraCount`、`externalCameraCount`、`usbDeviceCount`、`usbVideoDeviceCount`、`audioInputDeviceCount`、`usbAudioInputDeviceCount` 是否符合实物连接。
- OK、返回、右键、OK、返回这一组遥控器路径是否触发崩溃日志。
- 数字键 5、0、返回、数字键 5、6、返回、数字键 2、0、返回、数字键 3、菜单、返回这一组“全部内容/搜索/继续看救援”路径是否触发崩溃日志或卡死。
- 下键、OK、右键、下键、上键、左键、返回这一组“进入摄像头检测页再回首页”的路径是否触发崩溃日志。
- 摄像头冒烟会额外执行数字键 4、数字键 3、返回，先直达“摄像头”，再直达“测试摄像头”，避免焦点漂移影响自动化；脚本会先尝试 `pm grant` 摄像头和录音权限，点击后用 `dumpsys window` / `dumpsys activity` 确认 `CameraPreviewActivity` 已进入前台，再按返回确认能退出，并抓取 `CameraPreviewActivity`、`Camera`、`Audio`、`ActivityNotFound`、`AndroidRuntime`、`reportException` 等日志。
- 两类冒烟只要抓到 `E AndroidRuntime`、`FATAL EXCEPTION`、`reportException`、`render view exception` 或 `Uncaught` 就会退出失败；普通 `D AndroidRuntime` 多来自 adb input 命令，不作为崩溃证据。

## 后续优化建议

- 在设置页增加“长辈模式/儿童模式”开关，存入本地存储。
- 首页可配置默认入口：直播优先、少儿优先、历史优先。
- 在真实盒子上复测直播媒体键和收藏：直播页按播放/暂停键可暂停或继续播放；按 OK 打开频道列表，按 7 收藏频道，按 8 只看收藏，重启 App 后确认收藏仍然保留。
- 接入扫码登录时，先复用摄像头检测页，再进入扫码预览页。
- 接入更多真实设备样本后，把 `tv-box-field-matrix.csv` 汇总成版本化兼容性榜单，明确推荐摄像头型号和待适配盒子固件。

## 参考

- Android TV navigation: <https://developer.android.com/training/tv/get-started/navigation>
- Android manifest uses-feature: <https://developer.android.com/guide/topics/manifest/uses-feature-element>
- Android CameraX: <https://developer.android.com/media/camera/camerax>
- Android AudioManager input devices: <https://developer.android.com/reference/android/media/AudioManager#getDevices(int)>
