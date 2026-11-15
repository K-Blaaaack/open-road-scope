package dev.openroadscope.app;

import java.io.IOException;
import java.io.InputStream;

/**
 * ElmLineReader 的独立校验程序：只用 JDK 编译运行，不依赖 Android SDK。
 * 用法：javac -d <dir> ElmLineReader.java ElmLineReaderCheck.java && java -cp <dir> dev.openroadscope.app.ElmLineReaderCheck
 */
public final class ElmLineReaderCheck {
    private static int passed = 0;

    private ElmLineReaderCheck() {
    }

    public static void main(String[] args) throws Exception {
        // 1. 普通 CR 结尾
        ElmLineReader reader = new ElmLineReader(new BufferStream("41 0C 1A F8\r"));
        expect("41 0C 1A F8", reader.readLine(200), "CR 结尾的行");
        expect("", reader.readLine(20), "之后超时返回空串");

        // 2. 提示符不带换行（本次修复的核心场景）
        expect(">", new ElmLineReader(new BufferStream(">")).readLine(200), "裸提示符");

        // 3. 内容 + 提示符
        reader = new ElmLineReader(new BufferStream("OK\r>"));
        expect("OK", reader.readLine(200), "内容行");
        expect(">", reader.readLine(200), "紧随其后的提示符");

        // 4. 多行 + 空行跳过
        reader = new ElmLineReader(new BufferStream("\r\n\r\nSEARCHING...\r\rELM327 v1.5\r\n>"));
        expect("SEARCHING...", reader.readLine(200), "空行被跳过");
        expect("ELM327 v1.5", reader.readLine(200), "CRLF 行");
        expect(">", reader.readLine(200), "结束提示符");

        // 5. 半行超时：返回已读内容且不永久阻塞
        long started = System.currentTimeMillis();
        expect("41 0", new ElmLineReader(new BufferStream("41 0")).readLine(120), "超时交出半行");
        long elapsed = System.currentTimeMillis() - started;
        check(elapsed >= 110 && elapsed < 800, "半行超时耗时异常：" + elapsed + "ms");

        // 6. 完全无数据：按时返回空串
        started = System.currentTimeMillis();
        expect("", new ElmLineReader(new IdleStream()).readLine(80), "无数据返回空串");
        elapsed = System.currentTimeMillis() - started;
        check(elapsed >= 70 && elapsed < 600, "空闲超时耗时异常：" + elapsed + "ms");

        // 7. available() 每次都只有 1 字节：模拟慢速串口
        reader = new ElmLineReader(new OneByteStream("41 0D 42\r>"));
        expect("41 0D 42", reader.readLine(500), "逐字节到达的内容行");
        expect(">", reader.readLine(500), "逐字节到达的提示符");

        // 8. 提示符在行中间仍然拆分
        reader = new ElmLineReader(new BufferStream("OK>NO DATA\r"));
        expect("OK", reader.readLine(200), "提示符前的内容");
        expect(">", reader.readLine(200), "提示符");
        expect("NO DATA", reader.readLine(200), "提示符后的剩余内容");

        // 9. 超过缓冲上限时交出已读内容，不会无限增长
        StringBuilder huge = new StringBuilder();
        for (int index = 0; index < 5000; index++) {
            huge.append('A');
        }
        String overflow = new ElmLineReader(new BufferStream(huge.toString())).readLine(300);
        check(overflow.length() > 0 && overflow.length() <= 4096, "超长行未截断：" + overflow.length());

        // 10. 流被关闭明确报错，由上层转为断连
        boolean threw = false;
        try {
            new ElmLineReader(new ClosedStream()).readLine(50);
        } catch (IOException expected) {
            threw = true;
        }
        check(threw, "流关闭未抛出 IOException");

        System.out.println("ELM_LINE_READER_PASS " + passed + " checks");
    }

    private static void expect(String expected, String actual, String label) {
        check(expected.equals(actual), label + "：期望 [" + expected + "]，实际 [" + actual + "]");
    }

    private static void check(boolean condition, String message) {
        if (!condition) {
            System.err.println("ELM_LINE_READER_FAIL " + message);
            System.exit(1);
        }
        passed++;
    }

    /** 一次性提供全部字节的流 */
    private static final class BufferStream extends InputStream {
        private final byte[] data;
        private int offset = 0;

        BufferStream(String text) {
            this.data = text.getBytes();
        }

        @Override
        public int available() {
            return data.length - offset;
        }

        @Override
        public int read() {
            return offset < data.length ? data[offset++] & 0xff : -1;
        }
    }

    /** 每次只暴露 1 字节可读，模拟慢速串口 */
    private static final class OneByteStream extends InputStream {
        private final byte[] data;
        private int offset = 0;

        OneByteStream(String text) {
            this.data = text.getBytes();
        }

        @Override
        public int available() {
            return offset < data.length ? 1 : 0;
        }

        @Override
        public int read() {
            return offset < data.length ? data[offset++] & 0xff : -1;
        }
    }

    /** 永远没有数据，验证超时路径 */
    private static final class IdleStream extends InputStream {
        @Override
        public int available() {
            return 0;
        }

        @Override
        public int read() {
            throw new AssertionError("无数据时不应调用 read()");
        }
    }

    /** 立即结束的流 */
    private static final class ClosedStream extends InputStream {
        @Override
        public int available() {
            return 1;
        }

        @Override
        public int read() {
            return -1;
        }
    }
}
