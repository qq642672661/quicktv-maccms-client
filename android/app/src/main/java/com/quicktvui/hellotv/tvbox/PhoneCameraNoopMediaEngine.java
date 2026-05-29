package com.quicktvui.hellotv.tvbox;

import android.widget.FrameLayout;

public final class PhoneCameraNoopMediaEngine implements PhoneCameraMediaEngine {

    private final String status;
    private final String reason;
    private Listener listener;

    public PhoneCameraNoopMediaEngine(String status, String reason) {
        this.status = status == null || status.length() == 0 ? "native_webrtc_unavailable" : status;
        this.reason = reason == null ? "" : reason;
    }

    @Override
    public void start(String roomCode, String profileId, String signalingUrl, FrameLayout videoContainer, Listener listener) {
        this.listener = listener;
        notifyState(status, reason);
    }

    @Override
    public void handleOffer(String sdp, String offerProfileId) {
        if (listener != null) {
            listener.onEngineError(
                    "native_webrtc_unavailable",
                    reason.length() == 0 ? "WebRTC SDK 或媒体引擎未启用，不能创建 answer。" : reason,
                    true
            );
        }
    }

    @Override
    public void handleRemoteIceCandidate(String sdpMid, int sdpMLineIndex, String candidate) {
        notifyState(status, "收到远端 ICE，但当前媒体引擎不可用");
    }

    @Override
    public void stop() {
        notifyState("media_engine_stopped", reason);
    }

    @Override
    public String status() {
        return status;
    }

    private void notifyState(String state, String detail) {
        if (listener != null) {
            listener.onEngineState(state, detail == null ? "" : detail);
        }
    }
}
