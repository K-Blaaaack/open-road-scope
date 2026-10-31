<script setup lang="ts">
/**
 * MD3 选择框
 *
 * 外观与 MdTextField 的 outlined 完全对齐（同一套 fieldset + legend 缺口、56 高、1px → 2px 描边），
 * 内部盖一个 opacity: 0 的原生 <select>：可访问性、键盘操作、移动端原生选择器全都白拿，
 * 视觉层只负责展示当前选项文字与右侧箭头。
 */
import { computed, useId } from "vue";

/** 选项结构 */
interface MdSelectOption {
  /** 选项值 */
  value: string;
  /** 选项显示文字 */
  label: string;
}

const props = withDefaults(
  defineProps<{
    /** 当前选中值 */
    modelValue: string;
    /** 标签，同时作为无障碍名称 */
    label?: string;
    /** 选项列表 */
    options: MdSelectOption[];
    /** 辅助说明 */
    supportingText?: string;
    /** 禁用 */
    disabled?: boolean;
  }>(),
  {
    label: undefined,
    supportingText: undefined,
    disabled: false,
  }
);

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
}>();

/** 当前选中项的文字；找不到匹配项时留空，由占位样式兜住 */
const selectedLabel = computed(
  () => props.options.find((option) => option.value === props.modelValue)?.label ?? ""
);

/** 辅助说明的 id，供 aria-describedby 关联 */
const supportId = `md-select-support-${useId()}`;

/**
 * 原生 change 后抛值
 * @param event - 原生 change 事件
 */
const onChange = (event: Event): void => {
  emit("update:modelValue", (event.target as HTMLSelectElement).value);
};
</script>

<template>
  <div class="md-select" :class="{ 'md-select--disabled': disabled }">
    <div class="md-select__box">
      <span class="md-select__value" :class="{ 'md-select__value--empty': !selectedLabel }">
        {{ selectedLabel }}
      </span>
      <span class="md-select__arrow i-lucide-chevron-down" aria-hidden="true" />
      <!-- 透明覆盖层：保留原生选择器、键盘与读屏能力 -->
      <select
        class="md-select__native"
        :value="modelValue"
        :disabled="disabled"
        :aria-label="label"
        :aria-describedby="supportingText ? supportId : undefined"
        @change="onChange"
      >
        <option v-for="option in options" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
      <fieldset class="md-select__outline" aria-hidden="true">
        <legend v-if="label" class="md-select__legend">
          <span class="md-select__legend-text">{{ label }}</span>
        </legend>
      </fieldset>
    </div>
    <p v-if="supportingText" :id="supportId" class="md-select__support">
      {{ supportingText }}
    </p>
  </div>
</template>

<style scoped>
.md-select {
  display: flex;
  flex-direction: column;
  gap: 4px;
  /* 与 MdTextField 一致：预留 legend 浮出描边的上半截 */
  padding-top: 8px;
}

.md-select__box {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 56px;
  /* 右侧留出箭头的位置，避免长选项文字压到图标上 */
  padding: 0 40px 0 16px;
  border-radius: var(--md-sys-shape-corner-extra-small);
}

/* ---------- 描边与缺口（同 MdTextField） ---------- */
.md-select__outline {
  position: absolute;
  inset: 0;
  margin: 0;
  padding: 0 12px;
  min-width: 0;
  border: 1px solid var(--md-sys-color-outline);
  border-radius: var(--md-sys-shape-corner-extra-small);
  pointer-events: none;
  transition:
    border-color var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard),
    border-width var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
}

.md-select__legend {
  padding: 0 4px;
  max-width: 100%;
  font-family: var(--md-sys-typescale-font-family);
  font-size: var(--md-sys-typescale-body-small-size);
  line-height: var(--md-sys-typescale-body-small-line);
  font-weight: var(--md-sys-typescale-body-small-weight);
  letter-spacing: var(--md-sys-typescale-body-small-tracking);
  color: var(--md-sys-color-on-surface-variant);
  white-space: nowrap;
  transition: color var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
}

.md-select__legend-text {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: bottom;
}

/* ---------- 显示层 ---------- */
.md-select__value {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  color: var(--md-sys-color-on-surface);
  font-family: var(--md-sys-typescale-font-family);
  font-size: var(--md-sys-typescale-body-large-size);
  line-height: var(--md-sys-typescale-body-large-line);
  font-weight: var(--md-sys-typescale-body-large-weight);
  letter-spacing: var(--md-sys-typescale-body-large-tracking);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.md-select__value--empty {
  color: var(--md-sys-color-on-surface-variant);
}

.md-select__arrow {
  position: absolute;
  right: 16px;
  width: 20px;
  height: 20px;
  color: var(--md-sys-color-on-surface-variant);
  pointer-events: none;
}

/* ---------- 原生 select 覆盖层 ---------- */
.md-select__native {
  position: absolute;
  inset: 0;
  z-index: 1;
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  border: none;
  border-radius: var(--md-sys-shape-corner-extra-small);
  background: transparent;
  /* 完全透明，但仍在命中层里接收点击与键盘操作 */
  opacity: 0;
  cursor: pointer;
  -webkit-appearance: none;
  appearance: none;
}

/* ---------- 聚焦（含原生 select 被 Tab 聚焦） ---------- */
.md-select:focus-within .md-select__outline {
  border-width: 2px;
  border-color: var(--md-sys-color-primary);
}

.md-select:focus-within .md-select__legend {
  color: var(--md-sys-color-primary);
}

.md-select:focus-within .md-select__arrow {
  color: var(--md-sys-color-primary);
}

/* ---------- 辅助说明 ---------- */
.md-select__support {
  margin: 0;
  padding: 0 16px;
  font-family: var(--md-sys-typescale-font-family);
  font-size: var(--md-sys-typescale-body-small-size);
  line-height: var(--md-sys-typescale-body-small-line);
  font-weight: var(--md-sys-typescale-body-small-weight);
  letter-spacing: var(--md-sys-typescale-body-small-tracking);
  color: var(--md-sys-color-on-surface-variant);
}

/* ---------- 禁用态 ---------- */
.md-select--disabled .md-select__outline {
  border-color: color-mix(in srgb, var(--md-sys-color-on-surface) 12%, transparent);
}

.md-select--disabled .md-select__legend,
.md-select--disabled .md-select__value,
.md-select--disabled .md-select__arrow,
.md-select--disabled .md-select__support {
  color: color-mix(in srgb, var(--md-sys-color-on-surface) 38%, transparent);
}

.md-select--disabled .md-select__native {
  cursor: not-allowed;
}
</style>
