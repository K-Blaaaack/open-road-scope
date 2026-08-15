<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";

import { useObdStore } from "@/stores/obd";
import { usePrefsStore } from "@/stores/prefs";
import { useDashboardStore } from "@/stores/dashboard";

const { t } = useI18n();
const route = useRoute();
const store = useObdStore();
const prefs = usePrefsStore();
const layout = useDashboardStore();

const statusText = computed(() => {
  const key = store.status.state as "idle" | "connecting" | "connected" | "error";
  return t(`status.${key}`);
});

const isDark = computed(() => prefs.theme === "dark");

const statusColor = computed(() => {
  const map: Record<string, string> = {
    idle: "bg-gray-500",
    connecting: "bg-amber-400",
    connected: "bg-emerald-400",
    error: "bg-red-400",
  };
  return map[store.status.state] ?? "bg-gray-500";
});

/** 导航项：开发者模式开启时追加开发者菜单 */
const navItems = computed(() => {
  const base = [
    { path: "/dashboard", icon: "i-lucide-gauge", key: "nav.dashboard" },
    { path: "/connection", icon: "i-lucide-cable", key: "nav.connection" },
    { path: "/diagnostics", icon: "i-lucide-stethoscope", key: "nav.diagnostics" },
    { path: "/settings", icon: "i-lucide-settings", key: "nav.settings" },
    { path: "/about", icon: "i-lucide-info", key: "nav.about" },
  ];
  if (prefs.devMode) {
    base.push({ path: "/developer", icon: "i-lucide-terminal", key: "nav.developer" });
  }
  return base;
});

onMounted(() => {
  void prefs.init().then(() => store.setup());
  // 不自动连接任何设备：由用户在连接页主动选择模拟/实车
});
</script>

<template>
  <div class="flex h-full">
    <aside
      class="border-border flex flex-col gap-2 border-r bg-[var(--color-bg-elevated)] py-4 max-sm:w-14 max-sm:items-center"
      :class="prefs.showNavLabels ? 'w-44 items-stretch px-2' : 'w-14 items-center'"
    >
      <router-link
        v-for="item in navItems"
        :key="item.path"
        :to="item.path"
        class="text-secondary hover:bg-[var(--color-hover)] hover:text-primary flex items-center gap-2.5 rounded-lg transition-colors max-sm:flex-center max-sm:h-10 max-sm:w-10"
        :class="[
          prefs.showNavLabels ? 'px-3 py-2 text-sm' : 'flex-center h-10 w-10',
          route.path === item.path ? '!text-primary bg-[var(--color-active)]' : '',
        ]"
        :title="t(item.key)"
      >
        <span :class="item.icon" class="h-5 w-5 shrink-0" />
        <!-- 导航文字说明，可在设置中控制显示（手机窄屏下隐藏） -->
        <span v-if="prefs.showNavLabels" class="truncate max-sm:hidden">{{ t(item.key) }}</span>
      </router-link>

      <!-- 底部无文字快捷按钮：切换导航文字说明显示（样式与顶部日夜切换按钮一致） -->
      <button
        class="text-secondary hover:text-primary mt-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors max-sm:mx-auto"
        :class="[
          isDark
            ? 'border-white/10 bg-white/10 hover:bg-white/20'
            : 'border-[var(--color-border)] bg-black/5 hover:bg-black/10',
          prefs.showNavLabels ? '' : 'mx-auto',
        ]"
        :title="t('settings.showNavLabels')"
        @click="
          prefs.showNavLabels = !prefs.showNavLabels;
          prefs.persist();
        "
      >
        <span
          :class="prefs.showNavLabels ? 'i-lucide-panel-left-close' : 'i-lucide-panel-left-open'"
          class="h-4 w-4"
        />
      </button>
    </aside>

    <main class="flex min-w-0 flex-1 flex-col">
      <header
        class="border-border flex items-center justify-between border-b bg-[var(--color-bg-elevated)]/60 px-5 py-3"
      >
        <div class="flex items-center gap-2">
          <span class="i-lucide-car text-primary h-5 w-5" />
          <span class="text-primary font-semibold tracking-wide max-sm:hidden">OpenRoadScope</span>
        </div>
        <div class="flex items-center gap-3">
          <!-- 主题切换按钮（原样式：常态背景随日夜模式切换） -->
          <button
            class="text-secondary hover:text-primary flex h-8 w-8 items-center justify-center rounded-lg border transition-colors"
            :class="
              isDark
                ? 'border-white/10 bg-white/10 hover:bg-white/20'
                : 'border-[var(--color-border)] bg-black/5 hover:bg-black/10'
            "
            :title="isDark ? t('common.day') : t('common.night')"
            @click="prefs.toggleTheme()"
          >
            <!-- 图标随主题：黑夜模式为深色月亮，日间模式为亮色太阳 -->
            <span
              :class="isDark ? 'i-lucide-moon text-slate-500' : 'i-lucide-sun text-amber-500'"
              class="h-4 w-4"
            />
          </button>
          <!-- 仪表盘编辑按钮（仅仪表盘页面显示，样式与主题按钮一致） -->
          <button
            v-if="route.path === '/dashboard'"
            class="text-secondary hover:text-primary flex h-8 w-8 items-center justify-center rounded-lg border transition-colors"
            :class="[
              isDark
                ? 'border-white/10 bg-white/10 hover:bg-white/20'
                : 'border-[var(--color-border)] bg-black/5 hover:bg-black/10',
              layout.editing ? '!border-sky-400/60 !text-sky-300 bg-sky-400/10' : '',
            ]"
            :title="t('dashboard.edit')"
            @click="layout.editing ? layout.cancelEdit() : layout.enterEdit()"
          >
            <span class="i-lucide-pen-line h-4 w-4" />
          </button>
          <!-- 模拟/实车模式标识：仅连接后显示，手机窄屏下隐藏 -->
          <span v-if="store.status.state !== 'idle'" class="text-secondary text-xs max-sm:hidden">
            {{ store.status.mode === "sim" ? t("status.sim") : t("status.real") }}
          </span>
          <span class="flex items-center gap-1.5">
            <span class="h-2 w-2 rounded-full" :class="statusColor" />
            <span class="text-secondary text-xs">{{ statusText }}</span>
          </span>
        </div>
      </header>

      <div class="min-h-0 flex-1 overflow-auto p-5 max-sm:p-3">
        <router-view v-slot="{ Component }">
          <Transition name="page" mode="out-in">
            <component :is="Component" :key="route.path" />
          </Transition>
        </router-view>
      </div>
    </main>
  </div>
</template>
