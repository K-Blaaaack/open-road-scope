import { createApp } from "vue";
import { createPinia } from "pinia";
import "virtual:uno.css";
import "./styles/base.css";
import App from "./App.vue";
import { router } from "./router";
import { i18n } from "./i18n";

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.use(i18n);

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

// 路由就绪后挂载应用，并保证 splash 动画完整播放后再淡出
void router.isReady().then(() => {
  app.mount("#app");
  const elapsed = performance.now() - (window.__splashStart ?? 0);
  const remaining = Math.max(0, SPLASH_ANIM_MS - elapsed);
  setTimeout(removeSplash, remaining);
});
