<script setup lang="ts">
/**
 * 首次启动引导层
 *
 * 每次启动显示（是否渲染由 App 依据 prefs.skipOnboarding 决定）。
 * 勾选「不再显示」后点开始会先弹 MdDialog 二次确认，确认后才写入并持久化偏好。
 */
import { onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

import MdButton from "@/components/md3/MdButton.vue";
import MdDialog from "@/components/md3/MdDialog.vue";
import MdSwitch from "@/components/md3/MdSwitch.vue";
import { usePrefsStore } from "@/stores/prefs";

const { t } = useI18n();
const prefs = usePrefsStore();

/** 引导可见性（组件内部管理，App 层仅控制是否允许渲染） */
const visible = ref(true);
/** 是否勾选「不再显示」 */
const skipChecked = ref(false);
/** 是否展示「不再显示」二次确认 */
const confirmingSkip = ref(false);

/** 打开前的 body overflow，关闭引导后恢复原值 */
let previousOverflow = "";

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

/** 引导展示期间锁住 body 滚动，避免背后页面跟着滚 */
watch(
  visible,
  (open) => {
    if (open) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return;
    }
    document.body.style.overflow = previousOverflow;
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  document.body.style.overflow = previousOverflow;
});
</script>

<template>
  <!-- 安全引导层：每次启动显示，勾选「不再显示」并二次确认后可跳过 -->
  <div v-if="visible" class="onboarding">
    <div
      class="onboarding__panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <!-- 品牌区 -->
      <div class="onboarding__brand">
        <span class="onboarding__brand-icon">
          <span class="i-lucide-gauge onboarding__brand-glyph" aria-hidden="true" />
        </span>
        <h1 id="onboarding-title" class="md-headline-medium onboarding__title">OpenRoadScope</h1>
        <p class="md-body-medium onboarding__subtitle">{{ t("onboarding.welcome") }}</p>
      </div>

      <!-- 行车安全警告（醒目） -->
      <div class="onboarding__warning">
        <span class="i-lucide-triangle-alert onboarding__warning-icon" aria-hidden="true" />
        <div class="onboarding__warning-text">
          <div class="md-title-small">{{ t("onboarding.safetyTitle") }}</div>
          <p class="md-body-small onboarding__warning-desc">{{ t("onboarding.safetyDesc") }}</p>
        </div>
      </div>

      <!-- 功能简介 -->
      <ul class="onboarding__features">
        <li class="onboarding__feature">
          <span class="onboarding__feature-icon">
            <span class="i-lucide-plug onboarding__feature-glyph" aria-hidden="true" />
          </span>
          <div class="onboarding__feature-text">
            <div class="md-title-small">{{ t("onboarding.featureConnect") }}</div>
            <p class="md-body-small onboarding__feature-desc">
              {{ t("onboarding.featureConnectDesc") }}
            </p>
          </div>
        </li>
        <li class="onboarding__feature">
          <span class="onboarding__feature-icon">
            <span class="i-lucide-layout-dashboard onboarding__feature-glyph" aria-hidden="true" />
          </span>
          <div class="onboarding__feature-text">
            <div class="md-title-small">{{ t("onboarding.featureDashboard") }}</div>
            <p class="md-body-small onboarding__feature-desc">
              {{ t("onboarding.featureDashboardDesc") }}
            </p>
          </div>
        </li>
        <li class="onboarding__feature">
          <span class="onboarding__feature-icon">
            <span class="i-lucide-stethoscope onboarding__feature-glyph" aria-hidden="true" />
          </span>
          <div class="onboarding__feature-text">
            <div class="md-title-small">{{ t("onboarding.featureDiagnostics") }}</div>
            <p class="md-body-small onboarding__feature-desc">
              {{ t("onboarding.featureDiagnosticsDesc") }}
            </p>
          </div>
        </li>
      </ul>

      <!-- 不再显示开关 -->
      <div class="onboarding__skip">
        <span class="md-body-medium">{{ t("onboarding.dontShowAgain") }}</span>
        <MdSwitch v-model="skipChecked" :label="t('onboarding.dontShowAgain')" />
      </div>

      <MdButton variant="filled" size="lg" block @click="onStart">
        {{ t("onboarding.start") }}
      </MdButton>
    </div>

    <!-- 不再显示二次确认 -->
    <MdDialog
      v-model="confirmingSkip"
      :headline="t('onboarding.confirmSkipTitle')"
      icon="i-lucide-triangle-alert"
      icon-tone="warning"
    >
      {{ t("onboarding.confirmSkipDesc") }}
      <template #actions>
        <MdButton variant="text" @click="confirmingSkip = false">
          {{ t("common.cancel") }}
        </MdButton>
        <span class="onboarding__accept">
          <MdButton variant="filled" @click="confirmSkip">
            {{ t("onboarding.confirmSkipAccept") }}
          </MdButton>
        </span>
      </template>
    </MdDialog>
  </div>
</template>

<style scoped>
.onboarding {
  position: fixed;
  inset: 0;
  z-index: 900;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: color-mix(in srgb, var(--md-sys-color-scrim) 64%, transparent);
  backdrop-filter: blur(4px);
}

.onboarding__panel {
  display: flex;
  flex-direction: column;
  gap: 24px;
  box-sizing: border-box;
  width: 100%;
  max-width: 512px;
  max-height: 90vh;
  padding: 24px;
  overflow-y: auto;
  border-radius: var(--md-sys-shape-corner-extra-large);
  background: var(--md-sys-color-surface-container-high);
  color: var(--md-sys-color-on-surface);
  box-shadow: var(--md-sys-elevation-level3);
}

/* ---------- 品牌区 ---------- */
.onboarding__brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;
}

.onboarding__brand-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: var(--md-sys-shape-corner-medium);
  background: var(--md-sys-color-primary-container);
  color: var(--md-sys-color-on-primary-container);
}

.onboarding__brand-glyph {
  width: 32px;
  height: 32px;
}

.onboarding__title {
  margin: 0;
  color: var(--md-sys-color-on-surface);
}

.onboarding__subtitle {
  margin: 0;
  color: var(--md-sys-color-on-surface-variant);
}

/* ---------- 行车安全警告 ---------- */
.onboarding__warning {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  border-radius: var(--md-sys-shape-corner-medium);
  background: var(--md-sys-color-error-container);
  color: var(--md-sys-color-on-error-container);
}

.onboarding__warning-icon {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
}

.onboarding__warning-text {
  min-width: 0;
}

.onboarding__warning-desc {
  margin: 4px 0 0;
}

/* ---------- 功能说明 ---------- */
.onboarding__features {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.onboarding__feature {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.onboarding__feature-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border-radius: var(--md-sys-shape-corner-medium);
  background: var(--md-sys-color-secondary-container);
  color: var(--md-sys-color-on-secondary-container);
}

.onboarding__feature-glyph {
  width: 20px;
  height: 20px;
}

.onboarding__feature-text {
  min-width: 0;
}

.onboarding__feature-desc {
  margin: 2px 0 0;
  color: var(--md-sys-color-on-surface-variant);
}

/* ---------- 不再显示 ---------- */
.onboarding__skip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  color: var(--md-sys-color-on-surface);
}

/* 破坏性操作确认按钮改用 warning 语义色，仍由 MdButton 承担形状与状态层 */
.onboarding__accept :deep(.md-btn) {
  background: var(--md-sys-color-warning);
  color: var(--md-sys-color-on-warning);
  --md-state-layer-color: var(--md-sys-color-on-warning);
}
</style>
