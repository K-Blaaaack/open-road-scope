import { createRouter, createWebHashHistory } from "vue-router";

import { usePrefsStore } from "@/stores/prefs";

declare module "vue-router" {
  interface RouteMeta {
    /** 顶栏展示的页面标题 i18n key（页面内不再重复渲染标题） */
    titleKey?: string;
  }
}

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", redirect: "/dashboard" },
    {
      path: "/dashboard",
      name: "dashboard",
      component: () => import("@/pages/DashboardPage.vue"),
      meta: { titleKey: "dashboard.title" },
    },
    {
      path: "/connection",
      name: "connection",
      component: () => import("@/pages/ConnectionPage.vue"),
      meta: { titleKey: "connection.title" },
    },
    {
      path: "/diagnostics",
      name: "diagnostics",
      component: () => import("@/pages/DiagnosticsPage.vue"),
      meta: { titleKey: "diagnostics.title" },
    },
    {
      path: "/settings",
      name: "settings",
      component: () => import("@/pages/SettingsPage.vue"),
      meta: { titleKey: "settings.title" },
    },
    {
      path: "/about",
      name: "about",
      component: () => import("@/pages/AboutPage.vue"),
      meta: { titleKey: "nav.about" },
    },
    {
      path: "/developer",
      name: "developer",
      component: () => import("@/pages/DeveloperPage.vue"),
      meta: { titleKey: "developer.title" },
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
