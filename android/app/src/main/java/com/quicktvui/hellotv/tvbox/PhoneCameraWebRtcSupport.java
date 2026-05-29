package com.quicktvui.hellotv.tvbox;

/**
 * Keeps WebRTC SDK detection isolated so the TV package can ship a receiver shell
 * before the native AAR choice is locked. Real first-frame acceptance still needs
 * an org.webrtc-backed implementation and field evidence.
 */
public final class PhoneCameraWebRtcSupport {

    private static final String WEBRTC_FACTORY_CLASS = "org.webrtc.PeerConnectionFactory";

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

    public static String sdkStatus() {
        return hasNativeWebRtcSdk() ? "native_webrtc_sdk_present" : "native_webrtc_sdk_missing";
    }
}
