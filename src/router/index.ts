import { createRouter, createWebHashHistory } from "vue-router";

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
      path: "/developer",
      name: "developer",
      component: () => import("@/pages/DeveloperPage.vue"),
    },
  ],
});
