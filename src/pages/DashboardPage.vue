<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";

import { useObdStore } from "@/stores/obd";
import { usePrefsStore } from "@/stores/prefs";
import { PID_META, type Pid } from "@shared/obd";
import PixiGauge from "@/components/PixiGauge.vue";
import ValueCard from "@/components/ValueCard.vue";
import LineChart from "@/components/LineChart.vue";

const { t } = useI18n();
const store = useObdStore();
const prefs = usePrefsStore();

const isDark = computed(() => prefs.theme === "dark");

const speedMeta = PID_META.SPEED;
const rpmMeta = PID_META.RPM;

const cardPids: Pid[] = [
  "COOLANT_TEMP",
  "ENGINE_LOAD",
  "MAF",
  "THROTTLE_POS",
  "FUEL_LEVEL",
  "INTAKE_TEMP",
  "VOLTAGE",
  "FUEL_RATE",
];

const chartPids: Pid[] = ["SPEED", "COOLANT_TEMP", "ENGINE_LOAD"];

const hasData = computed(() => store.lastTs > 0);
</script>

<template>
  <div class="flex flex-col gap-5">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-primary text-lg font-semibold">{{ t("dashboard.title") }}</h1>
        <p v-if="!hasData" class="text-secondary mt-1 text-sm">{{ t("dashboard.noData") }}</p>
      </div>
      <button
        class="border-[var(--color-border)] text-secondary hover:bg-[var(--color-hover)] flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors"
        :title="isDark ? t('common.day') : t('common.night')"
        @click="prefs.toggleTheme()"
      >
        <span :class="isDark ? 'i-lucide-sun' : 'i-lucide-moon'" class="h-4 w-4" />
        {{ isDark ? t("common.day") : t("common.night") }}
      </button>
    </div>

    <div class="grid grid-cols-2 gap-5">
      <div class="glass-card flex-center p-4">
        <PixiGauge
          :label="t('pid.SPEED')"
          :value="store.latest.SPEED ?? 0"
          :min="speedMeta.min"
          :max="speedMeta.max"
          :unit="speedMeta.unit"
          :decimals="speedMeta.decimals"
        />
      </div>
      <div class="glass-card flex-center p-4">
        <PixiGauge
          :label="t('pid.RPM')"
          :value="store.latest.RPM ?? 0"
          :min="rpmMeta.min"
          :max="rpmMeta.max"
          :unit="rpmMeta.unit"
          :decimals="rpmMeta.decimals"
          :danger-at="6500"
        />
      </div>
    </div>

    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <ValueCard
        v-for="pid in cardPids"
        :key="pid"
        :label="t(`pid.${pid}`)"
        :value="store.latest[pid] ?? 0"
        :unit="PID_META[pid].unit"
        :decimals="PID_META[pid].decimals"
      />
    </div>

    <div>
      <h2 class="text-primary mb-3 text-base font-semibold">{{ t("dashboard.history") }}</h2>
      <div class="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <LineChart
          v-for="pid in chartPids"
          :key="pid"
          :pid="pid"
          :label="t(`pid.${pid}`)"
          :unit="PID_META[pid].unit"
          :min="PID_META[pid].min"
          :max="PID_META[pid].max"
          :decimals="PID_META[pid].decimals"
        />
      </div>
    </div>
  </div>
</template>
