import { beforeEach, describe, expect, test, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import localforage from "localforage";

import { usePrefsStore } from "./prefs";
import { READ_INTERVAL_DEFAULT, READ_INTERVAL_MAX, READ_INTERVAL_MIN } from "@shared/obd";

vi.mock("localforage", () => ({
  default: { getItem: vi.fn(), setItem: vi.fn() },
}));

beforeEach(() => {
  setActivePinia(createPinia());
  delete document.documentElement.dataset.theme;
  vi.mocked(localforage.getItem).mockResolvedValue(null);
});

describe("usePrefsStore", () => {
  test("toggleTheme 切换主题并应用到 html 属性", () => {
    const prefs = usePrefsStore();
    expect(prefs.theme).toBe("dark");
    prefs.toggleTheme();
    expect(prefs.theme).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    prefs.toggleTheme();
    expect(prefs.theme).toBe("dark");
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  test("setLocale 更新偏好语言", () => {
    const prefs = usePrefsStore();
    prefs.setLocale("en-US");
    expect(prefs.locale).toBe("en-US");
  });

  test("init 在存储不可用时回退默认值", async () => {
    const prefs = usePrefsStore();
    await prefs.init();
    expect(prefs.loaded).toBe(true);
    expect(prefs.theme).toBe("dark");
    expect(prefs.locale).toBe("zh-CN");
    expect(prefs.readInterval).toBe(READ_INTERVAL_DEFAULT);
  });

  test("setReadInterval 夹到标准区间并对齐步进", () => {
    const prefs = usePrefsStore();
    expect(prefs.readInterval).toBe(READ_INTERVAL_DEFAULT);

    prefs.setReadInterval(10);
    expect(prefs.readInterval).toBe(READ_INTERVAL_MIN);

    prefs.setReadInterval(9999);
    expect(prefs.readInterval).toBe(READ_INTERVAL_MAX);

    prefs.setReadInterval(313);
    expect(prefs.readInterval).toBe(300);

    prefs.setReadInterval(500);
    expect(prefs.readInterval).toBe(500);
  });

  test("init 恢复存储中的读取间隔并夹取越界值", async () => {
    vi.mocked(localforage.getItem).mockResolvedValueOnce({
      theme: "dark",
      locale: "zh-CN",
      readInterval: 5000,
    } as never);
    const prefs = usePrefsStore();
    await prefs.init();
    expect(prefs.readInterval).toBe(READ_INTERVAL_MAX);

    vi.mocked(localforage.getItem).mockResolvedValueOnce({
      theme: "dark",
      locale: "zh-CN",
      readInterval: 300,
    } as never);
    await prefs.init();
    expect(prefs.readInterval).toBe(300);
  });
});
