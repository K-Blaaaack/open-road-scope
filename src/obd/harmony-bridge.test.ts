import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import {
  createHarmonyTransport,
  installHarmonyBridge,
  type HarmonyMessage,
  type HarmonyProxy,
} from "./harmony-bridge";
import { useObdStore } from "@/stores/obd";

afterEach(async () => {
  if (window.obd?.platform === "harmonyos") await window.obd.disconnect();
  Reflect.deleteProperty(window, "obd");
  delete window.harmonyObd;
  delete window.__harmonyObdReceive;
  vi.useRealTimers();
});

beforeEach(() => {
  Reflect.deleteProperty(window, "obd");
  setActivePinia(createPinia());
});

describe("HarmonyOS 回执协议", () => {
  test("乱序回执按 id 配对，原生错误传回调用者", async () => {
    const calls: { id: number; method: string }[] = [];
    const bridge = createHarmonyTransport({ call: (id, method) => calls.push({ id, method }) });
    const ports = bridge.transport.listPorts();
    const open = bridge.transport.open("tcp", "192.168.0.10:35000");
    bridge.receive({ id: calls[1].id, ok: true, result: true });
    bridge.receive({ id: calls[0].id, ok: true, result: [] });
    expect(await open).toBe(true);
    expect(await ports).toBe("[]");
    const read = bridge.transport.readLine(100);
    const assertion = expect(read).rejects.toThrow("NOT_CONNECTED");
    bridge.receive({ id: calls[2].id, ok: false, error: "NOT_CONNECTED" });
    await assertion;
    bridge.dispose();
  });

  test("超时清理请求，丢弃迟到回执，断线取消等待", async () => {
    vi.useFakeTimers();
    const bridge = createHarmonyTransport({ call: () => {} });
    const pending = bridge.transport.readLine(100);
    const assertion = expect(pending).rejects.toThrow("bridgeTimeout");
    await vi.advanceTimersByTimeAsync(2100);
    await assertion;
    bridge.receive({ id: 1, ok: true, result: "stale" });
    const next = bridge.transport.readLine(100);
    const cancelled = expect(next).rejects.toThrow("disconnected");
    bridge.receive({ event: "disconnected" });
    await cancelled;
    expect(vi.getTimerCount()).toBe(0);
  });

  test("代理抛错时释放超时计时器", async () => {
    vi.useFakeTimers();
    const bridge = createHarmonyTransport({
      call: () => {
        throw new Error("bridge gone");
      },
    });
    await expect(bridge.transport.open("tcp", "host:1")).rejects.toThrow("bridge gone");
    expect(vi.getTimerCount()).toBe(0);
  });
});

/** @returns 使用真实桥接入口与脚本化原生传输的应用环境 */
function installFixture(): { writes: string[]; reply: (message: HarmonyMessage) => void } {
  const writes: string[] = [];
  const lines: string[] = [];
  const responses: Record<string, string> = {
    ATDP: "ISO 15765-4 CAN",
    ATI: "ELM327 v1.5",
    "0100": "41 00 BE 3E B8 13",
    "010C": "41 0C 1A F8",
    "010D": "41 0D 42",
    "03": "43 00 00",
    "04": "44",
  };
  const reply = (message: HarmonyMessage): void => {
    window.__harmonyObdReceive?.(message);
  };
  const proxy: HarmonyProxy = {
    call: (id, method, json) => {
      const params = JSON.parse(json) as { line?: string };
      let result: unknown = null;
      if (method === "open") result = true;
      if (method === "listPorts") result = [];
      if (method === "close") lines.length = 0;
      if (method === "write") {
        const line = params.line!;
        writes.push(line);
        lines.push(responses[line] ?? "OK", ">");
      }
      if (method === "readLine") result = lines.shift() ?? "";
      queueMicrotask(() => reply({ id, ok: true, result }));
    },
  };
  window.harmonyObd = proxy;
  installHarmonyBridge();
  return { writes, reply };
}

test("安装桥 → store 实车连接 → 周期采样 → 后台断开，不再发出采样", async () => {
  const fixture = installFixture();
  const store = useObdStore();
  store.setup();
  expect(window.obd.connectionTypes).toEqual(["network"]);
  await store.connect("real", { port: "192.168.0.10:35000" });
  expect(store.connected).toBe(true);
  await store.subscribe(["RPM", "SPEED"], 100);
  await vi.waitFor(() => expect(store.latest.SPEED).toBe(66));
  expect(store.latest.RPM).toBe(1726);
  const before = fixture.writes.length;
  fixture.reply({ event: "disconnected" });
  await vi.waitFor(() => expect(store.connected).toBe(false));
  await new Promise((resolve) => setTimeout(resolve, 150));
  expect(fixture.writes).toHaveLength(before);
});

test("模拟模式按订阅 PID 发数据，取消订阅及断开停止计时器", async () => {
  installFixture();
  await window.obd.connect("sim");
  vi.useFakeTimers();
  const events: unknown[] = [];
  window.obd.onEvent((event) => {
    if (event.event === "data") events.push(event.params);
  });
  const sub = await window.obd.subscribe({ pids: ["RPM"], interval: 100 });
  await vi.advanceTimersByTimeAsync(100);
  expect(events).toHaveLength(1);
  expect(events[0]).toEqual({ ts: expect.any(Number), values: { RPM: expect.any(Number) } });
  await window.obd.unsubscribe(sub.result!.subId);
  await vi.advanceTimersByTimeAsync(1000);
  expect(events).toHaveLength(1);
  expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers();
});

test("未连接时订阅失败，真实连接失败不回退模拟数据", async () => {
  installFixture();
  expect((await window.obd.subscribe({ pids: ["RPM"], interval: 100 })).ok).toBe(false);
  expect(await window.obd.connect("real", { port: "AA:BB:CC:DD:EE:FF" })).toMatchObject({
    ok: false,
  });
  expect((await window.obd.subscribe({ pids: ["RPM"], interval: 100 })).ok).toBe(false);
});

test("保留已经安装的 Electron API", () => {
  installFixture();
  const existing = window.obd;
  installHarmonyBridge();
  expect(window.obd).toBe(existing);
});
