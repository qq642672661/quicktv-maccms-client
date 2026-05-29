package com.quicktvui.hellotv.tvbox;

/**
 * Keeps WebRTC SDK detection isolated so the TV package can ship a receiver shell
 * before the native AAR choice is locked. Real first-frame acceptance still needs
 * an org.webrtc-backed implementation and field evidence.
 */
public final class PhoneCameraWebRtcSupport {

    private static final String WEBRTC_FACTORY_CLASS = "org.webrtc.PeerConnectionFactory";
    private static final String WEBRTC_ENGINE_CLASS = "com.quicktvui.hellotv.tvbox.PhoneCameraNativeWebRtcEngine";

    private PhoneCameraWebRtcSupport() {
    }

    public static boolean hasNativeWebRtcSdk() {
        try {
            Class.forName(WEBRTC_FACTORY_CLASS);
            return true;
        } catch (Throwable ignored) {
            return false;
        }
    }

    public static boolean hasNativeMediaEngine() {
        try {
            Class.forName(WEBRTC_ENGINE_CLASS);
            return true;
        } catch (Throwable ignored) {
            return false;
        }
    }

    public static String sdkStatus() {
        if (!hasNativeWebRtcSdk()) {
            return "native_webrtc_sdk_missing";
        }
        return hasNativeMediaEngine()
                ? "native_webrtc_sdk_present_engine_present"
                : "native_webrtc_sdk_present_engine_missing";
    }
}
