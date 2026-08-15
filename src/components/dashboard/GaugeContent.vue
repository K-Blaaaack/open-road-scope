<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";

import { useObdStore } from "@/stores/obd";
import { PID_META, type Pid } from "@shared/obd";
import PixiGauge from "@/components/PixiGauge.vue";

const props = defineProps<{
  /** 数据源 PID */
  pid: Pid;
  /** 量程下限，null 为自动 */
  min: number | null;
  /** 量程上限，null 为自动（无最大值） */
  max: number | null;
}>();

const { t } = useI18n();
const store = useObdStore();

const meta = computed(() => PID_META[props.pid]);

/** 向上取整到「好看」的数值（1/2/5 × 10^n） */
const ceilToNice = (v: number): number => {
  const pow = 10 ** Math.floor(Math.log10(Math.max(v, 1)));
  const d = v / pow;
  const nice = d <= 1 ? 1 : d <= 2 ? 2 : d <= 5 ? 5 : 10;
  return nice * pow;
};

/** 自动上限：取最近 30s 历史峰值 ×1.15，向上取整到整齐刻度，且不低于默认量程的 30% */
const autoMax = computed(() => {
  const samples = store.history[props.pid].toArray();
  let peak = 0;
  for (const s of samples) {
    if (s.t >= store.lastTs - 30000 && s.v > peak) peak = s.v;
  }
  return Math.max(ceilToNice(meta.value.max * 0.3), ceilToNice(peak * 1.15));
});

const rangeMin = computed(() => props.min ?? 0);
const rangeMax = computed(() => props.max ?? autoMax.value);

/** RPM 表的危险区起点按默认比例跟随量程 */
const dangerAt = computed<number | undefined>(() => {
  if (props.pid !== "RPM") return undefined;
  return rangeMax.value * 0.8125;
});
</script>

<template>
  <div class="h-full w-full">
    <PixiGauge
      :label="t(`pid.${pid}`)"
      :value="store.latest[pid] ?? 0"
      :min="rangeMin"
      :max="Math.max(rangeMax, rangeMin + 1)"
      :unit="meta.unit"
      :decimals="meta.decimals"
      :danger-at="dangerAt"
    />
  </div>
</template>
