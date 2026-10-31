<script setup lang="ts">
/**
 * MD3 按钮（参考样式样板）
 *
 * 五种变体对应 MD3 按钮家族：filled / tonal / outlined / text / elevated。
 * 尺寸在 MD3 的 40dp 基准上补了 32dp（sm，用于密集工具栏）与 48dp（lg，用于页面主操作）。
 * 交互反馈由 `.md-state-layer`（悬停/聚焦/按下）+ `v-ripple`（按下扩散）两层构成。
 */
import { computed } from "vue";
import { vRipple } from "@/directives/ripple";

const props = withDefaults(
  defineProps<{
    /** 按钮变体 */
    variant?: "filled" | "tonal" | "outlined" | "text" | "elevated";
    /** 尺寸：sm 32dp / md 40dp / lg 48dp */
    size?: "sm" | "md" | "lg";
    /** 原生 type，表单内提交需显式指定 */
    type?: "button" | "submit" | "reset";
    /** 禁用 */
    disabled?: boolean;
    /** 前置图标类名（如 i-lucide-play） */
    icon?: string;
    /** 后置图标类名 */
    trailingIcon?: string;
    /** 撑满父容器宽度 */
    block?: boolean;
  }>(),
  {
    variant: "filled",
    size: "md",
    type: "button",
    disabled: false,
    icon: undefined,
    trailingIcon: undefined,
    block: false,
  }
);

const emit = defineEmits<{
  (e: "click", event: MouseEvent): void;
}>();

/** 变体 → 颜色角色 + 层级 */
const variantClass = computed(() => `md-btn--${props.variant}`);
/** 尺寸 → 高度与内边距 */
const sizeClass = computed(() => `md-btn--${props.size}`);

const onClick = (event: MouseEvent): void => {
  if (props.disabled) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  emit("click", event);
};
</script>

<template>
  <button
    v-ripple
    :type="type"
    class="md-btn md-state-layer"
    :class="[variantClass, sizeClass, block ? 'md-btn--block' : '']"
    :disabled="disabled"
    @click="onClick"
  >
    <span v-if="icon" :class="icon" class="md-btn__icon" aria-hidden="true" />
    <span class="md-btn__label"><slot /></span>
    <span v-if="trailingIcon" :class="trailingIcon" class="md-btn__icon" aria-hidden="true" />
  </button>
</template>

<style scoped>
.md-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid transparent;
  border-radius: var(--md-sys-shape-corner-full);
  font-family: var(--md-sys-typescale-font-family);
  font-size: var(--md-sys-typescale-label-large-size);
  line-height: var(--md-sys-typescale-label-large-line);
  font-weight: var(--md-sys-typescale-label-large-weight);
  letter-spacing: var(--md-sys-typescale-label-large-tracking);
  cursor: pointer;
  white-space: nowrap;
  transition:
    background-color var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard),
    box-shadow var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard),
    border-color var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard),
    color var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard);
}

/* ---------- 尺寸 ---------- */
.md-btn--sm {
  height: 32px;
  padding: 0 16px;
  font-size: var(--md-sys-typescale-label-medium-size);
  line-height: var(--md-sys-typescale-label-medium-line);
  font-weight: var(--md-sys-typescale-label-medium-weight);
  gap: 6px;
}

.md-btn--md {
  height: var(--md-comp-button-height);
  padding: 0 24px;
}

.md-btn--lg {
  height: var(--md-comp-button-height-lg);
  padding: 0 28px;
}

.md-btn--block {
  display: flex;
  width: 100%;
}

/* 纯文字按钮两侧留白更小，避免视觉上过度内缩 */
.md-btn--text {
  padding-left: 12px;
  padding-right: 12px;
}

/* ---------- 变体 ---------- */
.md-btn--filled {
  background: var(--md-sys-color-primary);
  color: var(--md-sys-color-on-primary);
  --md-state-layer-color: var(--md-sys-color-on-primary);
}

.md-btn--tonal {
  background: var(--md-sys-color-secondary-container);
  color: var(--md-sys-color-on-secondary-container);
  --md-state-layer-color: var(--md-sys-color-on-secondary-container);
}

.md-btn--outlined {
  background: transparent;
  border-color: var(--md-sys-color-outline);
  color: var(--md-sys-color-primary);
  --md-state-layer-color: var(--md-sys-color-primary);
}

.md-btn--text {
  background: transparent;
  color: var(--md-sys-color-primary);
  --md-state-layer-color: var(--md-sys-color-primary);
}

.md-btn--elevated {
  background: var(--md-sys-color-surface-container-low);
  color: var(--md-sys-color-primary);
  box-shadow: var(--md-sys-elevation-level1);
  --md-state-layer-color: var(--md-sys-color-primary);
}

.md-btn--elevated:hover:not(:disabled) {
  box-shadow: var(--md-sys-elevation-level2);
}

/* ---------- 图标与文字 ---------- */
.md-btn__icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.md-btn__label {
  display: inline-block;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ---------- 禁用态 ---------- */
.md-btn:disabled {
  cursor: not-allowed;
  background: color-mix(in srgb, var(--md-sys-color-on-surface) 12%, transparent);
  border-color: transparent;
  color: color-mix(in srgb, var(--md-sys-color-on-surface) 38%, transparent);
  box-shadow: none;
}

.md-btn:disabled::after {
  opacity: 0;
}
</style>
