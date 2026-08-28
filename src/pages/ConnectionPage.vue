<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

import { useObdStore } from "@/stores/obd";
import { usePrefsStore } from "@/stores/prefs";
import type { ListPortsResult, SerialPortInfo } from "@shared/obd";

const { t } = useI18n();
const store = useObdStore();
const prefs = usePrefsStore();

/** 是否有原生桥接（Electron preload）；无桥接的 WebView/浏览器无法使用串口/蓝牙/网络 */
const hasBridge = computed(() => Boolean(window.obd));

const mode = ref<"sim" | "real">(store.status.mode === "real" ? "real" : "sim");
/** 实车连接方式：USB 串口 / 蓝牙串口 / 网络（RJ45 OBD） */
const connType = ref<"usb" | "bluetooth" | "network">("usb");
const port = ref("");
const ports = ref<SerialPortInfo[]>([]);
/** 串口枚举进行中 */
const scanning = ref(false);
/** 串口枚举失败原因（空串表示无错误） */
const scanError = ref("");
/** 网络串口（RJ45 OBD）地址 */
const netHost = ref("");
const netPort = ref("35000");
const fault = ref(false);
const busy = ref(false);

// 关闭模式选择或未开启开发者模式时，强制走实车连接（隐藏模拟入口）；immediate 保证重新挂载后立即生效
watch(
  [() => prefs.showModeSelect, () => prefs.devMode],
  ([showSelect, devMode]) => {
    if (!showSelect || !devMode) mode.value = "real";
  },
  { immediate: true }
);

/** 按连接方式过滤枚举出的串口 */
const filteredPorts = computed(() => {
  if (connType.value === "network") return [];
  const target = connType.value === "usb" ? ["usb", "other"] : ["bluetooth"];
  return ports.value.filter((p) => target.includes(p.type));
});

/** 保持选中项落在当前连接方式的可选串口内 */
const syncSelectedPort = (): void => {
  const list = filteredPorts.value;
  if (!list.some((p) => p.name === port.value)) {
    port.value = list.length > 0 ? list[0].name : "";
  }
};

/** 枚举串口；失败原因显示在界面上，避免点击刷新「没反应」 */
const listPorts = async (): Promise<void> => {
  // 无桥接环境（纯浏览器预览）下静默跳过
  if (!window.obd) return;
  scanning.value = true;
  scanError.value = "";
  try {
    const response = (await window.obd.listPorts()) as {
      ok: boolean;
      result?: ListPortsResult;
      error?: string;
    };
    if (!response.ok || !response.result) {
      ports.value = [];
      scanError.value = response.error || t("connection.scanFailed");
      return;
    }
    ports.value = response.result.ports;
    syncSelectedPort();
  } catch (err) {
    ports.value = [];
    scanError.value = String(err);
  } finally {
    scanning.value = false;
  }
};

// 切换连接方式后，选中项需要跟着换到该分类下的串口
watch(connType, syncSelectedPort);

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
      <!-- 模拟/实车模式选择：需开启开发者模式且未连接，可在开发者菜单中控制显示 -->
      <div v-if="prefs.showModeSelect && prefs.devMode && store.status.state === 'idle'">
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
        <!-- 无原生桥接平台（安卓 WebView / 浏览器）：串口/蓝牙/网络不可用 -->
        <div
          v-if="!hasBridge"
          class="rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-xs leading-relaxed text-amber-200/90"
        >
          {{ t("connection.noBridgeTitle") }}
          <div class="mt-1 text-amber-200/60">{{ t("connection.noBridgeDesc") }}</div>
        </div>

        <!-- 实车连接方式：USB 串口 / 蓝牙串口 / 网络（RJ45 OBD） -->
        <template v-if="hasBridge">
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
          <div v-if="connType !== 'network'" class="flex flex-col gap-2">
            <div class="flex items-end gap-2">
              <div class="flex-1">
                <div class="text-secondary mb-2 text-sm">
                  {{ connType === "usb" ? t("connection.portUsb") : t("connection.portBluetooth") }}
                </div>
                <select
                  v-model="port"
                  class="border-border bg-[var(--color-card)] text-primary w-full rounded-lg border px-3 py-2 text-sm outline-none"
                >
                  <option v-if="filteredPorts.length === 0" value="" disabled>
                    {{
                      scanning
                        ? t("connection.scanning")
                        : scanError
                          ? t("connection.scanFailed")
                          : t("connection.noPorts")
                    }}
                  </option>
                  <option v-for="p in filteredPorts" :key="p.name" :value="p.name">
                    {{ p.name }}{{ p.description ? `（${p.description}）` : "" }}
                  </option>
                </select>
              </div>
              <button
                class="border-border text-secondary hover:bg-[var(--color-hover)] rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
                :disabled="scanning"
                @click="listPorts"
              >
                {{ scanning ? t("connection.scanning") : t("connection.refresh") }}
              </button>
            </div>

            <!-- 枚举失败：带上底层错误，便于定位（sidecar 缺失 / 权限 / 超时） -->
            <div
              v-if="scanError"
              class="rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-xs leading-relaxed text-rose-200/90"
            >
              {{ t("connection.scanFailed") }}
              <div class="mt-1 font-mono break-all text-rose-200/60">{{ scanError }}</div>
            </div>
            <!-- 蓝牙串口需先在系统层面配对，否则枚举不到 -->
            <div
              v-else-if="connType === 'bluetooth' && !scanning && filteredPorts.length === 0"
              class="text-secondary text-xs leading-relaxed"
            >
              {{ t("connection.btPairHint") }}
            </div>
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
        </template>
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
