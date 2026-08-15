<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";

import { useDashboardStore } from "@/stores/dashboard";
import { useObdStore } from "@/stores/obd";
import { usePrefsStore } from "@/stores/prefs";
import { GRID_COLS, GRID_ROW_HEIGHT, CARD_PIDS, type GaugeType, type Pid } from "@shared/dashboard";
import DashboardCard from "@/components/dashboard/DashboardCard.vue";

const { t } = useI18n();
const layout = useDashboardStore();
const obd = useObdStore();
const prefs = usePrefsStore();

const containerRef = ref<HTMLDivElement>();
const containerWidth = ref(0);
const containerHeight = ref(0);
let ro: ResizeObserver | null = null;

const hasData = computed(() => obd.lastTs > 0);

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
  if (prefs.fitViewport) {
    // 适配模式：高度随窗口伸缩；行高有下限，窗口过小时允许滚动而不是裁掉内容
    return { flex: "1", minHeight: "0", overflow: "auto" as const };
  }
  return { height: `${totalRows.value * GRID_ROW_HEIGHT + 24}px` };
});

const gridLines = computed(() => {
  if (!layout.editing) return null;
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
  <div class="flex h-full flex-col gap-4">
    <!-- 标题栏 + 编辑按钮组 -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-primary text-lg font-semibold">{{ t("dashboard.title") }}</h1>
        <p v-if="!hasData" class="text-secondary mt-1 text-sm">{{ t("dashboard.noData") }}</p>
      </div>
      <div class="flex items-center gap-2">
        <template v-if="layout.editing">
          <button
            class="border-[var(--color-border)] text-secondary hover:bg-[var(--color-hover)] rounded-lg border px-3 py-1.5 text-sm transition-colors"
            @click="layout.sidebarOpen = true"
          >
            {{ t("dashboard.config") }}
          </button>
          <button
            class="border-[var(--color-border)] text-secondary hover:bg-[var(--color-hover)] rounded-lg border px-3 py-1.5 text-sm transition-colors"
            @click="layout.cancelEdit()"
          >
            {{ t("common.cancel") }}
          </button>
          <button
            class="rounded-lg bg-sky-500/90 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-sky-500"
            @click="layout.save()"
          >
            {{ t("common.save") }}
          </button>
        </template>
      </div>
    </div>

    <!-- 卡片布局区 -->
    <div ref="containerRef" class="relative w-full" :style="containerStyle">
      <!-- 编辑态网格背景线 -->
      <div v-if="gridLines" class="pointer-events-none absolute inset-0">
        <div
          v-for="c in gridLines.cols"
          :key="`c${c}`"
          class="absolute top-0 h-full border-l border-dashed border-sky-400/15"
          :style="{ left: `${(c / GRID_COLS) * 100}%` }"
        />
        <div
          v-for="r in gridLines.rows"
          :key="`r${r}`"
          class="absolute left-0 w-full border-t border-dashed border-sky-400/15"
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

      <div v-if="layout.cards.length === 0" class="text-secondary flex-center h-64 w-full text-sm">
        {{ t("dashboard.empty") }}
      </div>
    </div>

    <!-- 布局配置侧栏 -->
    <Teleport to="body">
      <div v-if="layout.sidebarOpen" class="fixed inset-0 z-40">
        <div class="absolute inset-0 bg-black/40" @click="layout.sidebarOpen = false" />
        <aside
          class="border-border absolute top-0 right-0 flex h-full w-80 flex-col gap-4 border-l bg-[var(--color-bg-elevated)] p-4 shadow-2xl"
        >
          <div class="flex items-center justify-between">
            <h2 class="text-primary font-semibold">{{ t("dashboard.config") }}</h2>
            <button
              class="text-secondary hover:bg-[var(--color-hover)] hover:text-primary flex h-7 w-7 items-center justify-center rounded-md"
              @click="layout.sidebarOpen = false"
            >
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
              <button
                class="rounded-lg bg-sky-500/90 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-500"
                @click="addCard"
              >
                +
              </button>
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
                class="border-border text-secondary hover:bg-[var(--color-hover)] rounded-lg border px-2.5 py-1 text-xs"
                @click="layout.applyPreset(preset.key as never)"
              >
                {{ preset.label }}
              </button>
            </div>
            <button
              class="border-border text-red-300/80 hover:bg-red-400/10 rounded-lg border px-2.5 py-1 text-xs transition-colors"
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
              <button
                class="border-border text-secondary hover:bg-[var(--color-hover)] flex-1 rounded-lg border px-2 py-1.5 text-sm"
                @click="doExport"
              >
                {{ t("dashboard.export") }}
              </button>
              <button
                class="border-border text-secondary hover:bg-[var(--color-hover)] flex-1 rounded-lg border px-2 py-1.5 text-sm"
                @click="doImport"
              >
                {{ t("dashboard.import") }}
              </button>
            </div>
            <div v-if="importMsg" class="text-xs text-sky-300">{{ importMsg }}</div>
          </section>
        </aside>
      </div>
    </Teleport>
  </div>
</template>
