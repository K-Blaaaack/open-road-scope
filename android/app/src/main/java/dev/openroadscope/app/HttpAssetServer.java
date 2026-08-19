package dev.openroadscope.app;

import android.content.Context;
import android.content.res.AssetManager;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 内嵌本地 HTTP 服务：把 assets/web 目录以 http://127.0.0.1 提供，
 * 使 WebView 以标准 http 环境加载应用（ESM / 动态导入 / CSP 与桌面浏览器行为一致）。
 */
final class HttpAssetServer {
    /** assets 下的应用资源根目录 */
    private static final String ROOT = "web";

    private static final Map<String, String> MIME = new HashMap<>();

    static {
        MIME.put("html", "text/html; charset=utf-8");
        MIME.put("js", "text/javascript; charset=utf-8");
        MIME.put("mjs", "text/javascript; charset=utf-8");
        MIME.put("css", "text/css; charset=utf-8");
        MIME.put("json", "application/json; charset=utf-8");
        MIME.put("webmanifest", "application/manifest+json");
        MIME.put("svg", "image/svg+xml");
        MIME.put("png", "image/png");
        MIME.put("ico", "image/x-icon");
        MIME.put("woff", "font/woff");
        MIME.put("woff2", "font/woff2");
        MIME.put("map", "application/json");
    }

    private final AssetManager assets;
    private ServerSocket serverSocket;
    private ExecutorService pool;

    HttpAssetServer(Context context) {
        this.assets = context.getAssets();
    }

    /** 启动服务（随机端口，仅监听 127.0.0.1 回环地址） */
    void start() throws IOException {
        serverSocket = new ServerSocket(0, 32, InetAddress.getByName("127.0.0.1"));
        pool = Executors.newFixedThreadPool(4);
        Thread acceptThread = new Thread(this::acceptLoop, "http-asset-server");
        acceptThread.setDaemon(true);
        acceptThread.start();
    }

    int getPort() {
        return serverSocket.getLocalPort();
    }

    void close() {
        try {
            serverSocket.close();
        } catch (IOException ignored) {
            // 服务已关闭
        }
        if (pool != null) {
            pool.shutdownNow();
        }
    }

    private void acceptLoop() {
        while (!serverSocket.isClosed()) {
            try {
                Socket socket = serverSocket.accept();
                pool.execute(() -> handle(socket));
            } catch (IOException e) {
                break;
            }
        }
    }

    private void handle(Socket socket) {
        try (InputStream in = socket.getInputStream();
             OutputStream out = socket.getOutputStream()) {
            String requestLine = readLine(in);
            if (requestLine == null || !requestLine.startsWith("GET ")) {
                writeResponse(out, 400, "text/plain", "Bad Request".getBytes(StandardCharsets.UTF_8));
                return;
            }
            String rawPath = requestLine.split(" ")[1];
            String path = URLDecoder.decode(rawPath, StandardCharsets.UTF_8.name());
            if (path.startsWith("/")) {
                path = path.substring(1);
            }
            if (path.isEmpty()) {
                path = "index.html";
            }
            // 防目录穿越：拒绝任何含 .. 的路径
            if (path.contains("..")) {
                writeResponse(out, 400, "text/plain", "Bad Request".getBytes(StandardCharsets.UTF_8));
                return;
            }
            byte[] body;
            String mime;
            try (InputStream asset = assets.open(ROOT + "/" + path)) {
                body = asset.readAllBytes();
                mime = mimeFor(path);
            } catch (IOException e) {
                writeResponse(out, 404, "text/plain", "Not Found".getBytes(StandardCharsets.UTF_8));
                return;
            }
            writeResponse(out, 200, mime, body);
        } catch (IOException ignored) {
            // 连接中断，忽略
        } finally {
            try {
                socket.close();
            } catch (IOException ignored) {
                // 忽略
            }
        }
    }

    private static void writeResponse(OutputStream out, int status, String mime, byte[] body)
            throws IOException {
        String statusText = status == 200 ? "OK" : (status == 404 ? "Not Found" : "Bad Request");
        StringBuilder headers = new StringBuilder();
        headers.append("HTTP/1.1 ").append(status).append(' ').append(statusText).append("\r\n");
        headers.append("Content-Type: ").append(mime).append("\r\n");
        headers.append("Content-Length: ").append(body.length).append("\r\n");
        headers.append("Cache-Control: no-cache\r\n");
        headers.append("Connection: close\r\n\r\n");
        out.write(headers.toString().getBytes(StandardCharsets.UTF_8));
        out.write(body);
        out.flush();
    }

    private static String mimeFor(String path) {
        int dot = path.lastIndexOf('.');
        if (dot < 0) {
            return "application/octet-stream";
        }
        String ext = path.substring(dot + 1).toLowerCase(Locale.ROOT);
        return MIME.getOrDefault(ext, "application/octet-stream");
    }

    /** 读取一行（以 \r\n 结尾），不完整或超限返回 null */
    private static String readLine(InputStream in) throws IOException {
        StringBuilder line = new StringBuilder();
        int b;
        while (line.length() < 8192 && (b = in.read()) != -1) {
            if (b == '\r') {
                if (in.read() == '\n') {
                    return line.toString();
                }
                return null;
            }
            if (b == '\n') {
                return line.toString();
            }
            line.append((char) b);
        }
        return null;
    }
}