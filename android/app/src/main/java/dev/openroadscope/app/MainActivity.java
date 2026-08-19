package dev.openroadscope.app;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.view.ViewGroup;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import java.io.IOException;

/**
 * 主界面：原生 WebView 加载内嵌本地 HTTP 服务（http://127.0.0.1:随机端口）。
 * 相比 Capacitor 桥接层，本地回环 http 下资源加载行为与桌面浏览器一致，
 * 且可通过 chrome://inspect 远程调试。
 */
public class MainActivity extends Activity {
    /** Android 12+ 蓝牙连接所需的运行时权限 */
    private static final int BT_PERMISSION_REQUEST = 1001;

    private WebView webView;
    private HttpAssetServer assetServer;
    private ObdBridge obdBridge;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        webView.setBackgroundColor(0xFF0B0F14);

        // 外层容器：通过 padding 压缩 WebView 的物理尺寸，让出系统状态栏/导航栏。
        // 直接对 WebView setPadding 不压缩其 CSS 视口（荣耀 WebView 行为），
        // 容器 padding 使子视图区域物理缩小，布局必然让开状态栏。
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(0xFF0B0F14);
        root.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);

        // edge-to-edge 下视口会延伸到状态栏/导航栏后面，按系统窗口安全区设置容器 padding
        // （Android 15+ insets 重构后 getSystemWindowInset* 可能返回 0，需显式取类型）
        ViewCompat.setOnApplyWindowInsetsListener(root, (view, insets) -> {
            int top = insets.getInsets(WindowInsetsCompat.Type.statusBars()).top;
            int bottom = insets.getInsets(WindowInsetsCompat.Type.navigationBars()).bottom;
            view.setPadding(0, top, 0, bottom);
            return insets;
        });

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        // edge-to-edge 下视口会延伸到状态栏/导航栏后面，手动让出系统窗口安全区。
        // 在 decorView 根上拦截并显式取状态栏/导航栏 inset
        // （Android 15+ insets 重构后 getSystemWindowInset* 可能返回 0）
        ViewCompat.setOnApplyWindowInsetsListener(getWindow().getDecorView(), (view, insets) -> {
            int top = insets.getInsets(WindowInsetsCompat.Type.statusBars()).top;
            int bottom = insets.getInsets(WindowInsetsCompat.Type.navigationBars()).bottom;
            android.util.Log.i("ORS-insets", "top=" + top + " bottom=" + bottom);
            webView.setPadding(0, top, 0, bottom);
            return insets;
        });

        // 本地回环 HTTP 服务承载应用资源，与桌面端构建产物完全一致
        assetServer = new HttpAssetServer(this);
        try {
            assetServer.start();
        } catch (IOException e) {
            throw new IllegalStateException("无法启动本地资源服务", e);
        }

        // 允许 chrome://inspect 远程调试（仅 debug 构建生效）
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);

        // 原生 OBD 传输桥：前端 ELM327 协议引擎经 window.androidObd 读写蓝牙/USB/TCP
        obdBridge = new ObdBridge(this);
        webView.addJavascriptInterface(obdBridge, "androidObd");

        // Android 12+ 蓝牙串口需要运行时授权
        requestBluetoothPermission();

        // 站内链接保持在当前 WebView。
        // 延迟到首帧布局完成后加载：容器 padding（insets）调整会触发 WebView relayout，
        // 若与首次导航竞争可能导致页面永久卡在 loading（白屏）
        webView.setWebViewClient(new WebViewClient());
        root.post(() ->
                webView.loadUrl("http://127.0.0.1:" + assetServer.getPort() + "/index.html"));
    }

    @Override
    protected void onDestroy() {
        if (assetServer != null) {
            assetServer.close();
            assetServer = null;
        }
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        super.onBackPressed();
    }

    /** Android 12+ 首次进入时请求蓝牙权限（连接页也会在需要时再次触发） */
    private void requestBluetoothPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return;
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT)
                != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(
                    this, new String[] {Manifest.permission.BLUETOOTH_CONNECT}, BT_PERMISSION_REQUEST);
        }
    }
}