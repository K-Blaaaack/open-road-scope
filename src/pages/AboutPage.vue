<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

/** 运行环境与依赖信息（从 UA 解析） */
const env = computed(() => {
  const ua = navigator.userAgent;
  return {
    electron: /Electron\/([\d.]+)/.exec(ua)?.[1] ?? "—",
    chromium: /Chrome\/([\d.]+)/.exec(ua)?.[1] ?? "—",
    node: /Node\/([\d.]+)/.exec(ua)?.[1] ?? "—",
  };
});
</script>

<template>
  <div class="flex h-full flex-col items-center justify-center gap-6">
    <!-- 应用标识 -->
    <div class="flex flex-col items-center gap-3">
      <span
        class="i-lucide-gauge text-[var(--color-accent)] flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]"
      />
      <div class="text-center">
        <h1 class="text-primary text-2xl font-bold tracking-wide">OpenRoadScope</h1>
        <p class="text-secondary mt-1 text-sm">{{ t("about.subtitle") }}</p>
      </div>
    </div>

    <!-- 版本与简介 -->
    <div class="glass-card flex w-full max-w-md flex-col gap-3 p-6 text-sm">
      <div class="flex justify-between">
        <span class="text-secondary">{{ t("developer.version") }}</span>
        <span class="text-primary font-mono">v0.1.0</span>
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
      <div class="mt-2 border-t border-[var(--color-border)] pt-3">
        <p class="text-secondary leading-relaxed">{{ t("about.desc") }}</p>
        <div class="mt-3 flex items-center gap-2">
          <span
            class="rounded bg-emerald-400/15 px-2 py-0.5 font-mono text-[11px] font-semibold text-emerald-300"
          >
            GPL-2.0
          </span>
          <span class="text-secondary/80 text-xs">{{ t("about.license") }}</span>
        </div>
        <p class="text-secondary/60 mt-2 text-xs leading-relaxed">{{ t("about.licenseNote") }}</p>
      </div>
    </div>
  </div>
</template>
