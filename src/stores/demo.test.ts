import { beforeEach, describe, expect, test } from "vitest";
import { createPinia, setActivePinia } from "pinia";

import { useObdStore } from "./obd";
import { usePrefsStore } from "./prefs";

// 本测试环境无 window.obd（未注入桥接），模拟正式包 preload 失效场景

beforeEach(() => {
  setActivePinia(createPinia());
  delete (window as unknown as Record<string, unknown>).obd;
});

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe("演示桥接受开发者模式控制", () => {
  test("开发者模式关闭时：不激活假数据", () => {
    const prefs = usePrefsStore();
    prefs.devMode = false;
    const store = useObdStore();
    store.setup();
    expect(store.isDemo).toBe(false);
    expect(store.status.state).toBe("idle");
    expect(store.lastTs).toBe(0);
  });

  test("开发者模式关闭时：连接抛出错误", async () => {
    const prefs = usePrefsStore();
    prefs.devMode = false;
    const store = useObdStore();
    store.setup();
    await expect(store.connect("sim")).rejects.toThrow(/桥接不可用/);
  });

  test("开发者模式开启时：激活内置演示数据", async () => {
    const prefs = usePrefsStore();
    prefs.devMode = true;
    const store = useObdStore();
    store.setup();
    expect(store.isDemo).toBe(true);
    expect(store.status.state).toBe("connected");
    await wait(1200); // 等待演示数据帧（500ms 间隔）
    expect(store.lastTs).toBeGreaterThan(0);
    expect(store.latest.SPEED).toBeDefined();
  });

  test("演示模式下查询返回固定数据", async () => {
    const prefs = usePrefsStore();
    prefs.devMode = true;
    const store = useObdStore();
    store.setup();
    await expect(store.query("GET_DTC")).resolves.toEqual(["P0420"]);
    await expect(store.query("VIN")).resolves.toBe("WEBDEMO000001");
  });
});
