import { beforeEach, describe, expect, test, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

import { useObdStore, HISTORY_SECONDS } from "./obd";

const listeners: ((event: { event: string; params: unknown }) => void)[] = [];

function mockObd(): void {
  (window as unknown as { obd: unknown }).obd = {
    connect: vi.fn().mockResolvedValue({ ok: true }),
    disconnect: vi.fn().mockResolvedValue({ ok: true }),
    subscribe: vi.fn().mockResolvedValue({ ok: true }),
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
