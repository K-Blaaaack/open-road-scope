<script setup lang="ts">
/**
 * MD3 顶栏（Top App Bar）
 *
 * 两种规格：small 64dp 单行、medium 112dp 内容贴底（标题更大，适合页面入口区）。
 * 底色取 `surface-container` 并以 `outline-variant` 描边；开启 `elevated` 时改用层级 2
 * 表达高度，同时去掉描边——描边与阴影同时出现会让边缘发脏。
 */
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    /** 主标题 */
    title: string;
    /** 副标题（仅 medium 常用，small 下也可显示） */
    subtitle?: string;
    /** 规格：small 64dp / medium 112dp */
    variant?: "small" | "medium";
    /** 抬起：用层级 2 替代底部描边 */
    elevated?: boolean;
  }>(),
  {
    subtitle: undefined,
    variant: "small",
    elevated: false,
  }
);

/** 规格修饰类 */
const variantClass = computed(() => `md-top-app-bar--${props.variant}`);
/** 标题字号随规格变化：small 用 title-large，medium 用 headline-small */
const titleClass = computed(() =>
  props.variant === "medium" ? "md-headline-small" : "md-title-large"
);
</script>

<template>
  <header
    class="md-top-app-bar"
    :class="[variantClass, elevated ? 'md-top-app-bar--elevated' : '']"
  >
    <div v-if="$slots.leading" class="md-top-app-bar__leading">
      <slot name="leading" />
    </div>

    <div class="md-top-app-bar__content">
      <h1 class="md-top-app-bar__title" :class="titleClass" :title="title">{{ title }}</h1>
      <p v-if="subtitle" class="md-top-app-bar__subtitle md-body-small">{{ subtitle }}</p>
    </div>

    <div v-if="$slots.actions" class="md-top-app-bar__actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<style scoped>
.md-top-app-bar {
  position: relative;
  z-index: var(--md-sys-z-appbar);
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
  background: var(--md-sys-color-surface-container);
  border-bottom: 1px solid var(--md-sys-color-outline-variant);
}

/* ---------- 规格 ---------- */
.md-top-app-bar--small {
  height: var(--md-comp-top-app-bar-height);
}

/* medium：标题区靠下，顶部留出可放置大图/留白的空间 */
.md-top-app-bar--medium {
  height: 112px;
  align-items: flex-end;
  padding-bottom: 16px;
}

.md-top-app-bar--medium .md-top-app-bar__content {
  align-items: flex-start;
}

/* ---------- 抬起 ---------- */
.md-top-app-bar--elevated {
  border-bottom-color: transparent;
  box-shadow: var(--md-sys-elevation-level2);
}

/* ---------- 区块 ---------- */
.md-top-app-bar__leading,
.md-top-app-bar__actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 4px;
}

.md-top-app-bar__content {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  /* 关键：允许 flex 子项收缩，标题才能被截断而不是把顶栏撑宽 */
  min-width: 0;
}

.md-top-app-bar__title {
  min-width: 0;
  overflow: hidden;
  color: var(--md-sys-color-on-surface);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.md-top-app-bar__subtitle {
  min-width: 0;
  overflow: hidden;
  color: var(--md-sys-color-on-surface-variant);
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
