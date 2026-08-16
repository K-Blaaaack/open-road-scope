import { createApp } from "vue";
import { createPinia } from "pinia";
import "virtual:uno.css";
import "./styles/base.css";
import App from "./App.vue";
import { router } from "./router";
import { i18n } from "./i18n";
import { usePrefsStore } from "./stores/prefs";

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);

/** splash 动画总时长（ms） */
const SPLASH_ANIM_MS = 2800;

/** 移除 splash 层（淡出后销毁；WebView 可能不触发 transitionend，加定时兜底） */
const removeSplash = (): void => {
  const el = document.getElementById("app-loading");
  if (!el || el.dataset.removed) return;
  el.dataset.removed = "1";
  el.classList.add("hidden");
  // 双重移除：transitionend 或超时兜底，避免透明层残留遮挡
  setTimeout(() => el.remove(), 500);
  el.addEventListener(
    "transitionend",
    () => {
      el.remove();
    },
    { once: true }
  );
};

// 顶层立即调度 splash 移除：与 init/mount 完全解耦，
// 即使偏好加载挂起或脚本后续异常，splash 也会按时消失（Android WebView 防卡死）
setTimeout(removeSplash, SPLASH_ANIM_MS + 800);

// 全局错误捕获：辅助排查 WebView 下脚本异常（输出到控制台）
window.addEventListener("error", (e) => {
  console.error("[boot] error:", e.message);
});
window.addEventListener("unhandledrejection", (e) => {
  console.error("[boot] unhandled rejection:", e.reason);
});

// 先加载用户偏好（开发者模式等），再安装路由触发初始导航，
// 保证路由守卫读取到持久化状态
void (async () => {
  // 偏好加载带超时兜底：Android WebView 下 IndexedDB 可能挂起，
  // 避免 init 永不完成导致应用无法启动
  try {
    await Promise.race([
      usePrefsStore().init(),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
  } catch {
    // 加载失败时按默认偏好继续启动
  }
  // splash 底部版本号跟随 package.json（构建期注入）
  const splashVersion = document.getElementById("splash-version");
  if (splashVersion) {
    splashVersion.textContent = `v${__APP_VERSION__}`;
  }
  app.use(router);
  app.use(i18n);
  app.mount("#app");
})();
