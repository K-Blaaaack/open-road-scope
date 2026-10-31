<script setup lang="ts">
/**
 * 诊断页（MD3 重写）
 *
 * 业务逻辑与原实现保持一致：readDtc / clearDtc / readVin 三个动作走 store.query，
 * dtcList / vin / busy 三个状态，清除按钮由 prefs.showClearDtc 控制显隐。
 * 呈现层换成卡片 + MD3 按钮 + 徽标 + 进度条；清码是不可撤销操作，
 * 用 MdDialog 二次确认替代原生 window.confirm，失败反馈走 snackbar。
 */
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";

import MdBadge from "@/components/md3/MdBadge.vue";
import MdButton from "@/components/md3/MdButton.vue";
import MdCard from "@/components/md3/MdCard.vue";
import MdDialog from "@/components/md3/MdDialog.vue";
import MdProgress from "@/components/md3/MdProgress.vue";
import { useSnackbar } from "@/composables/useSnackbar";
import { useObdStore } from "@/stores/obd";
import { usePrefsStore } from "@/stores/prefs";

const { t } = useI18n();
const store = useObdStore();
const prefs = usePrefsStore();
const snackbar = useSnackbar();

/** 故障码列表（空数组表示已读取且无故障码） */
const dtcList = ref<string[]>([]);
/** 车辆识别码 */
const vin = ref("");
/** 请求进行中：禁用操作行，避免并发查询打断适配器 */
const busy = ref(false);
/** 清除故障码确认框开关 */
const clearDialogOpen = ref(false);

/** 三个操作共用的可用条件：非忙碌且已连接 */
const actionsDisabled = computed(() => busy.value || !store.connected);

/** 读取故障码 */
const readDtc = async (): Promise<void> => {
  busy.value = true;
  try {
    const result = (await store.query("GET_DTC")) as string[] | null;
    dtcList.value = Array.isArray(result) ? result : [];
  } catch (err) {
    snackbar.show(String(err));
  } finally {
    busy.value = false;
  }
};

/** 点「清除故障码」：只开确认框，真正的清除在 clearDtc 里执行 */
const requestClear = (): void => {
  if (actionsDisabled.value) return;
  clearDialogOpen.value = true;
};

/** 清除故障码（确认后执行）；成功后本地列表立即清空 */
const clearDtc = async (): Promise<void> => {
  clearDialogOpen.value = false;
  busy.value = true;
  try {
    await store.query("CLEAR_DTC");
    dtcList.value = [];
  } catch (err) {
    snackbar.show(String(err));
  } finally {
    busy.value = false;
  }
};

/** 读取 VIN */
const readVin = async (): Promise<void> => {
  busy.value = true;
  try {
    const result = await store.query("VIN");
    vin.value = typeof result === "string" ? result : "";
  } catch (err) {
    snackbar.show(String(err));
  } finally {
    busy.value = false;
  }
};
</script>

<template>
  <div class="md-page">
    <!-- 操作区 -->
    <MdCard variant="elevated" layout="column" padding="lg" class="diag-card">
      <div class="diag-actions">
        <MdButton
          variant="filled"
          icon="i-lucide-scan-line"
          :disabled="actionsDisabled"
          @click="readDtc"
        >
          {{ t("diagnostics.readDtc") }}
        </MdButton>
        <MdButton
          variant="tonal"
          icon="i-lucide-badge-check"
          :disabled="actionsDisabled"
          @click="readVin"
        >
          {{ t("diagnostics.readVin") }}
        </MdButton>
        <!-- 清除故障码默认隐藏，需在设置里开启（实验性功能）；用 error 色与只读操作区分 -->
        <span v-if="prefs.showClearDtc" class="diag-danger">
          <MdButton
            variant="text"
            icon="i-lucide-trash-2"
            :disabled="actionsDisabled"
            @click="requestClear"
          >
            {{ t("diagnostics.clearDtc") }}
          </MdButton>
        </span>
      </div>

      <!-- 请求进行中：线性不确定进度，避免「按钮变灰但毫无反馈」 -->
      <MdProgress v-if="busy" type="linear" indeterminate :label="t('diagnostics.readDtc')" />
    </MdCard>

    <!-- 故障码 -->
    <MdCard variant="elevated" layout="column" padding="lg" class="diag-card">
      <div class="diag-head">
        <h2 class="md-title-large">{{ t("diagnostics.dtc") }}</h2>
        <!-- 0 条故障码不该报红：有码用 error，无码用 success，与下方勾选图标一致 -->
        <MdBadge
          :tone="dtcList.length ? 'error' : 'success'"
          variant="tonal"
          :label="t('diagnostics.dtcCount', { n: dtcList.length })"
        />
      </div>

      <p v-if="dtcList.length === 0" class="diag-empty md-body-medium">
        <span class="i-lucide-circle-check diag-empty__icon" aria-hidden="true" />
        {{ t("diagnostics.noDtc") }}
      </p>
      <ul v-else class="diag-dtc">
        <li v-for="code in dtcList" :key="code" class="diag-dtc__item md-mono md-body-medium">
          {{ code }}
        </li>
      </ul>
    </MdCard>

    <!-- VIN -->
    <MdCard variant="elevated" layout="column" padding="lg" class="diag-card diag-card--tight">
      <h3 class="diag-vin__label md-title-small">{{ t("diagnostics.vin") }}</h3>
      <p class="diag-vin__value md-mono md-body-large md-selectable">{{ vin || "—" }}</p>
    </MdCard>

    <!-- 清除故障码二次确认 -->
    <MdDialog
      v-model="clearDialogOpen"
      :headline="t('diagnostics.clearDtc')"
      icon="i-lucide-triangle-alert"
      icon-tone="error"
      width="sm"
    >
      <p class="diag-confirm">{{ t("diagnostics.confirmClear") }}</p>
      <template #actions>
        <MdButton variant="text" @click="clearDialogOpen = false">
          {{ t("common.cancel") }}
        </MdButton>
        <span class="diag-danger diag-danger--filled">
          <MdButton variant="filled" @click="clearDtc">
            {{ t("diagnostics.clearDtc") }}
          </MdButton>
        </span>
      </template>
    </MdDialog>
  </div>
</template>

<style scoped>
/* 卡片内各区块的节奏：16 的 4dp 倍数间距 */
.diag-card {
  gap: 16px;
}

.diag-card--tight {
  gap: 8px;
}

.diag-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

/* ---------- 危险操作：只覆盖前景/底色，其余沿用 MdButton ---------- */
.diag-danger :deep(.md-btn:not(:disabled)) {
  color: var(--md-sys-color-error);
  --md-state-layer-color: var(--md-sys-color-error);
}

.diag-danger--filled :deep(.md-btn:not(:disabled)) {
  background: var(--md-sys-color-error);
  color: var(--md-sys-color-on-error);
  --md-state-layer-color: var(--md-sys-color-on-error);
}

/* ---------- 故障码区 ---------- */
.diag-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.diag-empty {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  color: var(--md-sys-color-on-surface-variant);
}

.diag-empty__icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  color: var(--md-sys-color-success);
}

.diag-dtc {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

/* 故障码是错误语义，用 error-container 底保证深浅主题下都有足够对比 */
.diag-dtc__item {
  padding: 6px 12px;
  border-radius: var(--md-sys-shape-corner-small);
  background: var(--md-sys-color-error-container);
  color: var(--md-sys-color-on-error-container);
}

/* ---------- VIN 区 ---------- */
.diag-vin__label {
  margin: 0;
  color: var(--md-sys-color-on-surface-variant);
}

.diag-vin__value {
  margin: 0;
  color: var(--md-sys-color-on-surface);
}

/* ---------- 确认框正文 ---------- */
.diag-confirm {
  margin: 0;
}
</style>
