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

/** 开发者模式：连续点击 5 次触发（Toast 倒数提示），5 秒无点击重置计数 */
const devClickCount = ref(0);
const confirmingDevMode = ref(false);
let devClickTimer: number | undefined;

/** Toast 提示内容（空则不显示） */
const devToast = ref("");
let devToastTimer: number | undefined;

/** 显示 Toast 并自动消失 */
const showDevToast = (message: string): void => {
  devToast.value = message;
  window.clearTimeout(devToastTimer);
  devToastTimer = window.setTimeout(() => {
    devToast.value = "";
  }, 1800);
};

const onDevButtonClick = (): void => {
  devClickCount.value += 1;
  window.clearTimeout(devClickTimer);
  devClickTimer = window.setTimeout(() => {
    devClickCount.value = 0;
  }, 5000);
  if (devClickCount.value >= 5) {
    devClickCount.value = 0;
    confirmingDevMode.value = true;
    return;
  }
  showDevToast(t("settings.devClickHint", { n: 5 - devClickCount.value }));
};

const confirmDevMode = (): void => {
  prefs.devMode = true;
  prefs.persist();
  confirmingDevMode.value = false;
};

/** 关闭开发者模式：复位由开发者菜单控制的功能项 */
const disableDevMode = (): void => {
  prefs.devMode = false;
  prefs.showModeSelect = true;
  prefs.persist();
};
</script>

<template>
  <div class="mx-auto flex max-w-2xl flex-col gap-5">
    <section class="glass-card flex flex-col gap-4 p-5">
      <div>
        <div class="text-primary font-medium">{{ t("settings.language") }}</div>
        <div class="text-secondary mt-0.5 text-sm">{{ t("settings.languageDesc") }}</div>
      </div>
      <div class="flex gap-2">
        <button
          class="btn-ghost btn-md flex-1"
          :class="prefs.locale === 'zh-CN' ? 'btn-selected' : ''"
          @click="selectLocale('zh-CN')"
        >
          {{ t("settings.zh") }}
        </button>
        <button
          class="btn-ghost btn-md flex-1"
          :class="prefs.locale === 'en-US' ? 'btn-selected' : ''"
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
          class="btn-ghost btn-md flex-1"
          :class="prefs.theme === 'dark' ? 'btn-selected' : ''"
          @click="prefs.setTheme('dark')"
        >
          <span class="i-lucide-moon h-4 w-4" />
          {{ t("settings.dark") }}
        </button>
        <button
          class="btn-ghost btn-md flex-1"
          :class="prefs.theme === 'light' ? 'btn-selected' : ''"
          @click="prefs.setTheme('light')"
        >
          <span class="i-lucide-sun h-4 w-4" />
          {{ t("settings.light") }}
        </button>
      </div>
    </section>

    <section class="glass-card flex flex-col gap-4 p-5">
      <div>
        <div class="text-primary font-medium">{{ t("settings.behavior") }}</div>
        <div class="text-secondary mt-0.5 text-sm">{{ t("settings.behaviorDesc") }}</div>
      </div>

      <div class="flex items-center justify-between gap-4">
        <div>
          <div class="text-primary text-sm">{{ t("settings.showNavLabels") }}</div>
          <div class="text-secondary mt-0.5 text-xs">{{ t("settings.showNavLabelsDesc") }}</div>
        </div>
        <ToggleSwitch
          v-model="prefs.showNavLabels"
          :label="t('settings.showNavLabels')"
          @toggle="prefs.persist()"
        />
      </div>

      <div class="flex items-center justify-between gap-4">
        <div>
          <div class="text-primary text-sm">{{ t("settings.fitViewport") }}</div>
          <div class="text-secondary mt-0.5 text-xs">{{ t("settings.fitViewportDesc") }}</div>
        </div>
        <ToggleSwitch
          v-model="prefs.fitViewport"
          :label="t('settings.fitViewport')"
          @toggle="prefs.persist()"
        />
      </div>

      <div class="flex items-center justify-between gap-4">
        <div>
          <div class="flex items-center gap-1.5">
            <span class="text-primary text-sm">{{ t("settings.showClearDtc") }}</span>
            <span class="badge-warning">
              {{ t("settings.experimental") }}
            </span>
          </div>
          <div class="text-secondary mt-0.5 text-xs">{{ t("settings.showClearDtcDesc") }}</div>
        </div>
        <!-- 开启前需二次确认，故只读状态 + 自行处理点击 -->
        <ToggleSwitch
          :model-value="prefs.showClearDtc"
          :label="t('settings.showClearDtc')"
          @toggle="toggleShowClearDtc"
        />
      </div>

      <div class="flex items-center justify-between gap-4">
        <div>
          <div class="flex items-center gap-1.5">
            <span class="text-primary text-sm">{{ t("settings.hotReload") }}</span>
            <kbd
              class="text-secondary rounded border border-[var(--color-border)] bg-[var(--color-card)] px-1 py-0.5 font-mono text-[10px]"
            >
              F5 / Ctrl+R
            </kbd>
          </div>
          <div class="text-secondary mt-0.5 text-xs">{{ t("settings.hotReloadDesc") }}</div>
        </div>
        <button class="btn-primary btn-md shrink-0" @click="reloadUI">
          <span class="i-lucide-refresh-cw h-4 w-4" />
          {{ t("settings.reloadNow") }}
        </button>
      </div>

      <!-- 开发者模式：未开启时连击 5 次按钮；开启后变为开关 -->
      <div class="flex items-center justify-between gap-4">
        <div>
          <div class="flex items-center gap-1.5">
            <span class="text-primary text-sm">{{ t("settings.developer") }}</span>
            <span v-if="prefs.devMode" class="badge-success">
              {{ t("settings.developerActive") }}
            </span>
          </div>
          <div class="text-secondary mt-0.5 text-xs">
            {{ prefs.devMode ? t("settings.developerActive") : t("settings.developerDesc") }}
          </div>
        </div>
        <button v-if="!prefs.devMode" class="btn-ghost btn-sm shrink-0" @click="onDevButtonClick">
          {{ t("settings.developer") }}
        </button>
        <ToggleSwitch
          v-else
          :model-value="true"
          :label="t('settings.developer')"
          @toggle="disableDevMode"
        />
      </div>
    </section>

    <!-- 开发者模式开启警告弹窗 -->
    <Teleport to="body">
      <div v-if="confirmingDevMode" class="fixed inset-0 z-50 flex items-center justify-center">
        <div
          class="absolute inset-0 bg-black/60 backdrop-blur-sm"
          @click="confirmingDevMode = false"
        />
        <div
          class="relative w-96 max-w-[calc(100vw-32px)] rounded-xl border border-[var(--color-warning-border)] bg-[var(--color-bg-elevated)] p-6 shadow-2xl"
        >
          <div class="flex items-start gap-3">
            <span
              class="i-lucide-terminal flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-warning-soft)] text-[var(--color-warning-text)]"
            />
            <div>
              <h2 class="text-primary text-base font-semibold">
                {{ t("settings.developerWarningTitle") }}
              </h2>
              <p class="text-secondary mt-2 text-sm leading-relaxed">
                {{ t("settings.developerWarningDesc") }}
              </p>
            </div>
          </div>
          <div class="mt-5 flex justify-end gap-2">
            <button class="btn-ghost btn-md" @click="confirmingDevMode = false">
              {{ t("common.cancel") }}
            </button>
            <button class="btn-warning btn-md" @click="confirmDevMode">
              {{ t("settings.developerAccept") }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 实验性功能开启确认弹窗 -->
    <Teleport to="body">
      <div
        v-if="confirmingExperimental"
        class="fixed inset-0 z-50 flex items-center justify-center"
      >
        <div
          class="absolute inset-0 bg-black/60 backdrop-blur-sm"
          @click="confirmingExperimental = false"
        />
        <div
          class="relative w-96 max-w-[calc(100vw-32px)] rounded-xl border border-[var(--color-danger-border)] bg-[var(--color-bg-elevated)] p-6 shadow-2xl"
        >
          <div class="flex items-start gap-3">
            <span
              class="i-lucide-triangle-alert flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-danger-soft)] text-[var(--color-danger-text)]"
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
            <button class="btn-ghost btn-md" @click="confirmingExperimental = false">
              {{ t("common.cancel") }}
            </button>
            <button class="btn-danger btn-md" @click="confirmEnableExperimental">
              {{ t("settings.experimentalAccept") }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 开发者模式点击倒数 Toast -->
    <Teleport to="body">
      <Transition name="toast">
        <div
          v-if="devToast"
          class="border-border fixed bottom-24 left-1/2 z-[60] -translate-x-1/2 rounded-lg border bg-[var(--color-bg-elevated)] px-4 py-2 text-sm text-[var(--color-text-primary)] shadow-xl"
        >
          {{ devToast }}
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
