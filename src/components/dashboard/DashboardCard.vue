<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";

import { type DashboardCard, type GaugeType } from "@shared/dashboard";
import LineContent from "./LineContent.vue";
import BarContent from "./BarContent.vue";
import ValueContent from "./ValueContent.vue";

const props = defineProps<{
  /** 卡片定义 */
  card: DashboardCard;
  /** 是否编辑模式 */
  editing: boolean;
  /** 容器宽度（px），用于网格换算 */
  containerWidth: number;
  /** 当前行高（px），随视口适配变化 */
  rowHeight: number;
}>();

const emit = defineEmits<{
  (e: "move", x: number, y: number): void;
  (e: "resize", w: number, h: number): void;
  (e: "remove"): void;
  (e: "update", patch: Partial<DashboardCard>): void;
}>();

const { t } = useI18n();

const types: { type: GaugeType; icon: string }[] = [
  { type: "line", icon: "i-lucide-chart-line" },
  { type: "bar", icon: "i-lucide-chart-bar" },
  { type: "value", icon: "i-lucide-text" },
];

const style = computed(() => ({
  left: `${(props.card.x / 12) * 100}%`,
  top: `${props.card.y * props.rowHeight}px`,
  width: `${(props.card.w / 12) * 100}%`,
  height: `${props.card.h * props.rowHeight}px`,
}));

const dragOffset = ref({ x: 0, y: 0 });
const resizeOffset = ref({ w: 0, h: 0 });
let dragging = false;
let resizing = false;
let dragStart = { x: 0, y: 0, cardX: 0, cardY: 0 };
let resizeStart = { x: 0, y: 0, cardW: 0, cardH: 0 };

const colWidth = (): number => props.containerWidth / 12;

const onDragStart = (e: PointerEvent): void => {
  if (!props.editing) return;
  dragging = true;
  dragStart = { x: e.clientX, y: e.clientY, cardX: props.card.x, cardY: props.card.y };
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
};

const onDragMove = (e: PointerEvent): void => {
  if (!dragging) return;
  dragOffset.value = {
    x: e.clientX - dragStart.x,
    y: e.clientY - dragStart.y,
  };
};

const onDragEnd = (): void => {
  if (!dragging) return;
  dragging = false;
  const nx = dragStart.cardX + dragOffset.value.x / colWidth();
  const ny = dragStart.cardY + dragOffset.value.y / props.rowHeight;
  emit("move", nx, ny);
  dragOffset.value = { x: 0, y: 0 };
};

const onResizeStart = (e: PointerEvent): void => {
  if (!props.editing) return;
  resizing = true;
  resizeStart = { x: e.clientX, y: e.clientY, cardW: props.card.w, cardH: props.card.h };
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
};

const onResizeMove = (e: PointerEvent): void => {
  if (!resizing) return;
  resizeOffset.value = {
    w: (e.clientX - resizeStart.x) / colWidth(),
    h: (e.clientY - resizeStart.y) / props.rowHeight,
  };
};

const onResizeEnd = (): void => {
  if (!resizing) return;
  resizing = false;
  emit(
    "resize",
    resizeStart.cardW + resizeOffset.value.w,
    resizeStart.cardH + resizeOffset.value.h
  );
  resizeOffset.value = { w: 0, h: 0 };
};

const minText = ref(String(props.card.min ?? ""));
const maxText = ref(String(props.card.max ?? ""));

const applyRange = (): void => {
  const parse = (s: string): number | null => {
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };
  emit("update", { min: parse(minText.value), max: parse(maxText.value) });
};

/**
 * 调整数值卡片字号缩放
 * @param delta - 缩放增量（正为放大，负为缩小），范围 0.6~2.5
 */
const adjustFont = (delta: number): void => {
  const next = Math.min(2.5, Math.max(0.6, (props.card.fontScale ?? 1) + delta));
  emit("update", { fontScale: Math.round(next * 100) / 100 });
};
</script>

<template>
  <!-- 定位层：网格定位 + 卡片间距（p-2） -->
  <div
    class="absolute flex flex-col p-2"
    :style="{
      ...style,
      transform:
        editing && (dragOffset.x || dragOffset.y)
          ? `translate(${dragOffset.x}px, ${dragOffset.y}px)`
          : undefined,
    }"
  >
    <!-- 删除按钮（编辑态），置于视觉层外避免被 overflow 裁剪 -->
    <button
      v-if="editing"
      class="flex-center absolute -top-1.5 -right-1.5 z-10 h-6 w-6 rounded-full bg-red-500 text-white shadow-md transition-transform hover:scale-110"
      :title="t('dashboard.removeCard')"
      @click="emit('remove')"
    >
      <span class="i-lucide-x h-3.5 w-3.5" />
    </button>

    <!-- 视觉层：卡片外观与内容 -->
    <div
      class="glass-card relative flex min-h-0 flex-1 flex-col overflow-hidden transition-shadow"
      :class="editing ? 'ring-2 ring-sky-400/70 shadow-lg shadow-sky-900/30' : ''"
    >
      <!-- 编辑工具栏 -->
      <div
        v-if="editing"
        class="flex flex-wrap items-center gap-1 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2 py-1"
      >
        <button
          v-for="item in types"
          :key="item.type"
          class="flex-center rounded-md p-1 transition-colors"
          :class="
            card.type === item.type
              ? 'bg-sky-400/20 text-sky-300'
              : 'text-secondary hover:bg-[var(--color-hover)]'
          "
          :title="t(`dashboard.type.${item.type}`)"
          @click="emit('update', { type: item.type })"
        >
          <span :class="item.icon" class="h-4 w-4" />
        </button>
        <div v-if="card.type !== 'value'" class="ml-auto flex items-center gap-1">
          <input
            v-model="minText"
            type="number"
            class="border-border bg-[var(--color-card)] text-secondary w-14 rounded border px-1 py-0.5 text-xs outline-none"
            :placeholder="t('dashboard.auto')"
            @change="applyRange"
          />
          <span class="text-secondary text-xs">—</span>
          <input
            v-model="maxText"
            type="number"
            class="border-border bg-[var(--color-card)] text-secondary w-14 rounded border px-1 py-0.5 text-xs outline-none"
            :placeholder="t('dashboard.auto')"
            @change="applyRange"
          />
        </div>
        <!-- 数值卡片：字号调节 -->
        <div v-else class="ml-auto flex items-center gap-1">
          <button
            class="text-secondary hover:bg-[var(--color-hover)] rounded-md px-1.5 py-0.5 text-sm leading-none"
            :title="t('dashboard.fontSmaller')"
            @click="adjustFont(-0.15)"
          >
            A−
          </button>
          <span class="text-secondary font-mono w-9 text-center text-xs"
            >{{ Math.round((card.fontScale ?? 1) * 100) }}%</span
          >
          <button
            class="text-secondary hover:bg-[var(--color-hover)] rounded-md px-1.5 py-0.5 text-sm leading-none"
            :title="t('dashboard.fontLarger')"
            @click="adjustFont(0.15)"
          >
            A+
          </button>
        </div>
      </div>

      <!-- 标题（拖拽手柄） -->
      <div
        class="flex items-center justify-between px-3 pt-2.5"
        :class="editing ? 'cursor-grab active:cursor-grabbing' : ''"
        @pointerdown="onDragStart"
        @pointermove="onDragMove"
        @pointerup="onDragEnd"
        @pointercancel="onDragEnd"
      >
        <span class="text-primary/90 truncate text-sm font-semibold tracking-wide">
          {{ t(`pid.${card.pid}`) }}
        </span>
      </div>

      <!-- 内容 -->
      <div class="min-h-0 flex-1 px-3 pb-3">
        <LineContent v-if="card.type === 'line'" :pid="card.pid" :min="card.min" :max="card.max" />
        <BarContent
          v-else-if="card.type === 'bar'"
          :pid="card.pid"
          :min="card.min"
          :max="card.max"
        />
        <ValueContent v-else :pid="card.pid" :font-scale="card.fontScale" />
      </div>

      <!-- 缩放句柄（编辑态） -->
      <div
        v-if="editing"
        class="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize"
        @pointerdown="onResizeStart"
        @pointermove="onResizeMove"
        @pointerup="onResizeEnd"
        @pointercancel="onResizeEnd"
      >
        <span class="i-lucide-grip absolute bottom-0.5 right-0.5 h-3 w-3 text-sky-300" />
      </div>
    </div>
  </div>
</template>
