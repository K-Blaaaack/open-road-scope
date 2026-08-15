<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";

import { usePrefsStore } from "@/stores/prefs";

const { t } = useI18n();
const prefs = usePrefsStore();

/** 从 UA 中解析运行环境版本 */
const parseUA = (): { electron: string; chromium: string; node: string } => {
  const ua = navigator.userAgent;
  const electron = /Electron\/([\d.]+)/.exec(ua)?.[1] ?? "—";
  const chromium = /Chrome\/([\d.]+)/.exec(ua)?.[1] ?? "—";
  const node = /Node\/([\d.]+)/.exec(ua)?.[1] ?? "—";
  return { electron, chromium, node };
};

const env = parseUA();

const appVersion = __APP_VERSION__;

const platform = computed(() => {
  const p = navigator.platform;
  return p || "—";
});

const openDevTools = (): void => {
  void window.obd.openDevTools();
};
</script>

<template>
  <div class="mx-auto flex max-w-2xl flex-col gap-5">
    <h1 class="text-primary text-lg font-semibold">{{ t("developer.title") }}</h1>

    <section class="glass-card flex flex-col gap-3 p-5 text-sm">
      <div class="text-primary font-medium">{{ t("developer.appInfo") }}</div>
      <div class="flex justify-between">
        <span class="text-secondary">{{ t("developer.version") }}</span>
        <span class="text-primary font-mono">{{ appVersion }}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-secondary">{{ t("developer.platform") }}</span>
        <span class="text-primary font-mono">{{ platform }}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-secondary">{{ t("developer.electron") }}</span>
        <span class="text-primary font-mono">{{ env.electron }}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-secondary">{{ t("developer.chromium") }}</span>
        <span class="text-primary font-mono">{{ env.chromium }}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-secondary">{{ t("developer.node") }}</span>
        <span class="text-primary font-mono">{{ env.node }}</span>
      </div>
    </section>

    <section class="glass-card flex flex-col gap-2 p-5">
      <div class="text-primary font-medium">{{ t("developer.openDevtools") }}</div>
      <div class="text-secondary text-sm">{{ t("developer.devtoolsHint") }}</div>
      <button
        class="mt-2 flex w-fit items-center gap-2 rounded-lg bg-sky-500/90 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-500"
        @click="openDevTools"
      >
        <span class="i-lucide-bug h-4 w-4" />
        {{ t("developer.openDevtools") }}
      </button>
    </section>

    <!-- 连接页模式选择显示控制 -->
    <section class="glass-card flex items-center justify-between p-5">
      <div>
        <div class="text-primary text-sm">{{ t("developer.showModeSelect") }}</div>
        <div class="text-secondary mt-0.5 text-xs">{{ t("developer.showModeSelectDesc") }}</div>
      </div>
      <button
        class="relative h-6 w-11 rounded-full transition-colors"
        :class="prefs.showModeSelect ? 'bg-sky-500' : 'bg-[var(--color-border)]'"
        role="switch"
        :aria-checked="prefs.showModeSelect"
        @click="
          prefs.showModeSelect = !prefs.showModeSelect;
          prefs.persist();
        "
      >
        <span
          class="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all"
          :class="prefs.showModeSelect ? 'left-[22px]' : 'left-0.5'"
        />
      </button>
    </section>
  </div>
</template>
