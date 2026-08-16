<script setup lang="ts">
import { useI18n } from "vue-i18n";

import { usePrefsStore } from "@/stores/prefs";

const { t } = useI18n();
const prefs = usePrefsStore();

/** 完成引导并进入应用 */
const finish = (): void => {
  prefs.onboardingDone = true;
  prefs.persist();
};
</script>

<template>
  <!-- 首次使用引导层 -->
  <div class="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm">
    <div
      class="border-border mx-4 flex max-h-[90vh] w-full max-w-lg flex-col gap-5 overflow-auto rounded-2xl border bg-[var(--color-bg-elevated)] p-6 shadow-2xl"
    >
      <div class="flex flex-col items-center gap-2 text-center">
        <span class="i-lucide-gauge text-[var(--color-accent)] h-12 w-12" />
        <h1 class="text-primary text-xl font-bold">OpenRoadScope</h1>
        <p class="text-secondary text-sm">{{ t("onboarding.welcome") }}</p>
      </div>

      <!-- 行车安全警告（醒目） -->
      <div class="flex items-start gap-3 rounded-xl border border-red-400/50 bg-red-500/10 p-4">
        <span class="i-lucide-triangle-alert mt-0.5 h-6 w-6 shrink-0 text-red-400" />
        <div>
          <div class="text-sm font-semibold text-red-300">
            {{ t("onboarding.safetyTitle") }}
          </div>
          <p class="mt-1 text-sm leading-relaxed text-red-200/90">
            {{ t("onboarding.safetyDesc") }}
          </p>
        </div>
      </div>

      <!-- 功能简介 -->
      <div class="flex flex-col gap-3">
        <div class="flex items-start gap-3">
          <span class="i-lucide-plug mt-0.5 h-5 w-5 shrink-0 text-sky-300" />
          <div>
            <div class="text-primary text-sm font-medium">
              {{ t("onboarding.featureConnect") }}
            </div>
            <div class="text-secondary mt-0.5 text-xs leading-relaxed">
              {{ t("onboarding.featureConnectDesc") }}
            </div>
          </div>
        </div>
        <div class="flex items-start gap-3">
          <span class="i-lucide-layout-dashboard mt-0.5 h-5 w-5 shrink-0 text-sky-300" />
          <div>
            <div class="text-primary text-sm font-medium">
              {{ t("onboarding.featureDashboard") }}
            </div>
            <div class="text-secondary mt-0.5 text-xs leading-relaxed">
              {{ t("onboarding.featureDashboardDesc") }}
            </div>
          </div>
        </div>
        <div class="flex items-start gap-3">
          <span class="i-lucide-stethoscope mt-0.5 h-5 w-5 shrink-0 text-sky-300" />
          <div>
            <div class="text-primary text-sm font-medium">
              {{ t("onboarding.featureDiagnostics") }}
            </div>
            <div class="text-secondary mt-0.5 text-xs leading-relaxed">
              {{ t("onboarding.featureDiagnosticsDesc") }}
            </div>
          </div>
        </div>
      </div>

      <button
        class="w-full rounded-lg bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sky-400"
        @click="finish"
      >
        {{ t("onboarding.start") }}
      </button>
    </div>
  </div>
</template>
