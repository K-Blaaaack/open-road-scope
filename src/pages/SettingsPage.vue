<script setup lang="ts">
/**
 * 设置页（MD3）
 *
 * 四张卡片：外观 / 数据读取 / 行为 / 高级。业务逻辑与旧版一致：
 * 语言与主题即时生效、读取间隔拖动只改草稿松手才提交、实验特性与开发者模式均需二次确认、
 * 开发者模式需连点 5 次（5 秒无点击重置计数）。呈现层只消费 MD3 组件与设计令牌。
 */
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

import { useSnackbar } from "@/composables/useSnackbar";
import { usePrefsStore, type Locale } from "@/stores/prefs";
import {
  READ_INTERVAL_DEFAULT,
  READ_INTERVAL_MAX,
  READ_INTERVAL_MIN,
  READ_INTERVAL_PRESETS,
  READ_INTERVAL_STEP,
} from "@shared/obd";

const { t } = useI18n();
const prefs = usePrefsStore();
const snackbar = useSnackbar();

/**
 * 切换界面语言
 * @param l - 目标语言
 */
const selectLocale = (l: Locale): void => prefs.setLocale(l);

/** 语言分段按钮选项（label 随语言切换重算） */
const localeOptions = computed(() => [
  { value: "zh-CN", label: t("settings.zh") },
  { value: "en-US", label: t("settings.en") },
]);

/** 主题分段按钮选项 */
const themeOptions = computed(() => [
  { value: "dark", label: t("settings.dark"), icon: "i-lucide-moon" },
  { value: "light", label: t("settings.light"), icon: "i-lucide-sun" },
]);

/**
 * 分段按钮回传值是 string | number，这里收窄后交给 store
 * @param value - 被选中的选项值
 */
const onLocaleSelect = (value: string | number): void => {
  if (value === "zh-CN" || value === "en-US") selectLocale(value);
};

/**
 * 主题分段按钮回调
 * @param value - 被选中的选项值
 */
const onThemeSelect = (value: string | number): void => {
  if (value === "dark" || value === "light") prefs.setTheme(value);
};

/** 滑块本地草稿：拖动只更新它，松手才提交，避免拖动过程频繁落盘 */
const intervalDraft = ref<number>(prefs.readInterval);

/** 外部（store 夹取、恢复）改变间隔时同步草稿，防止回显不同步 */
watch(
  () => prefs.readInterval,
  (value: number) => {
    intervalDraft.value = value;
  }
);

/**
 * 滑块拖动中：仅更新本地草稿
 * @param value - 滑块当前值（ms）
 */
const onIntervalInput = (value: number): void => {
  intervalDraft.value = value;
};

/**
 * 滑块松手（或键盘提交）：草稿交由 store 夹取并对齐步进
 * @param value - 滑块提交值（ms）
 */
const onIntervalChange = (value: number): void => {
  intervalDraft.value = value;
  prefs.setReadInterval(intervalDraft.value);
};

/**
 * 档位徽片文案：默认档追加「默认」标注
 * @param preset - 档位间隔（ms）
 * @returns 展示用文案
 */
const chipLabel = (preset: number): string => {
  const base = `${preset} ${t("common.ms")}`;
  return preset === READ_INTERVAL_DEFAULT ? `${base} · ${t("settings.defaultValue")}` : base;
};

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

/** 确认开启实验特性 */
const confirmEnableExperimental = (): void => {
  prefs.showClearDtc = true;
  prefs.persist();
  confirmingExperimental.value = false;
};

/** 立即重载界面（应对突发界面异常） */
const reloadUI = (): void => {
  void window.obd.reloadUI();
};

/** 开发者模式：连续点击 5 次触发（提示条倒数），5 秒无点击重置计数 */
const devClickCount = ref(0);
const confirmingDevMode = ref(false);
let devClickTimer: number | undefined;

/** 开发者模式入口点击：计数 + 5 秒超时重置，满 5 次弹确认 */
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
  snackbar.show(t("settings.devClickHint", { n: 5 - devClickCount.value }));
};

/** 确认开启开发者模式 */
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
  <div class="md-page">
    <!-- 一、外观 -->
    <MdCard variant="elevated" padding="lg" layout="column" class="settings-card">
      <h2 class="md-title-large section-title">{{ t("settings.appearance") }}</h2>

      <MdListItem
        :headline="t('settings.language')"
        :supporting="t('settings.languageDesc')"
        :lines="2"
      />
      <MdSegmentedButton
        :model-value="prefs.locale"
        :options="localeOptions"
        :aria-label="t('settings.language')"
        full-width
        @update:model-value="onLocaleSelect"
      />

      <MdDivider />

      <MdListItem
        :headline="t('settings.theme')"
        :supporting="t('settings.themeDesc')"
        :lines="2"
      />
      <MdSegmentedButton
        :model-value="prefs.theme"
        :options="themeOptions"
        :aria-label="t('settings.theme')"
        full-width
        @update:model-value="onThemeSelect"
      />
    </MdCard>

    <!-- 二、数据读取 -->
    <MdCard variant="elevated" padding="lg" layout="column" class="settings-card">
      <h2 class="md-title-large section-title">{{ t("settings.data") }}</h2>
      <p class="md-body-small section-desc">{{ t("settings.dataDesc") }}</p>

      <div class="interval">
        <div class="interval__head">
          <label class="md-body-large interval__label" for="read-interval">
            {{ t("settings.readInterval") }}
          </label>
          <span class="md-mono interval__value">{{ intervalDraft }} {{ t("common.ms") }}</span>
        </div>
        <MdSlider
          id="read-interval"
          :model-value="intervalDraft"
          :min="READ_INTERVAL_MIN"
          :max="READ_INTERVAL_MAX"
          :step="READ_INTERVAL_STEP"
          :label="t('settings.readInterval')"
          :value-text="`${intervalDraft} ${t('common.ms')}`"
          aria-describedby="read-interval-hint"
          @update:model-value="onIntervalInput"
          @change="onIntervalChange"
        />
        <div class="interval__scale md-body-small">
          <span>{{ READ_INTERVAL_MIN }} {{ t("common.ms") }}</span>
          <span>{{ READ_INTERVAL_MAX }} {{ t("common.ms") }}</span>
        </div>
      </div>

      <!-- 档位：与滑块同一套网格，点击即提交 -->
      <div class="presets" role="group" :aria-label="t('settings.readInterval')">
        <MdChip
          v-for="preset in READ_INTERVAL_PRESETS"
          :key="preset"
          variant="filter"
          :selected="prefs.readInterval === preset"
          :label="chipLabel(preset)"
          @click="prefs.setReadInterval(preset)"
        />
      </div>

      <p id="read-interval-hint" class="md-body-small section-desc">
        {{
          t("settings.readIntervalHint", {
            min: READ_INTERVAL_MIN,
            max: READ_INTERVAL_MAX,
            step: READ_INTERVAL_STEP,
            def: READ_INTERVAL_DEFAULT,
          })
        }}
      </p>
    </MdCard>

    <!-- 三、行为 -->
    <MdCard variant="elevated" padding="lg" layout="column" class="settings-card">
      <h2 class="md-title-large section-title">{{ t("settings.behavior") }}</h2>
      <p class="md-body-small section-desc">{{ t("settings.behaviorDesc") }}</p>

      <div class="row">
        <div class="row__text">
          <span class="md-body-large row__headline">{{ t("settings.showNavLabels") }}</span>
          <span class="md-body-medium row__supporting">{{ t("settings.showNavLabelsDesc") }}</span>
        </div>
        <div class="row__trailing">
          <MdSwitch
            v-model="prefs.showNavLabels"
            :label="t('settings.showNavLabels')"
            @change="prefs.persist()"
          />
        </div>
      </div>

      <MdDivider />

      <div class="row">
        <div class="row__text">
          <span class="md-body-large row__headline">{{ t("settings.fitViewport") }}</span>
          <span class="md-body-medium row__supporting">{{ t("settings.fitViewportDesc") }}</span>
        </div>
        <div class="row__trailing">
          <MdSwitch
            v-model="prefs.fitViewport"
            :label="t('settings.fitViewport')"
            @change="prefs.persist()"
          />
        </div>
      </div>

      <MdDivider />

      <div class="row">
        <div class="row__text">
          <div class="row__headline-line">
            <span class="md-body-large row__headline">{{ t("settings.showClearDtc") }}</span>
            <MdBadge tone="warning" :label="t('settings.experimental')" />
          </div>
          <span class="md-body-medium row__supporting">{{ t("settings.showClearDtcDesc") }}</span>
        </div>
        <div class="row__trailing">
          <!-- 开启前需二次确认，故只回显状态 + 自行处理 change -->
          <MdSwitch
            :model-value="prefs.showClearDtc"
            :label="t('settings.showClearDtc')"
            @change="toggleShowClearDtc"
          />
        </div>
      </div>
    </MdCard>

    <!-- 四、高级 -->
    <MdCard variant="elevated" padding="lg" layout="column" class="settings-card">
      <h2 class="md-title-large section-title">{{ t("settings.advanced") }}</h2>

      <div class="row">
        <div class="row__text">
          <div class="row__headline-line">
            <span class="md-body-large row__headline">{{ t("settings.hotReload") }}</span>
            <kbd class="md-mono kbd">F5 / Ctrl+R</kbd>
          </div>
          <span class="md-body-medium row__supporting">{{ t("settings.hotReloadDesc") }}</span>
        </div>
        <div class="row__trailing">
          <MdButton variant="filled" icon="i-lucide-refresh-cw" @click="reloadUI">
            {{ t("settings.reloadNow") }}
          </MdButton>
        </div>
      </div>

      <MdDivider />

      <div class="row">
        <div class="row__text">
          <div class="row__headline-line">
            <span class="md-body-large row__headline">{{ t("settings.developer") }}</span>
            <MdBadge v-if="prefs.devMode" tone="success" :label="t('settings.developerActive')" />
          </div>
          <span class="md-body-medium row__supporting">
            {{ prefs.devMode ? t("settings.developerActive") : t("settings.developerDesc") }}
          </span>
        </div>
        <div class="row__trailing">
          <!-- 未开启：连点 5 次进入；已开启：开关关闭即复位相关功能项 -->
          <MdButton v-if="!prefs.devMode" variant="tonal" @click="onDevButtonClick">
            {{ t("settings.developer") }}
          </MdButton>
          <MdSwitch
            v-else
            :model-value="true"
            :label="t('settings.developer')"
            @change="disableDevMode"
          />
        </div>
      </div>
    </MdCard>

    <!-- 开发者模式开启警告 -->
    <MdDialog
      v-model="confirmingDevMode"
      icon="i-lucide-terminal"
      icon-tone="warning"
      :headline="t('settings.developerWarningTitle')"
    >
      <p class="dialog-text">{{ t("settings.developerWarningDesc") }}</p>
      <template #actions>
        <div class="dialog-actions">
          <MdButton variant="text" @click="confirmingDevMode = false">
            {{ t("common.cancel") }}
          </MdButton>
          <MdButton variant="filled" class="confirm-warning" @click="confirmDevMode">
            {{ t("settings.developerAccept") }}
          </MdButton>
        </div>
      </template>
    </MdDialog>

    <!-- 实验特性开启确认 -->
    <MdDialog
      v-model="confirmingExperimental"
      icon="i-lucide-triangle-alert"
      icon-tone="error"
      :headline="t('settings.experimentalTitle')"
    >
      <p class="dialog-text">{{ t("settings.experimentalDesc") }}</p>
      <template #actions>
        <div class="dialog-actions">
          <MdButton variant="text" @click="confirmingExperimental = false">
            {{ t("common.cancel") }}
          </MdButton>
          <MdButton variant="filled" class="confirm-danger" @click="confirmEnableExperimental">
            {{ t("settings.experimentalAccept") }}
          </MdButton>
        </div>
      </template>
    </MdDialog>
  </div>
</template>

<style scoped>
/* 卡片内部纵向节奏：标题 → 说明 → 控件，统一 12dp */
.settings-card {
  gap: 12px;
}

.section-title {
  margin: 0;
  color: var(--md-sys-color-on-surface);
}

.section-desc {
  margin: 0;
  color: var(--md-sys-color-on-surface-variant);
}

/* 卡片内列表项与标题左对齐：去掉列表项自带的 16dp 内缩 */
.settings-card :deep(.md-list-item) {
  padding-left: 0;
  padding-right: 0;
}

/* ---------- 数据读取 ---------- */
.interval {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.interval__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
}

.interval__label {
  color: var(--md-sys-color-on-surface);
}

.interval__value {
  color: var(--md-sys-color-primary);
  font-size: var(--md-sys-typescale-body-medium-size);
}

.interval__scale {
  display: flex;
  justify-content: space-between;
  color: var(--md-sys-color-on-surface-variant);
}

.presets {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

/* ---------- 设置行（行为 / 高级） ---------- */
.row {
  display: flex;
  align-items: center;
  gap: 16px;
  min-height: 56px;
  box-sizing: border-box;
}

.row__text {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.row__headline-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.row__headline {
  color: var(--md-sys-color-on-surface);
}

.row__supporting {
  color: var(--md-sys-color-on-surface-variant);
}

.row__trailing {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 8px;
}

/* 快捷键提示：等宽字体 + 低层级容器底，避免被误读为按钮 */
.kbd {
  padding: 2px 6px;
  border-radius: var(--md-sys-shape-corner-extra-small);
  background: var(--md-sys-color-surface-container-highest);
  color: var(--md-sys-color-on-surface-variant);
  font-size: var(--md-sys-typescale-label-small-size);
  line-height: var(--md-sys-typescale-label-small-line);
}

/* ---------- 对话框 ---------- */
.dialog-text {
  margin: 0;
  color: var(--md-sys-color-on-surface-variant);
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

/* 局部覆盖填充色：warning / error 语义的确认按钮（设计规范允许页面内覆盖） */
button.confirm-warning {
  background: var(--md-sys-color-warning);
  color: var(--md-sys-color-on-warning);
  --md-state-layer-color: var(--md-sys-color-on-warning);
}

button.confirm-danger {
  background: var(--md-sys-color-error);
  color: var(--md-sys-color-on-error);
  --md-state-layer-color: var(--md-sys-color-on-error);
}
</style>
