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

/** 移除 splash 层（淡出后销毁） */
const removeSplash = (): void => {
  const el = document.getElementById("app-loading");
  if (!el) return;
  el.classList.add("hidden");
  el.addEventListener(
    "transitionend",
    () => {
      el.remove();
    },
    { once: true }
  );
};

// 先加载用户偏好（开发者模式等），再安装路由触发初始导航，
// 保证路由守卫读取到持久化状态；splash 动画完整播放后淡出
void (async () => {
  await usePrefsStore().init();
  // splash 底部版本号跟随 package.json（构建期注入）
  const splashVersion = document.getElementById("splash-version");
  if (splashVersion) {
    splashVersion.textContent = `v${__APP_VERSION__}`;
  }
  app.use(router);
  app.use(i18n);
  app.mount("#app");
  const elapsed = performance.now() - (window.__splashStart ?? 0);
  const remaining = Math.max(0, SPLASH_ANIM_MS - elapsed);
  setTimeout(removeSplash, remaining);
})();
