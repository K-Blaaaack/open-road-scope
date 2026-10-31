<script setup lang="ts">
/**
 * 连接页（MD3 重写）
 *
 * 业务逻辑与原实现逐条保持一致（模式/连接方式/串口枚举/网络地址/模拟故障/连接与断开），
 * 只重写呈现层：卡片 + 分段按钮 + 文本框 + 选择框 + 开关 + 状态列表。
 */
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

import MdButton from "@/components/md3/MdButton.vue";
import MdCard from "@/components/md3/MdCard.vue";
import MdDivider from "@/components/md3/MdDivider.vue";
import MdSegmentedButton from "@/components/md3/MdSegmentedButton.vue";
import MdSelect from "@/components/md3/MdSelect.vue";
import MdSwitch from "@/components/md3/MdSwitch.vue";
import MdTextField from "@/components/md3/MdTextField.vue";
import { useSnackbar } from "@/composables/useSnackbar";
import { useDashboardStore } from "@/stores/dashboard";
import { useObdStore } from "@/stores/obd";
import { usePrefsStore } from "@/stores/prefs";
import type { ListPortsResult, SerialPortInfo } from "@shared/obd";

/** 状态圆点可用的语义色 */
type StatusTone = "primary" | "success" | "warning" | "error";

/** 状态列表的一行 */
interface StatusRow {
  /** 行标识，用于 v-for key */
  key: string;
  /** 左侧标签 */
  label: string;
  /** 右侧值 */
  value: string;
  /** 值用等宽字体（协议 / 版本 / 端口这类机器读数） */
  mono?: boolean;
  /** 行首圆点配色，仅「状态」行有 */
  tone?: StatusTone;
}

const { t } = useI18n();
const store = useObdStore();
const prefs = usePrefsStore();
const dashboard = useDashboardStore();
const snackbar = useSnackbar();

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
    // 连接成功后按仪表盘当前卡片 PID 重订阅；仪表盘尚未初始化时回退默认订阅
    if (dashboard.subscribedPids.length > 0) {
      await dashboard.resubscribe();
    } else {
      await store.subscribe();
    }
  } catch (err) {
    console.error(err);
    // 连接失败没有其它可视出口，用提示条兜底，避免按钮点下去「没反应」
    snackbar.show(String(err));
  } finally {
    busy.value = false;
  }
};

const disconnect = async (): Promise<void> => {
  await store.disconnect();
};

onMounted(listPorts);

/** 分段按钮抛的是宽类型，收窄回模式联合类型 */
const setMode = (value: string | number): void => {
  mode.value = value === "real" ? "real" : "sim";
};

/** 同上：连接方式只接受三个已知取值 */
const setConnType = (value: string | number): void => {
  if (value === "usb" || value === "bluetooth" || value === "network") {
    connType.value = value;
  }
};

/** 模式分段按钮选项 */
const modeOptions = computed(() => [
  { value: "sim", label: t("connection.sim") },
  { value: "real", label: t("connection.real") },
]);

/** 连接方式分段按钮选项 */
const connTypeOptions = computed(() => [
  { value: "usb", label: t("connection.typeUsb"), icon: "i-lucide-usb" },
  { value: "bluetooth", label: t("connection.typeBluetooth"), icon: "i-lucide-bluetooth" },
  { value: "network", label: t("connection.typeNetwork"), icon: "i-lucide-network" },
]);

/** 串口选择框的标签随连接方式变化 */
const portLabel = computed(() =>
  connType.value === "usb" ? t("connection.portUsb") : t("connection.portBluetooth")
);

/** 枚举中 / 枚举失败 / 无串口，三种占位文案 */
const portPlaceholder = computed(() => {
  if (scanning.value) return t("connection.scanning");
  if (scanError.value) return t("connection.scanFailed");
  return t("connection.noPorts");
});

/** 串口下拉项；无可用串口时给一条空值占位项，同时由 disabled 兜住不可选 */
const portOptions = computed(() => {
  const list = filteredPorts.value;
  if (list.length === 0) return [{ value: "", label: portPlaceholder.value }];
  return list.map((p) => ({
    value: p.name,
    label: p.description ? `${p.name}（${p.description}）` : p.name,
  }));
});

/** 连接中：本地 busy 与 store 状态任一为真即算，避免两个来源时序不一致时闪烁 */
const isConnecting = computed(() => busy.value || store.status.state === "connecting");

/** 状态圆点配色，按连接状态取语义色 */
const stateTone = computed<StatusTone>(() => {
  switch (store.status.state) {
    case "connected":
      return "success";
    case "connecting":
      return "warning";
    case "error":
      return "error";
    default:
      return "primary";
  }
});

/** 连接状态卡片的数据行；空值统一用破折号占位 */
const statusRows = computed<StatusRow[]>(() => [
  {
    key: "state",
    label: t("connection.state"),
    value: t(`status.${store.status.state}`),
    tone: stateTone.value,
  },
  {
    key: "mode",
    label: t("connection.modeLabel"),
    value: t(`status.${store.status.mode}`),
  },
  {
    key: "protocol",
    label: t("connection.protocol"),
    value: store.status.protocol ?? "—",
    mono: true,
  },
  {
    key: "elmVersion",
    label: t("connection.elmVersion"),
    value: store.status.elmVersion ?? "—",
    mono: true,
  },
  {
    key: "port",
    label: t("connection.port"),
    value: store.status.port ?? "—",
    mono: true,
  },
  {
    key: "message",
    label: t("connection.message"),
    value: store.status.message || "—",
  },
]);
</script>

<template>
  <div class="md-page">
    <MdCard variant="elevated" layout="column" padding="lg" class="conn-card">
      <h2 class="md-title-large conn-card__title">{{ t("connection.settingsTitle") }}</h2>

      <!-- 模式选择：需开启开发者模式且未连接，可在开发者菜单中控制显示 -->
      <section
        v-if="prefs.showModeSelect && prefs.devMode && store.status.state === 'idle'"
        class="conn-block"
      >
        <span class="conn-block__label md-body-medium">{{ t("connection.mode") }}</span>
        <MdSegmentedButton
          :model-value="mode"
          :options="modeOptions"
          full-width
          @update:model-value="setMode"
        />
      </section>

      <template v-if="mode === 'real' && store.status.state === 'idle'">
        <!-- 无原生桥接平台（安卓 WebView / 浏览器）：串口/蓝牙/网络不可用 -->
        <div v-if="!hasBridge" class="conn-note conn-note--warning md-body-small">
          <div class="conn-note__title">{{ t("connection.noBridgeTitle") }}</div>
          <div>{{ t("connection.noBridgeDesc") }}</div>
        </div>

        <template v-else>
          <!-- 实车连接方式：USB 串口 / 蓝牙串口 / 网络（RJ45 OBD） -->
          <section class="conn-block">
            <span class="conn-block__label md-body-medium">{{ t("connection.connType") }}</span>
            <MdSegmentedButton
              :model-value="connType"
              :options="connTypeOptions"
              full-width
              @update:model-value="setConnType"
            />
          </section>

          <!-- USB / 蓝牙串口下拉 -->
          <div v-if="connType !== 'network'" class="conn-port">
            <MdSelect
              class="conn-port__select"
              :model-value="port"
              :options="portOptions"
              :label="portLabel"
              :disabled="filteredPorts.length === 0"
              @update:model-value="port = $event"
            />
            <MdButton
              variant="outlined"
              icon="i-lucide-refresh-cw"
              :disabled="scanning"
              @click="listPorts"
            >
              {{ scanning ? t("connection.scanning") : t("connection.refresh") }}
            </MdButton>
          </div>

          <!-- 网络串口（RJ45 OBD）：IP + 端口 -->
          <div v-else class="conn-net">
            <MdTextField
              v-model="netHost"
              class="conn-net__host"
              :label="t('connection.networkAddr')"
              :placeholder="t('connection.networkPlaceholder')"
            />
            <MdTextField
              v-model="netPort"
              class="conn-net__port"
              :label="t('connection.networkPort')"
              type="number"
              inputmode="numeric"
              placeholder="35000"
            />
          </div>

          <!-- 枚举失败：带上底层错误原文，便于定位（sidecar 缺失 / 权限 / 超时） -->
          <div v-if="scanError" class="conn-note conn-note--error md-body-small">
            <div class="conn-note__title">{{ t("connection.scanFailed") }}</div>
            <div class="conn-note__detail md-mono md-selectable">{{ scanError }}</div>
          </div>
          <!-- 蓝牙串口需先在系统层面配对，否则枚举不到 -->
          <p
            v-else-if="connType === 'bluetooth' && !scanning && filteredPorts.length === 0"
            class="conn-hint md-body-small"
          >
            {{ t("connection.btPairHint") }}
          </p>
        </template>
      </template>

      <!-- 模拟模式：注入随机故障 -->
      <div v-if="mode === 'sim' && store.status.state === 'idle'" class="conn-switch">
        <span class="md-body-medium">{{ t("connection.fault") }}</span>
        <MdSwitch v-model="fault" :label="t('connection.fault')" />
      </div>

      <div class="conn-actions">
        <!-- MdProgress 尚未落地，这里用等价的本地不确定进度条，合并后可直接替换 -->
        <div
          v-if="isConnecting"
          class="conn-progress"
          role="progressbar"
          :aria-label="t('status.connecting')"
        >
          <span class="conn-progress__bar" />
        </div>
        <MdButton
          v-if="store.status.state === 'idle'"
          variant="filled"
          size="lg"
          block
          icon="i-lucide-plug"
          :disabled="busy"
          @click="connect"
        >
          {{ t("connection.connect") }}
        </MdButton>
        <MdButton v-else variant="outlined" size="lg" block @click="disconnect">
          {{ t("connection.disconnect") }}
        </MdButton>
      </div>
    </MdCard>

    <MdCard variant="outlined" layout="column" padding="lg" class="conn-card">
      <h2 class="md-title-large conn-card__title">{{ t("connection.statusTitle") }}</h2>

      <div class="conn-status">
        <template v-for="(row, index) in statusRows" :key="row.key">
          <div class="conn-status__row">
            <span class="conn-status__label md-body-medium">
              <!-- 圆点槽位恒占位：只有状态行有颜色，其余行留空，
                   否则第一行标签会比其它行右移 18px，整列看着是歪的 -->
              <span
                class="conn-dot"
                :class="row.tone ? `conn-dot--${row.tone}` : 'conn-dot--none'"
                aria-hidden="true"
              />
              {{ row.label }}
            </span>
            <span
              class="conn-status__value md-body-medium"
              :class="row.mono ? 'md-mono md-selectable' : ''"
            >
              {{ row.value }}
            </span>
          </div>
          <MdDivider v-if="index < statusRows.length - 1" />
        </template>
      </div>
    </MdCard>
  </div>
</template>

<style scoped>
/* 卡片内的节奏统一 20dp：标题 → 配置块 → 操作区 */
.conn-card {
  gap: 20px;
}

.conn-card__title {
  margin: 0;
  color: var(--md-sys-color-on-surface);
}

.conn-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.conn-block__label {
  color: var(--md-sys-color-on-surface-variant);
}

/* ---------- 提示块 ---------- */
.conn-note {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  border-radius: var(--md-sys-shape-corner-medium);
}

.conn-note--warning {
  background: var(--md-sys-color-warning-container);
  color: var(--md-sys-color-on-warning-container);
}

.conn-note--error {
  background: var(--md-sys-color-error-container);
  color: var(--md-sys-color-on-error-container);
}

.conn-note__title {
  font-size: var(--md-sys-typescale-body-medium-size);
  line-height: var(--md-sys-typescale-body-medium-line);
  font-weight: var(--md-sys-typescale-title-small-weight);
}

/* 底层错误原文可能很长且无空格，必须允许任意位置断行 */
.conn-note__detail {
  word-break: break-all;
}

.conn-hint {
  margin: 0;
  color: var(--md-sys-color-on-surface-variant);
}

/* ---------- 串口 / 网络 ---------- */
.conn-port {
  display: flex;
  align-items: flex-end;
  gap: 12px;
}

.conn-port__select {
  flex: 1 1 auto;
  min-width: 0;
}

.conn-net {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.conn-net__host {
  flex: 1 1 auto;
  min-width: 0;
}

.conn-net__port {
  flex: 0 0 auto;
  width: 120px;
}

/* ---------- 模拟故障开关 ---------- */
.conn-switch {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 40px;
  color: var(--md-sys-color-on-surface);
}

/* ---------- 操作区 ---------- */
.conn-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* 不确定进度条：轨道 surface-variant、指示条 primary，滑动用 long4 + emphasized */
.conn-progress {
  position: relative;
  height: 4px;
  overflow: hidden;
  border-radius: var(--md-sys-shape-corner-full);
  background: var(--md-sys-color-surface-variant);
}

.conn-progress__bar {
  position: absolute;
  inset: 0 auto 0 0;
  width: 40%;
  border-radius: inherit;
  background: var(--md-sys-color-primary);
  animation: conn-progress-slide var(--md-sys-motion-duration-long4)
    var(--md-sys-motion-easing-emphasized) infinite;
}

@keyframes conn-progress-slide {
  from {
    transform: translateX(-100%);
  }

  to {
    transform: translateX(250%);
  }
}

/* ---------- 状态列表 ---------- */
.conn-status {
  display: flex;
  flex-direction: column;
}

.conn-status__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 0;
}

.conn-status__label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--md-sys-color-on-surface-variant);
  white-space: nowrap;
}

.conn-status__value {
  min-width: 0;
  color: var(--md-sys-color-on-surface);
  text-align: right;
  word-break: break-all;
}

.conn-dot {
  width: 10px;
  height: 10px;
  flex: 0 0 auto;
  border-radius: var(--md-sys-shape-corner-full);
}

.conn-dot--none {
  background: transparent;
}

.conn-dot--primary {
  background: var(--md-sys-color-primary);
}

.conn-dot--success {
  background: var(--md-sys-color-success);
}

.conn-dot--warning {
  background: var(--md-sys-color-warning);
}

.conn-dot--error {
  background: var(--md-sys-color-error);
}
</style>
