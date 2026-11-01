const fs = require('fs');
const path = require('path');

// 1. Patch AndroidManifest.xml with Camera, Audio & Storage Permissions
const manifestPath = path.join(__dirname, 'android/app/src/main/AndroidManifest.xml');
if (fs.existsSync(manifestPath)) {
  let manifest = fs.readFileSync(manifestPath, 'utf8');

  const permissions = `
    <!-- Broadcast Studio Permissions -->
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-permission android:name="android.permission.RECORD_AUDIO" />
    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="32" />
    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />
    <uses-permission android:name="android.permission.READ_MEDIA_VIDEO" />
    <uses-permission android:name="android.permission.WAKE_LOCK" />
    <uses-feature android:name="android.hardware.camera" android:required="false" />
    <uses-feature android:name="android.hardware.camera.autofocus" android:required="false" />
    <uses-feature android:name="android.hardware.camera.front" android:required="false" />
    <uses-feature android:name="android.hardware.microphone" android:required="false" />
  `;

  if (!manifest.includes('android.permission.CAMERA')) {
    manifest = manifest.replace('</manifest>', `${permissions}\n</manifest>`);
  }

  // Ensure hardware acceleration & largeHeap for 60fps 720p Canvas Video Encoding
  manifest = manifest.replace(
    '<application',
    '<application android:hardwareAccelerated="true" android:largeHeap="true" android:usesCleartextTraffic="true"'
  );

  fs.writeFileSync(manifestPath, manifest, 'utf8');
  console.log('✅ AndroidManifest.xml patched successfully.');
}

// 2. Patch MainActivity.java to auto-request OS permissions & keep screen on
const mainActivityPath = path.join(
  __dirname,
  'android/app/src/main/java/com/abhishekdigitalnews/studio/MainActivity.java'
);

if (fs.existsSync(mainActivityPath)) {
  const activityCode = `package com.abhishekdigitalnews.studio;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Keep studio screen awake during live broadcast
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        requestStudioPermissions();
    }

    private void requestStudioPermissions() {
        String[] perms = {
            Manifest.permission.CAMERA,
            Manifest.permission.RECORD_AUDIO,
            Manifest.permission.MODIFY_AUDIO_SETTINGS
        };
        List<String> needed = new ArrayList<>();
        for (String p : perms) {
            if (ContextCompat.checkSelfPermission(this, p) != PackageManager.PERMISSION_GRANTED) {
                needed.add(p);
            }
        }
        if (!needed.isEmpty()) {
            ActivityCompat.requestPermissions(this, needed.toArray(new String[0]), 1001);
        }
    }
}
`;
  fs.writeFileSync(mainActivityPath, activityCode, 'utf8');
  console.log('✅ MainActivity.java patched with runtime permissions & wake-lock.');
}
