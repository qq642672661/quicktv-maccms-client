package com.quicktvui.hellotv;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.os.Handler;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;

import com.quicktvui.hellotv.tvbox.TvBoxModule;

import eskit.sdk.core.EsData;
import eskit.sdk.core.EsManager;

/**
 * <br>
 *
 * <br>
 */
public class MainActivity extends AppCompatActivity {

    private static final int REQUEST_MEDIA_PERMISSIONS = 9001;

    private Handler mHandler = new Handler();
    private boolean keepAliveForExternalActivity = false;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        startApp();
    }

    @Override
    protected void onResume() {
        super.onResume();
        keepAliveForExternalActivity = false;
        TvBoxModule.setCurrentActivity(this);
    }

    @Override
    protected void onPause() {
        super.onPause();
        TvBoxModule.clearCurrentActivity(this);
    }

    public boolean hasCameraPermission() {
        return getPackageManager().checkPermission(
                Manifest.permission.CAMERA,
                getPackageName()
        ) == PackageManager.PERMISSION_GRANTED;
    }

    public boolean hasRecordAudioPermission() {
        return getPackageManager().checkPermission(
                Manifest.permission.RECORD_AUDIO,
                getPackageName()
        ) == PackageManager.PERMISSION_GRANTED;
    }

    public void requestMediaPermissions() {
        if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.M || (hasCameraPermission() && hasRecordAudioPermission())) {
            TvBoxModule.notifyMediaPermissionResult(hasCameraPermission(), hasRecordAudioPermission());
            return;
        }
        runOnUiThread(() -> requestPermissions(
                new String[]{Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO},
                REQUEST_MEDIA_PERMISSIONS
        ));
    }

    public void startExternalActivity(Intent intent) {
        keepAliveForExternalActivity = true;
        try {
            startActivity(intent);
        } catch (RuntimeException error) {
            keepAliveForExternalActivity = false;
            throw error;
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQUEST_MEDIA_PERMISSIONS) {
            boolean cameraGranted = hasCameraPermission();
            boolean recordAudioGranted = hasRecordAudioPermission();
            for (int index = 0; index < permissions.length && index < grantResults.length; index++) {
                if (Manifest.permission.CAMERA.equals(permissions[index])) {
                    cameraGranted = grantResults[index] == PackageManager.PERMISSION_GRANTED;
                } else if (Manifest.permission.RECORD_AUDIO.equals(permissions[index])) {
                    recordAudioGranted = grantResults[index] == PackageManager.PERMISSION_GRANTED;
                }
            }
            TvBoxModule.notifyMediaPermissionResult(cameraGranted, recordAudioGranted);
        }
    }

    private void startApp() {
        if (App.sConfigLoadResult == null) {
            mHandler.postDelayed(this::startApp, 200);
            return;
        }
        if (!App.sConfigLoadResult.success) {
            finish();
            return;
        }

        // 第一步 设置启动参数
        EsData data = DataCreateHelper.createWithConfig(App.sConfigLoadResult.config);

        if (data == null) {
            finish();
            return;
        }
        //data.setCoverLayoutId(R.layout.my_custom_cover);

        // 第二步 启动
        EsManager.get().start(data);
    }

    @Override
    protected void onStop() {
        super.onStop();
        if (!isFinishing() && !keepAliveForExternalActivity) {
            finish();
        }
    }
}
