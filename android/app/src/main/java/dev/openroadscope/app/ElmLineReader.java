package dev.openroadscope.app;

import java.io.IOException;
import java.io.InputStream;

/**
 * ELM327 响应读取器：按字节读取，遇 CR / LF 或提示符 '>' 结束。
 *
 * 原生 BufferedReader.readLine() 必须等到换行才返回，而 ELM327 的提示符 '>' 常常
 * 不带换行；在 TCP（setSoTimeout(0)）下会永久阻塞，让前端命令超时保护失效。
 * 这里改为轮询 available() + 单字节读取，把 '>' 当作独立的分隔符。
 * 仅依赖 JDK，可脱离 Android SDK 用 javac 直接验证。
 */
final class ElmLineReader {
    /** 无数据时的轮询间隔（ms），兼顾响应速度与 CPU 占用 */
    private static final long POLL_INTERVAL_MS = 5;
    /** 单行缓冲区上限，防止异常流无限增长 */
    private static final int MAX_LINE_CHARS = 4096;

    private final InputStream input;
    /** 已读入但尚未交付的字符（跨多次 readLine 调用保留） */
    private final StringBuilder pending = new StringBuilder();

    ElmLineReader(InputStream input) {
        this.input = input;
    }

    /**
     * 读取一行响应。
     *
     * @param timeoutMs 最大等待时间（ms）
     * @return 行内容；提示符返回 ">"；无数据返回 ""；只读到半行时返回已读部分
     * @throws IOException 底层流读取失败
     */
    String readLine(long timeoutMs) throws IOException {
        long deadline = System.currentTimeMillis() + Math.max(0, timeoutMs);
        while (true) {
            String line = takeLine();
            if (line != null) {
                return line;
            }
            if (input.available() > 0) {
                int value = input.read();
                if (value < 0) {
                    throw new IOException("stream closed");
                }
                if (pending.length() >= MAX_LINE_CHARS) {
                    // 超长响应：交出已读内容，避免无限缓冲
                    return drain();
                }
                pending.append((char) value);
                continue;
            }
            if (System.currentTimeMillis() >= deadline) {
                return drain();
            }
            try {
                Thread.sleep(POLL_INTERVAL_MS);
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                return drain();
            }
        }
    }

    /**
     * 从缓冲区取出一个完整行。
     *
     * @return 完整行或提示符；尚无分隔符时返回 null
     */
    private String takeLine() {
        while (pending.length() > 0) {
            char character = pending.charAt(0);
            if (character == '>') {
                pending.delete(0, 1);
                return ">";
            }
            if (character != '\r' && character != '\n') {
                break;
            }
            // 空行不单独交付（如 CRLF 的第二个字符）
            pending.delete(0, 1);
        }
        for (int index = 0; index < pending.length(); index++) {
            char character = pending.charAt(index);
            if (character == '\r' || character == '\n') {
                String line = pending.substring(0, index);
                pending.delete(0, index + 1);
                return line;
            }
            if (character == '>') {
                String line = pending.substring(0, index);
                // 提示符留着下次读取，先交付本行内容
                pending.delete(0, index);
                return line;
            }
        }
        return null;
    }

    /**
     * 交出缓冲区内容并清空。
     *
     * @return 已缓存但未终止的行
     */
    private String drain() {
        String line = pending.toString();
        pending.setLength(0);
        return line;
    }
}
