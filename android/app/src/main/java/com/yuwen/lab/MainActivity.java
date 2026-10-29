package com.yuwen.lab;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.content.Intent;
import android.net.http.SslError;
import android.os.Bundle;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.util.Base64;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.SslErrorHandler;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.zip.GZIPInputStream;

/**
 * 语墨 · 原生外壳
 * 页面加载自 assets/index.html；API 请求由原生层发出，规避浏览器跨域限制。
 */
public class MainActivity extends Activity {

    private static final int REQ_PICK_IMAGE = 1001;
    private static final int REQ_SAVE_FILE = 1002;

    private WebView web;
    private final ExecutorService io = Executors.newFixedThreadPool(3);
    private ValueCallback<Uri[]> fileCallback;
    private byte[] pendingSaveBytes;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        getWindow().setStatusBarColor(0xFFF4EFE5);
        getWindow().setNavigationBarColor(0xFFF4EFE5);

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setUseWideViewPort(false);
        s.setLoadWithOverviewMode(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setTextZoom(100);

        web.setBackgroundColor(0xFFF4EFE5);
        web.addJavascriptInterface(new NativeBridge(), "YWNative");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (u != null && ("http".equals(u.getScheme()) || "https".equals(u.getScheme()))) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, u));
                    } catch (Exception ignored) {
                    }
                    return true;
                }
                return false;
            }

            @Override
            public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                handler.cancel();
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb,
                                             FileChooserParams params) {
                if (fileCallback != null) {
                    fileCallback.onReceiveValue(null);
                }
                fileCallback = cb;
                try {
                    Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
                    pick.addCategory(Intent.CATEGORY_OPENABLE);
                    pick.setType("image/*");
                    startActivityForResult(Intent.createChooser(pick, "选择作业照片"), REQ_PICK_IMAGE);
                } catch (Exception e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });

        setContentView(web);
        web.loadUrl("file:///android_asset/index.html");
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_PICK_IMAGE) {
            Uri[] result = null;
            if (resultCode == RESULT_OK && data != null) {
                Uri u = data.getData();
                if (u == null && data.getClipData() != null) {
                    u = data.getClipData().getItemAt(0).getUri();
                }
                if (u != null) {
                    result = new Uri[]{u};
                }
            }
            if (fileCallback != null) {
                fileCallback.onReceiveValue(result);
                fileCallback = null;
            }
        } else if (requestCode == REQ_SAVE_FILE) {
            if (resultCode == RESULT_OK && data != null && data.getData() != null) {
                writeToUri(data.getData());
            } else {
                js("YW.onSaveResult(false, '已取消保存')");
            }
        }
    }

    private void writeToUri(final Uri uri) {
        final byte[] bytes = pendingSaveBytes;
        if (bytes == null) {
            return;
        }
        io.execute(new Runnable() {
            @Override
            public void run() {
                OutputStream os = null;
                try {
                    os = getContentResolver().openOutputStream(uri);
                    if (os == null) {
                        throw new Exception("无法打开目标文件");
                    }
                    os.write(bytes);
                    os.flush();
                    js("YW.onSaveResult(true, '已保存到所选位置')");
                } catch (Exception e) {
                    String msg = e.getMessage() == null ? "写入失败" : e.getMessage().replace("'", " ");
                    js("YW.onSaveResult(false, '" + msg + "')");
                } finally {
                    if (os != null) {
                        try {
                            os.close();
                        } catch (Exception ignored) {
                        }
                    }
                    pendingSaveBytes = null;
                }
            }
        });
    }

    /** 把结果回调进网页 */
    private void js(final String code) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (web != null) {
                    web.evaluateJavascript(code, null);
                }
            }
        });
    }

    /** 原生桥 */
    public class NativeBridge {

        @JavascriptInterface
        public boolean isNative() {
            return true;
        }

        @JavascriptInterface
        public String platform() {
            return "android";
        }

        @JavascriptInterface
        public String appVersion() {
            return "1.0";
        }

        /** 异步 POST：request(url, headersJson, body, timeoutSec, callbackId) */
        @JavascriptInterface
        public void request(final String url, final String headersJson, final String body,
                            final int timeoutSec, final int callbackId) {
            io.execute(new Runnable() {
                @Override
                public void run() {
                    HttpURLConnection conn = null;
                    try {
                        URL u = new URL(url);
                        conn = (HttpURLConnection) u.openConnection();
                        conn.setRequestMethod("POST");
                        conn.setConnectTimeout(Math.min(Math.max(timeoutSec, 15), 60) * 1000);
                        conn.setReadTimeout(Math.max(timeoutSec, 15) * 1000);
                        conn.setDoOutput(true);
                        conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                        conn.setRequestProperty("Accept", "application/json");
                        conn.setRequestProperty("Accept-Encoding", "identity");

                        JSONObject hs = new JSONObject(headersJson);
                        Iterator<String> it = hs.keys();
                        while (it.hasNext()) {
                            String k = it.next();
                            conn.setRequestProperty(k, hs.getString(k));
                        }

                        byte[] payload = body.getBytes(StandardCharsets.UTF_8);
                        conn.setFixedLengthStreamingMode(payload.length);
                        OutputStream os = conn.getOutputStream();
                        try {
                            os.write(payload);
                        } finally {
                            os.close();
                        }

                        int code = conn.getResponseCode();
                        InputStream in = (code >= 200 && code < 300)
                                ? conn.getInputStream() : conn.getErrorStream();
                        String text = readAll(in, conn.getContentEncoding());

                        JSONObject out = new JSONObject();
                        out.put("status", code);
                        out.put("body", text);
                        js("YW.__nativeDone(" + callbackId + ", " + out.toString() + ")");
                    } catch (SocketTimeoutException te) {
                        js("YW.__nativeFail(" + callbackId + ", " + JSONObject.quote("timeout") + ")");
                    } catch (Exception e) {
                        String m = e.getClass().getSimpleName()
                                + (e.getMessage() == null ? "" : ": " + e.getMessage());
                        try {
                            js("YW.__nativeFail(" + callbackId + ", " + JSONObject.quote(m) + ")");
                        } catch (Exception ignored) {
                        }
                    } finally {
                        if (conn != null) {
                            conn.disconnect();
                        }
                    }
                }
            });
        }

        /** 保存文件：系统文件选择器决定位置 */
        @JavascriptInterface
        public void saveFile(final String fileName, final String mime, final String base64) {
            try {
                pendingSaveBytes = Base64.decode(base64, Base64.DEFAULT);
                final String m = (mime == null || mime.length() == 0)
                        ? "application/octet-stream" : mime;
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        try {
                            Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                            i.addCategory(Intent.CATEGORY_OPENABLE);
                            i.setType(m);
                            i.putExtra(Intent.EXTRA_TITLE, fileName);
                            startActivityForResult(i, REQ_SAVE_FILE);
                        } catch (Exception e) {
                            js("YW.onSaveResult(false, '系统未提供文件保存器')");
                        }
                    }
                });
            } catch (Exception e) {
                js("YW.onSaveResult(false, '文件编码失败')");
            }
        }

        @JavascriptInterface
        public void shareText(final String title, final String text) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        Intent i = new Intent(Intent.ACTION_SEND);
                        i.setType("text/plain");
                        i.putExtra(Intent.EXTRA_SUBJECT, title);
                        i.putExtra(Intent.EXTRA_TEXT, text);
                        startActivity(Intent.createChooser(i, "分享"));
                    } catch (Exception ignored) {
                    }
                }
            });
        }

        /**
         * 分享文件到微信 / 企业微信等应用：
         * 写入应用缓存目录，经 FileProvider 授权后调起系统分享面板
         */
        @JavascriptInterface
        public void shareFile(final String fileName, final String mime, final String base64) {
            final String type = (mime == null || mime.length() == 0)
                    ? "application/octet-stream" : mime;
            io.execute(new Runnable() {
                @Override
                public void run() {
                    try {
                        byte[] data = Base64.decode(base64, Base64.DEFAULT);
                        File dir = new File(getCacheDir(), "share");
                        if (!dir.exists()) dir.mkdirs();
                        // 每次用新的子目录，避免同名覆盖导致 FileProvider 报错
                        File sub = new File(dir, String.valueOf(System.currentTimeMillis()));
                        sub.mkdirs();
                        final File f = new File(sub, fileName);
                        FileOutputStream fos = new FileOutputStream(f);
                        try { fos.write(data); } finally { fos.close(); }

                        final Uri uri = Uri.parse("content://" + getPackageName()
                                + ShareProvider.AUTHORITY_SUFFIX + "/share/"
                                + sub.getName() + "/" + f.getName());

                        runOnUiThread(new Runnable() {
                            @Override
                            public void run() {
                                try {
                                    Intent i = new Intent(Intent.ACTION_SEND);
                                    i.setType(type);
                                    i.putExtra(Intent.EXTRA_STREAM, uri);
                                    i.putExtra(Intent.EXTRA_TITLE, fileName);
                                    i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                                    Intent chooser = Intent.createChooser(i, "分享到");
                                    startActivity(chooser);
                                    js("YW.onShareResult && YW.onShareResult(true)");
                                } catch (Exception e) {
                                    String m = e.getMessage() == null ? "无法调起分享" : e.getMessage().replace("'", " ");
                                    js("YW.onShareResult && YW.onShareResult(false, '" + m + "')");
                                }
                            }
                        });
                    } catch (Exception e) {
                        String m = e.getMessage() == null ? "分享失败" : e.getMessage().replace("'", " ");
                        js("YW.onShareResult && YW.onShareResult(false, '" + m + "')");
                    }
                }
            });
        }

        /** 直接调起微信好友分享（若已安装） */
        @JavascriptInterface
        public void shareToApp(final String fileName, final String mime, final String base64, final String pkg) {
            final String type = (mime == null || mime.length() == 0)
                    ? "application/octet-stream" : mime;
            io.execute(new Runnable() {
                @Override
                public void run() {
                    try {
                        byte[] data = Base64.decode(base64, Base64.DEFAULT);
                        File dir = new File(getCacheDir(), "share");
                        if (!dir.exists()) dir.mkdirs();
                        File sub = new File(dir, String.valueOf(System.currentTimeMillis()));
                        sub.mkdirs();
                        final File f = new File(sub, fileName);
                        FileOutputStream fos = new FileOutputStream(f);
                        try { fos.write(data); } finally { fos.close(); }

                        final Uri uri = Uri.parse("content://" + getPackageName()
                                + ShareProvider.AUTHORITY_SUFFIX + "/share/"
                                + sub.getName() + "/" + f.getName());

                        runOnUiThread(new Runnable() {
                            @Override
                            public void run() {
                                try {
                                    Intent i = new Intent(Intent.ACTION_SEND);
                                    i.setType(type);
                                    i.setPackage(pkg);
                                    i.putExtra(Intent.EXTRA_STREAM, uri);
                                    i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                                    startActivity(i);
                                    js("YW.onShareResult && YW.onShareResult(true)");
                                } catch (Exception e) {
                                    // 未安装该应用时，回退到系统分享面板
                                    try {
                                        Intent i = new Intent(Intent.ACTION_SEND);
                                        i.setType(type);
                                        i.putExtra(Intent.EXTRA_STREAM, uri);
                                        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                                        startActivity(Intent.createChooser(i, "分享到"));
                                        js("YW.onShareResult && YW.onShareResult(true)");
                                    } catch (Exception e2) {
                                        js("YW.onShareResult && YW.onShareResult(false, '未安装该应用，也无法调起分享')");
                                    }
                                }
                            }
                        });
                    } catch (Exception e) {
                        String m = e.getMessage() == null ? "分享失败" : e.getMessage().replace("'", " ");
                        js("YW.onShareResult && YW.onShareResult(false, '" + m + "')");
                    }
                }
            });
        }

        @JavascriptInterface
        public void printPage() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        PrintManager pm = (PrintManager) getSystemService(PRINT_SERVICE);
                        String job = "语墨试卷";
                        PrintDocumentAdapter adapter = web.createPrintDocumentAdapter(job);
                        pm.print(job, adapter, new PrintAttributes.Builder().build());
                    } catch (Exception e) {
                        Toast.makeText(MainActivity.this, "当前设备不支持打印", Toast.LENGTH_SHORT).show();
                    }
                }
            });
        }

        @JavascriptInterface
        public void toast(final String msg) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    Toast.makeText(MainActivity.this, msg, Toast.LENGTH_SHORT).show();
                }
            });
        }
    }

    private static String readAll(InputStream in, String encoding) throws Exception {
        if (in == null) {
            return "";
        }
        if (encoding != null && encoding.toLowerCase().contains("gzip")) {
            in = new GZIPInputStream(in);
        }
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) > 0) {
            bos.write(buf, 0, n);
        }
        in.close();
        return new String(bos.toByteArray(), StandardCharsets.UTF_8);
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript(
                "(function(){try{return window.YW && YW.onBack ? String(YW.onBack()) : 'false';}catch(e){return 'false';}})()",
                new ValueCallback<String>() {
                    @Override
                    public void onReceiveValue(String value) {
                        if (!"true".equals(value)) {
                            if (web.canGoBack()) {
                                web.goBack();
                            } else {
                                finish();
                            }
                        }
                    }
                });
    }

    @Override
    protected void onDestroy() {
        io.shutdownNow();
        if (web != null) {
            web.removeJavascriptInterface("YWNative");
            web.destroy();
        }
        super.onDestroy();
    }
}
