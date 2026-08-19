package dev.openroadscope.app;

import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.content.Context;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbManager;
import android.os.Build;
import android.webkit.JavascriptInterface;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import android.hardware.usb.UsbDeviceConnection;

import com.felhr.usbserial.UsbSerialDevice;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * 原生 OBD 传输桥：经 WebView.addJavascriptInterface 暴露给前端，
 * 提供蓝牙 SPP / USB 串口 / TCP socket 的字节流读写，供前端 ELM327 协议引擎使用。
 * 协议解析（AT 命令、PID 解码）全部在 WebView 侧 TS 引擎完成，原生只做传输。
 */
final class ObdBridge {
    /** 蓝牙 SPP（串口）标准 UUID */
    private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    /** 蓝牙连接超时（ms） */
    private static final int BT_CONNECT_TIMEOUT_MS = 20000;
    /** TCP 连接超时（ms） */
    private static final int TCP_CONNECT_TIMEOUT_MS = 5000;

    /** 统一传输抽象：打开连接 / 写一行（ELM 命令）/ 读一行（\r 或 \n 结尾） */
    private interface Transport {
        boolean open();

        void writeLine(String line) throws IOException;

        String readLine(long timeoutMs) throws IOException;

        void close();
    }

    /** 蓝牙 SPP 串口 */
    private static final class BluetoothTransport implements Transport {
        private final BluetoothDevice device;
        private BluetoothSocket socket;
        private BufferedReader reader;
        private OutputStream writer;

        BluetoothTransport(BluetoothDevice device) {
            this.device = device;
        }

        @Override
        public boolean open() {
            // socket.connect() 阻塞：放到后台线程并限时等待，避免卡死 JS 桥主线程
            final boolean[] ok = {false};
            final CountDownLatch latch = new CountDownLatch(1);
            new Thread(
                            () -> {
                                try {
                                    socket = device.createRfcommSocketToServiceRecord(SPP_UUID);
                                    socket.connect();
                                    reader =
                                            new BufferedReader(
                                                    new InputStreamReader(socket.getInputStream()));
                                    writer = socket.getOutputStream();
                                    ok[0] = true;
                                } catch (IOException e) {
                                    // 连接失败
                                } finally {
                                    latch.countDown();
                                }
                            })
                    .start();
            try {
                if (!latch.await(3000, TimeUnit.MILLISECONDS)) {
                    close();
                    return false;
                }
            } catch (InterruptedException e) {
                return false;
            }
            return ok[0];
        }

        @Override
        public void writeLine(String line) throws IOException {
            writer.write((line + "\r").getBytes());
            writer.flush();
        }

        @Override
        public String readLine(long timeoutMs) throws IOException {
            long deadline = System.currentTimeMillis() + timeoutMs;
            while (System.currentTimeMillis() < deadline) {
                if (reader.ready()) {
                    return reader.readLine();
                }
                try {
                    Thread.sleep(10);
                } catch (InterruptedException ignored) {
                    break;
                }
            }
            return null;
        }

        @Override
        public void close() {
            try {
                if (socket != null) socket.close();
            } catch (IOException ignored) {
                // 已关闭
            }
            socket = null;
        }
    }

    /** TCP socket（RJ45 OBD 设备） */
    private static final class TcpTransport implements Transport {
        private final String host;
        private final int port;
        private Socket socket;
        private BufferedReader reader;
        private OutputStream writer;

        TcpTransport(String host, int port) {
            this.host = host;
            this.port = port;
        }

        @Override
        public boolean open() {
            // connect 阻塞：放到后台线程并限时等待，避免卡死 JS 桥主线程
            final boolean[] ok = {false};
            final CountDownLatch latch = new CountDownLatch(1);
            new Thread(
                            () -> {
                                try {
                                    socket = new Socket();
                                    socket.connect(
                                            new InetSocketAddress(host, port),
                                            TCP_CONNECT_TIMEOUT_MS);
                                    socket.setSoTimeout(0);
                                    reader =
                                            new BufferedReader(
                                                    new InputStreamReader(socket.getInputStream()));
                                    writer = socket.getOutputStream();
                                    ok[0] = true;
                                } catch (IOException e) {
                                    // 连接失败
                                } finally {
                                    latch.countDown();
                                }
                            })
                    .start();
            try {
                if (!latch.await(TCP_CONNECT_TIMEOUT_MS + 200, TimeUnit.MILLISECONDS)) {
                    close();
                    return false;
                }
            } catch (InterruptedException e) {
                return false;
            }
            return ok[0];
        }

        @Override
        public void writeLine(String line) throws IOException {
            writer.write((line + "\r").getBytes());
            writer.flush();
        }

        @Override
        public String readLine(long timeoutMs) throws IOException {
            long deadline = System.currentTimeMillis() + timeoutMs;
            while (System.currentTimeMillis() < deadline) {
                if (reader.ready()) {
                    return reader.readLine();
                }
                try {
                    Thread.sleep(10);
                } catch (InterruptedException ignored) {
                    break;
                }
            }
            return null;
        }

        @Override
        public void close() {
            try {
                if (socket != null) socket.close();
            } catch (IOException ignored) {
                // 已关闭
            }
            socket = null;
        }
    }

    /** USB 串口（UsbSerial 库，同步流模式） */
    private static final class UsbTransport implements Transport {
        private final UsbManager usbManager;
        private final UsbDevice device;
        private UsbDeviceConnection connection;
        private UsbSerialDevice serial;
        private InputStream in;
        private OutputStream out;

        UsbTransport(UsbManager usbManager, UsbDevice device) {
            this.usbManager = usbManager;
            this.device = device;
        }

        @Override
        public boolean open() {
            try {
                connection = usbManager.openDevice(device);
                if (connection == null) return false;
                serial = UsbSerialDevice.createUsbSerialDevice(device, connection);
                serial.setInitialBaudRate(38400);
                if (!serial.open()) {
                    close();
                    return false;
                }
                in = serial.getInputStream();
                out = serial.getOutputStream();
                return true;
            } catch (Exception e) {
                close();
                return false;
            }
        }

        @Override
        public void writeLine(String line) throws IOException {
            out.write((line + "\r").getBytes());
            out.flush();
        }

        @Override
        public String readLine(long timeoutMs) throws IOException {
            long deadline = System.currentTimeMillis() + timeoutMs;
            StringBuilder sb = new StringBuilder();
            while (System.currentTimeMillis() < deadline) {
                if (in.available() > 0) {
                    int c = in.read();
                    if (c == '\r' || c == '\n') {
                        if (sb.length() > 0) return sb.toString();
                    } else {
                        sb.append((char) c);
                    }
                } else {
                    try {
                        Thread.sleep(10);
                    } catch (InterruptedException ignored) {
                        break;
                    }
                }
            }
            return sb.length() > 0 ? sb.toString() : null;
        }

        @Override
        public void close() {
            try {
                if (serial != null) serial.close();
            } catch (Exception ignored) {
                // 已关闭
            }
            if (connection != null) {
                connection.close();
            }
            serial = null;
            connection = null;
        }
    }

    private final Context context;
    private final BluetoothAdapter btAdapter;
    private final UsbManager usbManager;
    private Transport transport;
    private String transportName = "";

    ObdBridge(Context context) {
        this.context = context;
        this.btAdapter = BluetoothAdapter.getDefaultAdapter();
        this.usbManager = (UsbManager) context.getSystemService(Context.USB_SERVICE);
    }

    /** 枚举可用设备：已配对蓝牙 SPP 设备 + USB 串口设备 */
    @JavascriptInterface
    public String listPorts() {
        List<JSONObject> ports = new ArrayList<>();
        if (btAdapter != null && btAdapter.isEnabled()) {
            Set<BluetoothDevice> bonded = btAdapter.getBondedDevices();
            for (BluetoothDevice device : bonded) {
                try {
                    JSONObject o = new JSONObject();
                    o.put("name", device.getAddress());
                    o.put("description", device.getName() == null ? "" : device.getName());
                    o.put("type", "bluetooth");
                    ports.add(o);
                } catch (Exception ignored) {
                    // 忽略单个设备
                }
            }
        }
        if (usbManager != null) {
            for (UsbDevice device : usbManager.getDeviceList().values()) {
                if (UsbSerialDevice.isSupported(device)) {
                    try {
                        JSONObject o = new JSONObject();
                        o.put("name", device.getDeviceName());
                        o.put("description", device.getProductName() == null ? "" : device.getProductName());
                        o.put("type", "usb");
                        ports.add(o);
                    } catch (Exception ignored) {
                        // 忽略单个设备
                    }
                }
            }
        }
        return new JSONArray(ports).toString();
    }

    /** 建立传输连接：type 为 bluetooth / usb / tcp，target 为设备地址或 host:port */
    @JavascriptInterface
    public boolean open(String type, String target) {
        close();
        Transport t = null;
        try {
            switch (type) {
                case "bluetooth":
                    if (btAdapter == null || target == null) return false;
                    BluetoothDevice device = btAdapter.getRemoteDevice(target);
                    if (device == null) return false;
                    t = new BluetoothTransport(device);
                    break;
                case "tcp":
                    int sep = target.indexOf(':');
                    if (sep < 0) return false;
                    t = new TcpTransport(target.substring(0, sep), Integer.parseInt(target.substring(sep + 1)));
                    break;
                case "usb":
                    if (usbManager == null || target == null) return false;
                    UsbDevice usb = null;
                    for (UsbDevice d : usbManager.getDeviceList().values()) {
                        if (d.getDeviceName().equals(target)) {
                            usb = d;
                            break;
                        }
                    }
                    if (usb == null) return false;
                    t = new UsbTransport(usbManager, usb);
                    break;
                default:
                    return false;
            }
        } catch (Exception e) {
            return false;
        }
        if (t == null || !t.open()) {
            return false;
        }
        transport = t;
        transportName = type;
        return true;
    }

    @JavascriptInterface
    public void close() {
        if (transport != null) {
            transport.close();
            transport = null;
        }
        transportName = "";
    }

    @JavascriptInterface
    public boolean connected() {
        return transport != null;
    }

    /** 写入一行 ELM 命令（自动追加 \r） */
    @JavascriptInterface
    public void write(String line) {
        if (transport == null) return;
        try {
            transport.writeLine(line);
        } catch (IOException ignored) {
            // 写入失败时前端读侧会感知断连
        }
    }

    /** 读一行响应；超时返回空串（前端据此处理） */
    @JavascriptInterface
    public String readLine(long timeoutMs) {
        if (transport == null) return "";
        try {
            String line = transport.readLine(timeoutMs);
            return line == null ? "" : line;
        } catch (IOException e) {
            return "";
        }
    }

    /** 当前连接类型（bluetooth / usb / tcp），未连接为空串 */
    @JavascriptInterface
    public String currentType() {
        return transportName;
    }
}