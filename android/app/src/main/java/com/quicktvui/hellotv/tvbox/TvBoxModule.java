package com.quicktvui.hellotv.tvbox;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.hardware.usb.UsbConstants;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbInterface;
import android.hardware.usb.UsbManager;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.provider.Settings;
import android.util.Log;

import com.quicktvui.hellotv.MainActivity;

import eskit.sdk.support.EsPromise;
import eskit.sdk.support.PromiseHolder;
import eskit.sdk.support.module.IEsModule;

import java.util.HashMap;

/**
 * Native bridge for TV-box capability checks used by the simplified remote-first UI.
 */
public class TvBoxModule implements IEsModule {

    private static final String TAG = "TvBoxModule";

    private static MainActivity currentActivity;
    private static PromiseHolder pendingMediaPermissionCallback;

    private Context context;

    public static void setCurrentActivity(MainActivity activity) {
        currentActivity = activity;
    }

    public static void clearCurrentActivity(MainActivity activity) {
        if (currentActivity == activity) {
            currentActivity = null;
        }
    }

    public static void notifyMediaPermissionResult(boolean cameraGranted, boolean recordAudioGranted) {
        if (pendingMediaPermissionCallback != null) {
            pendingMediaPermissionCallback.put("success", true);
            pendingMediaPermissionCallback.put("message", cameraGranted && recordAudioGranted ? "媒体权限已允许" : "媒体权限未全部允许");
            pendingMediaPermissionCallback.put("hasCameraPermission", cameraGranted);
            pendingMediaPermissionCallback.put("hasRecordAudioPermission", recordAudioGranted);
            pendingMediaPermissionCallback.sendSuccess();
            pendingMediaPermissionCallback = null;
        }
    }

    @Override
    public void init(Context context) {
        this.context = context.getApplicationContext();
    }

    public void getCapabilities(EsPromise promise) {
        PromiseHolder callback = PromiseHolder.create(promise);
        try {
            fillCapabilities(callback);
        } catch (Throwable error) {
            callback.put("success", false);
            callback.put("message", error.getMessage() == null ? "能力检测失败" : error.getMessage());
        }
        callback.sendSuccess();
    }

    private void fillCapabilities(PromiseHolder callback) {
        try {
            PackageManager packageManager = context.getPackageManager();
            PackageInfo packageInfo = getOwnPackageInfo(packageManager);
            CameraInventory cameraInventory = inspectCameras();
            UsbInventory usbInventory = inspectUsbDevices();
            AudioInventory audioInventory = inspectAudioInputDevices();
            boolean hasAnyCameraFeature = hasFeature(packageManager, PackageManager.FEATURE_CAMERA_ANY);
            boolean hasExternalCameraFeature = hasFeature(packageManager, PackageManager.FEATURE_CAMERA_EXTERNAL);
            boolean hasMicrophoneFeature = hasFeature(packageManager, PackageManager.FEATURE_MICROPHONE);
            boolean hasUsbHost = hasFeature(packageManager, PackageManager.FEATURE_USB_HOST);
            boolean isLeanbackDevice = hasFeature(packageManager, PackageManager.FEATURE_LEANBACK);
            boolean hasCameraPermission = hasCameraPermission();
            boolean hasRecordAudioPermission = hasRecordAudioPermission();
            boolean hasPhoneCameraReceiver = hasPhoneCameraReceiverActivity();
            boolean hasNativeWebRtcSdk = PhoneCameraWebRtcSupport.hasNativeWebRtcSdk();
            callback.put("success", true);
            callback.put("message", "");
            callback.put("hasAnyCamera", hasAnyCameraFeature || cameraInventory.cameraCount > 0);
            callback.put("hasExternalCamera", hasExternalCameraFeature || cameraInventory.externalCameraCount > 0);
            callback.put("hasMicrophone", hasMicrophoneFeature || audioInventory.audioInputDeviceCount > 0);
            callback.put("hasAudioInput", audioInventory.audioInputDeviceCount > 0);
            callback.put("hasUsbHost", hasUsbHost);
            callback.put("cameraCount", cameraInventory.cameraCount);
            callback.put("externalCameraCount", cameraInventory.externalCameraCount);
            callback.put("usbDeviceCount", usbInventory.usbDeviceCount);
            callback.put("usbVideoDeviceCount", usbInventory.usbVideoDeviceCount);
            callback.put("audioInputDeviceCount", audioInventory.audioInputDeviceCount);
            callback.put("usbAudioInputDeviceCount", audioInventory.usbAudioInputDeviceCount);
            callback.put("hasCameraPermission", hasCameraPermission);
            callback.put("hasRecordAudioPermission", hasRecordAudioPermission);
            callback.put("hasPhoneCameraReceiver", hasPhoneCameraReceiver);
            callback.put("hasNativeWebRtcSdk", hasNativeWebRtcSdk);
            callback.put("phoneCameraReceiverReady", hasPhoneCameraReceiver && hasNativeWebRtcSdk);
            callback.put("isTvDevice", isLeanbackDevice);
            callback.put("isLeanbackLauncher", isLeanbackDevice);
            callback.put("androidSdk", Build.VERSION.SDK_INT);
            callback.put("buildModel", Build.MODEL == null ? "" : Build.MODEL);
            callback.put("appVersionName", packageInfo == null || packageInfo.versionName == null ? "" : packageInfo.versionName);
            if (packageInfo != null) {
                callback.put("appVersionCode", packageInfo.versionCode);
            }
            Log.i(TAG, "capabilities cameraCount=" + cameraInventory.cameraCount
                    + " externalCameraCount=" + cameraInventory.externalCameraCount
                    + " usbDeviceCount=" + usbInventory.usbDeviceCount
                    + " usbVideoDeviceCount=" + usbInventory.usbVideoDeviceCount
                    + " audioInputDeviceCount=" + audioInventory.audioInputDeviceCount
                    + " usbAudioInputDeviceCount=" + audioInventory.usbAudioInputDeviceCount
                    + " hasUsbHost=" + hasUsbHost
                    + " hasCameraPermission=" + hasCameraPermission
                    + " hasRecordAudioPermission=" + hasRecordAudioPermission
                    + " hasPhoneCameraReceiver=" + hasPhoneCameraReceiver
                    + " hasNativeWebRtcSdk=" + hasNativeWebRtcSdk
                    + " isLeanbackDevice=" + isLeanbackDevice
                    + " appVersion=" + (packageInfo == null ? "" : packageInfo.versionName));
        } catch (Throwable error) {
            callback.put("success", false);
            callback.put("message", error.getMessage() == null ? "能力检测失败" : error.getMessage());
        }
    }

    public void requestCameraPermission(EsPromise promise) {
        requestMediaPermissions(promise);
    }

    public void requestMediaPermissions(EsPromise promise) {
        PromiseHolder callback = PromiseHolder.create(promise);
        try {
            if (hasCameraPermission() && hasRecordAudioPermission()) {
                callback.put("success", true);
                callback.put("hasCameraPermission", true);
                callback.put("hasRecordAudioPermission", true);
                fillCapabilities(callback);
                callback.sendSuccess();
                return;
            }

            if (currentActivity == null) {
                callback.put("success", false);
                callback.put("message", "当前没有可请求权限的 Activity");
                callback.put("hasCameraPermission", hasCameraPermission());
                callback.put("hasRecordAudioPermission", hasRecordAudioPermission());
                callback.sendSuccess();
                return;
            }

            if (pendingMediaPermissionCallback != null) {
                callback.put("success", false);
                callback.put("message", "已有媒体权限请求处理中");
                callback.put("hasCameraPermission", hasCameraPermission());
                callback.put("hasRecordAudioPermission", hasRecordAudioPermission());
                callback.sendSuccess();
                return;
            }

            pendingMediaPermissionCallback = callback;
            currentActivity.requestMediaPermissions();
        } catch (Throwable error) {
            pendingMediaPermissionCallback = null;
            callback.put("success", false);
            callback.put("message", error.getMessage() == null ? "请求媒体权限失败" : error.getMessage());
            callback.put("hasCameraPermission", hasCameraPermission());
            callback.put("hasRecordAudioPermission", hasRecordAudioPermission());
            callback.sendSuccess();
        }
    }

    public void openAppSettings(EsPromise promise) {
        PromiseHolder callback = PromiseHolder.create(promise);
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(Uri.parse("package:" + context.getPackageName()));
            startActivity(intent);
            callback.put("success", true);
        } catch (Throwable error) {
            callback.put("success", false);
            callback.put("message", error.getMessage() == null ? "无法打开设置" : error.getMessage());
        }
        callback.sendSuccess();
    }

    public void openSystemCamera(EsPromise promise) {
        PromiseHolder callback = PromiseHolder.create(promise);
        try {
            Intent intent;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                intent = new Intent(context, CameraPreviewActivity.class);
            } else {
                intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            }
            startActivity(intent);
            callback.put("success", true);
            callback.put("message", Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP
                    ? "已打开内置摄像头预览"
                    : "已打开系统摄像头测试");
        } catch (Throwable error) {
            callback.put("success", false);
            callback.put("message", error.getMessage() == null ? "无法打开摄像头预览" : error.getMessage());
        }
        callback.sendSuccess();
    }

    public void openPhoneCameraReceiver(EsPromise promise) {
        PromiseHolder callback = PromiseHolder.create(promise);
        try {
            Intent intent = new Intent(context, PhoneCameraReceiverActivity.class);
            intent.putExtra(PhoneCameraReceiverActivity.EXTRA_PROFILE_ID, "default_720p_15");
            startActivity(intent);
            callback.put("success", true);
            callback.put("message", PhoneCameraWebRtcSupport.hasNativeWebRtcSdk()
                    ? "已打开手机摄像头电视接收端"
                    : "已打开手机摄像头电视接收端骨架；WebRTC SDK 和首帧验收仍未闭环");
            callback.put("hasNativeWebRtcSdk", PhoneCameraWebRtcSupport.hasNativeWebRtcSdk());
            callback.put("phoneCameraReceiverReady", hasPhoneCameraReceiverActivity() && PhoneCameraWebRtcSupport.hasNativeWebRtcSdk());
        } catch (Throwable error) {
            callback.put("success", false);
            callback.put("message", error.getMessage() == null ? "无法打开手机摄像头电视接收端" : error.getMessage());
            callback.put("hasNativeWebRtcSdk", PhoneCameraWebRtcSupport.hasNativeWebRtcSdk());
            callback.put("phoneCameraReceiverReady", false);
        }
        callback.sendSuccess();
    }

    public void getPhoneCameraReceiverStatus(EsPromise promise) {
        PromiseHolder callback = PromiseHolder.create(promise);
        try {
            boolean hasReceiver = hasPhoneCameraReceiverActivity();
            boolean hasSdk = PhoneCameraWebRtcSupport.hasNativeWebRtcSdk();
            callback.put("success", true);
            callback.put("message", hasReceiver && hasSdk
                    ? "手机摄像头接收端具备 SDK，仍需实机首帧验收"
                    : "手机摄像头接收端骨架已存在，WebRTC SDK/首帧未闭环");
            callback.put("hasPhoneCameraReceiver", hasReceiver);
            callback.put("hasNativeWebRtcSdk", hasSdk);
            callback.put("phoneCameraReceiverReady", hasReceiver && hasSdk);
        } catch (Throwable error) {
            callback.put("success", false);
            callback.put("message", error.getMessage() == null ? "手机摄像头接收端状态检测失败" : error.getMessage());
        }
        callback.sendSuccess();
    }

    private boolean hasFeature(PackageManager packageManager, String featureName) {
        return packageManager != null && packageManager.hasSystemFeature(featureName);
    }

    private PackageInfo getOwnPackageInfo(PackageManager packageManager) {
        if (packageManager == null) {
            return null;
        }

        try {
            return packageManager.getPackageInfo(context.getPackageName(), 0);
        } catch (Throwable ignored) {
            return null;
        }
    }

    private boolean hasPhoneCameraReceiverActivity() {
        try {
            Intent intent = new Intent(context, PhoneCameraReceiverActivity.class);
            return intent.resolveActivity(context.getPackageManager()) != null;
        } catch (Throwable ignored) {
            return false;
        }
    }

    private void startActivity(Intent intent) {
        if (currentActivity != null) {
            currentActivity.startExternalActivity(intent);
        } else {
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
        }
    }

    private boolean hasCameraPermission() {
        return context.getPackageManager().checkPermission(
                Manifest.permission.CAMERA,
                context.getPackageName()
        ) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean hasRecordAudioPermission() {
        return context.getPackageManager().checkPermission(
                Manifest.permission.RECORD_AUDIO,
                context.getPackageName()
        ) == PackageManager.PERMISSION_GRANTED;
    }

    private CameraInventory inspectCameras() {
        CameraInventory inventory = new CameraInventory();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) {
            return inventory;
        }

        try {
            CameraManager cameraManager = (CameraManager) context.getSystemService(Context.CAMERA_SERVICE);
            if (cameraManager == null) {
                return inventory;
            }

            String[] cameraIds = cameraManager.getCameraIdList();
            inventory.cameraCount = cameraIds == null ? 0 : cameraIds.length;
            if (cameraIds == null) {
                return inventory;
            }

            for (String cameraId : cameraIds) {
                CameraCharacteristics characteristics = cameraManager.getCameraCharacteristics(cameraId);
                Integer lensFacing = characteristics.get(CameraCharacteristics.LENS_FACING);
                if (lensFacing != null && lensFacing == CameraCharacteristics.LENS_FACING_EXTERNAL) {
                    inventory.externalCameraCount++;
                }
            }
        } catch (Throwable ignored) {
            inventory.cameraCount = 0;
            inventory.externalCameraCount = 0;
        }
        return inventory;
    }

    private UsbInventory inspectUsbDevices() {
        UsbInventory inventory = new UsbInventory();
        try {
            UsbManager usbManager = (UsbManager) context.getSystemService(Context.USB_SERVICE);
            if (usbManager == null) {
                return inventory;
            }

            HashMap<String, UsbDevice> deviceList = usbManager.getDeviceList();
            if (deviceList == null || deviceList.isEmpty()) {
                return inventory;
            }

            inventory.usbDeviceCount = deviceList.size();
            for (UsbDevice device : deviceList.values()) {
                if (isUsbVideoDevice(device)) {
                    inventory.usbVideoDeviceCount++;
                }
            }
        } catch (Throwable ignored) {
            inventory.usbDeviceCount = 0;
            inventory.usbVideoDeviceCount = 0;
        }
        return inventory;
    }

    private boolean isUsbVideoDevice(UsbDevice device) {
        if (device == null) {
            return false;
        }

        if (device.getDeviceClass() == UsbConstants.USB_CLASS_VIDEO) {
            return true;
        }

        for (int index = 0; index < device.getInterfaceCount(); index++) {
            UsbInterface usbInterface = device.getInterface(index);
            if (usbInterface != null && usbInterface.getInterfaceClass() == UsbConstants.USB_CLASS_VIDEO) {
                return true;
            }
        }

        return false;
    }

    private AudioInventory inspectAudioInputDevices() {
        AudioInventory inventory = new AudioInventory();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            return inventory;
        }

        try {
            AudioManager audioManager = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
            if (audioManager == null) {
                return inventory;
            }

            AudioDeviceInfo[] devices = audioManager.getDevices(AudioManager.GET_DEVICES_INPUTS);
            if (devices == null) {
                return inventory;
            }

            inventory.audioInputDeviceCount = devices.length;
            for (AudioDeviceInfo device : devices) {
                if (isUsbAudioInputDevice(device)) {
                    inventory.usbAudioInputDeviceCount++;
                }
            }
        } catch (Throwable ignored) {
            inventory.audioInputDeviceCount = 0;
            inventory.usbAudioInputDeviceCount = 0;
        }
        return inventory;
    }

    private boolean isUsbAudioInputDevice(AudioDeviceInfo device) {
        if (device == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            return false;
        }

        int type = device.getType();
        return type == AudioDeviceInfo.TYPE_USB_DEVICE
                || type == AudioDeviceInfo.TYPE_USB_HEADSET;
    }

    private static class CameraInventory {
        int cameraCount = 0;
        int externalCameraCount = 0;
    }

    private static class UsbInventory {
        int usbDeviceCount = 0;
        int usbVideoDeviceCount = 0;
    }

    private static class AudioInventory {
        int audioInputDeviceCount = 0;
        int usbAudioInputDeviceCount = 0;
    }

    @Override
    public void destroy() {
        context = null;
    }
}
