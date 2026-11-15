import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { test } from "node:test";
import { createLoader } from "./load-ets.mjs";

/** @returns 用于验证主线程桥的 Worker 和 WebviewController 替身。 */
function bridgeFixture() {
  const workers = [];
  const received = [];
  const scripts = [];
  class FakeWorker {
    messages = [];
    terminated = false;
    constructor(path) {
      this.path = path;
      workers.push(this);
    }
    postMessage(message) {
      this.messages.push(message);
      if (message.kind === "shutdown") {
        queueMicrotask(() => this.onmessage?.({ data: { kind: "stopped", payload: "" } }));
      }
    }
    terminate() {
      this.terminated = true;
      this.onexit?.();
    }
    response(response) {
      this.onmessage?.({ data: { kind: "response", payload: JSON.stringify(response) } });
    }
  }
  const load = createLoader({ "@kit.ArkTS": { worker: { ThreadWorker: FakeWorker } } });
  const { NativeBridge } = load("bridge/NativeBridge");
  const { LOCAL_PAGE } = load("bridge/Protocol");
  const bridge = new NativeBridge();
  const controller = {
    runJavaScript: (script) => {
      scripts.push(script);
      vm.runInNewContext(script, {
        window: { __harmonyObdReceive: (message) => received.push(message) },
      });
      return Promise.resolve("");
    },
  };
  bridge.attach(controller);
  bridge.pageBegin(LOCAL_PAGE);
  bridge.pageEnd(LOCAL_PAGE);
  return { bridge, workers, received, scripts, LOCAL_PAGE };
}

test("桥只开放可信本地页面，响应JSON不会拼接成脚本", () => {
  const f = bridgeFixture();
  f.bridge.call(1, "readLine", '{"timeoutMs":120}');
  const value = "');globalThis.compromised=true;//\n\u2028\"\\";
  f.workers[0].response({ id: 1, ok: true, result: value });
  assert.equal(f.received.length, 1);
  assert.equal(f.received[0].result, value);
  f.bridge.pageBegin("https://example.com");
  f.bridge.pageEnd("https://example.com");
  f.bridge.call(2, "open", "{}");
  assert.equal(f.workers.length, 1);
  f.bridge.detach();
});

test("后台终结pending并发断开事件，前台不会自动重连", async () => {
  const f = bridgeFixture();
  f.bridge.call(1, "open", '{"type":"tcp","target":"127.0.0.1:35000"}');
  f.workers[0].response({ id: 1, ok: true, result: true });
  f.bridge.call(2, "readLine", '{"timeoutMs":1000}');
  f.bridge.setForeground(false);
  await Promise.resolve();
  assert.equal(f.received.find((item) => item.id === 2).error, "APP_BACKGROUND");
  assert.equal(f.received.filter((item) => item.event === "disconnected").length, 1);
  assert.equal(f.workers[0].terminated, true);
  f.bridge.call(3, "write", '{"line":"ATZ"}');
  assert.equal(f.received.find((item) => item.id === 3).error, "APP_BACKGROUND");
  f.bridge.setForeground(true);
  assert.equal(f.workers.length, 1);
  f.bridge.call(4, "listPorts", "{}");
  assert.equal(f.workers.length, 2);
  f.bridge.detach();
});

test("主动close不产生disconnected，旧Worker响应不进入新页面", async () => {
  const f = bridgeFixture();
  f.bridge.call(1, "open", '{"type":"tcp","target":"127.0.0.1:35000"}');
  f.workers[0].response({ id: 1, ok: true, result: true });
  f.bridge.call(2, "close", "{}");
  f.workers[0].response({ id: 2, ok: true, result: null });
  const lateResponse = f.workers[0].onmessage;
  f.bridge.pageBegin(f.LOCAL_PAGE);
  f.bridge.pageEnd(f.LOCAL_PAGE);
  f.bridge.call(3, "listPorts", "{}");
  lateResponse({ data: { kind: "response", payload: '{"id":3,"ok":true,"result":["old"]}' } });
  assert.equal(
    f.received.some((item) => item.id === 3),
    false
  );
  f.workers[1].response({ id: 3, ok: true, result: [] });
  assert.equal(f.received.find((item) => item.id === 3).result.length, 0);
  assert.equal(
    f.received.some((item) => item.event === "disconnected"),
    false
  );
  f.bridge.detach();
  await Promise.resolve();
});

test("页面结束前排队响应，Worker故障清理pending", async () => {
  const f = bridgeFixture();
  f.bridge.pageBegin(f.LOCAL_PAGE);
  f.bridge.call(1, "listPorts", "{}");
  f.workers[0].response({ id: 1, ok: true, result: [] });
  assert.equal(f.received.length, 0);
  f.bridge.pageEnd(f.LOCAL_PAGE);
  assert.equal(f.received[0].id, 1);
  f.bridge.call(2, "open", '{"type":"tcp","target":"127.0.0.1:35000"}');
  f.workers[0].onerror({ message: "crash" });
  await Promise.resolve();
  assert.equal(f.received.find((item) => item.id === 2).error, "WORKER_FAILED");
  assert.equal(f.workers[0].terminated, true);
  f.bridge.detach();
});

test("工程配置引用资源、页面和Worker，API固定为12", () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const read = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
  const project = read("build-profile.json5");
  assert.equal(project.app.products[0].compatibleSdkVersion, "5.0.0(12)");
  assert.equal(project.app.products[0].targetSdkVersion, "5.0.0(12)");
  assert.equal(project.app.products[0].runtimeOS, "HarmonyOS");
  assert.equal(read("hvigor/hvigor-config.json5").modelVersion, "5.0.0");
  const module = read("entry/src/main/module.json5").module;
  assert.deepEqual(module.requestPermissions, [{ name: "ohos.permission.INTERNET" }]);
  assert.equal(existsSync(resolve(root, "entry/src/main", module.abilities[0].srcEntry)), true);
  assert.equal(existsSync(resolve(root, "AppScope/resources/base/media/app_icon.svg")), true);
  const worker = read("entry/build-profile.json5").buildOption.sourceOption.workers[0];
  assert.equal(existsSync(resolve(root, "entry", worker)), true);
  const page = read("entry/src/main/resources/base/profile/main_pages.json").src[0];
  assert.equal(existsSync(resolve(root, "entry/src/main/ets", `${page}.ets`)), true);
  const source = readFileSync(resolve(root, "entry/src/main/ets/pages/Index.ets"), "utf8");
  assert.match(source, /\.fileAccess\(false\)/);
  assert.match(source, /\.blockNetwork\(true\)/);
  assert.match(source, /permission: BRIDGE_PERMISSION/);
  assert.doesNotMatch(source, /setPathAllowingUniversalAccess/);
  assert.equal(
    dirname(resolve(root, "entry", worker)),
    resolve(root, "entry/src/main/ets/workers")
  );
});
