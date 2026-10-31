<script setup lang="ts">
/**
 * 关于页
 *
 * 结构：品牌区 → 版本信息卡 → 许可证卡 → 更新卡。
 * 版本信息与更新检查的既有逻辑（UA 解析、IPC 事件订阅、退订）保持不变，只重写呈现。
 */
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";

import type { UpdateEventParams } from "@shared/obd";
import MdBadge from "@/components/md3/MdBadge.vue";
import MdButton from "@/components/md3/MdButton.vue";
import MdCard from "@/components/md3/MdCard.vue";
import MdDivider from "@/components/md3/MdDivider.vue";
import MdListItem from "@/components/md3/MdListItem.vue";

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

/**
 * 触发一次联网版本检查
 *
 * 真正的结果（有新版 / 已最新）由 onUpdateEvent 事件回调写入，
 * 这里只处理「发起即失败」的两类情况：无桥接、开发模式/请求异常。
 * @returns 无返回值
 */
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
  <div class="md-page">
    <!-- 品牌区：图标 + 名称 + 副标题 -->
    <header class="brand">
      <span class="brand__mark">
        <span class="i-lucide-gauge brand__icon" aria-hidden="true" />
      </span>
      <div class="brand__text">
        <!-- 顶栏已有页面标题，这里只作品牌展示，用 h2 避免出现第二个 h1 -->
        <h2 class="md-headline-medium brand__name">OpenRoadScope</h2>
        <p class="md-body-medium brand__subtitle">{{ t("about.subtitle") }}</p>
      </div>
    </header>

    <!-- 版本与运行环境 -->
    <MdCard variant="elevated" padding="lg" layout="column" class="info-card">
      <MdListItem :headline="t('developer.version')">
        <template #trailing>
          <span class="info-card__value md-mono md-selectable">v{{ appVersion }}</span>
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

    <!-- 许可证 -->
    <MdCard variant="elevated" padding="lg" layout="column" class="license-card">
      <p class="md-body-medium license-card__desc">{{ t("about.desc") }}</p>
      <div class="license-card__row">
        <MdBadge tone="success" variant="tonal" label="GPL-2.0" />
        <span class="md-body-small license-card__license">{{ t("about.license") }}</span>
      </div>
      <p class="md-body-small license-card__note">{{ t("about.licenseNote") }}</p>
    </MdCard>

    <!-- 更新检查 -->
    <MdCard variant="elevated" padding="lg" layout="column" class="update-card">
      <div class="update-card__row">
        <div class="update-card__status">
          <!-- 空闲态也要有说明文字，否则卡片只剩右侧按钮，看起来像渲染缺失 -->
          <span v-if="updateState === 'idle'" class="md-body-small update-card__text">
            {{ t("about.updateIdle") }}
          </span>
          <span v-else-if="updateState === 'checking'" class="md-body-small update-card__text">
            {{ t("about.updating") }}
          </span>
          <span
            v-else-if="updateState === 'available'"
            class="md-body-small update-card__text update-card__text--success"
          >
            {{ t("about.updateAvailable", { version: updateVersion }) }}
          </span>
          <span v-else-if="updateState === 'not-available'" class="md-body-small update-card__text">
            {{ t("about.upToDate") }}
          </span>
          <span
            v-else-if="updateState === 'error'"
            class="md-body-small update-card__text update-card__text--error"
          >
            {{ updateMessage }}
          </span>
        </div>
        <div class="update-card__trailing">
          <MdBadge
            v-if="updateState === 'available'"
            tone="success"
            variant="tonal"
            :label="`v${updateVersion}`"
          />
          <MdButton
            variant="tonal"
            icon="i-lucide-refresh-cw"
            :disabled="updateState === 'checking'"
            @click="checkForUpdates"
          >
            {{ t("about.checkUpdate") }}
          </MdButton>
        </div>
      </div>
    </MdCard>
  </div>
</template>

<style scoped>
/* ---------- 品牌区 ---------- */
.brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 16px 0 8px;
  text-align: center;
}

.brand__mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 72px;
  border-radius: var(--md-sys-shape-corner-extra-large);
  background: var(--md-sys-color-primary-container);
  color: var(--md-sys-color-on-primary-container);
}

.brand__icon {
  width: 40px;
  height: 40px;
}

.brand__text {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.brand__name {
  color: var(--md-sys-color-on-surface);
}

.brand__subtitle {
  color: var(--md-sys-color-on-surface-variant);
}

/* ---------- 信息卡 ---------- */
/* 卡片已有 24 内边距，列表项再去掉自身 16 左右内边距，避免文本缩进过深 */
.info-card :deep(.md-list-item) {
  padding-left: 0;
  padding-right: 0;
}

.info-card__value {
  color: var(--md-sys-color-on-surface-variant);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---------- 许可证卡 ---------- */
.license-card__desc {
  color: var(--md-sys-color-on-surface-variant);
  margin: 0 0 12px;
}

.license-card__row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.license-card__license {
  color: var(--md-sys-color-on-surface-variant);
}

.license-card__note {
  color: var(--md-sys-color-on-surface-variant);
  /* 备注是补充说明，压一档透明度拉开层次 */
  opacity: 0.8;
  margin: 0;
}

/* ---------- 更新卡 ---------- */
.update-card__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.update-card__status {
  min-width: 0;
  flex: 1 1 auto;
}

.update-card__text {
  color: var(--md-sys-color-on-surface-variant);
}

.update-card__text--success {
  color: var(--md-sys-color-success);
}

.update-card__text--error {
  color: var(--md-sys-color-error);
}

.update-card__trailing {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
</style>
