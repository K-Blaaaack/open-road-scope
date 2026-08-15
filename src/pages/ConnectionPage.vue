<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

import { useObdStore } from "@/stores/obd";
import { usePrefsStore } from "@/stores/prefs";
import type { SerialPortInfo } from "@shared/obd";

const { t } = useI18n();
const store = useObdStore();
const prefs = usePrefsStore();

const mode = ref<"sim" | "real">(store.status.mode === "real" ? "real" : "sim");
/** 实车连接方式：USB 串口 / 蓝牙串口 / 网络（RJ45 OBD） */
const connType = ref<"usb" | "bluetooth" | "network">("usb");
const port = ref("");
const ports = ref<SerialPortInfo[]>([]);
/** 网络串口（RJ45 OBD）地址 */
const netHost = ref("");
const netPort = ref("35000");
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

/** 按连接方式过滤枚举出的串口 */
const filteredPorts = computed(() => {
  if (connType.value === "network") return [];
  const target = connType.value === "usb" ? ["usb", "other"] : ["bluetooth"];
  return ports.value.filter((p) => target.includes(p.type));
});

const listPorts = async (): Promise<void> => {
  const result = (await window.obd.listPorts()) as {
    ok: boolean;
    result?: { ports: typeof ports.value };
  };
  if (result.ok && result.result) {
    ports.value = result.result.ports;
    if (!port.value && filteredPorts.value.length > 0) {
      port.value = filteredPorts.value[0].name;
    }
  }
};

const connect = async (): Promise<void> => {
  busy.value = true;
  try {
    const options =
      mode.value === "real"
        ? {
            // 网络串口直接传 host:port，sidecar 自动转 socket:// URL
            port:
              connType.value === "network"
                ? `${netHost.value}:${netPort.value}`
                : port.value || undefined,
          }
        : { fault: fault.value };
    await store.connect(mode.value, options);
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
        <div class="flex flex-wrap gap-2">
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

      <div v-if="mode === 'real' && store.status.state === 'idle'" class="flex flex-col gap-3">
        <!-- 实车连接方式：USB 串口 / 蓝牙串口 / 网络（RJ45 OBD） -->
        <div>
          <div class="text-secondary mb-2 text-sm">{{ t("connection.connType") }}</div>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="type in [
                { key: 'usb', label: t('connection.typeUsb') },
                { key: 'bluetooth', label: t('connection.typeBluetooth') },
                { key: 'network', label: t('connection.typeNetwork') },
              ]"
              :key="type.key"
              class="flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors"
              :class="
                connType === type.key
                  ? 'border-sky-400/50 bg-sky-400/10 text-[var(--color-accent-text)]'
                  : 'border-border text-secondary hover:bg-[var(--color-hover)]'
              "
              @click="connType = type.key as typeof connType"
            >
              {{ type.label }}
            </button>
          </div>
        </div>

        <!-- USB / 蓝牙串口下拉 -->
        <div v-if="connType !== 'network'" class="flex items-end gap-2">
          <div class="flex-1">
            <div class="text-secondary mb-2 text-sm">
              {{ connType === "usb" ? t("connection.portUsb") : t("connection.portBluetooth") }}
            </div>
            <select
              v-model="port"
              class="border-border bg-[var(--color-card)] text-primary w-full rounded-lg border px-3 py-2 text-sm outline-none"
            >
              <option v-if="filteredPorts.length === 0" value="" disabled>
                {{ t("connection.scanning") }}
              </option>
              <option v-for="p in filteredPorts" :key="p.name" :value="p.name">
                {{ p.name }}{{ p.description ? `（${p.description}）` : "" }}
              </option>
            </select>
          </div>
          <button
            class="border-border text-secondary hover:bg-[var(--color-hover)] rounded-lg border px-3 py-2 text-sm"
            @click="listPorts"
          >
            {{ t("connection.refresh") }}
          </button>
        </div>

        <!-- 网络串口（RJ45 OBD）：IP + 端口 -->
        <div v-else class="flex items-end gap-2">
          <div class="flex-1">
            <div class="text-secondary mb-2 text-sm">{{ t("connection.networkAddr") }}</div>
            <input
              v-model="netHost"
              type="text"
              class="border-border bg-[var(--color-card)] text-primary w-full rounded-lg border px-3 py-2 text-sm outline-none"
              :placeholder="t('connection.networkPlaceholder')"
              spellcheck="false"
            />
          </div>
          <div class="w-28">
            <div class="text-secondary mb-2 text-sm">{{ t("connection.networkPort") }}</div>
            <input
              v-model="netPort"
              type="number"
              class="border-border bg-[var(--color-card)] text-primary w-full rounded-lg border px-3 py-2 text-sm outline-none"
              placeholder="35000"
            />
          </div>
        </div>
      </div>

      <div v-if="mode === 'sim' && store.status.state === 'idle'" class="flex items-center gap-2">
        <input id="sim-fault" v-model="fault" type="checkbox" class="accent-sky-400" />
        <label for="sim-fault" class="text-secondary text-sm">{{ t("connection.fault") }}</label>
      </div>

      <div class="flex flex-wrap gap-2">
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
