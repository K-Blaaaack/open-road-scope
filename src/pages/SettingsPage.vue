<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";

import { usePrefsStore, type Locale } from "@/stores/prefs";

const { t } = useI18n();
const prefs = usePrefsStore();

const selectLocale = (l: Locale): void => prefs.setLocale(l);

/** 是否展示实验性功能开启确认弹窗 */
const confirmingExperimental = ref(false);

/** 点击实验性开关：开启时先弹醒目确认 */
const toggleShowClearDtc = (): void => {
  if (!prefs.showClearDtc) {
    confirmingExperimental.value = true;
    return;
  }
  prefs.showClearDtc = false;
  prefs.persist();
};

const confirmEnableExperimental = (): void => {
  prefs.showClearDtc = true;
  prefs.persist();
  confirmingExperimental.value = false;
};

/** 立即重载界面（应对突发界面异常） */
const reloadUI = (): void => {
  void window.obd.reloadUI();
};
</script>

<template>
  <div class="mx-auto flex max-w-2xl flex-col gap-5">
    <h1 class="text-primary text-lg font-semibold">{{ t("settings.title") }}</h1>

    <section class="glass-card flex flex-col gap-4 p-5">
      <div>
        <div class="text-primary font-medium">{{ t("settings.language") }}</div>
        <div class="text-secondary mt-0.5 text-sm">{{ t("settings.languageDesc") }}</div>
      </div>
      <div class="flex gap-2">
        <button
          class="flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
          :class="
            prefs.locale === 'zh-CN'
              ? 'border-sky-400/50 bg-sky-400/10 text-sky-400'
              : 'border-[var(--color-border)] text-secondary hover:bg-[var(--color-hover)]'
          "
          @click="selectLocale('zh-CN')"
        >
          {{ t("settings.zh") }}
        </button>
        <button
          class="flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
          :class="
            prefs.locale === 'en-US'
              ? 'border-sky-400/50 bg-sky-400/10 text-sky-400'
              : 'border-[var(--color-border)] text-secondary hover:bg-[var(--color-hover)]'
          "
          @click="selectLocale('en-US')"
        >
          {{ t("settings.en") }}
        </button>
      </div>
    </section>

    <section class="glass-card flex flex-col gap-4 p-5">
      <div>
        <div class="text-primary font-medium">{{ t("settings.theme") }}</div>
        <div class="text-secondary mt-0.5 text-sm">{{ t("settings.themeDesc") }}</div>
      </div>
      <div class="flex gap-2">
        <button
          class="flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
          :class="
            prefs.theme === 'dark'
              ? 'border-sky-400/50 bg-sky-400/10 text-sky-400'
              : 'border-[var(--color-border)] text-secondary hover:bg-[var(--color-hover)]'
          "
          @click="prefs.theme !== 'dark' && prefs.toggleTheme()"
        >
          <span class="i-lucide-moon inline-block h-4 w-4 align-[-2px]" />
          {{ t("settings.dark") }}
        </button>
        <button
          class="flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
          :class="
            prefs.theme === 'light'
              ? 'border-sky-400/50 bg-sky-400/10 text-sky-400'
              : 'border-[var(--color-border)] text-secondary hover:bg-[var(--color-hover)]'
          "
          @click="prefs.theme !== 'light' && prefs.toggleTheme()"
        >
          <span class="i-lucide-sun inline-block h-4 w-4 align-[-2px]" />
          {{ t("settings.light") }}
        </button>
      </div>
    </section>

    <section class="glass-card flex flex-col gap-4 p-5">
      <div>
        <div class="text-primary font-medium">{{ t("settings.behavior") }}</div>
        <div class="text-secondary mt-0.5 text-sm">{{ t("settings.behaviorDesc") }}</div>
      </div>

      <div class="flex items-center justify-between">
        <div>
          <div class="text-primary text-sm">{{ t("settings.fitViewport") }}</div>
          <div class="text-secondary mt-0.5 text-xs">{{ t("settings.fitViewportDesc") }}</div>
        </div>
        <button
          class="relative h-6 w-11 rounded-full transition-colors"
          :class="prefs.fitViewport ? 'bg-sky-500' : 'bg-[var(--color-border)]'"
          role="switch"
          :aria-checked="prefs.fitViewport"
          @click="
            prefs.fitViewport = !prefs.fitViewport;
            prefs.persist();
          "
        >
          <span
            class="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all"
            :class="prefs.fitViewport ? 'left-[22px]' : 'left-0.5'"
          />
        </button>
      </div>

      <div class="flex items-center justify-between">
        <div>
          <div class="flex items-center gap-1.5">
            <span class="text-primary text-sm">{{ t("settings.showClearDtc") }}</span>
            <span
              class="rounded bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-300"
            >
              {{ t("settings.experimental") }}
            </span>
          </div>
          <div class="text-secondary mt-0.5 text-xs">{{ t("settings.showClearDtcDesc") }}</div>
        </div>
        <button
          class="relative h-6 w-11 rounded-full transition-colors"
          :class="prefs.showClearDtc ? 'bg-sky-500' : 'bg-[var(--color-border)]'"
          role="switch"
          :aria-checked="prefs.showClearDtc"
          @click="toggleShowClearDtc"
        >
          <span
            class="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all"
            :class="prefs.showClearDtc ? 'left-[22px]' : 'left-0.5'"
          />
        </button>
      </div>

      <div class="flex items-center justify-between">
        <div>
          <div class="flex items-center gap-1.5">
            <span class="text-primary text-sm">{{ t("settings.hotReload") }}</span>
            <kbd
              class="rounded border border-[var(--color-border)] bg-[var(--color-card)] px-1 py-0.5 font-mono text-[10px] text-secondary"
            >
              F5 / Ctrl+R
            </kbd>
          </div>
          <div class="text-secondary mt-0.5 text-xs">{{ t("settings.hotReloadDesc") }}</div>
        </div>
        <button
          class="flex items-center gap-1.5 rounded-lg bg-sky-500/90 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-500"
          @click="reloadUI"
        >
          <span class="i-lucide-refresh-cw h-4 w-4" />
          {{ t("settings.reloadNow") }}
        </button>
      </div>
    </section>
  </div>

  <!-- 实验性功能开启确认弹窗 -->
  <Teleport to="body">
    <div v-if="confirmingExperimental" class="fixed inset-0 z-50 flex items-center justify-center">
      <div
        class="absolute inset-0 bg-black/60 backdrop-blur-sm"
        @click="confirmingExperimental = false"
      />
      <div
        class="relative w-96 rounded-xl border border-red-400/50 bg-[var(--color-bg-elevated)] p-6 shadow-2xl"
      >
        <div class="flex items-start gap-3">
          <span
            class="i-lucide-triangle-alert flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/15 text-red-400"
          />
          <div>
            <h2 class="text-primary text-base font-semibold">
              {{ t("settings.experimentalTitle") }}
            </h2>
            <p class="text-secondary mt-2 text-sm leading-relaxed">
              {{ t("settings.experimentalDesc") }}
            </p>
          </div>
        </div>
        <div class="mt-5 flex justify-end gap-2">
          <button
            class="border-border text-secondary hover:bg-[var(--color-hover)] rounded-lg border px-4 py-2 text-sm"
            @click="confirmingExperimental = false"
          >
            {{ t("common.cancel") }}
          </button>
          <button
            class="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-400"
            @click="confirmEnableExperimental"
          >
            {{ t("settings.experimentalAccept") }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
