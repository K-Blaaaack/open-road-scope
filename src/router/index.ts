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
