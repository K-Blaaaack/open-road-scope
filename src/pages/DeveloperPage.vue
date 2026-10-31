<script setup lang="ts">
/**
 * 开发者菜单
 *
 * 三块：应用信息（版本/平台/运行时）→ 开发者工具入口 → 连接页显示控制。
 * 业务逻辑（UA 解析、DevTools 桥接、偏好持久化）保持不变，只重写呈现。
 */
import { computed } from "vue";
import { useI18n } from "vue-i18n";

import { usePrefsStore } from "@/stores/prefs";
import MdButton from "@/components/md3/MdButton.vue";
import MdCard from "@/components/md3/MdCard.vue";
import MdDivider from "@/components/md3/MdDivider.vue";
import MdListItem from "@/components/md3/MdListItem.vue";
import MdSwitch from "@/components/md3/MdSwitch.vue";

const { t } = useI18n();
const prefs = usePrefsStore();

/**
 * 从 UA 中解析运行环境版本
 * @returns Electron / Chromium / Node 版本号，缺失时为破折号
 */
const parseUA = (): { electron: string; chromium: string; node: string } => {
  const ua = navigator.userAgent;
  const electron = /Electron\/([\d.]+)/.exec(ua)?.[1] ?? "—";
  const chromium = /Chrome\/([\d.]+)/.exec(ua)?.[1] ?? "—";
  const node = /Node\/([\d.]+)/.exec(ua)?.[1] ?? "—";
  return { electron, chromium, node };
};

const env = parseUA();

/** 构建期注入的应用版本 */
const appVersion = __APP_VERSION__;

const platform = computed(() => {
  const p = navigator.platform;
  return p || "—";
});

/**
 * 打开 Chromium DevTools
 *
 * 仅 Electron 环境存在 preload 桥接，WebView/浏览器下静默跳过。
 * @returns 无返回值
 */
const openDevTools = (): void => {
  void window.obd?.openDevTools?.();
};
</script>

<template>
  <div class="md-page">
    <!-- 一、应用信息 -->
    <MdCard variant="elevated" padding="lg" layout="column" class="info-card">
      <h2 class="md-title-medium info-card__title">{{ t("developer.appInfo") }}</h2>

      <MdListItem :headline="t('developer.version')">
        <template #trailing>
          <span class="info-card__value md-mono md-selectable">{{ appVersion }}</span>
        </template>
      </MdListItem>
      <MdDivider />
      <MdListItem :headline="t('developer.platform')">
        <template #trailing>
          <span class="info-card__value md-mono md-selectable">{{ platform }}</span>
        </template>
      </MdListItem>
      <MdDivider />
      <MdListItem :headline="t('developer.electron')">
        <template #trailing>
          <span class="info-card__value md-mono md-selectable">{{ env.electron }}</span>
        </template>
      </MdListItem>
      <MdDivider />
      <MdListItem :headline="t('developer.chromium')">
        <template #trailing>
          <span class="info-card__value md-mono md-selectable">{{ env.chromium }}</span>
        </template>
      </MdListItem>
      <MdDivider />
      <MdListItem :headline="t('developer.node')">
        <template #trailing>
          <span class="info-card__value md-mono md-selectable">{{ env.node }}</span>
        </template>
      </MdListItem>
    </MdCard>

    <!-- 二、开发者工具 -->
    <MdCard variant="elevated" padding="lg" layout="column" class="tools-card">
      <h2 class="md-title-medium tools-card__title">{{ t("developer.openDevtools") }}</h2>
      <p class="md-body-small tools-card__hint">{{ t("developer.devtoolsHint") }}</p>
      <MdButton
        variant="filled"
        icon="i-lucide-bug"
        class="tools-card__action"
        @click="openDevTools"
      >
        {{ t("developer.openDevtools") }}
      </MdButton>
    </MdCard>

    <!-- 三、连接页显示控制 -->
    <MdCard variant="elevated" padding="lg" layout="column" class="toggle-card">
      <MdListItem
        :headline="t('developer.showModeSelect')"
        :supporting="t('developer.showModeSelectDesc')"
        :lines="2"
      >
        <template #trailing>
          <MdSwitch
            v-model="prefs.showModeSelect"
            :label="t('developer.showModeSelect')"
            @change="prefs.persist()"
          />
        </template>
      </MdListItem>
    </MdCard>
  </div>
</template>

<style scoped>
/* 卡片已有 24 内边距，列表项去掉自身 16 左右内边距，避免文本缩进过深 */
.info-card :deep(.md-list-item),
.toggle-card :deep(.md-list-item) {
  padding-left: 0;
  padding-right: 0;
}

.info-card__title {
  color: var(--md-sys-color-on-surface);
  margin: 0 0 8px;
}

.info-card__value {
  color: var(--md-sys-color-on-surface-variant);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---------- 开发者工具卡 ---------- */
.tools-card__title {
  color: var(--md-sys-color-on-surface);
  margin: 0 0 4px;
}

.tools-card__hint {
  color: var(--md-sys-color-on-surface-variant);
  margin: 0 0 16px;
}

.tools-card__action {
  align-self: flex-start;
}
</style>
