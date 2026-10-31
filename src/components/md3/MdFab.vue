<script setup lang="ts">
/**
 * MD3 悬浮操作按钮（FAB）
 *
 * 三种尺寸：md 56dp / sm 40dp / lg 96dp；扩展态固定 56 高、左右 20、圆角 16。
 * 层级默认 level3，悬停升到 level4 —— MD3 用「抬起」表达可点击，不再叠加状态层之外的动效。
 * 配色变体按 MD3 的 FAB 角色：primary / secondary-container / tertiary-container / surface-container-high。
 */
import { computed } from "vue";
import { vRipple } from "@/directives/ripple";

const props = withDefaults(
  defineProps<{
    /** 图标类名（如 i-lucide-play） */
    icon?: string;
    /** 无障碍名；扩展态同时可作插槽兜底文案 */
    label?: string;
    /** 配色变体 */
    variant?: "primary" | "secondary" | "tertiary" | "surface";
    /** 尺寸：sm 40dp / md 56dp / lg 96dp */
    size?: "sm" | "md" | "lg";
    /** 扩展态：图标 + label-large 文字 */
    extended?: boolean;
    /** 禁用 */
    disabled?: boolean;
  }>(),
  {
    icon: undefined,
    label: undefined,
    variant: "primary",
    size: "md",
    extended: false,
    disabled: false,
  }
);

const emit = defineEmits<{
  (e: "click", event: MouseEvent): void;
}>();

const variantClass = computed(() => `md-fab--${props.variant}`);
const sizeClass = computed(() => `md-fab--${props.size}`);

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
    type="button"
    class="md-fab md-state-layer"
    :class="[variantClass, sizeClass, extended ? 'md-fab--extended' : '']"
    :disabled="disabled"
    :aria-label="label"
    @click="onClick"
  >
    <span v-if="icon" :class="icon" class="md-fab__icon" aria-hidden="true" />
    <span v-if="extended" class="md-fab__label"
      ><slot>{{ label }}</slot></span
    >
  </button>
</template>

<style scoped>
.md-fab {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  padding: 0;
  border: none;
  background: var(--md-sys-color-primary);
  color: var(--md-sys-color-on-primary);
  --md-state-layer-color: var(--md-sys-color-on-primary);
  font-family: var(--md-sys-typescale-font-family);
  font-size: var(--md-sys-typescale-label-large-size);
  line-height: var(--md-sys-typescale-label-large-line);
  font-weight: var(--md-sys-typescale-label-large-weight);
  letter-spacing: var(--md-sys-typescale-label-large-tracking);
  cursor: pointer;
  white-space: nowrap;
  box-shadow: var(--md-sys-elevation-level3);
  transition:
    background-color var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard),
    color var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard),
    box-shadow var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard);
}

.md-fab:hover:not(:disabled) {
  box-shadow: var(--md-sys-elevation-level4);
}

/* ---------- 尺寸 ---------- */
.md-fab--md {
  width: var(--md-comp-fab-size);
  height: var(--md-comp-fab-size);
  border-radius: var(--md-sys-shape-corner-large);
}

.md-fab--sm {
  width: var(--md-comp-fab-size-sm);
  height: var(--md-comp-fab-size-sm);
  border-radius: var(--md-sys-shape-corner-medium);
}

.md-fab--lg {
  width: var(--md-comp-fab-size-lg);
  height: var(--md-comp-fab-size-lg);
  border-radius: var(--md-sys-shape-corner-extra-large);
}

/* 扩展态尺寸固定，放在尺寸规则之后以便覆盖 lg 的 96dp */
.md-fab--extended {
  width: auto;
  min-width: var(--md-comp-fab-size);
  height: var(--md-comp-fab-size);
  padding: 0 20px;
  border-radius: var(--md-sys-shape-corner-large);
  gap: 12px;
}

.md-fab__icon {
  width: 24px;
  height: 24px;
  flex: 0 0 auto;
}

.md-fab--lg .md-fab__icon {
  width: 36px;
  height: 36px;
}

.md-fab--extended .md-fab__icon {
  width: 24px;
  height: 24px;
}

.md-fab__label {
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ---------- 变体 ---------- */
.md-fab--primary {
  background: var(--md-sys-color-primary);
  color: var(--md-sys-color-on-primary);
  --md-state-layer-color: var(--md-sys-color-on-primary);
}

.md-fab--secondary {
  background: var(--md-sys-color-secondary-container);
  color: var(--md-sys-color-on-secondary-container);
  --md-state-layer-color: var(--md-sys-color-on-secondary-container);
}

.md-fab--tertiary {
  background: var(--md-sys-color-tertiary-container);
  color: var(--md-sys-color-on-tertiary-container);
  --md-state-layer-color: var(--md-sys-color-on-tertiary-container);
}

.md-fab--surface {
  background: var(--md-sys-color-surface-container-high);
  color: var(--md-sys-color-primary);
  --md-state-layer-color: var(--md-sys-color-primary);
}

/* ---------- 禁用态 ---------- */
.md-fab:disabled {
  cursor: not-allowed;
  background: color-mix(in srgb, var(--md-sys-color-on-surface) 12%, transparent);
  color: color-mix(in srgb, var(--md-sys-color-on-surface) 38%, transparent);
  box-shadow: none;
}

.md-fab:disabled::after {
  opacity: 0;
}
</style>
