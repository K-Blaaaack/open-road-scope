import { beforeEach, describe, expect, test, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

import { useObdStore, HISTORY_SECONDS } from "./obd";
import { usePrefsStore } from "./prefs";
import { READ_INTERVAL_MIN } from "@shared/obd";

const listeners: ((event: { event: string; params: unknown }) => void)[] = [];

function mockObd(): void {
  (window as unknown as { obd: unknown }).obd = {
    connect: vi.fn().mockResolvedValue({ ok: true }),
    disconnect: vi.fn().mockResolvedValue({ ok: true }),
    subscribe: vi.fn().mockResolvedValue({ ok: true }),
    unsubscribe: vi.fn().mockResolvedValue({ ok: true }),
    query: vi.fn().mockResolvedValue({ ok: true, result: { result: [] } }),
    status: vi.fn(),
    listPorts: vi.fn(),
    onEvent: vi.fn((cb) => {
      listeners.push(cb);
      return () => {};
    }),
  };
}

const emit = (event: { event: string; params: unknown }): void => {
  listeners.forEach((cb) => cb(event));
};

beforeEach(() => {
  listeners.length = 0;
  setActivePinia(createPinia());
  mockObd();
});

describe("useObdStore", () => {
  test("setup 订阅 sidecar 事件并更新最新值", () => {
    const store = useObdStore();
    store.setup();
    expect(window.obd.onEvent).toHaveBeenCalled();

    emit({ event: "data", params: { values: { RPM: 2345, SPEED: 66.5 }, ts: 1000 } });
    expect(store.latest.RPM).toBe(2345);
    expect(store.latest.SPEED).toBe(66.5);
    expect(store.lastTs).toBe(1000);
  });

  test("data 事件写入各 PID 历史缓冲", () => {
    const store = useObdStore();
    store.setup();
    for (let i = 0; i < 20; i += 1) {
      emit({ event: "data", params: { values: { RPM: 1000 + i }, ts: 1000 + i * 100 } });
    }
    const samples = store.history.RPM.toArray();
    expect(samples.length).toBe(20);
    expect(samples[0].v).toBe(1000);
    expect(samples[19].v).toBe(1019);
  });

  test("历史缓冲按容量封顶", () => {
    const store = useObdStore();
    store.setup();
    const capacity = HISTORY_SECONDS * 10;
    for (let i = 0; i < capacity + 50; i += 1) {
      emit({ event: "data", params: { values: { RPM: i }, ts: i } });
    }
    expect(store.history.RPM.size).toBe(capacity);
    expect(store.history.RPM.toArray()[0].v).toBe(50);
  });

  test("status 事件更新连接状态", () => {
    const store = useObdStore();
    store.setup();
    expect(store.status.state).toBe("idle");
    emit({ event: "status", params: { state: "connected", mode: "sim" } });
    expect(store.connected).toBe(true);
    emit({ event: "status", params: { state: "error", mode: "sim", message: "x" } });
    expect(store.connected).toBe(false);
    expect(store.status.message).toBe("x");
  });

  test("connect 失败抛出错误", async () => {
    const store = useObdStore();
    (window.obd.connect as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      error: "boom",
    });
    await expect(store.connect("sim")).rejects.toThrow("boom");
  });

  test("subscribe 缺省使用设置中的读取间隔并夹取越界值", async () => {
    const prefs = usePrefsStore();
    prefs.readInterval = 500;
    const store = useObdStore();

    await store.subscribe(["RPM"]);
    expect(window.obd.subscribe).toHaveBeenLastCalledWith({ pids: ["RPM"], interval: 500 });

    await store.subscribe(["RPM"], 10);
    expect(window.obd.subscribe).toHaveBeenLastCalledWith({
      pids: ["RPM"],
      interval: READ_INTERVAL_MIN,
    });
  });

  test("重订阅前释放旧订阅，避免 sidecar 重复轮询", async () => {
    (window.obd.subscribe as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      result: { subId: 3 },
    });
    const store = useObdStore();
    await store.subscribe(["RPM"]);
    expect(store.subId).toBe(3);

    await store.subscribe(["RPM", "SPEED"]);
    expect(window.obd.unsubscribe).toHaveBeenCalledWith(3);
  });

  test("并发两次 subscribe 只保留一个订阅，落单订阅被 unsubscribe", async () => {
    // subscribe 返回递增 subId，且可 await 延迟：模拟两次订阅重叠的竞态
    let nextSubId = 1;
    (window.obd.subscribe as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      const subId = nextSubId++;
      await new Promise((r) => setTimeout(r, 10));
      return { ok: true, result: { subId } };
    });
    const store = useObdStore();

    // 两次订阅并发触发（模拟 dashboard.save() 与防抖 watcher 重叠）
    const first = store.subscribe(["RPM"]);
    const second = store.subscribe(["SPEED"]);
    await Promise.all([first, second]);

    // 只有后完成者（世代最新）占住 subId，落单的那个必须被释放
    expect(store.subId).toBe(2);
    const calls = (window.obd.unsubscribe as ReturnType<typeof vi.fn>).mock.calls.map(
      (c) => c[0] as number
    );
    expect(calls).toContain(1);
    expect(calls.filter((v) => v === 2).length).toBe(0);
  });

  test("query 解包结果", async () => {
    const store = useObdStore();
    (window.obd.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      result: { result: ["P0301"] },
    });
    const result = await store.query("GET_DTC");
    expect(result).toEqual(["P0301"]);
  });
});
