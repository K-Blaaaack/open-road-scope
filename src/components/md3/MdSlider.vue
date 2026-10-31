<script setup lang="ts">
/**
 * MD3 滑块
 *
 * 语义与键盘操作交给原生 input[type=range]，视觉全部由伪元素自绘：
 * 轨道 4px、手柄 20px、命中高度 40px（原生 input 自身高度，鼠标/触摸都够用）。
 * 激活段用 background 渐变按百分比填充，比例通过 --md-slider-fill 传给伪元素
 * （伪元素无法接受内联样式，只能用继承的 CSS 变量）。
 */
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    /** 当前值 */
    modelValue: number;
    /** 最小值 */
    min?: number;
    /** 最大值 */
    max?: number;
    /** 步长 */
    step?: number;
    /** 无障碍名称（视觉标签由使用方排版） */
    label?: string;
    /** 无障碍读出的值文本，如 "500 ms" */
    valueText?: string;
    /** 禁用 */
    disabled?: boolean;
  }>(),
  {
    min: 0,
    max: 100,
    step: 1,
    label: undefined,
    valueText: undefined,
    disabled: false,
  }
);

const emit = defineEmits<{
  (e: "update:modelValue", value: number): void;
  (e: "change", value: number): void;
}>();

/** 已激活轨道占比（0–100），min ≥ max 时按 0 处理，避免除零 */
const fillPercent = computed(() => {
  const span = props.max - props.min;
  if (!Number.isFinite(span) || span <= 0) return 0;
  const ratio = (props.modelValue - props.min) / span;
  return Math.min(100, Math.max(0, ratio * 100));
});

/** 把填充比例交给伪元素用的 CSS 变量 */
const fillStyle = computed(() => ({ "--md-slider-fill": `${fillPercent.value}%` }));

/**
 * 读取原生输入值
 * @param event - 原生 input / change 事件
 * @returns 数值化的当前值
 */
const readValue = (event: Event): number => Number((event.target as HTMLInputElement).value);

/**
 * 拖动过程中持续抛值（受控回写由外层完成）
 * @param event - 原生 input 事件
 */
const onInput = (event: Event): void => {
  emit("update:modelValue", readValue(event));
};

/**
 * 松手（或键盘调整结束）时才抛 change，外层可在这里提交/持久化
 * @param event - 原生 change 事件
 */
const onChange = (event: Event): void => {
  emit("change", readValue(event));
};
</script>

<template>
  <input
    class="md-slider"
    type="range"
    :min="min"
    :max="max"
    :step="step"
    :value="modelValue"
    :style="fillStyle"
    :disabled="disabled"
    :aria-label="label"
    :aria-valuetext="valueText"
    @input="onInput"
    @change="onChange"
  />
</template>

<style scoped>
.md-slider {
  /* 关掉 UA 默认外观，轨道与手柄改由下面的伪元素绘制 */
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  /* 命中高度 ≥ 40，视觉轨道只有 4px */
  height: 40px;
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
  border-radius: var(--md-sys-shape-corner-full);
  cursor: pointer;
  --md-slider-fill: 0%;
  --md-slider-track: 4px;
  --md-slider-handle: 20px;
}

/* ---------- WebKit / Blink ---------- */
.md-slider::-webkit-slider-runnable-track {
  height: var(--md-slider-track);
  border-radius: var(--md-sys-shape-corner-full);
  background: linear-gradient(
    to right,
    var(--md-sys-color-primary) 0 var(--md-slider-fill),
    var(--md-sys-color-surface-variant) var(--md-slider-fill) 100%
  );
}

.md-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: var(--md-slider-handle);
  height: var(--md-slider-handle);
  /* 负 margin 让手柄在 4px 轨道上垂直居中 */
  margin-top: calc((var(--md-slider-track) - var(--md-slider-handle)) / 2);
  border: none;
  border-radius: var(--md-sys-shape-corner-full);
  background: var(--md-sys-color-primary);
  /* 占位光环：0 尺寸时不可见，悬停/聚焦再展开到 4px */
  box-shadow: 0 0 0 0 transparent;
  transition: box-shadow var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
}

.md-slider:hover::-webkit-slider-thumb,
.md-slider:focus-visible::-webkit-slider-thumb {
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--md-sys-color-primary) 16%, transparent);
}

/* ---------- Firefox ---------- */
.md-slider::-moz-range-track {
  height: var(--md-slider-track);
  border-radius: var(--md-sys-shape-corner-full);
  background: linear-gradient(
    to right,
    var(--md-sys-color-primary) 0 var(--md-slider-fill),
    var(--md-sys-color-surface-variant) var(--md-slider-fill) 100%
  );
}

/* Firefox 自带「已激活段」层，与渐变叠加后颜色一致，无需额外处理 */
.md-slider::-moz-range-progress {
  height: var(--md-slider-track);
  border-radius: var(--md-sys-shape-corner-full);
  background: var(--md-sys-color-primary);
}

.md-slider::-moz-range-thumb {
  width: var(--md-slider-handle);
  height: var(--md-slider-handle);
  border: none;
  border-radius: var(--md-sys-shape-corner-full);
  background: var(--md-sys-color-primary);
  box-shadow: 0 0 0 0 transparent;
  transition: box-shadow var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
}

.md-slider:hover::-moz-range-thumb,
.md-slider:focus-visible::-moz-range-thumb {
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--md-sys-color-primary) 16%, transparent);
}

/* 去掉 Firefox 手柄内侧的虚线框，外层仍保留全局 :focus-visible 焦点环 */
.md-slider::-moz-focus-outer {
  border: 0;
}

/* ---------- 禁用态 ---------- */
.md-slider:disabled {
  cursor: not-allowed;
  opacity: var(--md-sys-state-disabled-opacity);
}
</style>
