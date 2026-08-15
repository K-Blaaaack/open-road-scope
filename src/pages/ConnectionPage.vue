<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

import { useObdStore } from "@/stores/obd";
import { usePrefsStore } from "@/stores/prefs";

const { t } = useI18n();
const store = useObdStore();
const prefs = usePrefsStore();

const mode = ref<"sim" | "real">(store.status.mode === "real" ? "real" : "sim");
const port = ref("");
const ports = ref<{ name: string; description?: string }[]>([]);
const fault = ref(false);
const busy = ref(false);

// 关闭模式选择时强制走实车连接（隐藏模拟入口）；immediate 保证重新挂载后立即生效
watch(
  () => prefs.showModeSelect,
  (v) => {
    if (!v) mode.value = "real";
  },
  { immediate: true }
);

const listPorts = async (): Promise<void> => {
  const result = (await window.obd.listPorts()) as {
    ok: boolean;
    result?: { ports: typeof ports.value };
  };
  if (result.ok && result.result) {
    ports.value = result.result.ports;
    if (!port.value && ports.value.length > 0) port.value = ports.value[0].name;
  }
};

const connect = async (): Promise<void> => {
  busy.value = true;
  try {
    await store.connect(
      mode.value,
      mode.value === "real" ? { port: port.value || undefined } : { fault: fault.value }
    );
    await store.subscribe();
  } catch (err) {
    console.error(err);
  } finally {
    busy.value = false;
  }
};

const disconnect = async (): Promise<void> => {
  await store.disconnect();
};

onMounted(listPorts);
</script>

<template>
  <div class="mx-auto flex max-w-2xl flex-col gap-5">
    <h1 class="text-primary text-lg font-semibold">{{ t("connection.title") }}</h1>

    <div class="glass-card flex flex-col gap-4 p-5">
      <!-- 以下连接配置仅在未连接时显示 -->
      <!-- 模拟/实车模式选择，可在开发者菜单中控制显示 -->
      <div v-if="prefs.showModeSelect && store.status.state === 'idle'">
        <div class="text-secondary mb-2 text-sm">{{ t("connection.mode") }}</div>
        <div class="flex gap-2">
          <button
            class="flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
            :class="
              mode === 'sim'
                ? 'border-sky-400/50 bg-sky-400/10 text-[var(--color-accent-text)]'
                : 'border-border text-secondary hover:bg-[var(--color-hover)]'
            "
            @click="mode = 'sim'"
          >
            {{ t("connection.sim") }}
          </button>
          <button
            class="flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
            :class="
              mode === 'real'
                ? 'border-sky-400/50 bg-sky-400/10 text-[var(--color-accent-text)]'
                : 'border-border text-secondary hover:bg-[var(--color-hover)]'
            "
            @click="mode = 'real'"
          >
            {{ t("connection.real") }}
          </button>
        </div>
      </div>

      <div v-if="mode === 'real' && store.status.state === 'idle'" class="flex items-end gap-2">
        <div class="flex-1">
          <div class="text-secondary mb-2 text-sm">{{ t("connection.port") }}</div>
          <select
            v-model="port"
            class="border-border bg-[var(--color-card)] text-primary w-full rounded-lg border px-3 py-2 text-sm outline-none"
          >
            <option v-if="ports.length === 0" value="" disabled>
              {{ t("connection.scanning") }}
            </option>
            <option v-for="p in ports" :key="p.name" :value="p.name">{{ p.name }}</option>
          </select>
        </div>
        <button
          class="border-border text-secondary hover:bg-[var(--color-hover)] rounded-lg border px-3 py-2 text-sm"
          @click="listPorts"
        >
          {{ t("connection.refresh") }}
        </button>
      </div>

      <div v-if="mode === 'sim' && store.status.state === 'idle'" class="flex items-center gap-2">
        <input id="sim-fault" v-model="fault" type="checkbox" class="accent-sky-400" />
        <label for="sim-fault" class="text-secondary text-sm">{{ t("connection.fault") }}</label>
      </div>

      <div class="flex gap-2">
        <button
          v-if="store.status.state === 'idle'"
          class="flex-1 rounded-lg bg-sky-500/90 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sky-500 disabled:opacity-50"
          :disabled="busy"
          @click="connect"
        >
          {{ t("connection.connect") }}
        </button>
        <button
          v-if="store.status.state !== 'idle'"
          class="border-border text-secondary hover:bg-[var(--color-hover)] rounded-lg border px-4 py-2.5 text-sm"
          @click="disconnect"
        >
          {{ t("connection.disconnect") }}
        </button>
      </div>
    </div>

    <div class="glass-card flex flex-col gap-2 p-5 text-sm">
      <div class="flex justify-between">
        <span class="text-secondary">{{ t("connection.state") }}</span>
        <span class="text-primary font-medium">{{ t(`status.${store.status.state}`) }}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-secondary">{{ t("connection.modeLabel") }}</span>
        <span class="text-primary font-medium">{{ t(`status.${store.status.mode}`) }}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-secondary">{{ t("connection.protocol") }}</span>
        <span class="text-primary font-mono">{{ store.status.protocol ?? "—" }}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-secondary">{{ t("connection.elmVersion") }}</span>
        <span class="text-primary font-mono">{{ store.status.elmVersion ?? "—" }}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-secondary">{{ t("connection.port") }}</span>
        <span class="text-primary font-mono">{{ store.status.port ?? "—" }}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-secondary">{{ t("connection.message") }}</span>
        <span class="text-primary">{{ store.status.message || "—" }}</span>
      </div>
    </div>
  </div>
</template>
