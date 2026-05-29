#!/usr/bin/env node
const crypto = require('crypto')
const http = require('http')
const os = require('os')

const DEFAULT_PORT = Number(process.env.PHONE_CAMERA_SIGNALING_PORT || process.env.PORT || 17891)
const DEFAULT_HOST = process.env.PHONE_CAMERA_SIGNALING_HOST || '0.0.0.0'
const DEFAULT_ROOM_TTL_SECONDS = Number(process.env.PHONE_CAMERA_ROOM_TTL_SECONDS || 600)
const DEFAULT_PUBLIC_BASE_URL = process.env.PHONE_CAMERA_PUBLIC_BASE_URL || process.env.TV_BOX_PHONE_CAMERA_PUBLIC_BASE_URL || ''
const DEFAULT_PUBLIC_SIGNALING_URL = process.env.PHONE_CAMERA_PUBLIC_SIGNALING_URL || process.env.TV_BOX_PHONE_CAMERA_PUBLIC_SIGNALING_URL || ''

const SIGNALING_MESSAGE_REQUIREMENTS = {
  'room.create': ['role', 'deviceId', 'appVersion'],
  'peer.hello': ['roomCode', 'role', 'userAgent', 'mediaCapabilities'],
  'webrtc.offer': ['sdp', 'profileId'],
  'webrtc.answer': ['sdp', 'receiverProfileId'],
  'webrtc.ice-candidate': ['candidate', 'sdpMid', 'sdpMLineIndex'],
  'session.keepalive': ['roomCode', 'state', 'timestampUtc'],
  'session.stats': ['profileId', 'videoWidth', 'videoHeight', 'fps', 'bitrateKbps', 'packetsLost', 'rttMs'],
  'session.hangup': ['reason'],
  'session.error': ['code', 'message', 'recoverable']
}

const RELAY_TYPES = new Set([
  'peer.hello',
  'webrtc.offer',
  'webrtc.answer',
  'webrtc.ice-candidate',
  'session.keepalive',
  'session.hangup',
  'session.error'
])

function utcNow() {
  return new Date().toISOString()
}

function roomExpiresAt(ttlSeconds) {
  return new Date(Date.now() + ttlSeconds * 1000).toISOString()
}

function isRoomCode(value) {
  return /^[0-9]{6}$/.test(String(value || ''))
}

function generateRoomCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0')
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function writeJson(response, statusCode, payload) {
  const body = `${JSON.stringify(payload, null, 2)}\n`
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  })
  response.end(body)
}

function htmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function encodeFrame(data, opcode = 0x1) {
  const payload = Buffer.isBuffer(data) ? data : Buffer.from(String(data))
  let header

  if (payload.length < 126) {
    header = Buffer.alloc(2)
    header[1] = payload.length
  } else if (payload.length < 65536) {
    header = Buffer.alloc(4)
    header[1] = 126
    header.writeUInt16BE(payload.length, 2)
  } else {
    header = Buffer.alloc(10)
    header[1] = 127
    header.writeBigUInt64BE(BigInt(payload.length), 2)
  }

  header[0] = 0x80 | opcode
  return Buffer.concat([header, payload])
}

function decodeFrames(buffer) {
  const frames = []
  let offset = 0

  while (offset + 2 <= buffer.length) {
    const byte1 = buffer[offset]
    const byte2 = buffer[offset + 1]
    const opcode = byte1 & 0x0f
    const masked = (byte2 & 0x80) !== 0
    let length = byte2 & 0x7f
    let cursor = offset + 2

    if (length === 126) {
      if (cursor + 2 > buffer.length) break
      length = buffer.readUInt16BE(cursor)
      cursor += 2
    } else if (length === 127) {
      if (cursor + 8 > buffer.length) break
      const bigLength = buffer.readBigUInt64BE(cursor)
      if (bigLength > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error('WebSocket frame is too large')
      }
      length = Number(bigLength)
      cursor += 8
    }

    const maskOffset = masked ? 4 : 0
    if (cursor + maskOffset + length > buffer.length) break

    let payload = buffer.subarray(cursor + maskOffset, cursor + maskOffset + length)
    if (masked) {
      const mask = buffer.subarray(cursor, cursor + 4)
      payload = Buffer.from(payload)
      for (let index = 0; index < payload.length; index += 1) {
        payload[index] ^= mask[index % 4]
      }
    }

    frames.push({ opcode, payload })
    offset = cursor + maskOffset + length
  }

  return {
    frames,
    rest: buffer.subarray(offset)
  }
}

function publicBaseUrlFromRequest(request) {
  const forwardedProto = String(request.headers['x-forwarded-proto'] || '').split(',')[0].trim()
  const proto = forwardedProto || 'http'
  const host = request.headers.host || `127.0.0.1:${DEFAULT_PORT}`
  return `${proto}://${host}`
}

function signalingUrlFromBaseUrl(baseUrl) {
  const url = new URL(String(baseUrl || '').replace(/\/$/, '') || 'http://127.0.0.1')
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = '/phone-camera/signaling'
  url.search = ''
  url.hash = ''
  return url.toString()
}

function phoneCameraPairUrlFromBaseUrl(baseUrl, roomCode) {
  const url = new URL(String(baseUrl || '').replace(/\/$/, '') || 'http://127.0.0.1')
  const normalizedPath = url.pathname.replace(/\/$/, '')
  if (!normalizedPath || normalizedPath === '/') {
    url.pathname = '/phone-camera'
  } else if (!normalizedPath.endsWith('/phone-camera')) {
    url.pathname = `${normalizedPath}/phone-camera`
  }
  url.search = ''
  url.searchParams.set('room', roomCode)
  url.hash = ''
  return url.toString()
}

function isSecureBrowserOrigin(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || ['localhost', '127.0.0.1', '::1'].includes(url.hostname)
  } catch {
    return false
  }
}

function getLanHints() {
  const hints = []
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses || []) {
      if (address.family === 'IPv4' && !address.internal) {
        hints.push(address.address)
      }
    }
  }
  return hints
}

function validatePayload(type, payload) {
  const required = SIGNALING_MESSAGE_REQUIREMENTS[type]
  if (!required) return `unsupported message type: ${type}`

  for (const field of required) {
    if (!(field in payload)) return `${type} missing required field: ${field}`
  }

  if ('roomCode' in payload && !isRoomCode(payload.roomCode)) {
    return `${type} roomCode must be six digits`
  }

  if ((type === 'room.create' || type === 'peer.hello') && !['tv', 'phone'].includes(payload.role)) {
    return `${type} role must be tv or phone`
  }

  return ''
}

function buildPhoneCameraHtml(roomCode) {
  const escapedRoomCode = htmlEscape(roomCode)
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
    .hero { padding: 18px 0 12px; }
    .panel { margin-top: 14px; padding: 16px; background: #fff; border: 1px solid #d8e0ea; border-radius: 8px; box-shadow: 0 8px 20px rgba(15, 23, 42, 0.05); }
    label { display: block; font-size: 14px; font-weight: 700; color: #344256; }
    input { width: 100%; margin-top: 8px; height: 56px; border: 2px solid #9fb0c4; border-radius: 8px; font-size: 30px; font-weight: 800; text-align: center; letter-spacing: 8px; color: #172033; background: #fff; }
    video { width: 100%; aspect-ratio: 16 / 9; margin-top: 12px; background: #0f172a; border-radius: 8px; object-fit: cover; }
    .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 14px; }
    button { min-height: 54px; border: 0; border-radius: 8px; font-size: 18px; font-weight: 800; color: #fff; background: #2454a6; }
    button.secondary { background: #5b6678; }
    button.danger { background: #b42318; }
    button:disabled { opacity: 0.48; }
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
<body data-room-code="${escapedRoomCode}">
  <main>
    <section class="hero">
      <h1>HelloTV 手机摄像头</h1>
      <p>手机负责拍摄和收音，电视盒子通过 WebRTC 接收画面。默认不录制，不上传音视频内容。</p>
    </section>

    <section class="panel">
      <label for="roomCode">电视上的 6 位房间码</label>
      <input id="roomCode" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" value="${escapedRoomCode}" autocomplete="one-time-code">
      <video id="localPreview" muted playsinline autoplay></video>
      <div class="actions">
        <button id="startButton" type="button">开始发送</button>
        <button id="stopButton" class="danger" type="button" disabled>停止</button>
      </div>
      <p id="status" class="status">请确认房间码后点“开始发送”。</p>
      <p class="fine">如果浏览器提示不安全页面，请用 HTTPS/WSS 入口或手机 App；普通局域网 HTTP 页面通常拿不到摄像头权限。</p>
    </section>

    <section class="panel">
      <strong>现场只看三件事</strong>
      <ul>
        <li>手机弹出摄像头和麦克风授权，并且本页能看到预览。</li>
        <li>电视端接入原生 WebRTC 接收端后，10 秒内出现首帧和声音。</li>
        <li>点“停止”后手机采集灯熄灭，电视端收到挂断。</li>
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
      var currentState = 'idle'
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
        var override = new URLSearchParams(window.location.search).get('signaling')
        if (override) return override
        var protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        return protocol + '//' + window.location.host + '/phone-camera/signaling'
      }

      function mediaConstraints() {
        return {
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280, max: 1280 },
            height: { ideal: 720, max: 720 },
            frameRate: { ideal: 15, max: 15 }
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        }
      }

      function send(message) {
        if (!socket || socket.readyState !== WebSocket.OPEN) return
        socket.send(JSON.stringify(message))
      }

      function startKeepalive() {
        clearInterval(keepaliveTimer)
        keepaliveTimer = setInterval(function () {
          send({
            type: 'session.keepalive',
            roomCode: roomCode(),
            state: currentState,
            timestampUtc: new Date().toISOString()
          })
        }, 2000)
      }

      async function openSocket() {
        return new Promise(function (resolve, reject) {
          socket = new WebSocket(signalingUrl())
          socket.addEventListener('open', resolve, { once: true })
          socket.addEventListener('error', function () {
            reject(new Error('信令服务连接失败，请确认手机和电视在同一网络，且 HTTPS 页面对应 WSS。'))
          }, { once: true })
          socket.addEventListener('message', onMessage)
          socket.addEventListener('close', function () {
            if (currentState !== 'stopped') setStatus('信令已断开，可点开始重新连接。', 'warn')
          })
        })
      }

      async function createPeer() {
        peer = new RTCPeerConnection({ iceServers: [] })
        peer.addEventListener('icecandidate', function (event) {
          if (!event.candidate) return
          send({
            type: 'webrtc.ice-candidate',
            candidate: event.candidate.candidate,
            sdpMid: event.candidate.sdpMid,
            sdpMLineIndex: event.candidate.sdpMLineIndex
          })
        })
        peer.addEventListener('connectionstatechange', function () {
          currentState = peer.connectionState === 'connected' ? 'receiving' : 'negotiating'
          if (peer.connectionState === 'failed' || peer.connectionState === 'disconnected') {
            currentState = 'reconnecting'
            setStatus('连接不稳定，正在等待电视端恢复。', 'warn')
          }
        })
        localStream.getTracks().forEach(function (track) {
          peer.addTrack(track, localStream)
        })
        var offer = await peer.createOffer()
        await peer.setLocalDescription(offer)
        send({ type: 'webrtc.offer', sdp: offer.sdp, profileId: PROFILE_ID })
      }

      async function onMessage(event) {
        var message = {}
        try {
          message = JSON.parse(event.data)
        } catch (error) {
          return
        }
        if (message.type === 'webrtc.answer' && peer) {
          await peer.setRemoteDescription({ type: 'answer', sdp: message.sdp })
          currentState = 'receiving'
          setStatus('电视端已应答，等待首帧确认。', 'ok')
        } else if (message.type === 'webrtc.ice-candidate' && peer && message.candidate) {
          try {
            await peer.addIceCandidate({
              candidate: message.candidate,
              sdpMid: message.sdpMid,
              sdpMLineIndex: message.sdpMLineIndex
            })
          } catch (error) {
            setStatus('收到 ICE 候选但添加失败，可重新开始。', 'warn')
          }
        } else if (message.type === 'session.error') {
          setStatus(message.message || '信令错误，请重新扫码。', message.recoverable ? 'warn' : 'error')
        } else if (message.type === 'session.hangup') {
          stop('电视端已结束连接')
        }
      }

      async function start() {
        var code = roomCode()
        roomInput.value = code
        if (!/^[0-9]{6}$/.test(code)) {
          setStatus('请输入电视上的 6 位数字房间码。', 'warn')
          return
        }
        if (!window.isSecureContext) {
          setStatus('当前不是安全上下文，手机浏览器通常会拒绝摄像头。请改用 HTTPS/WSS 入口或手机 App。', 'error')
          return
        }
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          setStatus('当前浏览器不支持 getUserMedia，请换 Chrome/Safari 或使用手机 App。', 'error')
          return
        }
        if (typeof RTCPeerConnection !== 'function') {
          setStatus('当前浏览器不支持 RTCPeerConnection，无法作为摄像头发送。', 'error')
          return
        }

        startButton.disabled = true
        stopButton.disabled = false
        currentState = 'phone_connected'
        try {
          setStatus('正在请求摄像头和麦克风权限...', '')
          localStream = await navigator.mediaDevices.getUserMedia(mediaConstraints())
          localPreview.srcObject = localStream
          await openSocket()
          send({
            type: 'peer.hello',
            roomCode: code,
            role: 'phone',
            userAgent: navigator.userAgent,
            mediaCapabilities: {
              camera: localStream.getVideoTracks().length > 0,
              microphone: localStream.getAudioTracks().length > 0,
              profileId: PROFILE_ID,
              secureContext: window.isSecureContext
            }
          })
          currentState = 'negotiating'
          setStatus('已连接信令，正在向电视发送 WebRTC offer。', 'ok')
          await createPeer()
          startKeepalive()
        } catch (error) {
          setStatus(error && error.message ? error.message : '手机摄像头启动失败。', 'error')
          stop('启动失败')
        }
      }

      function stop(reason) {
        currentState = 'stopped'
        clearInterval(keepaliveTimer)
        send({ type: 'session.hangup', reason: reason || 'user_stop' })
        if (peer) peer.close()
        if (socket && socket.readyState === WebSocket.OPEN) socket.close()
        if (localStream) {
          localStream.getTracks().forEach(function (track) { track.stop() })
        }
        peer = null
        socket = null
        localStream = null
        localPreview.srcObject = null
        startButton.disabled = false
        stopButton.disabled = true
        setStatus(reason || '已停止，手机摄像头和麦克风已关闭。', reason === '启动失败' ? 'error' : 'ok')
      }

      roomInput.addEventListener('input', function () {
        roomInput.value = roomCode()
      })
      startButton.addEventListener('click', start)
      stopButton.addEventListener('click', function () { stop('user_stop') })
      window.addEventListener('pagehide', function () { stop('page_hide') })

      if (!roomCode()) {
        var queryRoom = new URLSearchParams(window.location.search).get('room') || ''
        roomInput.value = queryRoom.replace(/\\D/g, '').slice(0, 6)
      }
      if (!window.isSecureContext) {
        setStatus('提示：当前不是 HTTPS 安全上下文。页面可配对，但手机浏览器大概率不会给摄像头权限。', 'warn')
      }
    })()
  </script>
</body>
</html>`
}

function makeError(code, message, recoverable = true) {
  return {
    type: 'session.error',
    code,
    message,
    recoverable,
    timestampUtc: utcNow()
  }
}

function createSignalingServer(options = {}) {
  const roomTtlSeconds = Number(options.roomTtlSeconds || DEFAULT_ROOM_TTL_SECONDS)
  const codeGenerator = options.codeGenerator || generateRoomCode
  const logger = options.logger || console
  const rooms = new Map()
  const peers = new Set()
  let peerSequence = 0

  function snapshot() {
    return {
      status: 'ok',
      service: 'quicktv-phone-camera-signaling',
      generatedAtUtc: utcNow(),
      roomTtlSeconds,
      rooms: [...rooms.values()].map((room) => ({
        roomCode: room.roomCode,
        createdAtUtc: room.createdAtUtc,
        expiresAtUtc: room.expiresAtUtc,
        pairUrl: room.pairUrl,
        tvConnected: Boolean(room.tv && !room.tv.closed),
        phoneConnected: Boolean(room.phone && !room.phone.closed),
        paired: room.paired,
        pairingClosed: room.pairingClosed,
        lastStats: room.lastStats ? {
          profileId: room.lastStats.profileId,
          videoWidth: room.lastStats.videoWidth,
          videoHeight: room.lastStats.videoHeight,
          fps: room.lastStats.fps,
          bitrateKbps: room.lastStats.bitrateKbps,
          packetsLost: room.lastStats.packetsLost,
          rttMs: room.lastStats.rttMs,
          receivedAtUtc: room.lastStats.receivedAtUtc
        } : null
      }))
    }
  }

  function send(peer, payload) {
    if (!peer || peer.closed || peer.socket.destroyed) return
    peer.socket.write(encodeFrame(JSON.stringify(payload)))
  }

  function closePeer(peer) {
    if (!peer || peer.closed) return
    peer.closed = true
    peers.delete(peer)

    const room = peer.roomCode ? rooms.get(peer.roomCode) : null
    if (room) {
      const other = room.tv === peer ? room.phone : room.tv
      if (room.tv === peer) room.tv = null
      if (room.phone === peer) room.phone = null
      if (other && !other.closed) {
        send(other, makeError('peer_disconnected', `${peer.role || 'peer'} disconnected`, true))
      }
      if (!room.tv && !room.phone) {
        clearTimeout(room.expireTimer)
        rooms.delete(room.roomCode)
      }
    }
  }

  function relay(room, fromPeer, payload) {
    const target = room.tv === fromPeer ? room.phone : room.tv
    if (!target || target.closed) {
      send(fromPeer, makeError('peer_not_connected', 'The other side is not connected yet.', true))
      return
    }
    send(target, {
      ...payload,
      roomCode: room.roomCode,
      fromRole: fromPeer.role,
      serverTimeUtc: utcNow()
    })
  }

  function expireRoom(roomCode) {
    const room = rooms.get(roomCode)
    if (!room) return
    const error = makeError('room_expired', 'Room code expired. Please regenerate on TV.', true)
    send(room.tv, error)
    send(room.phone, error)
    clearTimeout(room.expireTimer)
    rooms.delete(roomCode)
  }

  function buildPairUrl(roomCode, request) {
    const baseUrl = options.publicBaseUrl || publicBaseUrlFromRequest(request)
    return phoneCameraPairUrlFromBaseUrl(baseUrl, roomCode)
  }

  function buildSignalingUrl(request) {
    if (options.publicSignalingUrl) return options.publicSignalingUrl
    const baseUrl = options.publicBaseUrl || publicBaseUrlFromRequest(request)
    return signalingUrlFromBaseUrl(baseUrl)
  }

  function handleRoomCreate(peer, payload, request) {
    if (payload.role !== 'tv') {
      send(peer, makeError('room_create_role_invalid', 'Only TV can create a room.', false))
      return
    }

    const requestedRoomCode = payload.roomCode || ''
    let roomCode = requestedRoomCode || codeGenerator()
    if (requestedRoomCode && rooms.has(requestedRoomCode)) {
      send(peer, makeError('room_code_unavailable', 'Requested room code is already active.', true))
      return
    }

    let guard = 0
    while (!requestedRoomCode && rooms.has(roomCode) && guard < 20) {
      roomCode = codeGenerator()
      guard += 1
    }
    if (!isRoomCode(roomCode) || rooms.has(roomCode)) {
      send(peer, makeError('room_code_unavailable', 'Could not allocate a six-digit room code.', true))
      return
    }

    const room = {
      roomCode,
      createdAtUtc: utcNow(),
      expiresAtUtc: roomExpiresAt(roomTtlSeconds),
      pairUrl: buildPairUrl(roomCode, request),
      tv: peer,
      phone: null,
      paired: false,
      pairingClosed: false,
      lastStats: null,
      expireTimer: setTimeout(() => expireRoom(roomCode), roomTtlSeconds * 1000)
    }

    peer.role = 'tv'
    peer.roomCode = roomCode
    rooms.set(roomCode, room)

    const signalingUrl = buildSignalingUrl(request)
    send(peer, {
      type: 'room.created',
      roomCode,
      roomCodeSource: requestedRoomCode ? 'tv_requested' : 'server_generated',
      expiresAtUtc: room.expiresAtUtc,
      pairUrl: room.pairUrl,
      signalingUrl,
      secureContext: {
        phoneCameraRequiresSecureContext: true,
        pairUrlBrowserSecure: isSecureBrowserOrigin(room.pairUrl),
        signalingUrlSecure: signalingUrl.startsWith('wss://'),
        note: '真实手机浏览器采集摄像头/麦克风通常需要 HTTPS 页面和 WSS 信令；HTTP 局域网入口只适合本地调试或 App 包装。'
      },
      ttlSeconds: roomTtlSeconds
    })
  }

  function handlePeerHello(peer, payload) {
    const room = rooms.get(payload.roomCode)
    if (!room) {
      send(peer, makeError('room_not_found', 'Room code is invalid or expired.', true))
      return
    }
    if (payload.role !== 'phone') {
      send(peer, makeError('peer_role_invalid', 'Only phone can join a TV-created room.', false))
      return
    }
    if (room.pairingClosed || (room.phone && room.phone !== peer)) {
      send(peer, makeError('room_already_paired', 'Room already has a paired phone.', true))
      return
    }

    peer.role = 'phone'
    peer.roomCode = room.roomCode
    room.phone = peer
    room.paired = true
    room.pairingClosed = true
    relay(room, peer, { type: 'peer.hello', ...payload })
  }

  function handleMessage(peer, rawMessage, request) {
    const message = safeJsonParse(rawMessage)
    if (!message || typeof message !== 'object') {
      send(peer, makeError('invalid_json', 'Message must be JSON.', false))
      return
    }

    const { type, ...payload } = message
    const validationError = validatePayload(type, payload)
    if (validationError) {
      send(peer, makeError('invalid_message', validationError, false))
      return
    }

    if (type === 'room.create') {
      handleRoomCreate(peer, payload, request)
      return
    }

    if (type === 'peer.hello') {
      handlePeerHello(peer, payload)
      return
    }

    const roomCode = payload.roomCode || peer.roomCode
    const room = roomCode ? rooms.get(roomCode) : null
    if (!room || (room.tv !== peer && room.phone !== peer)) {
      send(peer, makeError('room_not_joined', 'Create or join a room before sending signaling messages.', true))
      return
    }

    if (type === 'webrtc.offer' && peer.role !== 'phone') {
      send(peer, makeError('offer_role_invalid', 'WebRTC offer must come from phone.', false))
      return
    }
    if (type === 'webrtc.answer' && peer.role !== 'tv') {
      send(peer, makeError('answer_role_invalid', 'WebRTC answer must come from TV.', false))
      return
    }
    if (type === 'session.stats') {
      if (peer.role !== 'tv') {
        send(peer, makeError('stats_role_invalid', 'Session stats must come from TV receiver.', false))
        return
      }
      room.lastStats = {
        ...payload,
        receivedAtUtc: utcNow()
      }
      return
    }

    if (type === 'session.hangup') {
      relay(room, peer, { type, ...payload })
      clearTimeout(room.expireTimer)
      rooms.delete(room.roomCode)
      return
    }

    if (RELAY_TYPES.has(type)) {
      relay(room, peer, { type, ...payload })
      return
    }

    send(peer, makeError('unsupported_message', `Unsupported message type: ${type}`, false))
  }

  function handleHttp(request, response) {
    const url = new URL(request.url || '/', 'http://127.0.0.1')
    if (url.pathname === '/healthz') {
      writeJson(response, 200, snapshot())
      return
    }

    if (url.pathname === '/phone-camera') {
      const roomCode = url.searchParams.get('room') || ''
      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store'
      })
      response.end(buildPhoneCameraHtml(roomCode))
      return
    }

    writeJson(response, 404, { status: 'not_found' })
  }

  const server = http.createServer(handleHttp)

  server.on('upgrade', (request, socket) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1')
    if (url.pathname !== '/phone-camera/signaling') {
      socket.end('HTTP/1.1 404 Not Found\r\n\r\n')
      return
    }

    const key = request.headers['sec-websocket-key']
    if (!key) {
      socket.end('HTTP/1.1 400 Bad Request\r\n\r\n')
      return
    }

    const accept = crypto
      .createHash('sha1')
      .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest('base64')

    socket.write([
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${accept}`,
      '\r\n'
    ].join('\r\n'))

    const peer = {
      id: `peer-${peerSequence += 1}`,
      role: null,
      roomCode: null,
      socket,
      closed: false
    }
    peers.add(peer)

    let buffer = Buffer.alloc(0)

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk])
      let result
      try {
        result = decodeFrames(buffer)
      } catch (error) {
        send(peer, makeError('frame_error', error.message, false))
        socket.end()
        return
      }
      buffer = result.rest

      for (const frame of result.frames) {
        if (frame.opcode === 0x1) {
          handleMessage(peer, frame.payload.toString('utf8'), request)
        } else if (frame.opcode === 0x8) {
          socket.end()
        } else if (frame.opcode === 0x9) {
          socket.write(encodeFrame(frame.payload, 0xA))
        }
      }
    })

    socket.on('close', () => closePeer(peer))
    socket.on('error', () => closePeer(peer))
  })

  return {
    server,
    listen(port = DEFAULT_PORT, host = DEFAULT_HOST) {
      return new Promise((resolve, reject) => {
        const onError = (error) => {
          server.off('listening', onListening)
          reject(error)
        }
        const onListening = () => {
          server.off('error', onError)
          resolve(this)
        }
        server.once('error', onError)
        server.once('listening', onListening)
        server.listen(port, host)
      })
    },
    close() {
      for (const peer of peers) {
        peer.socket.destroy()
      }
      for (const room of rooms.values()) {
        clearTimeout(room.expireTimer)
      }
      rooms.clear()
      peers.clear()
      return new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      })
    },
    address() {
      return server.address()
    },
    snapshot
  }
}

async function main() {
  const service = createSignalingServer({
    publicBaseUrl: DEFAULT_PUBLIC_BASE_URL || undefined,
    publicSignalingUrl: DEFAULT_PUBLIC_SIGNALING_URL || undefined
  })
  await service.listen(DEFAULT_PORT, DEFAULT_HOST)
  const address = service.address()
  const port = typeof address === 'object' && address ? address.port : DEFAULT_PORT
  const lanHints = getLanHints()

  console.log('QuickTV phone camera LAN signaling service is running.')
  console.log(`Health: http://127.0.0.1:${port}/healthz`)
  console.log(`WebSocket: ws://127.0.0.1:${port}/phone-camera/signaling`)
  if (DEFAULT_PUBLIC_BASE_URL) {
    console.log(`Public phone entry: ${phoneCameraPairUrlFromBaseUrl(DEFAULT_PUBLIC_BASE_URL, '000000').replace('000000', '<room>')}`)
    console.log(`Public signaling: ${DEFAULT_PUBLIC_SIGNALING_URL || signalingUrlFromBaseUrl(DEFAULT_PUBLIC_BASE_URL)}`)
  }
  if (lanHints.length > 0) {
    console.log(`LAN hints: ${lanHints.map((ip) => `http://${ip}:${port}/phone-camera`).join(', ')}`)
  }
  console.log('Secure-context note: real phone browsers usually require HTTPS/WSS for camera and microphone permission; use a trusted LAN certificate, tunnel/reverse proxy, or phone app for field acceptance.')
  console.log('Boundary: signaling only; real pass still requires TV native WebRTC receiver, phone capture, first frame, audio, stats, reconnect, and privacy-stop evidence.')

  process.on('SIGINT', async () => {
    await service.close()
    process.exit(0)
  })
  process.on('SIGTERM', async () => {
    await service.close()
    process.exit(0)
  })
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}

module.exports = {
  createSignalingServer,
  buildPhoneCameraHtml,
  signalingUrlFromBaseUrl,
  phoneCameraPairUrlFromBaseUrl,
  SIGNALING_MESSAGE_REQUIREMENTS
}
