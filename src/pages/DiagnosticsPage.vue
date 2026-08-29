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
    <div class="glass-card flex flex-col gap-4 p-5">
      <div class="flex flex-wrap gap-2">
        <button class="btn-primary btn-md" :disabled="busy || !store.connected" @click="readDtc">
          {{ t("diagnostics.readDtc") }}
        </button>
        <!-- 清除故障码按钮默认隐藏，需在设置中开启（实验性功能） -->
        <button
          v-if="prefs.showClearDtc"
          class="btn-ghost btn-md !text-[var(--color-danger)] hover:!bg-[var(--color-danger-solid)]/12"
          :disabled="busy || !store.connected"
          @click="clearDtc"
        >
          {{ t("diagnostics.clearDtc") }}
        </button>
        <button class="btn-ghost btn-md" :disabled="busy || !store.connected" @click="readVin">
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
            class="rounded-md bg-[var(--color-danger-soft)] px-2.5 py-1 font-mono text-sm text-[var(--color-danger-text)]"
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
