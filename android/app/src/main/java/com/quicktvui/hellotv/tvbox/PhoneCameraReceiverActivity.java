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
 * This activity deliberately does not claim media success until a WebRTC AAR is
 * bundled and field evidence proves remote first frame, audio, stats and stop.
 */
public class PhoneCameraReceiverActivity extends Activity {

    public static final String EXTRA_ROOM_CODE = "roomCode";
    public static final String EXTRA_SIGNALING_URL = "signalingUrl";
    public static final String EXTRA_PROFILE_ID = "profileId";

    private static final String TAG = "PhoneCameraReceiverActivity";
    private static final String DEFAULT_PROFILE_ID = "default_720p_15";

    private TextView titleText;
    private TextView stateText;
    private TextView evidenceText;
    private String roomCode = "";
    private String signalingUrl = "";
    private String profileId = DEFAULT_PROFILE_ID;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN, WindowManager.LayoutParams.FLAG_FULLSCREEN);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        readIntentExtras();
        buildLayout();
        renderState();
        Log.i(TAG, "receiver_start roomCode=" + roomCode
                + " signalingUrl=" + signalingUrl
                + " profileId=" + profileId
                + " sdkStatus=" + PhoneCameraWebRtcSupport.sdkStatus());
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            finish();
            return true;
        }
        if (keyCode == KeyEvent.KEYCODE_DPAD_CENTER || keyCode == KeyEvent.KEYCODE_ENTER) {
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
        String receiverState;
        if (!validRoom) {
            receiverState = "missing_room_code";
        } else if (!validSignaling) {
            receiverState = "missing_signaling_url";
        } else if (!hasSdk) {
            receiverState = "waiting_for_native_webrtc_sdk";
        } else {
            receiverState = "native_webrtc_sdk_present_needs_media_engine";
        }

        stateText.setText("状态: " + receiverState
                + "\n房间码: " + emptyAsUnknown(roomCode)
                + "\n信令: " + emptyAsUnknown(signalingUrl)
                + "\n媒体档位: " + profileId
                + "\nWebRTC SDK: " + PhoneCameraWebRtcSupport.sdkStatus()
                + "\n\n按 OK 刷新状态，按返回退出。");

        evidenceText.setText("验收边界:\n"
                + "1. 这个 Activity 证明电视端原生接收入口已进入 APK，可被遥控器/ADB 打开。\n"
                + "2. 仍不能证明真实音视频通过；必须接入 org.webrtc PeerConnectionFactory 后，看到电视首帧、音频、stats 和停止按钮证据。\n"
                + "3. 手机摄像头不是 Android Camera2 设备；失败时按手机权限、信令、WebRTC、盒子解码和网络分层排查。");

        Log.i(TAG, "receiver_state state=" + receiverState
                + " roomValid=" + validRoom
                + " signalingValid=" + validSignaling
                + " sdkStatus=" + PhoneCameraWebRtcSupport.sdkStatus());
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
}
