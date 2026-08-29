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
  // 仅 Electron 环境存在 preload 桥接（WebView/浏览器下无 DevTools 通道）
  void window.obd?.openDevTools?.();
};
</script>

<template>
  <div class="mx-auto flex max-w-2xl flex-col gap-5">
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
      <button class="btn-primary btn-md mt-2 w-fit" @click="openDevTools">
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
      <ToggleSwitch
        v-model="prefs.showModeSelect"
        :label="t('developer.showModeSelect')"
        @toggle="prefs.persist()"
      />
    </section>
  </div>
</template>
