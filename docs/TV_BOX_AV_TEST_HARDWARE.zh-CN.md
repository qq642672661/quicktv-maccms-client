# 电视盒子音视频测试硬件环境

更新时间：2026-05-29

这份文档用于补齐 HelloTV / QuickTV 电视盒子的音频、视频测试环境。目标不是买最贵的设备，而是用最少的硬件把三件事测清楚：

- 盒子 USB 口和供电是否稳定。
- Android Camera2 是否能把 USB/UVC 摄像头开放给 App。
- Android AudioManager 是否能识别麦克风/USB 音频输入，并允许 `RECORD_AUDIO`。

## 当前实机基线

当前已连接的小米盒子证据：

- 型号：`MiTV-AZFP0`
- Android：9 / SDK 28
- ADB：`192.168.10.122:5555`
- 已报告能力：`android.hardware.usb.host`、`android.hardware.camera.any`、`android.hardware.camera.external`、`android.software.leanback_only`
- 当前 App 能力日志：`cameraCount=0`、`externalCameraCount=0`、`usbVideoDeviceCount=0`、`audioInputDeviceCount=2`
- 当前结论：App 内置 `CameraPreviewActivity` 能打开并返回，但系统没有枚举到真实摄像头；这证明预览链路不崩溃，不证明已有真实画面。

## 建议采购清单

### 第一优先级：必买测试套装

| 设备 | 建议型号 | 用途 | 通过标准 |
| --- | --- | --- | --- |
| 主摄像头 | Logitech C920s / C920 Pro HD | 作为主力 1080p UVC 摄像头，测试真实预览、扫码、互动课和视频通话基础链路 | `cameraCount` 或 `externalCameraCount` 大于 0，`CameraPreviewActivity` 有真实画面 |
| 低规格摄像头 | Logitech C270 | 作为 720p 低带宽备机，判断旧盒子是否只能稳定支持低规格 UVC | C920s 不通时，C270 能否被 Camera2 枚举 |
| 带独立供电 USB Hub | USB-A 上行，至少 4 口，外接电源 | 排除盒子 USB 口供电不足导致摄像头掉线的问题 | 摄像头 + USB 音频同时插入后不掉线 |
| USB 延长线 | 短线，1 米左右 | 方便摄像头固定到电视顶部，减少插拔损耗 | 不影响识别和预览 |

### 第二优先级：音频互动测试

| 设备 | 建议型号 | 用途 | 通过标准 |
| --- | --- | --- | --- |
| USB 会议麦克风/扬声器 | Jabra Speak 510 UC / Jabra Speak2 40/55，或同类免驱 USB Audio Class 设备 | 单独验证麦克风、回声、音量和互动课/视频通话音频输入；如果 Speak 510 缺货，优先买 Speak2 40/55 或同级 USB 会议麦 | `audioInputDeviceCount` 增加，`RECORD_AUDIO` 可授权 |
| 备用 USB 声卡 + 普通麦克风 | 免驱 USB Audio Class | 如果会议麦克风采购周期长，用于先验证 USB 音频枚举 | AudioManager 能识别输入设备 |

### 暂缓采购

- 4K 摄像头：旧 Android TV 盒子、USB 2.0、供电和解码压力都会增加变量。先把 720p/1080p 测通，再考虑 4K。
- 需要厂商专用驱动或手机 App 才能工作的摄像头。
- 带云台、AI 美颜、会议一体机等复杂设备。第一轮测试要先验证标准 UVC / USB Audio Class。
- C920e 这类商务型号如果麦克风默认关闭，需要先确认能否用电脑工具打开麦克风；否则仍要配独立 USB 麦克风。

## 接线方式

### 单摄像头测试

```text
Logitech C920s 或 C270
  -> 小米盒子 USB 口
```

先不要接 Hub，确认盒子 USB 口能否直接识别摄像头。

### 供电稳定性测试

```text
Logitech C920s
  -> 带独立供电 USB Hub
  -> 小米盒子 USB 口
```

如果直插不稳定，但带供电 Hub 稳定，说明盒子 USB 供电能力不足，交付时必须配 Hub。

### 摄像头 + 麦克风组合测试

```text
Logitech C920s
Jabra Speak 510 UC / Jabra Speak2 40/55
  -> 带独立供电 USB Hub
  -> 小米盒子 USB 口
```

这个组合用于模拟互动课、远程陪伴、视频通话或 AI 看护。测试时要分别记录摄像头预览和音频输入，不要只看其中一个。

## 买回来后的验收命令

每次换摄像头、麦克风、Hub 或接线方式，都按同一套命令记录证据：

```bash
BOX_IP=192.168.10.122 npm run tv-box:doctor
BOX_IP=192.168.10.122 npm run tv-box:inspect
BOX_IP=192.168.10.122 npm run tv-box:camera-smoke
```

如果买回来的第一台主摄像头是 Logitech C920 PRO / C920 Pro HD，直接跑专用到货验收。它会自动执行遥控器基础冒烟、摄像头冒烟、CameraService/USB/音频线索采集、兼容性记录、硬件画像和完成度审计；电视上看到真实画面、麦克风输入和 USB 热插拔稳定性仍需要现场确认，未确认会保留 `unknown`，不能关闭验收。

```bash
npm run tv-box:c920-arrived
```

`tv-box:c920-arrived` 默认面向当前小米盒子 `192.168.10.122`，并自动带上“已插入”和 `tv-box-field-state/c920-procurement.json` 的采购状态；换盒子时加 `BOX_IP=<盒子IP>` 即可。如果预计到货日还没到，它会只提示等待，不会误跑实体摄像头验收，避免把“未到货/未插入”误判为 USB 或 Camera2 故障。确认已经提前到货并插好时，可加 `C920_ARRIVED_ALLOW_EARLY=true` 强制执行。小米盒子只有一个 USB 口时，第一轮只直插 C920，一根线同时测真实画面和 C920 自带麦克风；直插供电不稳、C920 麦克风不进业务或必须外接独立会议麦克风时，再换带独立供电 USB Hub。它底层仍调用 `tv-box:c920-acceptance`，等价于 `BOX_IP=192.168.10.122 C920_PHYSICAL_STATUS=inserted npm run tv-box:c920-acceptance`，不会减少任何 USB、Camera2、音频、热插拔和人工确认证据。

到货前可用 dry-run 演练到货日路径，它会跑日期和 ADB 前置检查，但不会执行实体 C920 验收；演练结果会写到 `reports/tv-box-c920-arrived-dry-run-latest.md/json`：

```bash
C920_ARRIVED_DRY_RUN=true C920_ARRIVED_CURRENT_DATE=2026-05-31 npm run tv-box:c920-arrived
```

如果摄像头已经购买但还没有到货，或现场确认还没有插到盒子 USB 口，可以先把到货卡标成待接入，避免把“未插入基线”误读成兼容失败：

```bash
C920_PHYSICAL_STATUS=purchased_pending_arrival npm run tv-box:c920-arrival-card
```

如果已经确认采购来源和预计到货日，也一起写入到货卡，明天接入时继续沿用同一证据链：

```bash
C920_PHYSICAL_STATUS=purchased_pending_arrival C920_PURCHASE_CHANNEL="京东自营" C920_EXPECTED_ARRIVAL_DATE=2026-05-31 npm run tv-box:c920-arrival-card
```

现场不需要记英文状态，也可以直接用中文：

```bash
C920_PHYSICAL_STATUS=已采购待到货 C920_PURCHASE_CHANNEL="京东自营" C920_EXPECTED_ARRIVAL_DATE=2026-05-31 npm run tv-box:c920-arrival-card
C920_PHYSICAL_STATUS=已到货未插入 npm run tv-box:c920-arrival-card
npm run tv-box:c920-arrived
```

如果运行后电视上已经确认 C920 真实画面、C920 麦克风业务输入和 USB 热插拔都通过，用确认写入器把人工结果补进验收链路：

```bash
C920_CONFIRM_ALL_PASS=true npm run tv-box:c920-confirm
```

如果某项失败或不适用，逐项写入，例如麦克风失败时：

```bash
C920_CONFIRM_VIDEO=pass C920_CONFIRM_MIC=fail C920_CONFIRM_HOTPLUG=pass C920_CONFIRM_SUPPORT_CODE=pass npm run tv-box:c920-confirm
```

不带确认参数时，`npm run tv-box:c920-confirm` 只生成 `reports/tv-box-c920-confirm-latest.md/json` 提醒该补哪些现场确认，不会修改验收结论。

验收报告会额外生成“到货判定卡”，直接区分“USB 没看到视频设备”“USB 有线索但 Camera2 没枚举”“预览页已打开但需要看电视确认”“画面已确认但音频/热插拔未闭环”等状态，并列出 ADB 离线/未授权设备、`/dev/video*`、`/dev/snd`、USB 视频/音频线索和 App 原生能力计数。首次未插摄像头运行时会保存 `reports/tv-box-c920-pro-baseline.json` 到货前基线；后续插上 C920 后重跑，会自动对比是否新增 USB 视频、Camera2 摄像头和 USB 音频。它们用于判断是 USB 供电、盒子固件/Camera HAL、AudioManager 还是业务预览问题；但只有 Camera2/CameraService 枚举和电视真实画面一起成立，才算摄像头业务通过。

到货现场如果只想看一张大字操作卡，运行：

```bash
npm run tv-box:c920-arrival-card
```

它会生成 `reports/tv-box-c920-arrival-card-latest.md/json` 和 `reports/tv-box-c920-arrival-card.html`，把最新验收结果转换成直插、带独立供电 USB Hub、Camera2/USB 分流、C920 自带麦克风或独立 USB 麦克风、USB 热插拔和回传证据步骤。交付包里也会带 `C920_ARRIVAL_CARD.html`，现场人员可以直接双击打印。

到货卡会把 C920 专用证据文件名写清楚，现场按名字放进 `FIELD_RETURN/` 再打包回传：`C920_PREVIEW_TV_SCREEN.jpg/mp4` 证明电视真实预览，`C920_MIC_BUSINESS_INPUT.mp4/txt` 证明麦克风进入业务链路，`C920_HOTPLUG_RETEST.jpg/txt` 证明 USB 热插拔复测，`SUPPORT_CODE_C920.jpg` 证明维护码可读，`tv-box-c920-pro-acceptance-latest.md/json` 保留本次 USB、Camera2、音频、基线对比和日志目录证据；工程侧收到后先跑 `npm run tv-box:return-inbox -- <现场回传目录或zip>`，证据不齐或仍有 unknown 时不关闭。

如果一键验收：

```bash
BOX_IP=192.168.10.122 RUN_CAMERA_SMOKE=true npm run tv-box:easy
```

记录兼容性矩阵时，至少填写：

```bash
FIELD_BOX_BRAND=小米 \
FIELD_BOX_MODEL=MiTV-AZFP0 \
FIELD_CAMERA_MODEL="Logitech C920s" \
FIELD_MICROPHONE_MODEL="Jabra Speak 510 UC or Jabra Speak2 40/55" \
FIELD_USB_HOTPLUG=pass \
FIELD_CAMERA_PERMISSION=pass \
FIELD_CAMERA_PREVIEW=pass \
FIELD_AUDIO_INPUT=pass \
FIELD_RECORD_AUDIO_PERMISSION=pass \
BOX_IP=192.168.10.122 npm run tv-box:field-record
```

如果没有麦克风或暂不测音频，把音频项填 `na`，不要留 `unknown`。

## 判定规则

| 现象 | 结论 | 下一步 |
| --- | --- | --- |
| `cameraCount > 0` 或 `externalCameraCount > 0`，预览有真实画面 | Camera2 链路可用 | 继续测扫码、互动课或 WebRTC 接收端 |
| `dumpsys usb` 有 USB 视频线索，但 `cameraCount=0` | 摄像头插入了，但盒子固件/Camera HAL 没开放给 App | 换 C270 复测；仍失败则评估用户态 UVC SDK 或手机 WebRTC 路线 |
| `dumpsys usb` 没有摄像头线索 | 盒子没识别硬件 | 换线、换 USB 口、加带供电 Hub、确认摄像头能在电脑上工作 |
| `audioInputDeviceCount` 增加 | USB 音频输入可见 | 继续做录音权限和业务录音测试 |
| 摄像头预览可打开但无麦克风 | 视频可用，音频未闭环 | 使用独立 USB 麦克风/会议麦 |
| App 可看电视但摄像头不可用 | 电视核心可交付，音视频互动未完成 | 现场记录 `cameraPreview=fail` 或 `na`，不要声明摄像头完成 |

## 技术路线关系

- USB/UVC/Camera2 是实体摄像头保底路线，适合扫码、拍照、离线体感和本机预览。
- 手机当电视摄像头默认走“手机采集 + 电视端原生 WebRTC 接收”，不把手机误认为 Android 系统摄像头。
- RTSP/RTMP 适合快速同网预览 MVP，不适合低延迟互动课长期方案。
- 微信小程序 `live-pusher` 可作为手机免安装入口，但需要服务类目、主体资质和接口权限审核，不能作为无门槛默认承诺。

## 官方依据

- Android External USB Cameras: https://source.android.com/docs/core/camera/external-usb-cameras
- Android Camera2 camera enumeration: https://developer.android.com/media/camera/camera2/camera-enumeration
- Android AudioDeviceInfo: https://developer.android.com/reference/android/media/AudioDeviceInfo
- Logitech C920s Pro HD Webcam: https://www.logitech.com/en-us/products/webcams/c920s-pro-hd-webcam.960-001257.html
- Logitech C270 HD Webcam: https://www.logitech.com/en-us/products/webcams/c270-hd-webcam.960-000694.html
- Logitech C920e microphone note: https://prosupport.logi.com/hc/en-us/articles/360059260733-How-do-I-activate-the-microphones-on-C920e
- Jabra Speak 510: https://www.jabra.com/business/speakerphones/jabra-speak-series/jabra-speak-510
- Jabra Speak2 40: https://www.jabra.com/business/speakerphones/jabra-speak-series/jabra-speak2-40
- Jabra Speak2 55: https://www.jabra.com/business/speakerphones/jabra-speak-series/jabra-speak2-55
