const fs = require('fs');
const path = require('path');

// 1. Patch AndroidManifest.xml with Full Hardware & Storage Permissions
const manifestPath = path.join(__dirname, 'android/app/src/main/AndroidManifest.xml');
if (fs.existsSync(manifestPath)) {
  let manifest = fs.readFileSync(manifestPath, 'utf8');

  const permissions = `
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-permission android:name="android.permission.FLASHLIGHT" />
    <uses-permission android:name="android.permission.RECORD_AUDIO" />
    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
    <uses-permission android:name="android.permission.WAKE_LOCK" />
    <uses-permission android:name="android.permission.READ_MEDIA_VIDEO" />
    <uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
    <uses-permission android:name="android.permission.READ_MEDIA_AUDIO" />
    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="32" />
    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />

    <uses-feature android:name="android.hardware.camera" android:required="false" />
    <uses-feature android:name="android.hardware.camera.autofocus" android:required="false" />
    <uses-feature android:name="android.hardware.camera.front" android:required="false" />
    <uses-feature android:name="android.hardware.camera.flash" android:required="false" />
    <uses-feature android:name="android.hardware.microphone" android:required="false" />
  `;

  if (!manifest.includes('android.permission.CAMERA')) {
    manifest = manifest.replace('</manifest>', `${permissions}\n</manifest>`);
  }

  if (!manifest.includes('android:largeHeap="true"')) {
    manifest = manifest.replace(
      '<application',
      '<application android:hardwareAccelerated="true" android:largeHeap="true" android:usesCleartextTraffic="true" android:requestLegacyExternalStorage="true"'
    );
  }

  fs.writeFileSync(manifestPath, manifest, 'utf8');
  console.log('✅ AndroidManifest.xml patched successfully.');
}

// 2. Patch MainActivity.java with Torch Bridge + Native Video Saver & Share Bridge
const mainActivityPath = path.join(
  __dirname,
  'android/app/src/main/java/com/abhishekdigitalnews/studio/MainActivity.java'
);

if (fs.existsSync(mainActivityPath)) {
  const activityCode = `package com.abhishekdigitalnews.studio;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {
    private static final int PERMISSION_REQ_CODE = 1001;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        requestAllStudioPermissions();

        if (this.bridge != null && this.bridge.getWebView() != null) {
            WebView webView = this.bridge.getWebView();
            WebSettings settings = webView.getSettings();
            settings.setMediaPlaybackRequiresUserGesture(false);
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true);
            settings.setAllowFileAccess(true);
            settings.setAllowContentAccess(true);

            // 1. Hardware Torch Bridge
            webView.addJavascriptInterface(new NativeTorchBridge(this), "AndroidNativeTorch");

            // 2. Native Video Saver & Share Bridge (Saves directly to Downloads/Gallery)
            webView.addJavascriptInterface(new NativeFileSaverBridge(this), "AndroidNativeSaver");

            webView.setWebChromeClient(new BridgeWebChromeClient(bridge) {
                @Override
                public void onPermissionRequest(final PermissionRequest request) {
                    runOnUiThread(() -> {
                        try {
                            request.grant(request.getResources());
                        } catch (Exception e) {
                            e.printStackTrace();
                        }
                    });
                }
            });
        }
    }

    public static class NativeTorchBridge {
        private final Context ctx;
        public NativeTorchBridge(Context c) { this.ctx = c; }

        @JavascriptInterface
        public boolean setTorch(boolean enable) {
            try {
                CameraManager cm = (CameraManager) ctx.getSystemService(Context.CAMERA_SERVICE);
                if (cm == null) return false;
                for (String id : cm.getCameraIdList()) {
                    CameraCharacteristics cc = cm.getCameraCharacteristics(id);
                    Boolean hasFlash = cc.get(CameraCharacteristics.FLASH_INFO_AVAILABLE);
                    Integer facing = cc.get(CameraCharacteristics.LENS_FACING);
                    if (hasFlash != null && hasFlash && (facing == null || facing == CameraCharacteristics.LENS_FACING_BACK)) {
                        cm.setTorchMode(id, enable);
                        return true;
                    }
                }
            } catch (Exception e) {
                return false;
            }
            return false;
        }
    }

    // NATIVE CHUNKED FILE SAVER & WHATSAPP/YOUTUBE SHARER
    public class NativeFileSaverBridge {
        private final Context ctx;
        public NativeFileSaverBridge(Context c) { this.ctx = c; }

        @JavascriptInterface
        public boolean startFile(String fileName) {
            try {
                File temp = new File(ctx.getCacheDir(), fileName);
                if (temp.exists()) temp.delete();
                return temp.createNewFile();
            } catch (Exception e) {
                return false;
            }
        }

        @JavascriptInterface
        public boolean appendChunk(String fileName, String base64Chunk) {
            try {
                File temp = new File(ctx.getCacheDir(), fileName);
                byte[] bytes = Base64.decode(base64Chunk, Base64.DEFAULT);
                FileOutputStream fos = new FileOutputStream(temp, true);
                fos.write(bytes);
                fos.close();
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        @JavascriptInterface
        public String finishAndSave(String fileName, String mimeType, boolean shareNow, String shareTitle) {
            try {
                File temp = new File(ctx.getCacheDir(), fileName);
                if (!temp.exists()) return "ERROR: Temp file missing";

                Uri savedUri = null;
                ContentResolver resolver = ctx.getContentResolver();

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.MediaColumns.DISPLAY_NAME, fileName);
                    values.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);
                    values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/AbhishekDigitalNews");

                    savedUri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                    if (savedUri != null) {
                        OutputStream os = resolver.openOutputStream(savedUri);
                        FileInputStream fis = new FileInputStream(temp);
                        byte[] buffer = new byte[8192];
                        int len;
                        while ((len = fis.read(buffer)) != -1) {
                            os.write(buffer, 0, len);
                        }
                        fis.close();
                        os.flush();
                        os.close();
                    }
                } else {
                    File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "AbhishekDigitalNews");
                    if (!dir.exists()) dir.mkdirs();
                    File outFile = new File(dir, fileName);
                    FileInputStream fis = new FileInputStream(temp);
                    FileOutputStream fos = new FileOutputStream(outFile);
                    byte[] buffer = new byte[8192];
                    int len;
                    while ((len = fis.read(buffer)) != -1) {
                        fos.write(buffer, 0, len);
                    }
                    fis.close();
                    fos.flush();
                    fos.close();
                    MediaScannerConnection.scanFile(ctx, new String[]{outFile.getAbsolutePath()}, new String[]{mimeType}, null);
                    savedUri = Uri.fromFile(outFile);
                }

                final Uri finalUri = savedUri;
                runOnUiThread(() -> {
                    Toast.makeText(ctx, "Saved to Downloads/AbhishekDigitalNews/" + fileName, Toast.LENGTH_LONG).show();
                    if (shareNow && finalUri != null) {
                        try {
                            Intent shareIntent = new Intent(Intent.ACTION_SEND);
                            shareIntent.setType(mimeType);
                            shareIntent.putExtra(Intent.EXTRA_STREAM, finalUri);
                            shareIntent.putExtra(Intent.EXTRA_TEXT, shareTitle);
                            shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                            ctx.startActivity(Intent.createChooser(shareIntent, "Share Broadcast Video"));
                        } catch (Exception ex) {
                            Toast.makeText(ctx, "Share Error: " + ex.getMessage(), Toast.LENGTH_SHORT).show();
                        }
                    }
                });

                return "OK";
            } catch (Exception e) {
                return "ERROR: " + e.getMessage();
            }
        }
    }

    private void requestAllStudioPermissions() {
        List<String> perms = new ArrayList<>();
        perms.add(Manifest.permission.CAMERA);
        perms.add(Manifest.permission.RECORD_AUDIO);
        perms.add(Manifest.permission.MODIFY_AUDIO_SETTINGS);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            perms.add(Manifest.permission.READ_MEDIA_VIDEO);
            perms.add(Manifest.permission.READ_MEDIA_IMAGES);
            perms.add(Manifest.permission.READ_MEDIA_AUDIO);
        } else {
            perms.add(Manifest.permission.WRITE_EXTERNAL_STORAGE);
            perms.add(Manifest.permission.READ_EXTERNAL_STORAGE);
        }

        List<String> needed = new ArrayList<>();
        for (String p : perms) {
            if (ContextCompat.checkSelfPermission(this, p) != PackageManager.PERMISSION_GRANTED) {
                needed.add(p);
            }
        }
        if (!needed.isEmpty()) {
            ActivityCompat.requestPermissions(this, needed.toArray(new String[0]), PERMISSION_REQ_CODE);
        }
    }
}
`;
  fs.writeFileSync(mainActivityPath, activityCode, 'utf8');
  console.log('✅ MainActivity.java patched with NativeFileSaverBridge.');
}
