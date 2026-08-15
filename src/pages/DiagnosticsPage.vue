<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";

import { useObdStore } from "@/stores/obd";
import { usePrefsStore } from "@/stores/prefs";

const { t } = useI18n();
const store = useObdStore();
const prefs = usePrefsStore();

const dtcList = ref<string[]>([]);
const vin = ref("");
const busy = ref(false);

const readDtc = async (): Promise<void> => {
  busy.value = true;
  try {
    const result = (await store.query("GET_DTC")) as string[] | null;
    dtcList.value = Array.isArray(result) ? result : [];
  } finally {
    busy.value = false;
  }
};

const clearDtc = async (): Promise<void> => {
  // 保留二次确认，防止误清除故障码
  if (!window.confirm(t("diagnostics.confirmClear"))) {
    return;
  }
  busy.value = true;
  try {
    await store.query("CLEAR_DTC");
    dtcList.value = [];
  } finally {
    busy.value = false;
  }
};

const readVin = async (): Promise<void> => {
  busy.value = true;
  try {
    const result = await store.query("VIN");
    vin.value = typeof result === "string" ? result : "";
  } finally {
    busy.value = false;
  }
};
</script>

<template>
  <div class="mx-auto flex max-w-2xl flex-col gap-5">
    <h1 class="text-primary text-lg font-semibold">{{ t("diagnostics.title") }}</h1>

    <div class="glass-card flex flex-col gap-4 p-5">
      <div class="flex flex-wrap gap-2">
        <button
          class="rounded-lg bg-sky-500/90 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
          :disabled="busy || !store.connected"
          @click="readDtc"
        >
          {{ t("diagnostics.readDtc") }}
        </button>
        <!-- 清除故障码按钮默认隐藏，需在设置中开启（实验性功能） -->
        <button
          v-if="prefs.showClearDtc"
          class="border-border text-red-300/90 hover:bg-red-400/10 rounded-lg border px-4 py-2 text-sm disabled:opacity-50"
          :disabled="busy || !store.connected"
          @click="clearDtc"
        >
          {{ t("diagnostics.clearDtc") }}
        </button>
        <button
          class="border-border text-secondary hover:bg-[var(--color-hover)] rounded-lg border px-4 py-2 text-sm disabled:opacity-50"
          :disabled="busy || !store.connected"
          @click="readVin"
        >
          {{ t("diagnostics.readVin") }}
        </button>
      </div>

      <div>
        <div class="text-secondary mb-2 text-sm">{{ t("diagnostics.dtc") }}</div>
        <div v-if="dtcList.length === 0" class="text-primary/60 text-sm">
          {{ t("diagnostics.noDtc") }}
        </div>
        <div v-else class="flex flex-wrap gap-2">
          <span
            v-for="code in dtcList"
            :key="code"
            class="rounded-md bg-red-400/10 px-2.5 py-1 font-mono text-sm text-red-300"
          >
            {{ code }}
          </span>
        </div>
      </div>

      <div>
        <div class="text-secondary mb-2 text-sm">{{ t("diagnostics.vin") }}</div>
        <div class="text-primary font-mono text-sm">{{ vin || "—" }}</div>
      </div>
    </div>
  </div>
</template>
