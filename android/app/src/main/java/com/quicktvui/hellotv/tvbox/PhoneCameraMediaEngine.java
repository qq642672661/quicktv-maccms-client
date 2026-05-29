package com.quicktvui.hellotv.tvbox;

import android.widget.FrameLayout;

public interface PhoneCameraMediaEngine {

    interface Listener {
        void onEngineState(String state, String detail);

        void onAnswer(String sdp, String profileId);

        void onLocalIceCandidate(String sdpMid, int sdpMLineIndex, String candidate);

        void onRemoteVideoTrack(String detail);

        void onRemoteAudioTrack(String detail);

        void onStats(String summary);

        void onEngineError(String code, String message, boolean recoverable);
    }

    void start(String roomCode, String profileId, String signalingUrl, FrameLayout videoContainer, Listener listener);

    void handleOffer(String sdp, String offerProfileId);

    void handleRemoteIceCandidate(String sdpMid, int sdpMLineIndex, String candidate);

    void stop();

    String status();
}
