<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";

import { usePrefsStore } from "@/stores/prefs";

const { t } = useI18n();
const prefs = usePrefsStore();

/** 引导可见性（组件内部管理，App 层仅控制是否允许渲染） */
const visible = ref(true);
/** 是否勾选「不再显示」 */
const skipChecked = ref(false);
/** 是否展示「不再显示」二次确认 */
const confirmingSkip = ref(false);

/** 关闭本次引导（不跳过，下次启动仍显示） */
const close = (): void => {
  visible.value = false;
};

/** 点击开始：若勾选了不再显示，先弹二次确认 */
const onStart = (): void => {
  if (skipChecked.value) {
    confirmingSkip.value = true;
    return;
  }
  close();
};

/** 二次确认：勾选不再显示 */
const confirmSkip = (): void => {
  prefs.skipOnboarding = true;
  prefs.persist();
  confirmingSkip.value = false;
};
</script>

<template>
  <!-- 安全引导层：每次启动显示，勾选「不再显示」并二次确认后可跳过 -->
  <div
    v-if="visible"
    class="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm"
  >
    <div
      class="border-border mx-4 flex max-h-[90vh] w-full max-w-lg flex-col gap-5 overflow-auto rounded-2xl border bg-[var(--color-bg-elevated)] p-6 shadow-2xl"
    >
      <div class="flex flex-col items-center gap-2 text-center">
        <span class="i-lucide-gauge text-[var(--color-accent)] h-12 w-12" />
        <h1 class="text-primary text-xl font-bold">OpenRoadScope</h1>
        <p class="text-secondary text-sm">{{ t("onboarding.welcome") }}</p>
      </div>

      <!-- 行车安全警告（醒目） -->
      <div
        class="flex items-start gap-3 rounded-xl border border-[var(--color-danger-border)] bg-[var(--color-danger-soft)] p-4"
      >
        <span
          class="i-lucide-triangle-alert mt-0.5 h-6 w-6 shrink-0 text-[var(--color-danger-text)]"
        />
        <div>
          <div class="text-sm font-semibold text-[var(--color-danger-text)]">
            {{ t("onboarding.safetyTitle") }}
          </div>
          <p class="mt-1 text-sm leading-relaxed text-[var(--color-danger-text)] opacity-90">
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

      <!-- 不再显示勾选框 -->
      <label class="flex cursor-pointer items-center gap-2">
        <input
          v-model="skipChecked"
          type="checkbox"
          class="h-4 w-4 accent-[var(--color-primary)]"
        />
        <span class="text-secondary text-sm">{{ t("onboarding.dontShowAgain") }}</span>
      </label>

      <button class="btn-primary btn-lg w-full" @click="onStart">
        {{ t("onboarding.start") }}
      </button>
    </div>

    <!-- 不再显示二次确认 -->
    <Teleport to="body">
      <div v-if="confirmingSkip" class="fixed inset-0 z-[80] flex items-center justify-center">
        <div
          class="absolute inset-0 bg-black/70 backdrop-blur-sm"
          @click="confirmingSkip = false"
        />
        <div
          class="relative mx-4 w-96 max-w-[calc(100vw-32px)] rounded-xl border border-[var(--color-warning-border)] bg-[var(--color-bg-elevated)] p-6 shadow-2xl"
        >
          <div class="flex items-start gap-3">
            <span
              class="i-lucide-triangle-alert flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-warning-soft)] text-[var(--color-warning-text)]"
            />
            <div>
              <h2 class="text-primary text-base font-semibold">
                {{ t("onboarding.confirmSkipTitle") }}
              </h2>
              <p class="text-secondary mt-2 text-sm leading-relaxed">
                {{ t("onboarding.confirmSkipDesc") }}
              </p>
            </div>
          </div>
          <div class="mt-5 flex justify-end gap-2">
            <button class="btn-ghost btn-md" @click="confirmingSkip = false">
              {{ t("common.cancel") }}
            </button>
            <button class="btn-warning btn-md" @click="confirmSkip">
              {{ t("onboarding.confirmSkipAccept") }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
