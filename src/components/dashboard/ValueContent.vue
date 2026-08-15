<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";

import { useObdStore } from "@/stores/obd";
import { PID_META, type Pid } from "@shared/obd";

const props = defineProps<{
  /** 数据源 PID */
  pid: Pid;
}>();

const { t } = useI18n();
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
  <div class="flex h-full flex-col justify-center gap-1">
    <div class="text-secondary text-xs font-medium tracking-wider">{{ t(`pid.${pid}`) }}</div>
    <div class="flex items-baseline gap-1.5">
      <span class="font-mono text-4xl font-semibold text-primary leading-none">{{ display }}</span>
      <span class="text-secondary text-sm">{{ meta.unit }}</span>
    </div>
  </div>
</template>
