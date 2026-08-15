import { beforeEach, describe, expect, test } from "vitest";
import { createPinia, setActivePinia } from "pinia";

import { usePrefsStore } from "./prefs";

beforeEach(() => {
  setActivePinia(createPinia());
  delete document.documentElement.dataset.theme;
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
  });
});
