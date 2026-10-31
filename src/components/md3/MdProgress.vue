<script setup lang="ts">
/**
 * MD3 进度指示器
 *
 * linear：4px 高全圆角轨道，指示条 primary；不确定态用活动段往复动画。
 * circular：SVG 圆环，默认 32px（父级可用 `--md-progress-circular-size` 覆盖为 24/40）；
 * 不确定态叠加整体旋转与弧长动画。
 */
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    /** 形态：线性 / 环形 */
    type?: "linear" | "circular";
    /** 不确定进度（循环动画）；为 false 时按 value 展示 */
    indeterminate?: boolean;
    /** 确定进度的百分比，取值 0-100 */
    value?: number;
    /** 可访问名称 */
    label?: string;
  }>(),
  {
    type: "linear",
    indeterminate: true,
    value: 0,
    label: undefined,
  }
);

/** 收敛到 0-100，避免外部传入越界值 */
const percent = computed<number>(() => Math.min(100, Math.max(0, props.value)));

/** 不确定态不暴露数值，交给 CSS 动画表达 */
const ariaValueNow = computed<number | undefined>(() =>
  props.indeterminate ? undefined : percent.value
);

/** 环形确定进度的虚线偏移（pathLength=100 时按百分比换算） */
const circularOffset = computed<string>(() => String(100 - percent.value));
</script>

<template>
  <div
    v-if="type === 'linear'"
    class="md-progress-linear"
    :class="{ 'md-progress-linear--indeterminate': indeterminate }"
    role="progressbar"
    :aria-label="label"
    aria-valuemin="0"
    aria-valuemax="100"
    :aria-valuenow="ariaValueNow"
  >
    <div
      class="md-progress-linear__indicator"
      :style="indeterminate ? undefined : { width: `${percent}%` }"
    />
  </div>

  <svg
    v-else
    class="md-progress-circular"
    :class="{ 'md-progress-circular--indeterminate': indeterminate }"
    viewBox="0 0 32 32"
    role="progressbar"
    :aria-label="label"
    aria-valuemin="0"
    aria-valuemax="100"
    :aria-valuenow="ariaValueNow"
  >
    <circle class="md-progress-circular__track" cx="16" cy="16" r="14" />
    <circle
      class="md-progress-circular__indicator"
      cx="16"
      cy="16"
      r="14"
      pathLength="100"
      stroke-dasharray="100"
      :stroke-dashoffset="indeterminate ? undefined : circularOffset"
    />
  </svg>
</template>

<style scoped>
/* ---------- 线性 ---------- */
.md-progress-linear {
  position: relative;
  width: 100%;
  height: 4px;
  overflow: hidden;
  border-radius: var(--md-sys-shape-corner-full);
  background: var(--md-sys-color-surface-variant);
}

.md-progress-linear__indicator {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 0;
  border-radius: var(--md-sys-shape-corner-full);
  background: var(--md-sys-color-primary);
  transition: width var(--md-sys-motion-duration-medium2) var(--md-sys-motion-easing-emphasized);
}

/* 不确定态：40% 宽的活动段从左外侧滑到右外侧 */
.md-progress-linear--indeterminate .md-progress-linear__indicator {
  width: 40%;
  animation: md-progress-linear-slide 1.4s var(--md-sys-motion-easing-emphasized) infinite;
}

@keyframes md-progress-linear-slide {
  from {
    transform: translateX(-100%);
  }

  to {
    transform: translateX(250%);
  }
}

/* ---------- 环形 ---------- */
.md-progress-circular {
  display: block;
  width: var(--md-progress-circular-size, 32px);
  height: var(--md-progress-circular-size, 32px);
  transform-origin: center;
}

.md-progress-circular__track,
.md-progress-circular__indicator {
  fill: none;
  stroke-width: 3;
}

.md-progress-circular__track {
  stroke: var(--md-sys-color-surface-variant);
}

.md-progress-circular__indicator {
  stroke: var(--md-sys-color-primary);
  stroke-linecap: round;
  transition: stroke-dashoffset var(--md-sys-motion-duration-medium2)
    var(--md-sys-motion-easing-emphasized);
}

.md-progress-circular--indeterminate {
  animation: md-progress-circular-rotate 1.4s linear infinite;
}

.md-progress-circular--indeterminate .md-progress-circular__indicator {
  animation: md-progress-circular-dash 1.4s var(--md-sys-motion-easing-emphasized) infinite;
}

@keyframes md-progress-circular-rotate {
  to {
    transform: rotate(360deg);
  }
}

@keyframes md-progress-circular-dash {
  0% {
    stroke-dasharray: 1 100;
    stroke-dashoffset: 0;
  }

  50% {
    stroke-dasharray: 60 100;
    stroke-dashoffset: -20;
  }

  100% {
    stroke-dasharray: 60 100;
    stroke-dashoffset: -80;
  }
}
</style>
