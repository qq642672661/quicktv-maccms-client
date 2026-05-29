# 手机当电视摄像头信令与验收合同

更新时间：2026-05-29

这份文档把“手机当电视摄像头”从概念方案固定成可实现、可验收、可审计的合同。默认路线不是把手机伪装成电视盒子的系统 Camera2 摄像头，而是：

```text
手机采集摄像头/麦克风
  -> 局域网 WebSocket 信令
  -> 电视盒子原生 WebRTC 接收端
  -> QuickTVUI 显示配对、状态、重试和降级
```

## 最小可交付

- 电视端显示 6 位一次性房间码和二维码。
- 手机端扫码后请求摄像头和麦克风权限。
- 局域网信令交换 `offer`、`answer`、`ice-candidate`。
- 电视端 10 秒内出现首帧，并能显示连接中、已连接、重连、降级、失败。
- 房间码 10 分钟内过期，配对成功后立即失效。
- 默认不录制、不上传音视频内容；必须有停止按钮和未成年人使用告知。

当前电视端已补 `phone_camera_pair` 配对入口：从摄像头页按 4 进入，页面显示二维码、6 位房间码、接收端准备度、重新生成、返回摄像头和帮助自检。按“打开接收端”时，前端会把同一个房间码、手机入口、信令地址和媒体档位传给 Android 原生 `PhoneCameraReceiverActivity`，接收端画面会显示这些参数，并通过 `PhoneCameraSignalingClient` 用同一个房间码向局域网信令服务创建 TV 房间、观察手机 `peer.hello` 和 `webrtc.offer`，方便现场拍照核对。实验构建启用 `ENABLE_PHONE_CAMERA_WEBRTC=true` 后，会把 JDK 11 兼容的 `io.github.webrtc-sdk:android:114.5735.11` 和可选 `PhoneCameraNativeWebRtcEngine` 编译进 APK，用 `org.webrtc` 创建 answer、发送 ICE、渲染远端视频、接收音频轨并上报 `session.stats`。配对页也会通过原生桥显示当前是“骨架已接入、等待 WebRTC SDK”“SDK 已接入、等待媒体引擎”，还是“媒体引擎已接入、仍需首帧/音频/stats”。这个页面只证明入口、遥控器动作、配对参数传递、信令房间创建、可选媒体引擎和验收边界已经固化；在真实手机采集端、电视首帧、音频、stats 和停止按钮证据闭环前，不能把它记为音视频通过。

## 为什么先做合同

QuickTVUI 官方仓库目前没有发现手机摄像头直连电视端的 WebRTC 示例。开发时如果直接写页面，很容易把“扫码配对”“媒体传输”“隐私合规”“现场验收”混在一起，最后现场无法判断到底是手机权限、信令、WebRTC、盒子解码还是网络问题。

因此先用 `npm run tv-box:phone-camera-contract` 生成机器可读合同：

```bash
npm run tv-box:phone-camera-contract
npm run tv-box:phone-camera-capture-test
npm run tv-box:phone-camera-signaling
npm run tv-box:phone-camera-signaling-test
npm run tv-box:phone-camera-scenarios-test
```

它会输出：

- `reports/tv-box-phone-camera-contract-latest.md`
- `reports/tv-box-phone-camera-contract-latest.json`
- `reports/tv-box-phone-camera-capture-test-latest.md`
- `reports/tv-box-phone-camera-capture-test-latest.json`
- `reports/tv-box-phone-camera-signaling-test-latest.md`
- `reports/tv-box-phone-camera-signaling-test-latest.json`
- `reports/tv-box-phone-camera-scenarios-test-latest.md`
- `reports/tv-box-phone-camera-scenarios-test-latest.json`

这些报告会被交付包和排障包带走。`tv-box:phone-camera-signaling` 是开发/现场可启动的局域网信令服务，默认监听 `0.0.0.0:17891`，提供 `/healthz`、`/phone-camera` 和 `/phone-camera/signaling`；`/phone-camera?room=xxxxxx` 已经是手机采集入口，页面会请求 `getUserMedia` 摄像头/麦克风，创建 `RTCPeerConnection`，发送 `webrtc.offer`，并提供明显停止按钮。电视端配对页的默认手机入口可通过 `VITE_PHONE_CAMERA_PAIR_BASE_URL` 配置，媒体档位可通过 `VITE_PHONE_CAMERA_PROFILE_ID` 配置；信令地址会从同一个手机入口派生到 `/phone-camera/signaling`，并随房间码一起传给原生接收端，原生接收端会用同一个房间码发送 `room.create`，让手机扫码页加入同一个 TV 房间。`tv-box:phone-camera-capture-test` 会验证这个页面的房间码、权限请求、WebRTC offer、停止按钮、默认不录制和 HTTPS/WSS 安全上下文保护。注意：手机浏览器真实采集必须在安全上下文运行，普通 `http://局域网IP` 很可能被 Chrome/Safari 拒绝摄像头权限；现场要用 HTTPS/WSS 入口、受信任局域网证书、隧道/反代或手机 App。`tv-box:phone-camera-signaling-test` 会启动同一服务，自动验证电视端指定房间码创建、重复房间码拒绝、无效房间拒绝、一台电视配一台手机、`offer` / `answer` / `ice-candidate` / `keepalive` 转发、`session.stats` 接收和挂断关闭房间；它证明 M2 信令层可运行，但不代替真实 WebRTC 首帧。实验包中的 `PhoneCameraNativeWebRtcEngine` 会消费手机 offer、创建 answer、发送本地 ICE、把远端 ICE 加入 `PeerConnection`、用 `SurfaceViewRenderer` 渲染远端视频、开启远端音频轨并每 2 秒上报 stats 摘要；它证明 Android 媒体引擎已进入 APK，但仍不代替真实电视画面和声音。场景回归会用合成信令验证扫码首帧、房间过期、手机权限失败、弱网降级、断线重连、隐私停止和微信小程序资质门禁；它也不代替真实 WebRTC 首帧，但能防止合同字段、状态机和合规边界漂移。`tv-box:webrtc-sdk-gate` 会检查 Android WebRTC AAR 是否保持可选接入、默认不膨胀 APK、运行时仍用 `org.webrtc.PeerConnectionFactory` 检测 SDK，并把候选坐标、Java class 兼容性和“首帧/音频/stats 未闭环不得通过”的边界写入报告；当前默认候选 `114.5735.11` 要求 minSdk 21 且可用 JDK 11 编译，`125+` AAR 是 Java 17 class，需升级 JDK/AGP 后再评估。只有 `ENABLE_PHONE_CAMERA_WEBRTC=true` 的实验构建会临时提升 minSdk，默认电视 APK 仍沿用项目基线。需要联网验证候选 AAR 时再加 `WEBRTC_SDK_GATE_NETWORK=true`。后续开发手机采集端和现场验收矩阵都必须对齐同一份合同。

真实验收结果已经接入现场记录体系：`tv-box:field-wizard` 和 `FIELD_WIZARD_OFFLINE.html` 会额外记录 `FIELD_PHONE_CAMERA_PAIRING`、`FIELD_PHONE_CAMERA_PERMISSION`、`FIELD_PHONE_MICROPHONE_PERMISSION`、`FIELD_PHONE_TV_FIRST_FRAME`、`FIELD_PHONE_TV_AUDIO`、`FIELD_PHONE_SESSION_STATS`、`FIELD_PHONE_RECONNECT`、`FIELD_PHONE_PRIVACY_STOP`。这些字段是手机摄像头专用，不会阻断“只看电视”核心验收；但一旦现场明确填 `fail`，兼容性记录会进入 `needs_fix`，防止把未闭环的手机音视频误当通过。完整通过必须同时具备手机权限截图、电视首帧、电视端声音、`session.stats`、断线重连和停止按钮关闭采集证据。

## 路线边界

- WebRTC 原生接收端是默认路线，适合互动课、远程陪伴、AI 看护和低延迟视频。
- RTSP/RTMP 只作为同网预览 MVP，不作为长期互动课主路线。
- USB/UVC/Camera2 继续作为实体摄像头保底路线。
- 微信小程序 `live-pusher` 只作为主体资质、服务类目和接口权限审核通过后的免安装入口，不能默认承诺。
