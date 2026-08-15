<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";

import { useObdStore } from "@/stores/obd";
import { usePrefsStore } from "@/stores/prefs";

const { t } = useI18n();
const route = useRoute();
const store = useObdStore();
const prefs = usePrefsStore();

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

const navItems = [
  { path: "/dashboard", icon: "i-lucide-gauge", key: "nav.dashboard" },
  { path: "/connection", icon: "i-lucide-cable", key: "nav.connection" },
  { path: "/diagnostics", icon: "i-lucide-stethoscope", key: "nav.diagnostics" },
  { path: "/settings", icon: "i-lucide-settings", key: "nav.settings" },
];

onMounted(() => {
  void prefs.init().then(() => store.setup());
  if (store.status.state === "idle") {
    store
      .connect("sim")
      .then(() => store.subscribe())
      .catch(() => {});
  }
});
</script>

<template>
  <div class="flex h-full">
    <aside
      class="border-border flex w-14 flex-col items-center gap-2 border-r bg-[var(--color-bg-elevated)] py-4"
    >
      <router-link
        v-for="item in navItems"
        :key="item.path"
        :to="item.path"
        class="flex-center text-secondary hover:bg-[var(--color-hover)] hover:text-primary h-10 w-10 rounded-lg transition-colors"
        :class="route.path === item.path ? '!text-primary bg-[var(--color-active)]' : ''"
        :title="t(item.key)"
      >
        <span :class="item.icon" class="h-5 w-5" />
      </router-link>
    </aside>

    <main class="flex min-w-0 flex-1 flex-col">
      <header
        class="border-border flex items-center justify-between border-b bg-[var(--color-bg-elevated)]/60 px-5 py-3"
      >
        <div class="flex items-center gap-2">
          <span class="i-lucide-car text-primary h-5 w-5" />
          <span class="text-primary font-semibold tracking-wide">OpenRoadScope</span>
        </div>
        <div class="flex items-center gap-3">
          <button
            class="flex h-8 w-8 items-center justify-center rounded-lg border transition-colors"
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
          <span class="text-secondary text-xs">
            {{ store.status.mode === "sim" ? t("status.sim") : t("status.real") }}
          </span>
          <span class="flex items-center gap-1.5">
            <span class="h-2 w-2 rounded-full" :class="statusColor" />
            <span class="text-secondary text-xs">{{ statusText }}</span>
          </span>
        </div>
      </header>

      <div class="min-h-0 flex-1 overflow-auto p-5">
        <router-view v-slot="{ Component }">
          <Transition name="page" mode="out-in">
            <component :is="Component" :key="route.path" />
          </Transition>
        </router-view>
      </div>
    </main>
  </div>
</template>
