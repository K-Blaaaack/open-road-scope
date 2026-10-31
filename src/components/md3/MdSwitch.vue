<script setup lang="ts">
/**
 * MD3 开关
 *
 * 轨道 52×32 全圆角，手柄 24；未选中时用 transform 缩到 16（MD3 规范里的「小手柄」），
 * 选中时放大到 24 并右移 20px，位移与缩放共用 emphasized 缓动，视觉上是一次连续运动。
 * 外层按钮高 40 补齐命中区域，轨道本身保持 32，避免行高被撑开。
 */
import { vRipple } from "@/directives/ripple";

const props = withDefaults(
  defineProps<{
    /** 开关状态 */
    modelValue: boolean;
    /** 无障碍名称（视觉标签由使用方排版） */
    label?: string;
    /** 禁用：降透明度且不响应交互 */
    disabled?: boolean;
  }>(),
  {
    label: undefined,
    disabled: false,
  }
);

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "change", value: boolean): void;
}>();

/**
 * 切换状态
 *
 * 先抛新值再抛 change：外层常在 change 里做持久化或二次确认，
 * 保证它读到的 store 已经是新值。
 */
const toggle = (): void => {
  if (props.disabled) return;
  const next = !props.modelValue;
  emit("update:modelValue", next);
  emit("change", next);
};
</script>

<template>
  <button
    type="button"
    role="switch"
    class="md-switch"
    :class="modelValue ? 'md-switch--on' : ''"
    :aria-checked="modelValue"
    :aria-label="label"
    :disabled="disabled"
    @click="toggle"
  >
    <span v-ripple class="md-switch__track md-state-layer">
      <span class="md-switch__handle" />
    </span>
  </button>
</template>

<style scoped>
.md-switch {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  /* 轨道 32，靠外层 40 补足命中高度 */
  height: 40px;
  padding: 0;
  border: none;
  background: transparent;
  border-radius: var(--md-sys-shape-corner-full);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.md-switch__track {
  position: relative;
  display: block;
  flex-shrink: 0;
  width: var(--md-comp-switch-track-width);
  height: var(--md-comp-switch-track-height);
  border: 2px solid var(--md-sys-color-outline);
  border-radius: var(--md-sys-shape-corner-full);
  background: var(--md-sys-color-surface-container-highest);
  --md-state-layer-color: var(--md-sys-color-on-surface);
  transition:
    background-color var(--md-sys-motion-duration-medium2) var(--md-sys-motion-easing-emphasized),
    border-color var(--md-sys-motion-duration-medium2) var(--md-sys-motion-easing-emphasized);
}

/* 选中态：轨道填 primary，状态层换成 on-primary 才能看清 */
.md-switch--on .md-switch__track {
  background: var(--md-sys-color-primary);
  border-color: var(--md-sys-color-primary);
  --md-state-layer-color: var(--md-sys-color-on-primary);
}

.md-switch__handle {
  position: absolute;
  /* 定位基准是 padding box（已在 2px 描边之内），再让 2px 就与轨道外沿相距 4px */
  top: 50%;
  left: 2px;
  width: var(--md-comp-switch-handle);
  height: var(--md-comp-switch-handle);
  margin-top: calc(var(--md-comp-switch-handle) / -2);
  border-radius: var(--md-sys-shape-corner-full);
  background: var(--md-sys-color-outline);
  /* 未选中视觉 16 = 24 × 0.667，缩放在中心进行，圆心仍落在 16px 处 */
  transform: translateX(0) scale(0.667);
  transition:
    transform var(--md-sys-motion-duration-medium2) var(--md-sys-motion-easing-emphasized),
    background-color var(--md-sys-motion-duration-medium2) var(--md-sys-motion-easing-emphasized);
}

/* 52 - 2×4(内边距) - 24(手柄) = 20 */
.md-switch--on .md-switch__handle {
  background: var(--md-sys-color-on-primary);
  transform: translateX(20px) scale(1);
}

.md-switch:disabled {
  cursor: not-allowed;
}

.md-switch:disabled .md-switch__track {
  opacity: var(--md-sys-state-disabled-opacity);
}
</style>
