package com.quicktvui.hellotv.tvbox;

import android.app.Activity;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.TextView;

/**
 * Native TV-side entry for the phone-as-camera route.
 *
 * This activity can host an optional org.webrtc media engine in experiment
 * builds. It still does not claim field success until TV first frame, audio,
 * stats, reconnect and privacy-stop evidence are captured.
 */
public class PhoneCameraReceiverActivity extends Activity {

    public static final String EXTRA_ROOM_CODE = "roomCode";
    public static final String EXTRA_SIGNALING_URL = "signalingUrl";
    public static final String EXTRA_PAIR_URL = "pairUrl";
    public static final String EXTRA_PROFILE_ID = "profileId";

    private static final String TAG = "PhoneCameraReceiverActivity";
    private static final String DEFAULT_PROFILE_ID = "default_720p_15";

    private FrameLayout videoContainer;
    private TextView titleText;
    private TextView stateText;
    private TextView evidenceText;
    private String roomCode = "";
    private String signalingUrl = "";
    private String pairUrl = "";
    private String profileId = DEFAULT_PROFILE_ID;
    private String appVersion = "unknown";
    private String receiverState = "initializing";
    private String signalingDetail = "";
    private String roomExpiresAt = "";
    private String roomCodeSource = "";
    private boolean signalingStarted = false;
    private boolean remoteVideoSeen = false;
    private boolean remoteAudioSeen = false;
    private String mediaDetail = "";
    private String statsDetail = "";
    private PhoneCameraSignalingClient signalingClient;
    private PhoneCameraMediaEngine mediaEngine;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN, WindowManager.LayoutParams.FLAG_FULLSCREEN);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        readIntentExtras();
        appVersion = resolveAppVersion();
        buildLayout();
        renderState();
        startSignalingIfReady();
        Log.i(TAG, "receiver_start roomCode=" + roomCode
                + " signalingUrl=" + signalingUrl
                + " pairUrl=" + pairUrl
                + " profileId=" + profileId
                + " sdkStatus=" + PhoneCameraWebRtcSupport.sdkStatus());
    }

    @Override
    protected void onDestroy() {
        if (signalingClient != null) {
            signalingClient.stop();
            signalingClient = null;
        }
        if (mediaEngine != null) {
            mediaEngine.stop();
            mediaEngine = null;
        }
        super.onDestroy();
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            finish();
            return true;
        }
        if (keyCode == KeyEvent.KEYCODE_DPAD_CENTER || keyCode == KeyEvent.KEYCODE_ENTER) {
            startSignalingIfReady();
            renderState();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    private void readIntentExtras() {
        if (getIntent() == null) {
            return;
        }
        roomCode = safeExtra(EXTRA_ROOM_CODE);
        signalingUrl = safeExtra(EXTRA_SIGNALING_URL);
        pairUrl = safeExtra(EXTRA_PAIR_URL);
        profileId = safeExtra(EXTRA_PROFILE_ID);
        if (profileId.length() == 0) {
            profileId = DEFAULT_PROFILE_ID;
        }
    }

    private String safeExtra(String name) {
        try {
            String value = getIntent().getStringExtra(name);
            return value == null ? "" : value.trim();
        } catch (Throwable ignored) {
            return "";
        }
    }

    private void buildLayout() {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(12, 18, 28));

        videoContainer = new FrameLayout(this);
        videoContainer.setBackgroundColor(Color.rgb(2, 6, 12));
        root.addView(videoContainer, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));

        titleText = new TextView(this);
        titleText.setTextColor(Color.WHITE);
        titleText.setTextSize(40);
        titleText.setGravity(Gravity.LEFT);
        titleText.setText("手机摄像头电视接收端");
        titleText.setPadding(64, 54, 64, 0);
        root.addView(titleText, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                160
        ));

        stateText = new TextView(this);
        stateText.setTextColor(Color.WHITE);
        stateText.setTextSize(30);
        stateText.setGravity(Gravity.LEFT);
        stateText.setPadding(64, 36, 64, 36);
        stateText.setBackgroundColor(Color.rgb(24, 34, 50));
        FrameLayout.LayoutParams stateParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                420
        );
        stateParams.leftMargin = 64;
        stateParams.rightMargin = 64;
        stateParams.topMargin = 180;
        root.addView(stateText, stateParams);

        evidenceText = new TextView(this);
        evidenceText.setTextColor(Color.rgb(220, 230, 242));
        evidenceText.setTextSize(25);
        evidenceText.setGravity(Gravity.LEFT);
        evidenceText.setPadding(64, 30, 64, 30);
        evidenceText.setBackgroundColor(Color.rgb(16, 24, 36));
        FrameLayout.LayoutParams evidenceParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                350
        );
        evidenceParams.leftMargin = 64;
        evidenceParams.rightMargin = 64;
        evidenceParams.topMargin = 630;
        root.addView(evidenceText, evidenceParams);

        setContentView(root);
    }

    private void renderState() {
        boolean validRoom = roomCode.matches("^[0-9]{6}$");
        boolean validSignaling = isWebSocketUrl(signalingUrl);
        boolean hasSdk = PhoneCameraWebRtcSupport.hasNativeWebRtcSdk();
        if (!validRoom) {
            receiverState = "missing_room_code";
        } else if (!validSignaling) {
            receiverState = "missing_signaling_url";
        } else if ("initializing".equals(receiverState)) {
            receiverState = hasSdk
                    ? "native_webrtc_sdk_present_ready_for_signaling"
                    : "creating_signaling_room_without_media_engine";
        }

        stateText.setText("状态: " + receiverState
                + "\n房间码: " + emptyAsUnknown(roomCode)
                + "\n信令: " + emptyAsUnknown(signalingUrl)
                + "\n手机入口: " + emptyAsUnknown(pairUrl)
                + "\n媒体档位: " + profileId
                + "\n房间来源: " + emptyAsUnknown(roomCodeSource)
                + "\n房间过期: " + emptyAsUnknown(roomExpiresAt)
                + "\nWebRTC SDK: " + PhoneCameraWebRtcSupport.sdkStatus()
                + "\n媒体引擎: " + mediaEngineStatus()
                + "\n远端视频/音频: " + (remoteVideoSeen ? "video_seen" : "video_waiting") + " / " + (remoteAudioSeen ? "audio_seen" : "audio_waiting")
                + "\n信令事件: " + emptyAsUnknown(signalingDetail)
                + "\n媒体事件: " + emptyAsUnknown(mediaDetail)
                + "\nstats: " + emptyAsUnknown(statsDetail)
                + "\n\n按 OK 刷新状态，按返回退出。");

        evidenceText.setText("验收边界:\n"
                + "1. 这个 Activity 会用同一个房间码向局域网信令服务创建 TV 房间，并接收手机 hello/offer/ICE 事件。\n"
                + "2. 实验包会用 org.webrtc 创建 answer、渲染远端视频、接收音频并上报 stats；现场仍必须拍到电视首帧、音频和停止证据，否则仍不能证明真实音视频通过。\n"
                + "3. 手机摄像头不是 Android Camera2 设备；失败时按手机权限、信令、WebRTC、盒子解码和网络分层排查。");

        Log.i(TAG, "receiver_state state=" + receiverState
                + " roomValid=" + validRoom
                + " signalingValid=" + validSignaling
                + " pairUrlPresent=" + (pairUrl.length() > 0)
                + " signalingDetail=" + signalingDetail
                + " mediaDetail=" + mediaDetail
                + " sdkStatus=" + PhoneCameraWebRtcSupport.sdkStatus());
    }

    private void startSignalingIfReady() {
        if (signalingStarted || !roomCode.matches("^[0-9]{6}$") || !isWebSocketUrl(signalingUrl)) {
            return;
        }
        signalingStarted = true;
        receiverState = PhoneCameraWebRtcSupport.hasNativeWebRtcSdk()
                ? "creating_signaling_room_sdk_present"
                : "creating_signaling_room_without_media_engine";
        signalingDetail = "正在创建 TV 房间";
        renderState();
        signalingClient = new PhoneCameraSignalingClient(signalingUrl, roomCode, profileId, appVersion, new PhoneCameraSignalingClient.Listener() {
            @Override
            public void onState(String state, String detail) {
                updateSignalingState(state, detail);
            }

            @Override
            public void onRoomCreated(String createdRoomCode, String createdPairUrl, String createdSignalingUrl, String expiresAtUtc, String source) {
                roomCode = createdRoomCode.length() == 0 ? roomCode : createdRoomCode;
                if (createdPairUrl.length() > 0) {
                    pairUrl = createdPairUrl;
                }
                if (createdSignalingUrl.length() > 0) {
                    signalingUrl = createdSignalingUrl;
                }
                roomExpiresAt = expiresAtUtc;
                roomCodeSource = source;
                updateSignalingState("waiting_for_phone", "房间已创建，等待手机扫码");
            }

            @Override
            public void onPhoneHello(String detail) {
                updateSignalingState("phone_connected_waiting_for_offer", detail);
            }

            @Override
            public void onOffer(String offerProfileId, String detail) {
                handlePhoneOffer(offerProfileId, detail);
            }

            @Override
            public void onRemoteIceCandidate(String sdpMid, int sdpMLineIndex, String candidate) {
                handleRemoteIceCandidate(sdpMid, sdpMLineIndex, candidate);
            }

            @Override
            public void onError(String code, String message, boolean recoverable) {
                updateSignalingState("signaling_error_" + code, message + (recoverable ? " / 可重试" : " / 不可重试"));
            }

            @Override
            public void onClosed(String reason) {
                updateSignalingState("signaling_closed", reason);
            }
        });
        signalingClient.start();
    }

    private void handlePhoneOffer(final String offerProfileId, final String sdp) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                String state = PhoneCameraWebRtcSupport.hasNativeWebRtcSdk()
                        ? "offer_received_creating_native_answer"
                        : "offer_received_waiting_for_native_webrtc_engine";
                updateSignalingState(state, offerProfileId.length() == 0 ? "offer received" : offerProfileId);
                ensureMediaEngineStarted();
                if (mediaEngine != null) {
                    mediaEngine.handleOffer(sdp, offerProfileId);
                }
            }
        });
    }

    private void handleRemoteIceCandidate(final String sdpMid, final int sdpMLineIndex, final String candidate) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                ensureMediaEngineStarted();
                if (mediaEngine != null) {
                    mediaEngine.handleRemoteIceCandidate(sdpMid, sdpMLineIndex, candidate);
                }
                updateSignalingState("remote_ice_candidate_received", sdpMid + ":" + sdpMLineIndex);
            }
        });
    }

    private void ensureMediaEngineStarted() {
        if (mediaEngine == null) {
            mediaEngine = PhoneCameraMediaEngineFactory.create(this);
            mediaEngine.start(roomCode, profileId, signalingUrl, videoContainer, new PhoneCameraMediaEngine.Listener() {
                @Override
                public void onEngineState(String state, String detail) {
                    updateMediaState(state, detail);
                }

                @Override
                public void onAnswer(String sdp, String answerProfileId) {
                    if (signalingClient != null) {
                        signalingClient.sendAnswer(sdp, answerProfileId);
                    }
                    updateMediaState("webrtc_answer_sent", answerProfileId);
                }

                @Override
                public void onLocalIceCandidate(String sdpMid, int sdpMLineIndex, String candidate) {
                    if (signalingClient != null) {
                        signalingClient.sendIceCandidate(sdpMid, sdpMLineIndex, candidate);
                    }
                    updateMediaState("local_ice_candidate_sent", sdpMid + ":" + sdpMLineIndex);
                }

                @Override
                public void onRemoteVideoTrack(String detail) {
                    remoteVideoSeen = true;
                    updateMediaState("remote_video_track_received", detail);
                }

                @Override
                public void onRemoteAudioTrack(String detail) {
                    remoteAudioSeen = true;
                    updateMediaState("remote_audio_track_received", detail);
                }

                @Override
                public void onStats(String summary) {
                    statsDetail = summary;
                    if (signalingClient != null) {
                        signalingClient.sendStats(summary);
                    }
                    updateMediaState("webrtc_stats_reported", summary);
                }

                @Override
                public void onEngineError(String code, String message, boolean recoverable) {
                    updateMediaState("media_engine_error_" + code, message + (recoverable ? " / 可重试" : " / 不可重试"));
                }
            });
        }
    }

    private void updateMediaState(final String state, final String detail) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                mediaDetail = (state == null || state.length() == 0 ? "media_state_unknown" : state)
                        + (detail == null || detail.length() == 0 ? "" : " / " + detail);
                renderState();
            }
        });
    }

    private void updateSignalingState(final String state, final String detail) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                receiverState = state == null || state.length() == 0 ? "signaling_state_unknown" : state;
                signalingDetail = detail == null ? "" : detail;
                renderState();
            }
        });
    }

    private boolean isWebSocketUrl(String value) {
        try {
            Uri uri = Uri.parse(value);
            String scheme = uri.getScheme();
            return ("ws".equalsIgnoreCase(scheme) || "wss".equalsIgnoreCase(scheme))
                    && uri.getHost() != null
                    && uri.getHost().length() > 0;
        } catch (Throwable ignored) {
            return false;
        }
    }

    private String emptyAsUnknown(String value) {
        return value == null || value.length() == 0 ? "未填写" : value;
    }

    private String mediaEngineStatus() {
        return mediaEngine == null ? "not_started" : mediaEngine.status();
    }

    private String resolveAppVersion() {
        try {
            String value = getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            return value == null || value.length() == 0 ? "unknown" : value;
        } catch (Throwable ignored) {
            return "unknown";
        }
    }
}
