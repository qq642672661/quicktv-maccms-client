package com.quicktvui.hellotv.tvbox;

import android.app.Activity;

import java.lang.reflect.Constructor;

public final class PhoneCameraMediaEngineFactory {

    private static final String NATIVE_ENGINE_CLASS = "com.quicktvui.hellotv.tvbox.PhoneCameraNativeWebRtcEngine";

    private PhoneCameraMediaEngineFactory() {
    }

    public static PhoneCameraMediaEngine create(Activity activity) {
        if (!PhoneCameraWebRtcSupport.hasNativeWebRtcSdk()) {
            return new PhoneCameraNoopMediaEngine(
                    "native_webrtc_sdk_missing",
                    "默认 APK 未启用 WebRTC AAR；需要 ENABLE_PHONE_CAMERA_WEBRTC=true 的实验包。"
            );
        }
        try {
            Class<?> engineClass = Class.forName(NATIVE_ENGINE_CLASS);
            Constructor<?> constructor = engineClass.getConstructor(Activity.class);
            Object engine = constructor.newInstance(activity);
            if (engine instanceof PhoneCameraMediaEngine) {
                return (PhoneCameraMediaEngine) engine;
            }
            return new PhoneCameraNoopMediaEngine(
                    "native_webrtc_engine_type_invalid",
                    "WebRTC 引擎类未实现 PhoneCameraMediaEngine。"
            );
        } catch (Throwable error) {
            return new PhoneCameraNoopMediaEngine(
                    "native_webrtc_engine_missing",
                    error.getMessage() == null ? "WebRTC SDK 已存在，但可选媒体引擎未编译进 APK。" : error.getMessage()
            );
        }
    }
}
