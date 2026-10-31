<script setup lang="ts">
/**
 * 仪表盘数值卡内容
 *
 * 只负责数字与单位的排版，卡片外壳由 DashboardCard 提供。
 * 数字用 on-surface（大面积高饱和的 primary 会压过其它卡片），单位用 on-surface-variant。
 */
import { computed } from "vue";

import { useObdStore } from "@/stores/obd";
import { PID_META, type Pid } from "@shared/obd";

const props = defineProps<{
  /** 数据源 PID */
  pid: Pid;
  /** 字号缩放（0.6~2.5），默认 1 */
  fontScale?: number;
}>();

/** 数字基准字号（px），按 fontScale 缩放 */
const BASE_NUMBER_SIZE = 48;

const store = useObdStore();
const meta = computed(() => PID_META[props.pid]);

/** 数字字号 */
const numberSize = computed(() => Math.round(BASE_NUMBER_SIZE * (props.fontScale ?? 1)));
/** 单位字号：随数字等比缩小，下限 12px 保证可读 */
const unitSize = computed(() => Math.max(12, Math.round(numberSize.value * 0.34)));

/** 读数文本：三位数以上少保留一位小数，避免卡片内溢出；无数据显示破折号 */
const display = computed(() => {
  const v = store.latest[props.pid];
  if (v === undefined) return "—";
  return v >= 100
    ? v.toFixed(Math.max(0, meta.value.decimals - 1))
    : v.toFixed(meta.value.decimals);
});
</script>

<template>
  <!-- 容器不带卡片外观：卡片外壳由 DashboardCard 负责 -->
  <div class="flex h-full min-h-0 flex-1 flex-col justify-center">
    <div class="flex items-baseline gap-2">
      <span class="value-number md-mono tabular-nums" :style="{ fontSize: `${numberSize}px` }">{{
        display
      }}</span>
      <span class="value-unit" :style="{ fontSize: `${unitSize}px` }">{{ meta.unit }}</span>
    </div>
  </div>
</template>

<style scoped>
.value-number {
  color: var(--md-sys-color-on-surface);
  font-weight: 500;
  line-height: 1;
  letter-spacing: var(--md-sys-typescale-display-small-tracking);
}

.value-unit {
  color: var(--md-sys-color-on-surface-variant);
  font-weight: var(--md-sys-typescale-title-small-weight);
  line-height: 1;
  letter-spacing: var(--md-sys-typescale-title-small-tracking);
}
</style>
