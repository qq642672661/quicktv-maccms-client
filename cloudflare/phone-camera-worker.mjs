const ROOM_TTL_SECONDS = 600
const ROOM_PATTERN = /^[0-9]{6}$/
const RELAY_TYPES = new Set([
  'peer.hello',
  'webrtc.offer',
  'webrtc.answer',
  'webrtc.ice-candidate',
  'session.error'
])

function utcNow() {
  return new Date().toISOString()
}

function json(payload, status = 200) {
  return Response.json(payload, {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8'
    }
  })
}

function errorPayload(code, message, recoverable = true) {
  return {
    type: 'session.error',
    code,
    message,
    recoverable,
    timestampUtc: utcNow()
  }
}

function phoneCameraHtml(roomCode) {
  const escapedRoomCode = String(roomCode || '').replace(/[^0-9]/g, '').slice(0, 6)
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#0f172a">
  <title>HelloTV 手机摄像头</title>
  <style>
    :root { color-scheme: light; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif; background: #f5f7fb; color: #172033; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: #f5f7fb; }
    main { width: min(720px, 100%); margin: 0 auto; padding: 20px 18px 32px; }
    h1 { margin: 0; font-size: 28px; line-height: 1.18; letter-spacing: 0; }
    p { margin: 8px 0 0; font-size: 16px; line-height: 1.55; }
    .panel { margin-top: 14px; padding: 16px; background: #fff; border: 1px solid #d8e0ea; border-radius: 8px; }
    label { display: block; font-size: 14px; font-weight: 700; color: #344256; }
    input { width: 100%; margin-top: 8px; height: 56px; border: 2px solid #9fb0c4; border-radius: 8px; font-size: 30px; font-weight: 800; text-align: center; letter-spacing: 8px; color: #172033; background: #fff; }
    video { width: 100%; aspect-ratio: 16 / 9; margin-top: 12px; background: #0f172a; border-radius: 8px; object-fit: cover; }
    .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 14px; }
    button { min-height: 54px; border: 0; border-radius: 8px; background: #0f62fe; color: #fff; font-size: 18px; font-weight: 800; }
    button:disabled { opacity: .5; }
    button.danger { background: #c2410c; }
    .status { min-height: 48px; padding: 12px; border-radius: 8px; background: #eef4ff; color: #1e3a8a; font-weight: 700; }
    .warn { background: #fff7ed; color: #9a3412; }
    .ok { background: #ecfdf3; color: #087443; }
    .error { background: #fef3f2; color: #b42318; }
    ul { margin: 8px 0 0; padding-left: 20px; }
    li { margin-top: 5px; line-height: 1.5; }
    .fine { font-size: 13px; color: #5b6678; }
    @media (max-width: 420px) { main { padding: 16px 12px 24px; } h1 { font-size: 25px; } .actions { grid-template-columns: 1fr; } input { letter-spacing: 5px; } }
  </style>
</head>
<body>
  <main>
    <h1>HelloTV 手机摄像头</h1>
    <p>手机负责拍摄和收音，电视盒子通过 WebRTC 接收画面。默认不录制，不上传音视频内容。</p>
    <section class="panel">
      <label for="roomCode">电视上的 6 位房间码</label>
      <input id="roomCode" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" value="${escapedRoomCode}" autocomplete="one-time-code">
      <video id="localPreview" muted playsinline autoplay></video>
      <div class="actions">
        <button id="startButton" type="button">开始发送</button>
        <button id="stopButton" class="danger" type="button" disabled>停止</button>
      </div>
      <p id="status" class="status">请确认房间码后点“开始发送”。</p>
      <p class="fine">页面只负责实时传输。点“停止”后会关闭手机摄像头和麦克风。</p>
    </section>
    <section class="panel">
      <strong>现场验收</strong>
      <ul>
        <li>允许手机摄像头和麦克风权限。</li>
        <li>确认手机预览、电视首帧和电视声音。</li>
        <li>点“停止”，确认采集灯熄灭。</li>
      </ul>
    </section>
  </main>
  <script>
    (function () {
      'use strict'
      var PROFILE_ID = 'default_720p_15'
      var localStream = null
      var socket = null
      var peer = null
      var keepaliveTimer = null
      var roomInput = document.getElementById('roomCode')
      var localPreview = document.getElementById('localPreview')
      var startButton = document.getElementById('startButton')
      var stopButton = document.getElementById('stopButton')
      var statusBox = document.getElementById('status')

      function setStatus(text, kind) {
        statusBox.textContent = text
        statusBox.className = 'status' + (kind ? ' ' + kind : '')
      }

      function roomCode() {
        return String(roomInput.value || '').replace(/\\D/g, '').slice(0, 6)
      }

      function signalingUrl() {
        return 'wss://' + window.location.host + '/phone-camera/signaling?room=' + encodeURIComponent(roomCode()) + '&role=phone'
      }

      function send(message) {
        if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
      }

      async function openSocket() {
        return new Promise(function (resolve, reject) {
          socket = new WebSocket(signalingUrl())
          socket.addEventListener('open', resolve, { once: true })
          socket.addEventListener('error', function () { reject(new Error('信令连接失败，请重新扫码。')) }, { once: true })
          socket.addEventListener('message', onMessage)
          socket.addEventListener('close', function () { setStatus('信令已断开，可点开始重新连接。', 'warn') })
        })
      }

      async function createPeer() {
        peer = new RTCPeerConnection({ iceServers: [] })
        peer.addEventListener('icecandidate', function (event) {
          if (!event.candidate) return
          send({ type: 'webrtc.ice-candidate', candidate: event.candidate.candidate, sdpMid: event.candidate.sdpMid, sdpMLineIndex: event.candidate.sdpMLineIndex })
        })
        peer.addEventListener('connectionstatechange', function () {
          if (peer.connectionState === 'connected') setStatus('电视端已连接，请确认电视画面和声音。', 'ok')
          if (peer.connectionState === 'failed' || peer.connectionState === 'disconnected') setStatus('连接不稳定，可点停止后重新开始。', 'warn')
        })
        localStream.getTracks().forEach(function (track) { peer.addTrack(track, localStream) })
        var offer = await peer.createOffer()
        await peer.setLocalDescription(offer)
        send({ type: 'webrtc.offer', sdp: offer.sdp, profileId: PROFILE_ID })
      }

      async function onMessage(event) {
        var message
        try { message = JSON.parse(event.data) } catch (error) { return }
        if (message.type === 'webrtc.answer' && peer) {
          await peer.setRemoteDescription({ type: 'answer', sdp: message.sdp })
          setStatus('电视端已应答，请确认电视首帧。', 'ok')
        } else if (message.type === 'webrtc.ice-candidate' && peer && message.candidate) {
          try { await peer.addIceCandidate(message) } catch (error) { setStatus('ICE 候选添加失败，可重新开始。', 'warn') }
        } else if (message.type === 'session.error') {
          setStatus(message.message || '信令错误，请重新扫码。', message.recoverable ? 'warn' : 'error')
        } else if (message.type === 'session.hangup') {
          stop('电视端已结束连接')
        }
      }

      async function start() {
        var code = roomCode()
        if (!/^[0-9]{6}$/.test(code)) return setStatus('请输入电视上的 6 位数字房间码。', 'warn')
        if (!window.isSecureContext) return setStatus('请使用 HTTPS 安全入口。', 'error')
        startButton.disabled = true
        stopButton.disabled = false
        try {
          setStatus('正在请求摄像头和麦克风权限...', '')
          localStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280, max: 1280 }, height: { ideal: 720, max: 720 }, frameRate: { ideal: 15, max: 15 } },
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
          })
          localPreview.srcObject = localStream
          await openSocket()
          send({ type: 'peer.hello', roomCode: code, role: 'phone', userAgent: navigator.userAgent, mediaCapabilities: { camera: true, microphone: true, profileId: PROFILE_ID, secureContext: true } })
          setStatus('已连接信令，正在向电视发送画面。', 'ok')
          await createPeer()
          keepaliveTimer = setInterval(function () { send({ type: 'session.keepalive', roomCode: code, state: 'sending', timestampUtc: new Date().toISOString() }) }, 2000)
        } catch (error) {
          stop(error && error.message ? error.message : '手机摄像头启动失败。')
        }
      }

      function stop(reason) {
        clearInterval(keepaliveTimer)
        send({ type: 'session.hangup', reason: reason || 'user_stop' })
        if (peer) peer.close()
        if (socket && socket.readyState === WebSocket.OPEN) socket.close()
        if (localStream) localStream.getTracks().forEach(function (track) { track.stop() })
        peer = null
        socket = null
        localStream = null
        localPreview.srcObject = null
        startButton.disabled = false
        stopButton.disabled = true
        setStatus(reason || '已停止，手机摄像头和麦克风已关闭。', 'ok')
      }

      roomInput.addEventListener('input', function () { roomInput.value = roomCode() })
      startButton.addEventListener('click', start)
      stopButton.addEventListener('click', function () { stop('user_stop') })
      window.addEventListener('pagehide', function () { stop('page_hide') })
    })()
  </script>
</body>
</html>`
}

export class QuickTvPhoneCameraRoom {
  constructor(state) {
    this.state = state
  }

  sockets(role) {
    return this.state.getWebSockets(role)
  }

  socket(role) {
    return this.sockets(role)[0] || null
  }

  send(socket, payload) {
    if (!socket) return false
    try {
      socket.send(JSON.stringify(payload))
      return true
    } catch {
      return false
    }
  }

  relay(fromRole, payload) {
    const targetRole = fromRole === 'tv' ? 'phone' : 'tv'
    if (!this.send(this.socket(targetRole), { ...payload, fromRole, serverTimeUtc: utcNow() })) {
      this.send(this.socket(fromRole), errorPayload('peer_not_connected', 'The other side is not connected yet.', true))
    }
  }

  async snapshot(roomCode) {
    const room = await this.state.storage.get('room')
    return {
      roomCode,
      expiresAtUtc: room?.expiresAtUtc || null,
      pairUrl: room?.pairUrl || null,
      tvConnected: this.sockets('tv').length > 0,
      phoneConnected: this.sockets('phone').length > 0,
      paired: Boolean(room?.paired),
      pairingClosed: Boolean(room?.pairingClosed),
      lastStats: room?.lastStats || null
    }
  }

  async fetch(request) {
    const url = new URL(request.url)
    const roomCode = url.searchParams.get('room') || ''
    if (!ROOM_PATTERN.test(roomCode)) return json({ status: 'invalid_room_code' }, 400)
    if (url.pathname === '/healthz') return json({ status: 'ok', service: 'quicktv-phone-camera-room', room: await this.snapshot(roomCode) })
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return json({ status: 'websocket_upgrade_required' }, 426)
    const role = url.searchParams.get('role')
    if (role !== 'tv' && role !== 'phone') return json({ status: 'invalid_role' }, 400)
    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]
    server.serializeAttachment({ roomCode, role, host: url.host })
    this.state.acceptWebSocket(server, [role])
    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(socket, rawMessage) {
    const attachment = socket.deserializeAttachment()
    let message
    try {
      message = JSON.parse(typeof rawMessage === 'string' ? rawMessage : new TextDecoder().decode(rawMessage))
    } catch {
      return this.send(socket, errorPayload('invalid_json', 'Message must be JSON.', false))
    }
    const role = attachment.role
    const roomCode = attachment.roomCode
    const room = await this.state.storage.get('room')

    if (message.type === 'room.create') {
      if (role !== 'tv' || message.role !== 'tv') return this.send(socket, errorPayload('room_create_role_invalid', 'Only TV can create a room.', false))
      if (message.roomCode && message.roomCode !== roomCode) return this.send(socket, errorPayload('room_code_mismatch', 'TV room code must match the signaling URL.', false))
      const expiresAtUtc = new Date(Date.now() + ROOM_TTL_SECONDS * 1000).toISOString()
      const host = attachment.host
      const pairUrl = `https://${host}/phone-camera?room=${roomCode}&role=phone`
      const signalingUrl = `wss://${host}/phone-camera/signaling?room=${roomCode}&role=tv`
      await this.state.storage.put('room', { roomCode, expiresAtUtc, pairUrl, signalingUrl, paired: false, pairingClosed: false, lastStats: null })
      await this.state.storage.setAlarm(Date.now() + ROOM_TTL_SECONDS * 1000)
      return this.send(socket, { type: 'room.created', roomCode, roomCodeSource: 'tv_requested', expiresAtUtc, pairUrl, signalingUrl, ttlSeconds: ROOM_TTL_SECONDS })
    }

    if (!room || new Date(room.expiresAtUtc).getTime() <= Date.now()) {
      return this.send(socket, errorPayload('room_not_found', 'Room code is invalid or expired.', true))
    }

    if (message.type === 'peer.hello') {
      if (role !== 'phone' || message.role !== 'phone') return this.send(socket, errorPayload('peer_role_invalid', 'Only phone can join a TV-created room.', false))
      if (message.roomCode !== roomCode) return this.send(socket, errorPayload('room_code_mismatch', 'Phone room code must match the signaling URL.', false))
      if (room.pairingClosed && this.sockets('phone').length > 1) return this.send(socket, errorPayload('room_already_paired', 'Room already has a paired phone.', true))
      room.paired = true
      room.pairingClosed = true
      await this.state.storage.put('room', room)
      return this.relay(role, message)
    }

    if (message.type === 'session.keepalive') return
    if (message.type === 'session.stats') {
      if (role !== 'tv') return this.send(socket, errorPayload('stats_role_invalid', 'Session stats must come from TV receiver.', false))
      room.lastStats = { ...message, receivedAtUtc: utcNow() }
      await this.state.storage.put('room', room)
      return
    }
    if (message.type === 'session.hangup') {
      this.relay(role, message)
      await this.closeRoom('session_hangup')
      return
    }
    if (RELAY_TYPES.has(message.type)) return this.relay(role, message)
    this.send(socket, errorPayload('unsupported_message', `Unsupported message type: ${message.type}`, false))
  }

  async closeRoom(reason) {
    const payload = errorPayload(reason, reason, true)
    for (const socket of this.state.getWebSockets()) {
      this.send(socket, payload)
      try { socket.close(1000, reason) } catch {}
    }
    await this.state.storage.deleteAll()
    await this.state.storage.deleteAlarm()
  }

  async webSocketClose(socket) {
    const attachment = socket.deserializeAttachment()
    const otherRole = attachment.role === 'tv' ? 'phone' : 'tv'
    this.send(this.socket(otherRole), errorPayload('peer_disconnected', `${attachment.role} disconnected`, true))
  }

  async webSocketError(socket) {
    await this.webSocketClose(socket)
  }

  async alarm() {
    await this.closeRoom('room_expired')
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname === '/healthz') {
      const roomCode = url.searchParams.get('room') || ''
      if (ROOM_PATTERN.test(roomCode)) return env.PHONE_CAMERA_ROOMS.getByName(roomCode).fetch(request)
      return json({
        status: 'ok',
        service: 'quicktv-phone-camera-cloudflare-signaling',
        architecture: 'durable_object_per_room',
        generatedAtUtc: utcNow(),
        roomTtlSeconds: ROOM_TTL_SECONDS
      })
    }
    if (url.pathname === '/phone-camera') {
      return new Response(phoneCameraHtml(url.searchParams.get('room') || ''), {
        headers: {
          'cache-control': 'no-store',
          'content-type': 'text/html; charset=utf-8',
          'referrer-policy': 'no-referrer'
        }
      })
    }
    if (url.pathname === '/phone-camera/signaling') {
      const roomCode = url.searchParams.get('room') || ''
      if (!ROOM_PATTERN.test(roomCode)) return json({ status: 'invalid_room_code' }, 400)
      return env.PHONE_CAMERA_ROOMS.getByName(roomCode).fetch(request)
    }
    return json({ status: 'not_found' }, 404)
  }
}
