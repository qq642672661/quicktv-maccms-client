# HelloTV 手机摄像头 Cloudflare 信令

## 目标

电视盒子与手机通过 Cloudflare Worker 的 HTTPS/WSS 入口完成房间创建、配对、WebRTC offer/answer/ICE 转发、stats 记录和停止通知。音视频内容仍由手机与电视盒子之间的 WebRTC 直接传输，不进入 Worker。

## 架构

- 每个 6 位房间码使用一个独立 Durable Object。
- 电视端信令 URL 必须包含 `room=<房间码>&role=tv`。
- 手机端信令 URL 必须包含 `room=<房间码>&role=phone`。
- 房间有效期为 10 分钟。
- `/healthz` 检查 Worker 存活；`/healthz?room=<房间码>` 检查单个房间状态。

## 部署

源码：`cloudflare/phone-camera-worker.mjs`

Wrangler 配置：`cloudflare/wrangler.phone-camera.jsonc`

```bash
cd cloudflare
npx wrangler deploy --config wrangler.phone-camera.jsonc
```

## 自动冒烟

```bash
TV_BOX_PHONE_CAMERA_CLOUDFLARE_BASE_URL=https://quicktv-phone-camera.<workers-subdomain>.workers.dev \
  npm run tv-box:phone-camera-cloudflare-smoke
```

## 验收边界

Cloudflare 冒烟只能证明 HTTPS/WSS、房间路由、信令转发、stats 存储和停止通知。真实通过仍必须由现场 iPhone 补齐权限截图、手机预览、电视首帧、电视声音、断线重连和停止后采集灯熄灭证据。
