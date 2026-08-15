import { defineStore } from "pinia";
import { ref } from "vue";
import localforage from "localforage";

import { i18n } from "@/i18n";

export type Theme = "dark" | "light";
export type Locale = "zh-CN" | "en-US";

const STORAGE_KEY = "open-road-scope:prefs";

interface PrefsSnapshot {
  theme: Theme;
  locale: Locale;
}

const applyTheme = (theme: Theme): void => {
  if (theme === "light") {
    document.documentElement.dataset.theme = "light";
  } else {
    delete document.documentElement.dataset.theme;
  }
};

const applyLocale = (locale: Locale): void => {
  i18n.global.locale.value = locale;
  document.documentElement.lang = locale;
};

/** 用户偏好：主题与语言，持久化到 IndexedDB */
export const usePrefsStore = defineStore("prefs", () => {
  const theme = ref<Theme>("dark");
  const locale = ref<Locale>("zh-CN");
  const loaded = ref(false);

  /** 从本地存储恢复偏好并应用到界面 */
  const init = async (): Promise<void> => {
    try {
      const saved = await localforage.getItem<PrefsSnapshot>(STORAGE_KEY);
      if (saved) {
        theme.value = saved.theme;
        locale.value = saved.locale;
      }
    } catch {
      // 存储不可用时回退默认值
    }
    applyTheme(theme.value);
    applyLocale(locale.value);
    loaded.value = true;
  };

  const persist = (): void => {
    void localforage.setItem(STORAGE_KEY, { theme: theme.value, locale: locale.value });
  };

  /** 切换深色/浅色主题 */
  const toggleTheme = (): void => {
    theme.value = theme.value === "dark" ? "light" : "dark";
    applyTheme(theme.value);
    persist();
  };

  /**
   * 设置界面语言
   * @param l - 目标语言
   */
  const setLocale = (l: Locale): void => {
    locale.value = l;
    applyLocale(l);
    persist();
  };

  return { theme, locale, loaded, init, toggleTheme, setLocale };
});
