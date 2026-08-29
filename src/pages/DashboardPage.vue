<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";

import { useDashboardStore } from "@/stores/dashboard";
import { usePrefsStore } from "@/stores/prefs";
import {
  GRID_COLS,
  GRID_ROW_HEIGHT,
  CARD_PIDS,
  type DashboardCard as CardDef,
  type GaugeType,
  type Pid,
} from "@shared/dashboard";
import DashboardCard from "@/components/dashboard/DashboardCard.vue";

const { t } = useI18n();
const layout = useDashboardStore();
const prefs = usePrefsStore();

const containerRef = ref<HTMLDivElement>();
const containerWidth = ref(0);
const containerHeight = ref(0);
let ro: ResizeObserver | null = null;

/** 流式布局阈值：低于此宽度时 12 列网格的单卡不足百像素，改为顺序堆叠 */
const FLOW_WIDTH = 560;
/** 双列堆叠阈值：再窄就只放一列 */
const FLOW_TWO_COL_WIDTH = 420;

/** 是否流式布局（手机竖屏 / 小窗） */
const flow = computed(() => containerWidth.value > 0 && containerWidth.value < FLOW_WIDTH);
/** 流式布局列数 */
const flowCols = computed(() => (containerWidth.value >= FLOW_TWO_COL_WIDTH ? 2 : 1));
/** 流式布局的卡片顺序：沿用原网格的行列先后 */
const flowCards = computed(() => [...layout.cards].sort((a, b) => a.y - b.y || a.x - b.x));

/**
 * 流式布局下的卡片高度
 * @param card - 卡片定义
 * @returns 像素高度（由原始行数折算并夹到可读区间）
 */
const flowHeight = (card: CardDef): number => Math.min(220, Math.max(104, card.h * 38));

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
  ro = new ResizeObserver((entries) => {
    for (const entry of entries) {
      containerWidth.value = entry.contentRect.width;
      containerHeight.value = entry.contentRect.height;
    }
  });
  if (containerRef.value) ro.observe(containerRef.value);
});

onBeforeUnmount(() => {
  ro?.disconnect();
  ro = null;
});

/* ---------- 配置侧栏 ---------- */

const addPid = ref<Pid>("SPEED");
const addType = ref<GaugeType>("line");
const jsonText = ref("");
const importMsg = ref("");

const addCard = (): void => {
  layout.addCard(addPid.value, addType.value);
};

const doExport = async (): Promise<void> => {
  jsonText.value = layout.toJSON();
  try {
    await navigator.clipboard.writeText(jsonText.value);
    importMsg.value = t("dashboard.exportCopied");
  } catch {
    importMsg.value = "";
  }
};

const doImport = (): void => {
  importMsg.value = layout.fromJSON(jsonText.value)
    ? t("dashboard.importOk")
    : t("dashboard.importFail");
};
</script>

<template>
  <div class="flex h-full flex-col gap-4 max-sm:gap-2">
    <!-- 编辑态操作行：非编辑态不渲染，垂直空间全部留给卡片（标题已移入顶栏） -->
    <div v-if="layout.editing" class="flex flex-wrap items-center justify-end gap-2">
      <button class="btn-ghost btn-sm" @click="layout.sidebarOpen = true">
        {{ t("dashboard.config") }}
      </button>
      <button class="btn-ghost btn-sm" @click="layout.cancelEdit()">
        {{ t("common.cancel") }}
      </button>
      <button class="btn-primary btn-sm" @click="layout.save()">
        {{ t("common.save") }}
      </button>
    </div>

    <!-- 卡片布局区 -->
    <div ref="containerRef" class="relative w-full" :style="containerStyle">
      <!-- 流式堆叠（窄屏）：按原顺序单/双列排列，规避 12 列网格在手机上过窄 -->
      <div
        v-if="flow"
        class="grid gap-2"
        :style="{ gridTemplateColumns: `repeat(${flowCols}, minmax(0, 1fr))` }"
      >
        <div v-for="card in flowCards" :key="card.id" :style="{ height: `${flowHeight(card)}px` }">
          <DashboardCard
            :card="card"
            :editing="layout.editing"
            flow
            :container-width="containerWidth"
            :row-height="rowHeight"
            @remove="layout.removeCard(card.id)"
            @update="(patch) => layout.updateCard(card.id, patch)"
          />
        </div>
      </div>

      <template v-else>
        <!-- 编辑态网格背景线 -->
        <div v-if="gridLines" class="pointer-events-none absolute inset-0">
          <div
            v-for="c in gridLines.cols"
            :key="`c${c}`"
            class="absolute top-0 h-full border-l border-dashed border-[var(--color-accent)]/20"
            :style="{ left: `${(c / GRID_COLS) * 100}%` }"
          />
          <div
            v-for="r in gridLines.rows"
            :key="`r${r}`"
            class="absolute left-0 w-full border-t border-dashed border-[var(--color-accent)]/20"
            :style="{ top: `${r * rowHeight}px` }"
          />
        </div>

        <DashboardCard
          v-for="card in layout.cards"
          :key="card.id"
          :card="card"
          :editing="layout.editing"
          :container-width="containerWidth"
          :row-height="rowHeight"
          @move="(x, y) => layout.moveCard(card.id, x, y)"
          @resize="(w, h) => layout.resizeCard(card.id, w, h)"
          @remove="layout.removeCard(card.id)"
          @update="(patch) => layout.updateCard(card.id, patch)"
        />
      </template>

      <div v-if="layout.cards.length === 0" class="text-secondary flex-center h-64 w-full text-sm">
        {{ t("dashboard.empty") }}
      </div>
    </div>

    <!-- 布局配置侧栏 -->
    <Teleport to="body">
      <div v-if="layout.sidebarOpen" class="fixed inset-0 z-40">
        <div class="absolute inset-0 bg-black/40" @click="layout.sidebarOpen = false" />
        <aside
          class="border-border absolute top-0 right-0 flex h-full w-80 flex-col gap-4 border-l bg-[var(--color-bg-elevated)] p-4 shadow-2xl max-sm:w-[88vw]"
        >
          <div class="flex items-center justify-between">
            <h2 class="text-primary font-semibold">{{ t("dashboard.config") }}</h2>
            <button class="btn-quiet btn-icon-sm" @click="layout.sidebarOpen = false">
              <span class="i-lucide-x h-4 w-4" />
            </button>
          </div>

          <!-- 添加卡片 -->
          <section class="flex flex-col gap-2">
            <div class="text-secondary text-sm">{{ t("dashboard.addCard") }}</div>
            <div class="flex gap-2">
              <select
                v-model="addPid"
                class="border-border bg-[var(--color-card)] text-primary min-w-0 flex-1 rounded-lg border px-2 py-1.5 text-sm outline-none"
              >
                <option v-for="p in CARD_PIDS" :key="p" :value="p">{{ t(`pid.${p}`) }}</option>
              </select>
              <select
                v-model="addType"
                class="border-border bg-[var(--color-card)] text-primary rounded-lg border px-2 py-1.5 text-sm outline-none"
              >
                <option value="line">{{ t("dashboard.type.line") }}</option>
                <option value="bar">{{ t("dashboard.type.bar") }}</option>
                <option value="value">{{ t("dashboard.type.value") }}</option>
              </select>
              <button class="btn-primary btn-sm" @click="addCard">+</button>
            </div>
          </section>

          <!-- 预设布局 -->
          <section class="flex flex-col gap-2">
            <div class="text-secondary text-sm">{{ t("dashboard.preset") }}</div>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="preset in [
                  { key: 'default', label: t('dashboard.presetDefault') },
                  { key: 'compact', label: t('dashboard.presetCompact') },
                ]"
                :key="preset.key"
                class="btn-ghost btn-xs"
                @click="layout.applyPreset(preset.key as never)"
              >
                {{ preset.label }}
              </button>
            </div>
            <button
              class="btn-ghost btn-xs !text-[var(--color-danger)] hover:!bg-[var(--color-danger-solid)]/12"
              @click="layout.applyPreset('default')"
            >
              {{ t("dashboard.resetLayout") }}
            </button>
          </section>

          <!-- 导入 / 导出 -->
          <section class="flex min-h-0 flex-1 flex-col gap-2">
            <div class="text-secondary text-sm">{{ t("dashboard.layoutJson") }}</div>
            <textarea
              v-model="jsonText"
              class="border-border bg-[var(--color-card)] text-secondary font-mono min-h-0 flex-1 resize-none rounded-lg border p-2 text-xs outline-none"
              spellcheck="false"
            />
            <div class="flex gap-2">
              <button class="btn-ghost btn-sm flex-1" @click="doExport">
                {{ t("dashboard.export") }}
              </button>
              <button class="btn-ghost btn-sm flex-1" @click="doImport">
                {{ t("dashboard.import") }}
              </button>
            </div>
            <div v-if="importMsg" class="text-xs text-[var(--color-accent-text)]">
              {{ importMsg }}
            </div>
          </section>
        </aside>
      </div>
    </Teleport>
  </div>
</template>
