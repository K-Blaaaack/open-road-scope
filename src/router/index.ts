import { createRouter, createWebHashHistory } from "vue-router";

import { usePrefsStore } from "@/stores/prefs";

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", redirect: "/dashboard" },
    { path: "/dashboard", name: "dashboard", component: () => import("@/pages/DashboardPage.vue") },
    {
      path: "/connection",
      name: "connection",
      component: () => import("@/pages/ConnectionPage.vue"),
    },
    {
      path: "/diagnostics",
      name: "diagnostics",
      component: () => import("@/pages/DiagnosticsPage.vue"),
    },
    {
      path: "/settings",
      name: "settings",
      component: () => import("@/pages/SettingsPage.vue"),
    },
    {
      path: "/about",
      name: "about",
      component: () => import("@/pages/AboutPage.vue"),
    },
    {
      path: "/developer",
      name: "developer",
      component: () => import("@/pages/DeveloperPage.vue"),
    },
  ],
});

// 开发者菜单仅在开发者模式开启时可访问
router.beforeEach((to) => {
  if (to.path === "/developer" && !usePrefsStore().devMode) {
    return { path: "/dashboard" };
  }
  return true;
});

/**
 * 空闲时预取全部路由 chunk（预加载 / 缓存预热），
 * 用户在切换页面时无需再等待动态导入完成
 */
export const prefetchRoutes = (): void => {
  const load = (): void => {
    for (const route of router.getRoutes()) {
      const loader = route.components?.default;
      if (typeof loader === "function" && route.path !== router.currentRoute.value.path) {
        void (loader as () => Promise<unknown>)().catch(() => {
          // 预取失败静默忽略，不影响后续按需加载
        });
      }
    }
  };
  // requestIdleCallback 空闲调度，低优先级不抢占首屏渲染；不支持时降级为延迟执行
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(load, { timeout: 3000 });
  } else {
    window.setTimeout(load, 800);
  }
};
