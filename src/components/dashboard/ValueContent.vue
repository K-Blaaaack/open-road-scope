<script setup lang="ts">
import { computed } from "vue";

import { useObdStore } from "@/stores/obd";
import { PID_META, type Pid } from "@shared/obd";

const props = defineProps<{
  /** 数据源 PID */
  pid: Pid;
}>();

const store = useObdStore();

const meta = computed(() => PID_META[props.pid]);

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
      <span class="font-mono text-5xl font-bold text-primary leading-none tabular-nums">{{
        display
      }}</span>
      <span class="text-secondary text-sm font-medium">{{ meta.unit }}</span>
    </div>
  </div>
</template>
