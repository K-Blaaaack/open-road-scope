<script setup lang="ts">
/**
 * MD3 卡片
 *
 * 三种变体：elevated（表面 + 层级 1）、filled（surface-container-highest）、outlined（表面 + 描边）。
 * 卡片本身不承担点击行为，可交互卡片由使用方叠加 .md-state-layer 与 v-ripple。
 */
withDefaults(
  defineProps<{
    /** 卡片变体 */
    variant?: "elevated" | "filled" | "outlined";
    /** 内边距：none 由内容自行控制（图表、网格卡片常用） */
    padding?: "none" | "sm" | "md" | "lg";
    /** 内容纵向排布 */
    layout?: "block" | "column";
    /** 圆角档位 */
    shape?: "medium" | "large" | "extra-large";
    /** 可交互（悬停态层） */
    interactive?: boolean;
  }>(),
  {
    variant: "elevated",
    padding: "md",
    layout: "block",
    shape: "medium",
    interactive: false,
  }
);
</script>

<template>
  <div
    class="md-card"
    :class="[
      `md-card--${variant}`,
      `md-card--pad-${padding}`,
      `md-card--shape-${shape}`,
      layout === 'column' ? 'md-card--column' : '',
      interactive ? 'md-state-layer' : '',
    ]"
  >
    <slot />
  </div>
</template>

<style scoped>
.md-card {
  position: relative;
  background: var(--md-sys-color-surface-container-low);
  color: var(--md-sys-color-on-surface);
  border-radius: var(--md-sys-shape-corner-medium);
  overflow: hidden;
}

.md-card--column {
  display: flex;
  flex-direction: column;
}

/* ---------- 变体 ---------- */
.md-card--elevated {
  background: var(--md-sys-color-surface-container-low);
  box-shadow: var(--md-sys-elevation-level1);
}

.md-card--filled {
  background: var(--md-sys-color-surface-container-highest);
}

.md-card--outlined {
  background: var(--md-sys-color-surface);
  border: 1px solid var(--md-sys-color-outline-variant);
}

/* ---------- 内边距 ---------- */
.md-card--pad-none {
  padding: 0;
}

.md-card--pad-sm {
  padding: 8px;
}

.md-card--pad-md {
  padding: 16px;
}

.md-card--pad-lg {
  padding: 24px;
}

/* ---------- 形状 ---------- */
.md-card--shape-medium {
  border-radius: var(--md-sys-shape-corner-medium);
}

.md-card--shape-large {
  border-radius: var(--md-sys-shape-corner-large);
}

.md-card--shape-extra-large {
  border-radius: var(--md-sys-shape-corner-extra-large);
}
</style>
