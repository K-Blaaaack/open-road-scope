import assert from "node:assert/strict";
import { once } from "node:events";
import net from "node:net";
import { test } from "node:test";
import { createLoader } from "./load-ets.mjs";

/** @returns 可手动完成的异步操作。 */
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

class FakeSocket {
  callbacks = new Map();
  writes = [];
  closed = 0;
  connectTask = undefined;
  sendTask = undefined;
  bindTask = undefined;
  closeTask = undefined;
  on(name, callback) {
    this.callbacks.set(name, callback);
  }
  off(name) {
    this.callbacks.delete(name);
  }
  async bind(address) {
    this.local = address;
    await this.bindTask?.promise;
  }
  async connect(options) {
    this.remote = options;
    await this.connectTask?.promise;
  }
  async send(options) {
    this.writes.push(options.data);
    await this.sendTask?.promise;
  }
  async close() {
    this.closed += 1;
    await this.closeTask?.promise;
  }
  receive(text) {
    const bytes = Uint8Array.from(Buffer.from(text));
    this.callbacks.get("message")?.({ message: bytes.buffer });
  }
  emit(name) {
    this.callbacks.get(name)?.({ code: 1 });
  }
}

/**
 * @param factory - 为每次连接创建 socket。
 * @returns 使用测试 NetworkKit 的真实传输实现。
 */
function fixture(factory = () => new FakeSocket()) {
  const sockets = [];
  let disconnects = 0;
  const load = createLoader({
    "@kit.NetworkKit": {
      socket: {
        constructTCPSocketInstance: () => {
          const socket = factory();
          sockets.push(socket);
          return socket;
        },
      },
      connection: { getAddressesByName: async () => [{ address: "127.0.0.1", family: 1 }] },
    },
  });
  const { TcpTransport } = load("bridge/TcpTransport");
  const { RequestHandler } = load("bridge/RequestHandler");
  const transport = new TcpTransport(() => {
    disconnects += 1;
  });
  const handler = new RequestHandler(transport);
  return { load, sockets, transport, handler, disconnects: () => disconnects };
}

test("分包、CR/LF和无换行提示符依次返回，短超时保留半行", async () => {
  const { LineReader } = createLoader()("bridge/LineReader");
  const reader = new LineReader();
  reader.append("\r\n41 0");
  assert.equal(await reader.read(5), "");
  const reading = reader.read(100);
  reader.append("C 1A F8\r\nOK\r>");
  assert.equal(await reading, "41 0C 1A F8");
  assert.equal(await reader.read(100), "OK");
  assert.equal(await reader.read(100), ">");
  assert.equal(await reader.read(5), "");
});

test("并行读取保留原reader；reset释放计时器和未完成读取", async () => {
  const { LineReader } = createLoader()("bridge/LineReader");
  const reader = new LineReader();
  const first = reader.read(5000);
  await assert.rejects(reader.read(5), /READ_IN_PROGRESS/);
  reader.reset("DISCONNECTED");
  await assert.rejects(first, /DISCONNECTED/);
  reader.append("READY>");
  assert.equal(await reader.read(5), "READY");
  assert.equal(await reader.read(5), ">");
});

test("读缓存到边界可用，超过64KiB报BUFFER_OVERFLOW", () => {
  const load = createLoader();
  const { LineReader } = load("bridge/LineReader");
  const { MAX_BUFFER_BYTES } = load("bridge/Protocol");
  const reader = new LineReader();
  reader.append("A".repeat(MAX_BUFFER_BYTES));
  assert.throws(() => reader.append("B"), /BUFFER_OVERFLOW/);
  reader.reset("DISCONNECTED");
});

test("RPC契约：open/write/readLine/listPorts/close及非法参数", async () => {
  const f = fixture();
  const request = (id, method, params) =>
    f.handler.handle({ id, method, paramsJson: JSON.stringify(params) });
  assert.deepEqual(await request(1, "listPorts", {}), { id: 1, ok: true, result: [] });
  assert.equal(
    (await request(2, "open", { type: "spp", target: "a" })).error,
    "UNSUPPORTED_TRANSPORT"
  );
  assert.equal(
    (await request(3, "open", { type: "tcp", target: "127.0.0.1:0" })).error,
    "INVALID_TARGET"
  );
  assert.equal(
    (await request(4, "open", { type: "tcp", target: "adapter.local:35000" })).result,
    true
  );
  assert.deepEqual(f.sockets[0].local, { address: "0.0.0.0", port: 0, family: 1 });
  assert.equal(f.sockets[0].remote.address.address, "127.0.0.1");
  assert.equal((await request(5, "write", { line: "ATZ" })).result, null);
  assert.deepEqual(f.sockets[0].writes, ["ATZ\r"]);
  for (const line of ["ATZ\r", "A\nB", "\u0000", "A".repeat(1025), 42]) {
    assert.equal((await request(6, "write", { line })).error, "INVALID_PARAMS");
  }
  assert.deepEqual(await request(7, "readLine", { timeoutMs: 5 }), { id: 7, ok: true, result: "" });
  assert.equal((await request(8, "readLine", { timeoutMs: 0 })).error, "INVALID_PARAMS");
  assert.equal((await request(9, "not-a-method", {})).error, "UNSUPPORTED_METHOD");
  assert.equal(
    (await f.handler.handle({ id: 10, method: "open", paramsJson: "{" })).error,
    "INVALID_PARAMS"
  );
  assert.equal((await request(11, "close", {})).result, null);
  assert.equal((await request(12, "write", { line: "ATZ" })).error, "NOT_CONNECTED");
  assert.equal(f.disconnects(), 0);
});

test("远端断开结束reader并仅通知一次，旧socket事件不污染新连接", async () => {
  const f = fixture();
  await f.transport.open("127.0.0.1:35000");
  const oldSocket = f.sockets[0];
  const staleClose = oldSocket.callbacks.get("close");
  const reading = f.transport.readLine(5000);
  oldSocket.emit("close");
  await assert.rejects(reading, /DISCONNECTED/);
  assert.equal(f.disconnects(), 1);
  await f.transport.open("127.0.0.1:35001");
  staleClose();
  assert.equal(f.disconnects(), 1);
  await f.transport.write("010C");
  assert.deepEqual(f.sockets[1].writes, ["010C\r"]);
  await f.transport.close();
});

test("缓冲溢出关闭TCP并结束挂起reader", async () => {
  const f = fixture();
  await f.transport.open("127.0.0.1:35000");
  const reading = f.transport.readLine(5000);
  f.sockets[0].receive("A".repeat(65537));
  await assert.rejects(reading, /BUFFER_OVERFLOW/);
  assert.equal(f.sockets[0].closed, 1);
  assert.equal(f.disconnects(), 1);
});

test("连接失败释放socket，并行open不破坏首次连接", async () => {
  const connect = deferred();
  const f = fixture(() => Object.assign(new FakeSocket(), { connectTask: connect }));
  const opening = f.transport.open("127.0.0.1:35000");
  await assert.rejects(f.transport.open("127.0.0.1:35001"), /CONNECT_IN_PROGRESS/);
  connect.reject(new Error("connect failed"));
  await assert.rejects(opening, /TCP_CONNECT_FAILED/);
  assert.equal(f.sockets[0].closed, 1);
  assert.equal(f.transport.hasSession(), false);
});

test("open等待旧socket关闭期间收到close，旧open不得重新连接", async () => {
  const f = fixture();
  await f.transport.open("127.0.0.1:35000");
  const closing = deferred();
  f.sockets[0].closeTask = closing;
  const reopening = f.transport.open("127.0.0.1:35001");
  await f.transport.close();
  closing.resolve();
  await assert.rejects(reopening, /DISCONNECTED/);
  assert.equal(f.sockets.length, 1);
});

test("写入失败及并行写入返回稳定错误，不静默成功", async () => {
  const f = fixture();
  await f.transport.open("127.0.0.1:35000");
  const sending = deferred();
  f.sockets[0].sendTask = sending;
  const first = f.transport.write("010C");
  await assert.rejects(f.transport.write("010D"), /WRITE_IN_PROGRESS/);
  sending.reject(new Error("write failed"));
  await assert.rejects(first, /TCP_WRITE_FAILED/);
  assert.equal(f.disconnects(), 1);
  assert.equal(f.sockets[0].closed, 1);
});

test("目标与本地页面白名单拒绝外部导航和异常输入", () => {
  const { parseTarget, isTrustedPage, LOCAL_PAGE } = createLoader()("bridge/Protocol");
  assert.deepEqual(parseTarget("[::1]:35000"), { address: "::1", port: 35000, family: 2 });
  for (const value of ["", "http://host:35000", "host:65536", "::1:35000", "host:-1", "a/b:1"]) {
    assert.throws(() => parseTarget(value), /INVALID_TARGET/);
  }
  assert.equal(isTrustedPage(LOCAL_PAGE), true);
  assert.equal(isTrustedPage(LOCAL_PAGE + "#/settings"), true);
  for (const value of [
    "https://example.com",
    LOCAL_PAGE + ".evil",
    LOCAL_PAGE + "?url=x",
    "file:///data/index.html",
    "about:blank",
  ]) {
    assert.equal(isTrustedPage(value), false);
  }
});

test("真实本地TCP服务器完成AT命令、分包响应及提示符读取", async (t) => {
  const clients = new Set();
  const received = [];
  const server = net.createServer((client) => {
    clients.add(client);
    client.on("close", () => clients.delete(client));
    client.on("data", (buffer) => {
      received.push(buffer.toString());
      client.write("ELM3");
      setTimeout(() => client.write("27 v1.5\r\n>"), 5);
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => {
    for (const client of clients) client.destroy();
    server.close();
  });
  class NodeSocket extends FakeSocket {
    constructor() {
      super();
      this.node = new net.Socket();
      this.node.on("data", (buffer) => this.receive(buffer.toString("latin1")));
      this.node.on("close", () => this.emit("close"));
      this.node.on("error", () => this.emit("error"));
    }
    connect(options) {
      this.node.connect(options.address.port, options.address.address);
      return once(this.node, "connect").then(() => undefined);
    }
    send(options) {
      return new Promise((resolve, reject) =>
        this.node.write(options.data, (error) => (error ? reject(error) : resolve()))
      );
    }
    async close() {
      this.node.destroy();
    }
  }
  const f = fixture(() => new NodeSocket());
  t.after(() => f.transport.close());
  await f.transport.open(`127.0.0.1:${server.address().port}`);
  await f.transport.write("ATZ");
  assert.equal(await f.transport.readLine(1000), "ELM327 v1.5");
  assert.equal(await f.transport.readLine(1000), ">");
  assert.equal(received.join(""), "ATZ\r");
  await f.transport.close();
  assert.equal(f.disconnects(), 0);
});
