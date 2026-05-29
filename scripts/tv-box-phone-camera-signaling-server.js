#!/usr/bin/env node
const crypto = require('crypto')
const http = require('http')
const os = require('os')

const DEFAULT_PORT = Number(process.env.PHONE_CAMERA_SIGNALING_PORT || process.env.PORT || 17891)
const DEFAULT_HOST = process.env.PHONE_CAMERA_SIGNALING_HOST || '0.0.0.0'
const DEFAULT_ROOM_TTL_SECONDS = Number(process.env.PHONE_CAMERA_ROOM_TTL_SECONDS || 600)

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
  const host = request.headers.host || `127.0.0.1:${DEFAULT_PORT}`
  return `http://${host}`
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
    return `${String(baseUrl).replace(/\/$/, '')}/phone-camera?room=${roomCode}`
  }

  function handleRoomCreate(peer, payload, request) {
    if (payload.role !== 'tv') {
      send(peer, makeError('room_create_role_invalid', 'Only TV can create a room.', false))
      return
    }

    let roomCode = codeGenerator()
    let guard = 0
    while (rooms.has(roomCode) && guard < 20) {
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

    send(peer, {
      type: 'room.created',
      roomCode,
      expiresAtUtc: room.expiresAtUtc,
      pairUrl: room.pairUrl,
      signalingUrl: `ws://${request.headers.host || '127.0.0.1'}/phone-camera/signaling`,
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
      response.end(`<!doctype html>
<html lang="zh-CN">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>HelloTV 手机摄像头</title>
<body>
<h1>手机摄像头信令已就绪</h1>
<p>房间码：<strong>${htmlEscape(roomCode || '请从电视扫码进入')}</strong></p>
<p>当前页面只提供局域网信令入口说明；手机采集端接入后，会在这里请求摄像头和麦克风权限，并提供明显停止按钮。</p>
<p>默认不录制、不上传音视频内容。电视端出现首帧和音频后才算通过。</p>
</body>
</html>`)
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
  const service = createSignalingServer()
  await service.listen(DEFAULT_PORT, DEFAULT_HOST)
  const address = service.address()
  const port = typeof address === 'object' && address ? address.port : DEFAULT_PORT
  const lanHints = getLanHints()

  console.log('QuickTV phone camera LAN signaling service is running.')
  console.log(`Health: http://127.0.0.1:${port}/healthz`)
  console.log(`WebSocket: ws://127.0.0.1:${port}/phone-camera/signaling`)
  if (lanHints.length > 0) {
    console.log(`LAN hints: ${lanHints.map((ip) => `http://${ip}:${port}/phone-camera`).join(', ')}`)
  }
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
  SIGNALING_MESSAGE_REQUIREMENTS
}
