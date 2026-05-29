package com.quicktvui.hellotv.tvbox;

import android.os.Build;
import android.util.Base64;
import android.util.Log;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.EOFException;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.URI;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Locale;

import javax.net.ssl.SSLSocketFactory;

/**
 * Tiny WebSocket client for the LAN signaling MVP.
 *
 * It creates the TV room and observes phone hello/offer events. Media is still
 * handled by the future org.webrtc receiver; this class must not claim media
 * success by itself.
 */
public final class PhoneCameraSignalingClient {

    public interface Listener {
        void onState(String state, String detail);

        void onRoomCreated(String roomCode, String pairUrl, String signalingUrl, String expiresAtUtc, String roomCodeSource);

        void onPhoneHello(String detail);

        void onOffer(String profileId, String sdp);

        void onRemoteIceCandidate(String sdpMid, int sdpMLineIndex, String candidate);

        void onError(String code, String message, boolean recoverable);

        void onClosed(String reason);
    }

    private static final String TAG = "PhoneCameraSignaling";
    private static final int OPCODE_TEXT = 0x1;
    private static final int OPCODE_CLOSE = 0x8;
    private static final int OPCODE_PING = 0x9;
    private static final int OPCODE_PONG = 0xA;

    private final String signalingUrl;
    private final String roomCode;
    private final String profileId;
    private final String appVersion;
    private final Listener listener;
    private final SecureRandom random = new SecureRandom();
    private final Object writeLock = new Object();

    private volatile boolean stopped;
    private Socket socket;
    private OutputStream outputStream;
    private Thread thread;

    public PhoneCameraSignalingClient(String signalingUrl, String roomCode, String profileId, String appVersion, Listener listener) {
        this.signalingUrl = signalingUrl == null ? "" : signalingUrl.trim();
        this.roomCode = roomCode == null ? "" : roomCode.trim();
        this.profileId = profileId == null ? "" : profileId.trim();
        this.appVersion = appVersion == null || appVersion.trim().length() == 0 ? "unknown" : appVersion.trim();
        this.listener = listener;
    }

    public void start() {
        if (thread != null) {
            return;
        }
        thread = new Thread(new Runnable() {
            @Override
            public void run() {
                runClient();
            }
        }, "PhoneCameraSignalingClient");
        thread.start();
    }

    public void stop() {
        stopped = true;
        closeSocket();
    }

    private void runClient() {
        try {
            notifyState("connecting_signaling", signalingUrl);
            URI uri = URI.create(signalingUrl);
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.US);
            if (!"ws".equals(scheme) && !"wss".equals(scheme)) {
                notifyError("invalid_signaling_url", "signalingUrl must start with ws:// or wss://", true);
                return;
            }

            socket = openSocket(uri, "wss".equals(scheme));
            outputStream = socket.getOutputStream();
            performHandshake(uri);
            notifyState("signaling_connected_creating_room", roomCode);
            sendRoomCreate();

            InputStream inputStream = socket.getInputStream();
            while (!stopped) {
                Frame frame = readFrame(inputStream);
                if (frame == null) {
                    notifyClosed("socket_closed");
                    return;
                }
                if (frame.opcode == OPCODE_CLOSE) {
                    notifyClosed("server_closed");
                    return;
                }
                if (frame.opcode == OPCODE_PING) {
                    sendFrame(frame.payload, OPCODE_PONG);
                    continue;
                }
                if (frame.opcode == OPCODE_TEXT) {
                    handleTextFrame(new String(frame.payload, "UTF-8"));
                }
            }
        } catch (Throwable error) {
            if (!stopped) {
                notifyError("signaling_client_error", error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage(), true);
            }
        } finally {
            closeSocket();
        }
    }

    private Socket openSocket(URI uri, boolean tls) throws IOException {
        String host = uri.getHost();
        int port = uri.getPort();
        if (host == null || host.length() == 0) {
            throw new IOException("missing signaling host");
        }
        if (port < 0) {
            port = tls ? 443 : 80;
        }

        if (tls) {
            Socket tlsSocket = SSLSocketFactory.getDefault().createSocket(host, port);
            tlsSocket.setSoTimeout(0);
            return tlsSocket;
        }

        Socket plainSocket = new Socket();
        plainSocket.connect(new InetSocketAddress(host, port), 10000);
        plainSocket.setSoTimeout(0);
        return plainSocket;
    }

    private void performHandshake(URI uri) throws Exception {
        String path = uri.getRawPath();
        if (path == null || path.length() == 0) {
            path = "/";
        }
        if (uri.getRawQuery() != null && uri.getRawQuery().length() > 0) {
            path += "?" + uri.getRawQuery();
        }

        String key = randomKey();
        String host = uri.getHost();
        int port = uri.getPort();
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.US);
        boolean defaultPort = port < 0 || ("ws".equals(scheme) && port == 80) || ("wss".equals(scheme) && port == 443);
        String hostHeader = defaultPort ? host : host + ":" + port;

        String request = "GET " + path + " HTTP/1.1\r\n"
                + "Host: " + hostHeader + "\r\n"
                + "Upgrade: websocket\r\n"
                + "Connection: Upgrade\r\n"
                + "Sec-WebSocket-Key: " + key + "\r\n"
                + "Sec-WebSocket-Version: 13\r\n"
                + "\r\n";
        outputStream.write(request.getBytes("UTF-8"));
        outputStream.flush();

        String response = readHttpHeader(socket.getInputStream());
        if (!response.startsWith("HTTP/1.1 101") && !response.startsWith("HTTP/1.0 101")) {
            throw new IOException("websocket handshake failed: " + firstLine(response));
        }
        String expectedAccept = websocketAccept(key);
        if (!response.toLowerCase(Locale.US).contains(("sec-websocket-accept: " + expectedAccept).toLowerCase(Locale.US))) {
            Log.w(TAG, "websocket accept header missing or unexpected");
        }
    }

    private void sendRoomCreate() throws Exception {
        JSONObject message = new JSONObject();
        message.put("type", "room.create");
        message.put("role", "tv");
        message.put("deviceId", safeDeviceId());
        message.put("appVersion", appVersion);
        message.put("roomCode", roomCode);
        message.put("receiverProfileId", profileId);
        sendText(message.toString());
    }

    private void handleTextFrame(String text) {
        try {
            JSONObject message = new JSONObject(text);
            String type = message.optString("type", "");
            if ("room.created".equals(type)) {
                listener.onRoomCreated(
                        message.optString("roomCode", roomCode),
                        message.optString("pairUrl", ""),
                        message.optString("signalingUrl", signalingUrl),
                        message.optString("expiresAtUtc", ""),
                        message.optString("roomCodeSource", "")
                );
                return;
            }
            if ("peer.hello".equals(type)) {
                listener.onPhoneHello(message.optString("userAgent", "phone"));
                return;
            }
            if ("webrtc.offer".equals(type)) {
                listener.onOffer(message.optString("profileId", ""), message.optString("sdp", ""));
                return;
            }
            if ("webrtc.ice-candidate".equals(type)) {
                listener.onRemoteIceCandidate(
                        message.optString("sdpMid", ""),
                        message.optInt("sdpMLineIndex", 0),
                        message.optString("candidate", "")
                );
                return;
            }
            if ("session.hangup".equals(type)) {
                notifyClosed("session_hangup:" + message.optString("reason", "unknown"));
                return;
            }
            if ("session.error".equals(type)) {
                notifyError(message.optString("code", "session_error"), message.optString("message", ""), message.optBoolean("recoverable", true));
                return;
            }
            notifyState("signaling_message_" + type, message.toString());
        } catch (Throwable error) {
            notifyError("invalid_signaling_message", error.getMessage() == null ? text : error.getMessage(), true);
        }
    }

    private void sendText(String text) throws IOException {
        sendFrame(text.getBytes("UTF-8"), OPCODE_TEXT);
    }

    public void sendAnswer(String sdp, String receiverProfileId) {
        try {
            JSONObject message = new JSONObject();
            message.put("type", "webrtc.answer");
            message.put("role", "tv");
            message.put("sdp", sdp == null ? "" : sdp);
            message.put("receiverProfileId", receiverProfileId == null || receiverProfileId.length() == 0 ? profileId : receiverProfileId);
            sendText(message.toString());
        } catch (Throwable error) {
            notifyError("send_answer_failed", error.getMessage() == null ? "send answer failed" : error.getMessage(), true);
        }
    }

    public void sendIceCandidate(String sdpMid, int sdpMLineIndex, String candidate) {
        try {
            JSONObject message = new JSONObject();
            message.put("type", "webrtc.ice-candidate");
            message.put("role", "tv");
            message.put("sdpMid", sdpMid == null ? "" : sdpMid);
            message.put("sdpMLineIndex", sdpMLineIndex);
            message.put("candidate", candidate == null ? "" : candidate);
            sendText(message.toString());
        } catch (Throwable error) {
            notifyError("send_ice_candidate_failed", error.getMessage() == null ? "send ICE candidate failed" : error.getMessage(), true);
        }
    }

    public void sendStats(String summary) {
        try {
            JSONObject message = new JSONObject();
            message.put("type", "session.stats");
            message.put("role", "tv");
            message.put("profileId", profileId.length() == 0 ? "default_720p_15" : profileId);
            message.put("videoWidth", 0);
            message.put("videoHeight", 0);
            message.put("fps", 0);
            message.put("bitrateKbps", 0);
            message.put("packetsLost", 0);
            message.put("rttMs", 0);
            message.put("summary", summary == null ? "" : summary);
            sendText(message.toString());
        } catch (Throwable error) {
            notifyError("send_stats_failed", error.getMessage() == null ? "send stats failed" : error.getMessage(), true);
        }
    }

    private void sendFrame(byte[] payload, int opcode) throws IOException {
        synchronized (writeLock) {
            if (outputStream == null) {
                throw new EOFException("websocket output is closed");
            }
            ByteArrayOutputStream frame = new ByteArrayOutputStream();
            frame.write(0x80 | opcode);
            int length = payload.length;
            if (length < 126) {
                frame.write(0x80 | length);
            } else if (length <= 0xFFFF) {
                frame.write(0x80 | 126);
                frame.write((length >> 8) & 0xFF);
                frame.write(length & 0xFF);
            } else {
                long longLength = length;
                frame.write(0x80 | 127);
                for (int shift = 56; shift >= 0; shift -= 8) {
                    frame.write((int) ((longLength >> shift) & 0xFF));
                }
            }
            byte[] mask = new byte[4];
            random.nextBytes(mask);
            frame.write(mask);
            for (int index = 0; index < payload.length; index += 1) {
                frame.write(payload[index] ^ mask[index % 4]);
            }
            outputStream.write(frame.toByteArray());
            outputStream.flush();
        }
    }

    private Frame readFrame(InputStream inputStream) throws IOException {
        int first = inputStream.read();
        if (first < 0) {
            return null;
        }
        int second = inputStream.read();
        if (second < 0) {
            return null;
        }
        int opcode = first & 0x0F;
        boolean masked = (second & 0x80) != 0;
        long length = second & 0x7F;
        if (length == 126) {
            length = (readByte(inputStream) << 8) | readByte(inputStream);
        } else if (length == 127) {
            length = 0;
            for (int index = 0; index < 8; index += 1) {
                length = (length << 8) | readByte(inputStream);
            }
        }
        if (length > 1024 * 1024) {
            throw new IOException("websocket frame too large");
        }

        byte[] mask = null;
        if (masked) {
            mask = readFully(inputStream, 4);
        }
        byte[] payload = readFully(inputStream, (int) length);
        if (masked) {
            for (int index = 0; index < payload.length; index += 1) {
                payload[index] = (byte) (payload[index] ^ mask[index % 4]);
            }
        }
        return new Frame(opcode, payload);
    }

    private byte[] readFully(InputStream inputStream, int length) throws IOException {
        byte[] data = new byte[length];
        int offset = 0;
        while (offset < length) {
            int count = inputStream.read(data, offset, length - offset);
            if (count < 0) {
                throw new EOFException("unexpected websocket EOF");
            }
            offset += count;
        }
        return data;
    }

    private int readByte(InputStream inputStream) throws IOException {
        int value = inputStream.read();
        if (value < 0) {
            throw new EOFException("unexpected websocket EOF");
        }
        return value;
    }

    private String readHttpHeader(InputStream inputStream) throws IOException {
        ByteArrayOutputStream header = new ByteArrayOutputStream();
        int state = 0;
        while (header.size() < 8192) {
            int value = inputStream.read();
            if (value < 0) {
                throw new EOFException("unexpected HTTP EOF");
            }
            header.write(value);
            if ((state == 0 || state == 2) && value == '\r') {
                state += 1;
            } else if ((state == 1 || state == 3) && value == '\n') {
                state += 1;
            } else {
                state = 0;
            }
            if (state == 4) {
                return new String(header.toByteArray(), "UTF-8");
            }
        }
        throw new IOException("HTTP header too large");
    }

    private String randomKey() {
        byte[] bytes = new byte[16];
        random.nextBytes(bytes);
        return Base64.encodeToString(bytes, Base64.NO_WRAP);
    }

    private String websocketAccept(String key) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-1");
        byte[] bytes = digest.digest((key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").getBytes("UTF-8"));
        return Base64.encodeToString(bytes, Base64.NO_WRAP);
    }

    private String safeDeviceId() {
        String model = Build.MODEL == null ? "android-tv" : Build.MODEL.trim();
        if (model.length() == 0) {
            model = "android-tv";
        }
        return model.replaceAll("[^A-Za-z0-9_.-]", "_");
    }

    private String firstLine(String value) {
        int index = value.indexOf('\n');
        return index >= 0 ? value.substring(0, index).trim() : value.trim();
    }

    private void notifyState(String state, String detail) {
        if (listener != null) {
            listener.onState(state, detail == null ? "" : detail);
        }
    }

    private void notifyError(String code, String message, boolean recoverable) {
        if (listener != null) {
            listener.onError(code == null ? "unknown" : code, message == null ? "" : message, recoverable);
        }
    }

    private void notifyClosed(String reason) {
        if (listener != null) {
            listener.onClosed(reason == null ? "closed" : reason);
        }
    }

    private void closeSocket() {
        try {
            if (socket != null) {
                socket.close();
            }
        } catch (Throwable ignored) {
        }
    }

    private static final class Frame {
        final int opcode;
        final byte[] payload;

        Frame(int opcode, byte[] payload) {
            this.opcode = opcode;
            this.payload = payload;
        }
    }
}
