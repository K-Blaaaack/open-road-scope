<script setup lang="ts">
import { computed } from "vue";

import { useObdStore } from "@/stores/obd";
import { PID_META, type Pid } from "@shared/obd";

const props = defineProps<{
  /** 数据源 PID */
  pid: Pid;
  /** 字号缩放（0.6~2.5），默认 1 */
  fontScale?: number;
}>();

const store = useObdStore();

const meta = computed(() => PID_META[props.pid]);

/** 数字基准字号 48px（text-5xl），按缩放系数调整 */
const numberSize = computed(() => Math.round(48 * (props.fontScale ?? 1)));
const unitSize = computed(() => Math.max(12, Math.round(numberSize.value * 0.34)));

const display = computed(() => {
  const v = store.latest[props.pid];
  if (v === undefined) return "—";
  return v >= 100
    ? v.toFixed(Math.max(0, meta.value.decimals - 1))
    : v.toFixed(meta.value.decimals);
});
</script>

<template>
  <div class="flex h-full flex-col justify-center">
    <div class="flex items-baseline gap-2">
      <span
        class="font-mono font-bold text-primary leading-none tabular-nums"
        :style="{ fontSize: `${numberSize}px` }"
        >{{ display }}</span
      >
      <span class="text-primary/70 font-medium" :style="{ fontSize: `${unitSize}px` }">{{
        meta.unit
      }}</span>
    </div>
  </div>
</template>
