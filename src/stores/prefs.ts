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
  fitViewport?: boolean;
  showClearDtc?: boolean;
  devMode?: boolean;
  showModeSelect?: boolean;
}

const applyTheme = (theme: Theme): void => {
  if (theme === "light") {
    document.documentElement.dataset.theme = "light";
  } else {
    delete document.documentElement.dataset.theme;
  }
  // 镜像到 localStorage，供启动页脚本同步明暗主题
  try {
    localStorage.setItem("open-road-scope:theme", theme);
  } catch {
    // 存储不可用时忽略
  }
};

const applyLocale = (locale: Locale): void => {
  i18n.global.locale.value = locale;
  document.documentElement.lang = locale;
};

/** 用户偏好：主题、语言与行为选项，持久化到 IndexedDB */
export const usePrefsStore = defineStore("prefs", () => {
  const theme = ref<Theme>("dark");
  const locale = ref<Locale>("zh-CN");
  /** 仪表盘内容是否适配窗口高度（不滚屏） */
  const fitViewport = ref(true);
  /** 是否显示「清除故障码」按钮（实验性，默认隐藏） */
  const showClearDtc = ref(false);
  /** 开发者模式（默认关闭，需设置页连续点击 5 次开启） */
  const devMode = ref(false);
  /** 顶栏是否显示模拟/实车模式标识（默认显示，可在开发者菜单关闭） */
  const showModeSelect = ref(true);
  /** 界面热重载：崩溃自动恢复与 F5/Ctrl+R 快捷键 */
  const loaded = ref(false);

  /** 从本地存储恢复偏好并应用到界面 */
  const init = async (): Promise<void> => {
    try {
      const saved = await localforage.getItem<PrefsSnapshot>(STORAGE_KEY);
      if (saved) {
        theme.value = saved.theme;
        locale.value = saved.locale;
        fitViewport.value = saved.fitViewport ?? true;
        showClearDtc.value = saved.showClearDtc ?? false;
        devMode.value = saved.devMode ?? false;
        showModeSelect.value = saved.showModeSelect ?? true;
      }
    } catch {
      // 存储不可用时回退默认值
    }
    applyTheme(theme.value);
    applyLocale(locale.value);
    loaded.value = true;
  };

  const persist = (): void => {
    void localforage.setItem(STORAGE_KEY, {
      theme: theme.value,
      locale: locale.value,
      fitViewport: fitViewport.value,
      showClearDtc: showClearDtc.value,
      devMode: devMode.value,
      showModeSelect: showModeSelect.value,
    });
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

  return {
    theme,
    locale,
    fitViewport,
    showClearDtc,
    devMode,
    showModeSelect,
    loaded,
    init,
    toggleTheme,
    setLocale,
    persist,
  };
});
