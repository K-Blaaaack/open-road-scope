<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";

import type { UpdateEventParams } from "@shared/obd";

const { t } = useI18n();

/** 构建期注入的应用版本 */
const appVersion = __APP_VERSION__;

/** 运行环境与依赖信息（从 UA 解析） */
const env = computed(() => {
  const ua = navigator.userAgent;
  return {
    electron: /Electron\/([\d.]+)/.exec(ua)?.[1] ?? "—",
    chromium: /Chrome\/([\d.]+)/.exec(ua)?.[1] ?? "—",
    node: /Node\/([\d.]+)/.exec(ua)?.[1] ?? "—",
  };
});

/* ---------- 联网检查新版本 ---------- */

/** 检查状态：空闲 / 检查中 / 有新版本 / 已是最新 / 失败 */
const updateState = ref<"idle" | "checking" | "available" | "not-available" | "error">("idle");
const updateVersion = ref("");
const updateMessage = ref("");

let unsubscribe: (() => void) | undefined;

const checkForUpdates = (): void => {
  if (!window.obd) {
    // 无原生桥接（WebView / 浏览器预览）：无更新通道，明确提示
    updateState.value = "error";
    updateMessage.value = t("about.updateUnsupported");
    return;
  }
  updateState.value = "checking";
  void window.obd
    .checkForUpdates()
    .then((res) => {
      const r = res as { ok: boolean; error?: string; result?: { version?: string } | null };
      if (!r.ok && r.error === "dev") {
        // 开发模式（未打包）无法联网检测，直接标记失败并提示
        updateState.value = "error";
        updateMessage.value = t("about.updateDevOnly");
      } else if (!r.ok) {
        updateState.value = "error";
        updateMessage.value = r.error ?? t("about.updateFail");
      }
      // 事件回调会设置 available / not-available 状态，此处无需重复处理
    })
    .catch(() => {
      updateState.value = "error";
      updateMessage.value = t("about.updateFail");
    });
};

onMounted(() => {
  if (window.obd) {
    unsubscribe = window.obd.onUpdateEvent((event: UpdateEventParams) => {
      updateState.value = event.state;
      updateVersion.value = event.version ?? "";
      updateMessage.value = event.message ?? "";
    });
  }
});

onBeforeUnmount(() => {
  unsubscribe?.();
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
        <span class="text-primary font-mono">v{{ appVersion }}</span>
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

      <!-- 联网检查新版本 -->
      <div
        class="flex items-center justify-between gap-2 border-t border-[var(--color-border)] pt-3"
      >
        <div class="min-w-0 flex-1">
          <template v-if="updateState === 'checking'">
            <span class="text-secondary text-xs">{{ t("about.updating") }}</span>
          </template>
          <template v-else-if="updateState === 'available'">
            <span class="text-xs font-semibold text-emerald-300">
              {{ t("about.updateAvailable", { version: updateVersion }) }}
            </span>
          </template>
          <template v-else-if="updateState === 'not-available'">
            <span class="text-secondary text-xs">{{ t("about.upToDate") }}</span>
          </template>
          <template v-else-if="updateState === 'error'">
            <span class="text-xs text-red-300/90">{{ updateMessage }}</span>
          </template>
        </div>
        <button
          class="border-border text-secondary hover:bg-[var(--color-hover)] rounded-lg border px-3 py-1.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="updateState === 'checking'"
          @click="checkForUpdates"
        >
          {{ t("about.checkUpdate") }}
        </button>
      </div>
    </div>
  </div>
</template>
