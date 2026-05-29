package com.quicktvui.hellotv.tvbox;

import android.app.Activity;
import android.os.Handler;
import android.os.Looper;
import android.widget.FrameLayout;

import org.webrtc.AudioTrack;
import org.webrtc.DataChannel;
import org.webrtc.DefaultVideoDecoderFactory;
import org.webrtc.DefaultVideoEncoderFactory;
import org.webrtc.EglBase;
import org.webrtc.IceCandidate;
import org.webrtc.MediaConstraints;
import org.webrtc.MediaStream;
import org.webrtc.MediaStreamTrack;
import org.webrtc.PeerConnection;
import org.webrtc.PeerConnectionFactory;
import org.webrtc.RTCStatsCollectorCallback;
import org.webrtc.RTCStatsReport;
import org.webrtc.RtpReceiver;
import org.webrtc.RtpTransceiver;
import org.webrtc.SdpObserver;
import org.webrtc.SessionDescription;
import org.webrtc.SurfaceViewRenderer;
import org.webrtc.VideoTrack;

import java.util.ArrayList;
import java.util.List;

public final class PhoneCameraNativeWebRtcEngine implements PhoneCameraMediaEngine {

    private static final long STATS_INTERVAL_MS = 2000L;

    private final Activity activity;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final List<VideoTrack> remoteVideoTracks = new ArrayList<>();

    private Listener listener;
    private FrameLayout videoContainer;
    private EglBase eglBase;
    private SurfaceViewRenderer videoRenderer;
    private PeerConnectionFactory factory;
    private PeerConnection peerConnection;
    private String roomCode = "";
    private String profileId = "";
    private boolean started;
    private boolean stopped = true;
    private int remoteVideoTrackCount;
    private int remoteAudioTrackCount;

    private final Runnable statsRunnable = new Runnable() {
        @Override
        public void run() {
            collectStats();
        }
    };

    public PhoneCameraNativeWebRtcEngine(Activity activity) {
        this.activity = activity;
    }

    @Override
    public void start(String roomCode, String profileId, String signalingUrl, FrameLayout videoContainer, Listener listener) {
        this.roomCode = roomCode == null ? "" : roomCode;
        this.profileId = profileId == null || profileId.length() == 0 ? "default_720p_15" : profileId;
        this.videoContainer = videoContainer;
        this.listener = listener;
        if (started) {
            notifyState("native_webrtc_engine_started", "already started");
            return;
        }
        started = true;
        stopped = false;
        try {
            ensureRenderer();
            ensurePeerConnection();
            notifyState("native_webrtc_engine_ready", "等待手机 offer");
            scheduleStats();
        } catch (Throwable error) {
            notifyError("native_webrtc_start_failed", safeMessage(error), true);
        }
    }

    @Override
    public void handleOffer(final String sdp, final String offerProfileId) {
        if (sdp == null || sdp.trim().length() == 0) {
            notifyError("empty_webrtc_offer", "手机 offer 为空，不能创建 answer。", true);
            return;
        }
        if (peerConnection == null) {
            try {
                ensureRenderer();
                ensurePeerConnection();
            } catch (Throwable error) {
                notifyError("native_webrtc_not_ready", safeMessage(error), true);
                return;
            }
        }
        notifyState("offer_received_setting_remote_description", offerProfileId);
        peerConnection.setRemoteDescription(new SimpleSdpObserver("set_remote_offer") {
            @Override
            public void onSetSuccess() {
                createAnswer(offerProfileId);
            }
        }, new SessionDescription(SessionDescription.Type.OFFER, sdp));
    }

    @Override
    public void handleRemoteIceCandidate(String sdpMid, int sdpMLineIndex, String candidate) {
        if (peerConnection == null || candidate == null || candidate.length() == 0) {
            return;
        }
        try {
            peerConnection.addIceCandidate(new IceCandidate(sdpMid, sdpMLineIndex, candidate));
            notifyState("remote_ice_candidate_added", sdpMid + ":" + sdpMLineIndex);
        } catch (Throwable error) {
            notifyError("remote_ice_candidate_failed", safeMessage(error), true);
        }
    }

    @Override
    public void stop() {
        stopped = true;
        mainHandler.removeCallbacks(statsRunnable);
        for (VideoTrack track : remoteVideoTracks) {
            try {
                if (videoRenderer != null) {
                    track.removeSink(videoRenderer);
                }
            } catch (Throwable ignored) {
            }
        }
        remoteVideoTracks.clear();
        if (peerConnection != null) {
            try {
                peerConnection.close();
                peerConnection.dispose();
            } catch (Throwable ignored) {
            }
            peerConnection = null;
        }
        if (factory != null) {
            try {
                factory.dispose();
            } catch (Throwable ignored) {
            }
            factory = null;
        }
        if (videoRenderer != null) {
            try {
                videoRenderer.release();
            } catch (Throwable ignored) {
            }
            if (videoContainer != null) {
                videoContainer.removeView(videoRenderer);
            }
            videoRenderer = null;
        }
        if (eglBase != null) {
            try {
                eglBase.release();
            } catch (Throwable ignored) {
            }
            eglBase = null;
        }
        notifyState("native_webrtc_engine_stopped", "receiver closed");
    }

    @Override
    public String status() {
        if (!started) {
            return "native_webrtc_engine_not_started";
        }
        return stopped ? "native_webrtc_engine_stopped" : "native_webrtc_engine_ready";
    }

    private void ensureRenderer() {
        if (videoRenderer != null || videoContainer == null) {
            return;
        }
        runOnMainSync(new Runnable() {
            @Override
            public void run() {
                if (eglBase == null) {
                    eglBase = EglBase.create();
                }
                videoRenderer = new SurfaceViewRenderer(activity);
                videoRenderer.init(eglBase.getEglBaseContext(), null);
                videoRenderer.setEnableHardwareScaler(true);
                videoRenderer.setMirror(false);
                videoContainer.addView(videoRenderer, new FrameLayout.LayoutParams(
                        FrameLayout.LayoutParams.MATCH_PARENT,
                        FrameLayout.LayoutParams.MATCH_PARENT
                ));
            }
        });
    }

    private void ensurePeerConnection() {
        if (peerConnection != null) {
            return;
        }
        if (eglBase == null) {
            eglBase = EglBase.create();
        }
        PeerConnectionFactory.initialize(PeerConnectionFactory.InitializationOptions
                .builder(activity.getApplicationContext())
                .setEnableInternalTracer(false)
                .createInitializationOptions());
        DefaultVideoEncoderFactory encoderFactory = new DefaultVideoEncoderFactory(
                eglBase.getEglBaseContext(),
                true,
                true
        );
        DefaultVideoDecoderFactory decoderFactory = new DefaultVideoDecoderFactory(eglBase.getEglBaseContext());
        factory = PeerConnectionFactory.builder()
                .setVideoEncoderFactory(encoderFactory)
                .setVideoDecoderFactory(decoderFactory)
                .createPeerConnectionFactory();

        PeerConnection.RTCConfiguration configuration = new PeerConnection.RTCConfiguration(new ArrayList<PeerConnection.IceServer>());
        configuration.sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN;
        peerConnection = factory.createPeerConnection(configuration, new ReceiverObserver());
        if (peerConnection == null) {
            throw new IllegalStateException("createPeerConnection returned null");
        }
    }

    private void createAnswer(final String offerProfileId) {
        notifyState("creating_webrtc_answer", offerProfileId);
        peerConnection.createAnswer(new SimpleSdpObserver("create_answer") {
            @Override
            public void onCreateSuccess(final SessionDescription answer) {
                peerConnection.setLocalDescription(new SimpleSdpObserver("set_local_answer") {
                    @Override
                    public void onSetSuccess() {
                        String answerProfile = offerProfileId == null || offerProfileId.length() == 0 ? profileId : offerProfileId;
                        if (listener != null) {
                            listener.onAnswer(answer.description, answerProfile);
                        }
                        notifyState("webrtc_answer_ready", answerProfile);
                    }
                }, answer);
            }
        }, new MediaConstraints());
    }

    private void addRemoteTrack(MediaStreamTrack track, String source) {
        if (track instanceof VideoTrack) {
            VideoTrack videoTrack = (VideoTrack) track;
            videoTrack.setEnabled(true);
            if (videoRenderer != null) {
                videoTrack.addSink(videoRenderer);
            }
            if (!remoteVideoTracks.contains(videoTrack)) {
                remoteVideoTracks.add(videoTrack);
            }
            remoteVideoTrackCount += 1;
            if (listener != null) {
                listener.onRemoteVideoTrack(source + " video=" + remoteVideoTrackCount);
            }
            notifyState("remote_video_track_received", source);
            return;
        }
        if (track instanceof AudioTrack) {
            ((AudioTrack) track).setEnabled(true);
            remoteAudioTrackCount += 1;
            if (listener != null) {
                listener.onRemoteAudioTrack(source + " audio=" + remoteAudioTrackCount);
            }
            notifyState("remote_audio_track_received", source);
        }
    }

    private void collectStats() {
        if (stopped || peerConnection == null) {
            return;
        }
        try {
            peerConnection.getStats(new RTCStatsCollectorCallback() {
                @Override
                public void onStatsDelivered(RTCStatsReport report) {
                    if (listener != null) {
                        listener.onStats("stats=" + report.getStatsMap().size()
                                + ", videoTracks=" + remoteVideoTrackCount
                                + ", audioTracks=" + remoteAudioTrackCount);
                    }
                }
            });
        } catch (Throwable error) {
            notifyError("webrtc_stats_failed", safeMessage(error), true);
        } finally {
            scheduleStats();
        }
    }

    private void scheduleStats() {
        if (!stopped) {
            mainHandler.removeCallbacks(statsRunnable);
            mainHandler.postDelayed(statsRunnable, STATS_INTERVAL_MS);
        }
    }

    private void runOnMainSync(Runnable runnable) {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            runnable.run();
            return;
        }
        final Object lock = new Object();
        final boolean[] done = {false};
        mainHandler.post(new Runnable() {
            @Override
            public void run() {
                synchronized (lock) {
                    try {
                        runnable.run();
                    } finally {
                        done[0] = true;
                        lock.notifyAll();
                    }
                }
            }
        });
        synchronized (lock) {
            while (!done[0]) {
                try {
                    lock.wait();
                } catch (InterruptedException ignored) {
                    Thread.currentThread().interrupt();
                    return;
                }
            }
        }
    }

    private void notifyState(String state, String detail) {
        if (listener != null) {
            listener.onEngineState(state, detail == null ? "" : detail);
        }
    }

    private void notifyError(String code, String message, boolean recoverable) {
        if (listener != null) {
            listener.onEngineError(code == null ? "unknown" : code, message == null ? "" : message, recoverable);
        }
    }

    private String safeMessage(Throwable error) {
        return error == null || error.getMessage() == null ? "unknown" : error.getMessage();
    }

    private class ReceiverObserver implements PeerConnection.Observer {
        @Override
        public void onSignalingChange(PeerConnection.SignalingState signalingState) {
            notifyState("webrtc_signaling_" + signalingState, "");
        }

        @Override
        public void onIceConnectionChange(PeerConnection.IceConnectionState iceConnectionState) {
            notifyState("webrtc_ice_connection_" + iceConnectionState, "");
        }

        @Override
        public void onIceConnectionReceivingChange(boolean receiving) {
            notifyState("webrtc_ice_receiving_" + receiving, "");
        }

        @Override
        public void onIceGatheringChange(PeerConnection.IceGatheringState iceGatheringState) {
            notifyState("webrtc_ice_gathering_" + iceGatheringState, "");
        }

        @Override
        public void onIceCandidate(IceCandidate iceCandidate) {
            if (listener != null && iceCandidate != null) {
                listener.onLocalIceCandidate(iceCandidate.sdpMid, iceCandidate.sdpMLineIndex, iceCandidate.sdp);
            }
        }

        @Override
        public void onIceCandidatesRemoved(IceCandidate[] iceCandidates) {
            notifyState("webrtc_ice_candidates_removed", String.valueOf(iceCandidates == null ? 0 : iceCandidates.length));
        }

        @Override
        public void onAddStream(MediaStream mediaStream) {
            if (mediaStream == null) {
                return;
            }
            for (VideoTrack track : mediaStream.videoTracks) {
                addRemoteTrack(track, "stream");
            }
            for (AudioTrack track : mediaStream.audioTracks) {
                addRemoteTrack(track, "stream");
            }
        }

        @Override
        public void onRemoveStream(MediaStream mediaStream) {
            notifyState("webrtc_stream_removed", mediaStream == null ? "" : mediaStream.getId());
        }

        @Override
        public void onDataChannel(DataChannel dataChannel) {
            notifyState("webrtc_data_channel", dataChannel == null ? "" : dataChannel.label());
        }

        @Override
        public void onRenegotiationNeeded() {
            notifyState("webrtc_renegotiation_needed", "");
        }

        @Override
        public void onAddTrack(RtpReceiver receiver, MediaStream[] mediaStreams) {
            if (receiver != null) {
                addRemoteTrack(receiver.track(), "receiver");
            }
        }

        public void onTrack(RtpTransceiver transceiver) {
            if (transceiver != null && transceiver.getReceiver() != null) {
                addRemoteTrack(transceiver.getReceiver().track(), "transceiver");
            }
        }
    }

    private class SimpleSdpObserver implements SdpObserver {
        private final String label;

        SimpleSdpObserver(String label) {
            this.label = label;
        }

        @Override
        public void onCreateSuccess(SessionDescription sessionDescription) {
        }

        @Override
        public void onSetSuccess() {
        }

        @Override
        public void onCreateFailure(String error) {
            notifyError(label + "_create_failed", error, true);
        }

        @Override
        public void onSetFailure(String error) {
            notifyError(label + "_set_failed", error, true);
        }
    }
}
