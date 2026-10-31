<script setup lang="ts">
/**
 * MD3 分段按钮（单选用）
 *
 * 容器全圆角 + 1px outline，项之间只画一条分隔线（后一项的左侧内阴影），
 * 因此不会和容器描边叠成双线。选中项 secondary-container 底，没给 icon 时自动补勾选图标。
 * 每一项都是原生 <button>：Tab 可进入、Enter/Space 原生触发，不用自己写键盘逻辑。
 */
import { vRipple } from "@/directives/ripple";

const props = withDefaults(
  defineProps<{
    /** 当前选中值 */
    modelValue: string | number;
    /** 选项列表；label 由页面传入已翻译文案 */
    options: { value: string | number; label?: string; icon?: string }[];
    /** 整体禁用 */
    disabled?: boolean;
    /** 等分撑满父容器 */
    fullWidth?: boolean;
  }>(),
  {
    disabled: false,
    fullWidth: false,
  }
);

const emit = defineEmits<{
  (e: "update:modelValue", value: string | number): void;
}>();

/**
 * 判断某项是否选中
 * @param value - 选项值
 * @returns 是否等于当前 modelValue
 */
const isSelected = (value: string | number): boolean => value === props.modelValue;

/**
 * 切换选中项；点已选中项不重复派发，避免页面收到无意义的更新
 * @param value - 被点击的选项值
 */
const select = (value: string | number): void => {
  if (props.disabled || value === props.modelValue) return;
  emit("update:modelValue", value);
};
</script>

<template>
  <div
    class="md-segmented"
    :class="[fullWidth ? 'md-segmented--full' : '', disabled ? 'md-segmented--disabled' : '']"
    role="group"
  >
    <button
      v-for="option in options"
      :key="option.value"
      v-ripple
      type="button"
      class="md-segmented__item md-state-layer"
      :class="isSelected(option.value) ? 'md-segmented__item--selected' : ''"
      :disabled="disabled"
      :aria-pressed="isSelected(option.value) ? 'true' : 'false'"
      @click="select(option.value)"
    >
      <span v-if="option.icon" :class="option.icon" class="md-segmented__icon" aria-hidden="true" />
      <span
        v-else-if="isSelected(option.value)"
        class="i-lucide-check md-segmented__icon"
        aria-hidden="true"
      />
      <span v-if="option.label" class="md-segmented__label">{{ option.label }}</span>
    </button>
  </div>
</template>

<style scoped>
.md-segmented {
  display: inline-flex;
  align-items: stretch;
  max-width: 100%;
  height: var(--md-comp-button-height);
  border: 1px solid var(--md-sys-color-outline);
  border-radius: var(--md-sys-shape-corner-full);
  overflow: hidden;
  transition: border-color var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard);
}

.md-segmented--full {
  display: flex;
  width: 100%;
}

.md-segmented__item {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 0;
  padding: 0 16px;
  border: none;
  background: transparent;
  color: var(--md-sys-color-on-surface);
  --md-state-layer-color: var(--md-sys-color-on-surface);
  font-family: var(--md-sys-typescale-font-family);
  font-size: var(--md-sys-typescale-label-large-size);
  line-height: var(--md-sys-typescale-label-large-line);
  font-weight: var(--md-sys-typescale-label-large-weight);
  letter-spacing: var(--md-sys-typescale-label-large-tracking);
  cursor: pointer;
  white-space: nowrap;
  transition:
    background-color var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard),
    color var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard);
}

/* 分隔线只画在后一项左侧，且用内阴影而非 border，避免相邻两项各画一条叠成 2px */
.md-segmented__item + .md-segmented__item {
  box-shadow: inset 1px 0 0 0 var(--md-sys-color-outline);
}

.md-segmented--full .md-segmented__item {
  flex: 1 1 0;
}

.md-segmented__item--selected {
  background: var(--md-sys-color-secondary-container);
  color: var(--md-sys-color-on-secondary-container);
  --md-state-layer-color: var(--md-sys-color-on-secondary-container);
}

.md-segmented__icon {
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
}

.md-segmented__label {
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ---------- 禁用态 ---------- */
.md-segmented--disabled {
  border-color: color-mix(in srgb, var(--md-sys-color-on-surface) 12%, transparent);
}

.md-segmented__item:disabled {
  cursor: not-allowed;
  color: color-mix(in srgb, var(--md-sys-color-on-surface) 38%, transparent);
}

.md-segmented__item--selected:disabled {
  background: color-mix(in srgb, var(--md-sys-color-on-surface) 12%, transparent);
}

.md-segmented__item:disabled::after {
  opacity: 0;
}
</style>
