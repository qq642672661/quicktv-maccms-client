package com.quicktvui.hellotv.tvbox;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.SurfaceTexture;
import android.hardware.camera2.CameraAccessException;
import android.hardware.camera2.CameraCaptureSession;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraDevice;
import android.hardware.camera2.CameraManager;
import android.hardware.camera2.CameraMetadata;
import android.hardware.camera2.CaptureRequest;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.HandlerThread;
import android.util.Log;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.Surface;
import android.view.TextureView;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.TextView;

import androidx.annotation.NonNull;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Full-screen camera preview used when a TV box has no system camera app.
 */
public class CameraPreviewActivity extends Activity {

    private static final int REQUEST_CAMERA_PERMISSION = 9102;
    private static final int PREVIEW_WIDTH = 1280;
    private static final int PREVIEW_HEIGHT = 720;
    private static final String TAG = "CameraPreviewActivity";

    private TextureView textureView;
    private TextView statusText;
    private HandlerThread cameraThread;
    private Handler cameraHandler;
    private CameraDevice cameraDevice;
    private CameraCaptureSession captureSession;
    private String cameraId = "";

    private final TextureView.SurfaceTextureListener surfaceTextureListener = new TextureView.SurfaceTextureListener() {
        @Override
        public void onSurfaceTextureAvailable(@NonNull SurfaceTexture surface, int width, int height) {
            startCameraFlow();
        }

        @Override
        public void onSurfaceTextureSizeChanged(@NonNull SurfaceTexture surface, int width, int height) {
        }

        @Override
        public boolean onSurfaceTextureDestroyed(@NonNull SurfaceTexture surface) {
            closeCamera();
            return true;
        }

        @Override
        public void onSurfaceTextureUpdated(@NonNull SurfaceTexture surface) {
        }
    };

    private final CameraDevice.StateCallback cameraStateCallback = new CameraDevice.StateCallback() {
        @Override
        public void onOpened(@NonNull CameraDevice camera) {
            cameraDevice = camera;
            createPreviewSession();
        }

        @Override
        public void onDisconnected(@NonNull CameraDevice camera) {
            showStatus("摄像头已断开。按返回退出，重新插入 USB 摄像头后再试。");
            camera.close();
            cameraDevice = null;
        }

        @Override
        public void onError(@NonNull CameraDevice camera, int error) {
            showStatus("摄像头打开失败（错误 " + error + "）。按返回退出。");
            camera.close();
            cameraDevice = null;
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN, WindowManager.LayoutParams.FLAG_FULLSCREEN);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        buildLayout();
        startCameraThread();
    }

    @Override
    protected void onResume() {
        super.onResume();
        startCameraThread();
        if (textureView.isAvailable()) {
            startCameraFlow();
        } else {
            textureView.setSurfaceTextureListener(surfaceTextureListener);
        }
    }

    @Override
    protected void onPause() {
        closeCamera();
        stopCameraThread();
        super.onPause();
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            finish();
            return true;
        }
        if (keyCode == KeyEvent.KEYCODE_DPAD_CENTER || keyCode == KeyEvent.KEYCODE_ENTER) {
            startCameraFlow();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQUEST_CAMERA_PERMISSION) {
            boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            if (granted) {
                showStatus("权限已允许，正在打开摄像头...");
                startCameraFlow();
            } else {
                showStatus("摄像头权限未允许。按返回退出，回到摄像头页打开权限设置。");
            }
        }
    }

    private void buildLayout() {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);

        textureView = new TextureView(this);
        textureView.setSurfaceTextureListener(surfaceTextureListener);
        root.addView(textureView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));

        statusText = new TextView(this);
        statusText.setTextColor(Color.WHITE);
        statusText.setTextSize(30);
        statusText.setGravity(Gravity.CENTER_VERTICAL);
        statusText.setPadding(48, 24, 48, 24);
        statusText.setBackgroundColor(Color.argb(190, 12, 16, 22));
        statusText.setText("正在准备摄像头预览...");

        FrameLayout.LayoutParams statusParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        statusParams.gravity = Gravity.BOTTOM;
        root.addView(statusText, statusParams);

        setContentView(root);
    }

    private void startCameraFlow() {
        if (!hasCameraPermission()) {
            requestCameraPermission();
            return;
        }

        cameraId = findBestPreviewCameraId();
        if (cameraId.length() == 0) {
            showStatus("未检测到系统可用摄像头。若已插 USB 摄像头，说明盒子固件暂未把它开放给 Android Camera。按返回退出。");
            return;
        }

        openCamera();
    }

    private boolean hasCameraPermission() {
        return getPackageManager().checkPermission(
                Manifest.permission.CAMERA,
                getPackageName()
        ) == PackageManager.PERMISSION_GRANTED;
    }

    private void requestCameraPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            showStatus("当前系统不支持运行时权限请求，正在尝试打开摄像头...");
            return;
        }
        showStatus("请在电视屏幕上允许摄像头权限。");
        requestPermissions(new String[]{Manifest.permission.CAMERA}, REQUEST_CAMERA_PERMISSION);
    }

    private String findBestPreviewCameraId() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) {
            showStatus("当前 Android 版本过低，无法使用 Camera2 预览测试。");
            return "";
        }

        try {
            CameraManager cameraManager = (CameraManager) getSystemService(CAMERA_SERVICE);
            if (cameraManager == null) {
                return "";
            }
            String[] cameraIds = cameraManager.getCameraIdList();
            if (cameraIds == null || cameraIds.length == 0) {
                return "";
            }
            List<CameraCandidate> candidates = new ArrayList<>();
            for (String candidateId : cameraIds) {
                CameraCharacteristics characteristics = cameraManager.getCameraCharacteristics(candidateId);
                candidates.add(new CameraCandidate(
                        candidateId,
                        cameraLensFacing(characteristics),
                        cameraSupportsPreview(characteristics)
                ));
            }
            return chooseCameraId(candidates);
        } catch (CameraAccessException error) {
            showStatus("读取摄像头列表失败：" + safeMessage(error));
            return "";
        }
    }

    private Integer cameraLensFacing(CameraCharacteristics characteristics) {
        try {
            return characteristics.get(CameraCharacteristics.LENS_FACING);
        } catch (Throwable ignored) {
            return null;
        }
    }

    private boolean cameraSupportsPreview(CameraCharacteristics characteristics) {
        try {
            int[] capabilities = characteristics.get(CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES);
            if (capabilities == null || capabilities.length == 0) {
                return true;
            }
            for (int capability : capabilities) {
                if (capability == CameraMetadata.REQUEST_AVAILABLE_CAPABILITIES_BACKWARD_COMPATIBLE) {
                    return true;
                }
            }
            return false;
        } catch (Throwable ignored) {
            return true;
        }
    }

    private String chooseCameraId(List<CameraCandidate> candidates) {
        String compatibleExternalId = firstMatchingCameraId(candidates, true, CameraCharacteristics.LENS_FACING_EXTERNAL);
        if (compatibleExternalId.length() > 0) {
            return compatibleExternalId;
        }

        String compatibleBackId = firstMatchingCameraId(candidates, true, CameraCharacteristics.LENS_FACING_BACK);
        if (compatibleBackId.length() > 0) {
            return compatibleBackId;
        }

        String compatibleFrontId = firstMatchingCameraId(candidates, true, CameraCharacteristics.LENS_FACING_FRONT);
        if (compatibleFrontId.length() > 0) {
            return compatibleFrontId;
        }

        String compatibleAnyId = firstMatchingCameraId(candidates, true, null);
        if (compatibleAnyId.length() > 0) {
            return compatibleAnyId;
        }

        return candidates.isEmpty() ? "" : candidates.get(0).id;
    }

    private String firstMatchingCameraId(List<CameraCandidate> candidates, boolean requirePreviewSupport, Integer lensFacing) {
        for (CameraCandidate candidate : candidates) {
            if (requirePreviewSupport && !candidate.supportsPreview) {
                continue;
            }
            if (lensFacing != null && !lensFacing.equals(candidate.lensFacing)) {
                continue;
            }
            return candidate.id;
        }
        return "";
    }

    private void openCamera() {
        if (cameraDevice != null) {
            return;
        }

        try {
            CameraManager cameraManager = (CameraManager) getSystemService(CAMERA_SERVICE);
            if (cameraManager == null) {
                showStatus("系统摄像头服务不可用。按返回退出。");
                return;
            }
            showStatus("正在打开内置摄像头预览，按返回退出。");
            cameraManager.openCamera(cameraId, cameraStateCallback, cameraHandler);
        } catch (SecurityException error) {
            showStatus("没有摄像头权限。按返回退出，回到摄像头页授权。");
        } catch (CameraAccessException error) {
            showStatus("摄像头暂时不可用：" + safeMessage(error));
        } catch (RuntimeException error) {
            showStatus("摄像头打开异常：" + safeMessage(error));
        }
    }

    private void createPreviewSession() {
        if (cameraDevice == null || !textureView.isAvailable()) {
            return;
        }

        try {
            SurfaceTexture texture = textureView.getSurfaceTexture();
            if (texture == null) {
                showStatus("预览画面未准备好。按 OK 重试，或按返回退出。");
                return;
            }
            texture.setDefaultBufferSize(PREVIEW_WIDTH, PREVIEW_HEIGHT);
            Surface surface = new Surface(texture);
            CaptureRequest.Builder previewRequestBuilder = cameraDevice.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW);
            previewRequestBuilder.addTarget(surface);

            cameraDevice.createCaptureSession(
                    Collections.singletonList(surface),
                    new CameraCaptureSession.StateCallback() {
                        @Override
                        public void onConfigured(@NonNull CameraCaptureSession session) {
                            captureSession = session;
                            try {
                                captureSession.setRepeatingRequest(previewRequestBuilder.build(), null, cameraHandler);
                                showStatus("摄像头预览正常。按返回退出；画面黑屏时换 UVC 摄像头或检查盒子固件。");
                            } catch (CameraAccessException error) {
                                showStatus("摄像头预览启动失败：" + safeMessage(error));
                            }
                        }

                        @Override
                        public void onConfigureFailed(@NonNull CameraCaptureSession session) {
                            showStatus("摄像头预览配置失败。按返回退出。");
                        }
                    },
                    cameraHandler
            );
        } catch (CameraAccessException error) {
            showStatus("创建摄像头预览失败：" + safeMessage(error));
        }
    }

    private void startCameraThread() {
        if (cameraThread != null) {
            return;
        }
        cameraThread = new HandlerThread("HelloTVCameraPreview");
        cameraThread.start();
        cameraHandler = new Handler(cameraThread.getLooper());
    }

    private void stopCameraThread() {
        if (cameraThread == null) {
            return;
        }
        cameraThread.quitSafely();
        try {
            cameraThread.join();
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
        }
        cameraThread = null;
        cameraHandler = null;
    }

    private void closeCamera() {
        if (captureSession != null) {
            captureSession.close();
            captureSession = null;
        }
        if (cameraDevice != null) {
            cameraDevice.close();
            cameraDevice = null;
        }
    }

    private void showStatus(String message) {
        Log.i(TAG, message);
        runOnUiThread(() -> statusText.setText(message));
    }

    private String safeMessage(Throwable error) {
        return error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage();
    }

    private static class CameraCandidate {
        final String id;
        final Integer lensFacing;
        final boolean supportsPreview;

        CameraCandidate(String id, Integer lensFacing, boolean supportsPreview) {
            this.id = id;
            this.lensFacing = lensFacing;
            this.supportsPreview = supportsPreview;
        }
    }
}
