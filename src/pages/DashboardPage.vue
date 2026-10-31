<script setup lang="ts">
/**
 * 实时仪表盘页（MD3）
 *
 * 呈现层按 Material Design 3 重写：编辑态操作条、卡片画布、右下角 FAB、配置侧边面板。
 * 网格拖拽、窄屏流式堆叠、视口适配与布局导入导出等既有逻辑原样保留。
 */
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useMediaQuery } from "@vueuse/core";

import { useDashboardStore } from "@/stores/dashboard";
import { usePrefsStore } from "@/stores/prefs";
import { useSnackbar } from "@/composables/useSnackbar";
import {
  GRID_COLS,
  GRID_ROW_HEIGHT,
  CARD_PIDS,
  type DashboardCard as CardDef,
  type GaugeType,
  type Pid,
} from "@shared/dashboard";
import DashboardCard from "@/components/dashboard/DashboardCard.vue";
import MdButton from "@/components/md3/MdButton.vue";
import MdChip from "@/components/md3/MdChip.vue";
import MdDivider from "@/components/md3/MdDivider.vue";
import MdFab from "@/components/md3/MdFab.vue";
import MdIconButton from "@/components/md3/MdIconButton.vue";
import MdSegmentedButton from "@/components/md3/MdSegmentedButton.vue";
import MdSelect from "@/components/md3/MdSelect.vue";
import MdSideSheet from "@/components/md3/MdSideSheet.vue";

const { t } = useI18n();
const layout = useDashboardStore();
const prefs = usePrefsStore();
const { show } = useSnackbar();

/** 拖拽中的落点幽灵框（网格坐标，松手即清） */
const ghost = ref<{ x: number; y: number; w: number; h: number } | null>(null);

const containerRef = ref<HTMLDivElement>();
const containerWidth = ref(0);
const containerHeight = ref(0);
let ro: ResizeObserver | null = null;

/** 流式布局阈值：低于此宽度时 12 列网格的单卡不足百像素，改为顺序堆叠 */
const FLOW_WIDTH = 560;
/** 双列堆叠阈值：再窄就只放一列 */
const FLOW_TWO_COL_WIDTH = 420;

/** 宽屏（≥600px）：FAB 用扩展样式带文字，窄屏收起文字只留图标，减少对卡片的遮挡 */
const fabExtended = useMediaQuery("(min-width: 600px)");

/** 是否流式布局（手机竖屏 / 小窗） */
const flow = computed(() => containerWidth.value > 0 && containerWidth.value < FLOW_WIDTH);
/** 流式布局列数 */
const flowCols = computed(() => (containerWidth.value >= FLOW_TWO_COL_WIDTH ? 2 : 1));
/** 流式布局的卡片顺序：沿用原网格的行列先后 */
const flowCards = computed(() => [...layout.cards].sort((a, b) => a.y - b.y || a.x - b.x));

/**
 * 流式布局下的卡片高度
 *
 * 下限 150 是实测的可用高度：标题 32 + 数值行 28 + 绘图区至少 78 + 内边距，
 * 再矮刻度文字就会互相压字。上限 240 避免单卡在手机上占满整屏。
 * @param card - 卡片定义
 * @returns 像素高度（由原始行数折算并夹到可读区间）
 */
const flowHeight = (card: CardDef): number => Math.min(240, Math.max(150, card.h * 42));

/** 卡片总行数 */
const totalRows = computed(() => {
  const bottom = layout.cards.reduce((m, c) => Math.max(m, c.y + c.h), 0);
  return Math.max(bottom, 4);
});

/** 网格行高：适配窗口时按可用高度压缩，否则用固定行高（可滚动） */
const rowHeight = computed(() => {
  if (prefs.fitViewport) {
    const avail = containerHeight.value - 8;
    return Math.max(52, avail / totalRows.value);
  }
  return GRID_ROW_HEIGHT;
});

const containerStyle = computed(() => {
  // 流式布局：高度随内容增长，滚动交给页面容器
  if (flow.value) return {};
  if (prefs.fitViewport) {
    // 适配模式：高度随窗口伸缩；行高有下限，窗口过小时允许滚动而不是裁掉内容
    return { flex: "1", minHeight: "0", overflow: "auto" as const };
  }
  return { height: `${totalRows.value * GRID_ROW_HEIGHT + 24}px` };
});

const gridLines = computed(() => {
  if (!layout.editing || flow.value) return null;
  const cols = Array.from({ length: GRID_COLS - 1 }, (_, i) => i + 1);
  const rows = Array.from({ length: totalRows.value - 1 }, (_, i) => i + 1);
  return { cols, rows };
});

onMounted(() => {
  void layout.init();
  window.addEventListener("keydown", onGlobalKeydown);
  ro = new ResizeObserver((entries) => {
    for (const entry of entries) {
      containerWidth.value = entry.contentRect.width;
      containerHeight.value = entry.contentRect.height;
    }
  });
  if (containerRef.value) ro.observe(containerRef.value);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onGlobalKeydown);
  ro?.disconnect();
  ro = null;
});

/* ---------- 配置面板 ---------- */

const addPid = ref<Pid>("SPEED");
const addType = ref<GaugeType>("line");
const jsonText = ref("");
const importMsg = ref("");

/** 可添加的 PID 选项（文案随语言切换实时更新） */
const pidOptions = computed(() => CARD_PIDS.map((p) => ({ value: p, label: t(`pid.${p}`) })));

/** 呈现方式选项：图标 + 已翻译文案 */
const typeOptions = computed(() => [
  { value: "line", label: t("dashboard.type.line"), icon: "i-lucide-chart-line" },
  { value: "bar", label: t("dashboard.type.bar"), icon: "i-lucide-chart-bar" },
  { value: "value", label: t("dashboard.type.value"), icon: "i-lucide-text" },
]);

/**
 * 回写选中的 PID：MdSelect 只抛字符串，这里按 CARD_PIDS 收窄成 Pid
 * @param value - 下拉框抛出的值
 */
const onPidChange = (value: string): void => {
  const hit = CARD_PIDS.find((p) => p === value);
  if (hit) addPid.value = hit;
};

/**
 * 回写呈现方式：分段按钮抛 string | number，这里收窄成 GaugeType
 * @param value - 分段按钮抛出的值
 */
const onTypeChange = (value: string | number): void => {
  if (value === "line" || value === "bar" || value === "value") addType.value = value;
};

/** 幽灵框的像素样式：网格坐标换算成画布内的绝对位置 */
const ghostStyle = computed(() => {
  const g = ghost.value;
  if (!g) return null;
  return {
    left: `${(g.x / GRID_COLS) * 100}%`,
    top: `${g.y * rowHeight.value}px`,
    width: `${(g.w / GRID_COLS) * 100}%`,
    height: `${g.h * rowHeight.value}px`,
  };
});

/**
 * 接住卡片拖拽时抛出的落点预览
 * @param rect - 网格坐标矩形，松手时为 null
 */
const onPreview = (rect: { x: number; y: number; w: number; h: number } | null): void => {
  ghost.value = rect;
};

/** 撤销上一步编辑，并用提示条反馈 */
const doUndo = (): void => {
  if (!layout.undo()) return;
  show(t("dashboard.undoDone"));
};

/**
 * 删除卡片并给出可撤销的提示条
 * @param id - 卡片 ID
 */
const doRemove = (id: string): void => {
  const removed = layout.removeCard(id);
  if (!removed) return;
  // removed 是 store 里的响应式对象，structuredClone 会抛 DataCloneError，只能走 JSON
  const snapshot = JSON.parse(JSON.stringify(removed)) as CardDef;
  show(t("dashboard.cardRemoved"), {
    actionLabel: t("common.undo"),
    onAction: () => {
      // 撤销可能已经跨过若干步，直接把卡片塞回去比依赖历史栈更稳
      if (layout.cards.some((c) => c.id === snapshot.id)) return;
      layout.restoreCard(snapshot);
    },
  });
};

/** 按当前 PID 与呈现方式追加一张卡片 */
const addCard = (): void => {
  layout.addCard(addPid.value, addType.value);
  layout.sidebarOpen = false;
};

/**
 * 编辑态全局快捷键：Esc 取消编辑、Ctrl/Cmd+Z 撤销、Ctrl/Cmd+Enter 保存
 * @param e - 键盘事件
 */
const onGlobalKeydown = (e: KeyboardEvent): void => {
  if (!layout.editing) return;
  // 输入控件内的 Esc / 撤销交给控件自己处理，别抢
  const target = e.target as HTMLElement | null;
  const inField =
    !!target &&
    (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
  const mod = e.metaKey || e.ctrlKey;

  if (e.key === "Escape" && !inField) {
    e.preventDefault();
    layout.cancelEdit();
    return;
  }
  if (mod && !e.shiftKey && e.key.toLowerCase() === "z") {
    if (inField) return;
    e.preventDefault();
    doUndo();
    return;
  }
  if (mod && e.key === "Enter") {
    e.preventDefault();
    void layout.save();
  }
};

/** 导出当前布局到 JSON 文本并复制到剪贴板 */
const doExport = async (): Promise<void> => {
  jsonText.value = layout.toJSON();
  try {
    await navigator.clipboard.writeText(jsonText.value);
    importMsg.value = t("dashboard.exportCopied");
    show(t("dashboard.exportCopied"));
  } catch {
    importMsg.value = "";
  }
};

/** 从 JSON 文本导入布局，并用提示条反馈结果 */
const doImport = (): void => {
  const ok = layout.fromJSON(jsonText.value);
  importMsg.value = ok ? t("dashboard.importOk") : t("dashboard.importFail");
  show(ok ? t("dashboard.importOk") : t("dashboard.importFail"));
};
</script>

<template>
  <!-- 根用 flex:1 撑满内容区剩余高度（内容区是 flex 列）。
       不能用 h-full：内容区 overflow:auto 时 height:100% 基准是内容高度而非可用高度，会塌陷。 -->
  <div class="relative flex min-h-0 flex-1 flex-col">
    <!-- 编辑态操作条：非编辑态不渲染，垂直空间全部留给卡片（标题已在顶栏） -->
    <div v-if="layout.editing" class="dash-editbar">
      <div class="dash-editbar__hints">
        <p class="md-body-small dash-editbar__hint">
          {{ flow ? t("dashboard.configDescFlow") : t("dashboard.configDesc") }}
        </p>
        <p v-if="!flow" class="md-label-small dash-editbar__keys">
          {{ t("dashboard.configDescKeys") }}
        </p>
      </div>
      <!-- 无可撤销内容时按钮仍在位但禁用，避免操作条宽度跳动 -->
      <MdIconButton
        icon="i-lucide-undo-2"
        :label="t('dashboard.undo')"
        :disabled="!layout.canUndo"
        @click="doUndo"
      />
      <MdIconButton
        icon="i-lucide-sliders-horizontal"
        :label="t('dashboard.config')"
        @click="layout.sidebarOpen = true"
      />
      <MdButton variant="text" @click="layout.cancelEdit()">{{ t("common.cancel") }}</MdButton>
      <MdButton variant="filled" icon="i-lucide-check" @click="layout.save()">
        {{ t("common.done") }}
      </MdButton>
    </div>

    <!-- 卡片画布：绝对定位网格与窄屏流式堆叠两套渲染 -->
    <div
      ref="containerRef"
      class="dash-canvas relative w-full min-h-0"
      :class="{ 'dash-canvas--fab-space': !layout.editing }"
      :style="containerStyle"
    >
      <!-- 流式堆叠（窄屏）：按原顺序单/双列排列，规避 12 列网格在手机上过窄 -->
      <div
        v-if="flow"
        class="grid gap-3"
        :style="{ gridTemplateColumns: `repeat(${flowCols}, minmax(0, 1fr))` }"
      >
        <div v-for="card in flowCards" :key="card.id" :style="{ height: `${flowHeight(card)}px` }">
          <DashboardCard
            :card="card"
            :editing="layout.editing"
            flow
            :container-width="containerWidth"
            :row-height="rowHeight"
            @remove="doRemove(card.id)"
            @update="(patch) => layout.updateCard(card.id, patch)"
          />
        </div>
      </div>

      <template v-else>
        <!-- 编辑态网格背景线：dashed + primary 20% 透明度 -->
        <div v-if="gridLines" class="pointer-events-none absolute inset-0" aria-hidden="true">
          <div
            v-for="c in gridLines.cols"
            :key="`c${c}`"
            class="dash-grid-col absolute top-0 h-full"
            :style="{ left: `${(c / GRID_COLS) * 100}%` }"
          />
          <div
            v-for="r in gridLines.rows"
            :key="`r${r}`"
            class="dash-grid-row absolute left-0 w-full"
            :style="{ top: `${r * rowHeight}px` }"
          />
        </div>

        <!-- 落点幽灵框：拖拽期间显示卡片将落到哪个格子，压在网格线上、卡片下 -->
        <div v-if="ghost && ghostStyle" class="dash-ghost" :style="ghostStyle" aria-hidden="true" />

        <DashboardCard
          v-for="card in layout.cards"
          :key="card.id"
          :card="card"
          :editing="layout.editing"
          :container-width="containerWidth"
          :row-height="rowHeight"
          @move="(x, y) => layout.moveCard(card.id, x, y)"
          @resize="(w, h) => layout.resizeCard(card.id, w, h)"
          @remove="doRemove(card.id)"
          @update="(patch) => layout.updateCard(card.id, patch)"
          @preview="onPreview"
        />
      </template>

      <!-- 空态：一列图标 + 说明，居中显示（网格模式下覆盖整块画布） -->
      <div
        v-if="layout.cards.length === 0"
        class="dash-empty"
        :class="{ 'dash-empty--overlay': !flow }"
      >
        <span class="i-lucide-layout-dashboard dash-empty__icon" aria-hidden="true" />
        <p class="md-body-medium">{{ t("dashboard.empty") }}</p>
        <MdButton variant="filled" icon="i-lucide-plus" @click="layout.sidebarOpen = true">
          {{ t("dashboard.addCard") }}
        </MdButton>
      </div>
    </div>

    <!-- 右下角编辑入口：编辑态由顶部操作条接管，不再显示 -->
    <div v-if="!layout.editing" class="dash-fab">
      <MdFab
        icon="i-lucide-pen-line"
        :extended="fabExtended"
        :label="t('dashboard.edit')"
        @click="layout.enterEdit()"
      >
        {{ t("dashboard.edit") }}
      </MdFab>
    </div>

    <!-- 配置侧边面板：添加卡片 / 预设布局 / 布局 JSON 三段 -->
    <MdSideSheet v-model="layout.sidebarOpen" :headline="t('dashboard.config')">
      <!-- 1. 添加卡片 -->
      <section class="dash-section">
        <h3 class="md-title-small dash-section__title">{{ t("dashboard.addCard") }}</h3>
        <div class="dash-addrow">
          <MdSelect
            class="dash-addrow__select"
            :model-value="addPid"
            :label="t('dashboard.addCard')"
            :options="pidOptions"
            @update:model-value="onPidChange"
          />
          <MdButton variant="filled" icon="i-lucide-plus" @click="addCard">
            {{ t("common.add") }}
          </MdButton>
          <!-- 三项并排放不下 360 宽的面板，呈现方式独占一行 -->
          <MdSegmentedButton
            class="dash-addrow__type"
            full-width
            :model-value="addType"
            :options="typeOptions"
            @update:model-value="onTypeChange"
          />
        </div>
      </section>

      <MdDivider />

      <!-- 2. 预设布局 -->
      <section class="dash-section">
        <h3 class="md-title-small dash-section__title">{{ t("dashboard.preset") }}</h3>
        <div class="dash-presets">
          <MdChip
            variant="filter"
            :label="t('dashboard.presetDefault')"
            @click="layout.applyPreset('default')"
          />
          <MdChip
            variant="filter"
            :label="t('dashboard.presetCompact')"
            @click="layout.applyPreset('compact')"
          />
        </div>
        <!-- 重置是破坏性操作，用局部 error 文字色区分 -->
        <div class="dash-danger">
          <MdButton variant="text" @click="layout.applyPreset('default')">
            {{ t("dashboard.resetLayout") }}
          </MdButton>
        </div>
      </section>

      <MdDivider />

      <!-- 3. 布局配置 JSON -->
      <section class="dash-section">
        <h3 class="md-title-small dash-section__title">{{ t("dashboard.layoutJson") }}</h3>
        <textarea
          v-model="jsonText"
          class="dash-json md-mono md-body-small md-selectable"
          spellcheck="false"
          :aria-label="t('dashboard.layoutJson')"
        ></textarea>
        <div class="dash-json__actions">
          <MdButton variant="outlined" block @click="doExport">
            {{ t("dashboard.export") }}
          </MdButton>
          <MdButton variant="outlined" block @click="doImport">
            {{ t("dashboard.import") }}
          </MdButton>
        </div>
        <p v-if="importMsg" class="md-body-small dash-import-msg">{{ importMsg }}</p>
      </section>
    </MdSideSheet>
  </div>
</template>

<style scoped>
/* ---------- 编辑态操作条 ---------- */
.dash-editbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding-bottom: 12px;
}

/* 提示区：占满左侧剩余空间，把操作按钮推到右端。
   两行提示都单行截断——一旦允许换行，中等宽度窗口下提示会把
   「完成」按钮挤到第二行，操作条凭空长高 48px 吃掉卡片空间。 */
.dash-editbar__hints {
  min-width: 0;
  margin-right: auto;
}

.dash-editbar__hint,
.dash-editbar__keys {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--md-sys-color-on-surface-variant);
}

.dash-editbar__keys {
  margin-top: 2px;
  opacity: 0.72;
}

/* 快捷键提示是桌面专属信息：窗口不够宽时先牺牲它，保住操作条单行 */
@media (max-width: 1199px) {
  .dash-editbar__keys {
    display: none;
  }
}

/* 窄屏两行时让提示独占第一行、四个按钮整齐排在第二行，
   否则撤销按钮会孤零零挂在提示行末尾 */
@media (max-width: 599px) {
  .dash-editbar__hints {
    flex-basis: 100%;
    margin-right: 0;
  }
}

/* 拖拽落点幽灵框：虚线主色边 + 极淡主色底，只提示「会落到这儿」，
   刻意不加阴影与实底，免得和真正被拖动的卡片抢视觉重量 */
.dash-ghost {
  position: absolute;
  box-sizing: border-box;
  padding: 8px;
  pointer-events: none;
  z-index: calc(var(--md-sys-z-fab) - 1);
}

.dash-ghost::after {
  content: "";
  display: block;
  width: 100%;
  height: 100%;
  border: 2px dashed var(--md-sys-color-primary);
  border-radius: var(--md-sys-shape-corner-medium);
  background: color-mix(in srgb, var(--md-sys-color-primary) 10%, transparent);
}

/* 非编辑态右下角有悬浮 FAB：底部预留它的高度，避免压住最后一行卡片的数据 */
.dash-canvas--fab-space {
  padding-bottom: 80px;
}

/* 宽屏 FAB 是带文字的扩展样式，比窄屏的圆形 FAB 更高 */
@media (min-width: 600px) {
  .dash-canvas--fab-space {
    padding-bottom: 88px;
  }
}

/* ---------- 编辑态网格背景线 ---------- */
.dash-grid-col {
  border-left: 1px dashed color-mix(in srgb, var(--md-sys-color-primary) 20%, transparent);
}

.dash-grid-row {
  border-top: 1px dashed color-mix(in srgb, var(--md-sys-color-primary) 20%, transparent);
}

/* ---------- 空态 ---------- */
.dash-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  width: 100%;
  min-height: 240px;
  color: var(--md-sys-color-on-surface-variant);
  text-align: center;
}

.dash-empty__icon {
  width: 48px;
  height: 48px;
}

/* 网格模式下画布有确定高度，空态直接铺满画布做垂直居中 */
.dash-empty--overlay {
  position: absolute;
  inset: 0;
  min-height: 0;
}

/* ---------- 右下角 FAB ---------- */
.dash-fab {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: var(--md-sys-z-fab);
}

/* 手机竖屏底部有导航条，FAB 上移避开 */
@media (max-width: 600px) {
  .dash-fab {
    bottom: 96px;
  }
}

/* ---------- 配置面板分段 ---------- */
.dash-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 0;
}

.dash-section__title {
  color: var(--md-sys-color-on-surface-variant);
}

/* 面板宽 360，三项并排放不下，允许换行：PID 与添加按钮一行，呈现方式独占一行 */
.dash-addrow {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

.dash-addrow__select {
  flex: 1 1 160px;
  min-width: 0;
}

.dash-addrow__type {
  flex: 1 1 100%;
  min-width: 0;
}

.dash-presets {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

/* 局部 error 前景：重置按钮用 text 变体 + error 文字色 */
.dash-danger :deep(.md-btn) {
  color: var(--md-sys-color-error);
  --md-state-layer-color: var(--md-sys-color-error);
}

/* ---------- JSON 文本域 ---------- */
.dash-json {
  width: 100%;
  min-height: 140px;
  padding: 12px;
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-corner-medium);
  background: var(--md-sys-color-surface-container-lowest);
  color: var(--md-sys-color-on-surface);
  resize: none;
}

.dash-json:focus-visible {
  border-color: var(--md-sys-color-primary);
}

.dash-json__actions {
  display: flex;
  gap: 8px;
}

.dash-import-msg {
  color: var(--md-sys-color-primary);
  overflow-wrap: anywhere;
}
</style>
