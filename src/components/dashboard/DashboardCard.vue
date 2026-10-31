<script setup lang="ts">
/**
 * 仪表盘卡片
 *
 * 结构分两层：外层「定位层」负责网格坐标与拖拽位移，内层 MD3 卡片负责外观与内容。
 * 之所以拆两层，是因为拖拽时只需要改定位层的 transform，卡片本体（阴影、圆角、裁剪）
 * 不受影响，也不会因 overflow:hidden 裁掉编辑态的删除按钮。
 */
import { computed, ref, watch, type CSSProperties } from "vue";
import { useI18n } from "vue-i18n";

import { GRID_COLS, type DashboardCard, type GaugeType } from "@shared/dashboard";
import { vRipple } from "@/directives/ripple";
import MdCard from "@/components/md3/MdCard.vue";
import MdIconButton from "@/components/md3/MdIconButton.vue";
import MdSegmentedButton from "@/components/md3/MdSegmentedButton.vue";
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
  /** 流式布局（窄屏堆叠）：由外层容器决定尺寸，不做网格定位与拖拽缩放 */
  flow?: boolean;
}>();

const emit = defineEmits<{
  (e: "move", x: number, y: number): void;
  (e: "resize", w: number, h: number): void;
  (e: "remove"): void;
  (e: "update", patch: Partial<DashboardCard>): void;
  /** 拖拽中的落点预览（网格坐标），松手时回传 null 清掉幽灵框 */
  (e: "preview", rect: { x: number; y: number; w: number; h: number } | null): void;
}>();

const { t } = useI18n();

/** 图表类型与图标；label 在 computed 里按当前语言取，避免语言切换后失效 */
const types: { type: GaugeType; icon: string }[] = [
  { type: "line", icon: "i-lucide-chart-line" },
  { type: "bar", icon: "i-lucide-chart-bar" },
  { type: "value", icon: "i-lucide-text" },
];

const typeOptions = computed(() =>
  types.map((item) => ({
    value: item.type,
    label: t(`dashboard.type.${item.type}`),
    icon: item.icon,
  }))
);

/** 贴边卡片的内缩量：编辑态删除按钮会向槽位外伸出 8px，
    贴左/贴右的卡片若顶到画布边缘，绝对定位元素会把滚动容器的
    scrollWidth 撑大，整页多出一条横向滚动条。 */
const EDGE_INSET = 8;

const style = computed<CSSProperties>(() => {
  // 流式布局下尺寸由外层网格单元决定
  if (props.flow) return {};
  const touchLeft = props.card.x === 0;
  const touchRight = props.card.x + props.card.w === GRID_COLS;
  const insetLeft = touchLeft ? EDGE_INSET : 0;
  const insetRight = touchRight ? EDGE_INSET : 0;
  return {
    left: `calc(${(props.card.x / 12) * 100}% + ${insetLeft}px)`,
    top: `${props.card.y * props.rowHeight}px`,
    width: `calc(${(props.card.w / 12) * 100}% - ${insetLeft + insetRight}px)`,
    height: `${props.card.h * props.rowHeight}px`,
  };
});

/** 是否可拖拽/缩放：流式布局下网格坐标无意义，禁用 */
const movable = computed(() => props.editing && !props.flow);

const dragOffset = ref({ x: 0, y: 0 });
const resizeOffset = ref({ w: 0, h: 0 });
/** 拖拽/缩放状态要驱动模板（幽灵框、层级、光标），必须是响应式的 */
const dragging = ref(false);
const resizing = ref(false);
const slotRef = ref<HTMLElement | null>(null);
let dragStart = { x: 0, y: 0, cardX: 0, cardY: 0 };
let resizeStart = { x: 0, y: 0, cardW: 0, cardH: 0 };
/** 自动滚动累计量：容器滚了多少，拖拽位移就要补多少，卡片才会一直贴在指针下 */
const scrollComp = ref({ x: 0, y: 0 });

/** 自动滚动的触发边距与步长（像素） */
const AUTO_SCROLL_EDGE = 56;
const AUTO_SCROLL_STEP = 12;

/** 自动滚动的方向：-1 向上、1 向下、0 不动 */
let autoScrollDir = 0;
let autoScrollRaf = 0;

/**
 * 找到最近的可滚动祖先（画布或页面内容区）
 * @param el - 起点元素
 * @returns 可滚动的祖先元素，找不到时为 null
 */
const scrollParent = (el: HTMLElement | null): HTMLElement | null => {
  let node = el?.parentElement ?? null;
  while (node) {
    const cs = getComputedStyle(node);
    if (/(auto|scroll)/.test(cs.overflowY) && node.scrollHeight > node.clientHeight) return node;
    node = node.parentElement;
  }
  return null;
};

/** 逐帧推进自动滚动；停止拖拽或指针离开边缘时自动退出 */
const tickAutoScroll = (): void => {
  if (!dragging.value || autoScrollDir === 0) {
    autoScrollRaf = 0;
    return;
  }
  const el = scrollParent(slotRef.value);
  if (el) {
    const before = el.scrollTop;
    el.scrollTop = before + autoScrollDir * AUTO_SCROLL_STEP;
    scrollComp.value = { ...scrollComp.value, y: scrollComp.value.y + (el.scrollTop - before) };
    dragOffset.value = { ...dragOffset.value, y: dragOffset.value.y + (el.scrollTop - before) };
  }
  autoScrollRaf = requestAnimationFrame(tickAutoScroll);
};

/**
 * 按指针位置更新自动滚动方向，并在需要时启动滚动循环
 * @param clientY - 指针的屏幕纵坐标
 */
const updateAutoScroll = (clientY: number): void => {
  const el = scrollParent(slotRef.value);
  if (!el) return;
  const rect = el.getBoundingClientRect();
  if (clientY < rect.top + AUTO_SCROLL_EDGE) autoScrollDir = -1;
  else if (clientY > rect.bottom - AUTO_SCROLL_EDGE) autoScrollDir = 1;
  else autoScrollDir = 0;
  if (autoScrollDir !== 0 && !autoScrollRaf) autoScrollRaf = requestAnimationFrame(tickAutoScroll);
};

/**
 * 单列宽度（px），把像素位移换算成网格列数
 * @returns 一列的像素宽度
 */
const colWidth = (): number => props.containerWidth / 12;

/**
 * 开始拖拽：记录起点并锁定指针，保证指针移出卡片后仍能收到 move 事件
 * @param e - 指针按下事件
 */
const onDragStart = (e: PointerEvent): void => {
  if (!movable.value) return;
  dragging.value = true;
  scrollComp.value = { x: 0, y: 0 };
  dragStart = { x: e.clientX, y: e.clientY, cardX: props.card.x, cardY: props.card.y };
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
};

/**
 * 拖拽过程中更新位移量（只改 transform，松手才提交网格坐标）
 * @param e - 指针移动事件
 */
const onDragMove = (e: PointerEvent): void => {
  if (!dragging.value) return;
  dragOffset.value = {
    x: e.clientX - dragStart.x + scrollComp.value.x,
    y: e.clientY - dragStart.y + scrollComp.value.y,
  };
  updateAutoScroll(e.clientY);
};

/** 结束拖拽：位移换算成网格坐标后提交，并把视觉位移归零 */
const onDragEnd = (): void => {
  if (!dragging.value) return;
  dragging.value = false;
  autoScrollDir = 0;
  const nx = dragStart.cardX + dragOffset.value.x / colWidth();
  const ny = dragStart.cardY + dragOffset.value.y / props.rowHeight;
  emit("move", nx, ny);
  dragOffset.value = { x: 0, y: 0 };
  scrollComp.value = { x: 0, y: 0 };
  emit("preview", null);
};

/**
 * 开始缩放：与拖拽同理锁定指针
 * @param e - 指针按下事件
 */
const onResizeStart = (e: PointerEvent): void => {
  if (!movable.value) return;
  resizing.value = true;
  resizeStart = { x: e.clientX, y: e.clientY, cardW: props.card.w, cardH: props.card.h };
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
};

/**
 * 缩放过程中更新尺寸增量（不直接改卡片尺寸，避免布局抖动）
 * @param e - 指针移动事件
 */
const onResizeMove = (e: PointerEvent): void => {
  if (!resizing.value) return;
  resizeOffset.value = {
    w: (e.clientX - resizeStart.x) / colWidth(),
    h: (e.clientY - resizeStart.y) / props.rowHeight,
  };
};

/** 结束缩放：增量叠加到起始尺寸后提交 */
const onResizeEnd = (): void => {
  if (!resizing.value) return;
  resizing.value = false;
  emit(
    "resize",
    resizeStart.cardW + resizeOffset.value.w,
    resizeStart.cardH + resizeOffset.value.h
  );
  resizeOffset.value = { w: 0, h: 0 };
};

const minText = ref(String(props.card.min ?? ""));
const maxText = ref(String(props.card.max ?? ""));

/** 提交量程输入：空串或非法值视为「自动」（null） */
const applyRange = (): void => {
  const parse = (s: string): number | null => {
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };
  emit("update", { min: parse(minText.value), max: parse(maxText.value) });
};

/**
 * 判断分段按钮回传的值是否为合法图表类型（避免类型断言）
 * @param value - 分段按钮回传值
 * @returns 是否属于 GaugeType
 */
const isGaugeType = (value: string | number): value is GaugeType =>
  value === "line" || value === "bar" || value === "value";

/**
 * 切换图表类型
 * @param value - 分段按钮回传的选中值
 */
const onTypeChange = (value: string | number): void => {
  if (!isGaugeType(value)) return;
  emit("update", { type: value });
};

/**
 * 调整数值卡片字号缩放
 * @param delta - 缩放增量（正为放大，负为缩小），范围 0.6~2.5
 */
const adjustFont = (delta: number): void => {
  const next = Math.min(2.5, Math.max(0.6, (props.card.fontScale ?? 1) + delta));
  emit("update", { fontScale: Math.round(next * 100) / 100 });
};

/** 拖拽中的吸附落点：把像素位移换算成网格坐标并夹到画布内 */
const previewRect = computed(() => {
  if (!dragging.value) return null;
  const rawX = props.card.x + dragOffset.value.x / colWidth();
  const rawY = props.card.y + dragOffset.value.y / props.rowHeight;
  return {
    x: Math.min(Math.max(0, Math.round(rawX)), GRID_COLS - props.card.w),
    y: Math.max(0, Math.round(rawY)),
    w: props.card.w,
    h: props.card.h,
  };
});

watch(previewRect, (rect) => emit("preview", rect));

/**
 * 编辑态键盘操作：方向键移动一格，Shift+方向键改尺寸，Delete 删除。
 * 事件来自卡片内的输入框时直接放过，避免劫持数字微调与光标移动。
 * @param e - 键盘事件
 */
const onKeydown = (e: KeyboardEvent): void => {
  if (!movable.value || e.target !== e.currentTarget) return;
  const { card } = props;
  const key = e.key;
  const arrow =
    key === "ArrowLeft" || key === "ArrowRight" || key === "ArrowUp" || key === "ArrowDown";
  if (arrow) {
    e.preventDefault();
    const dx = key === "ArrowLeft" ? -1 : key === "ArrowRight" ? 1 : 0;
    const dy = key === "ArrowUp" ? -1 : key === "ArrowDown" ? 1 : 0;
    if (e.shiftKey) emit("resize", card.w + dx, card.h + dy);
    else emit("move", card.x + dx, card.y + dy);
    return;
  }
  if (key === "Delete" || key === "Backspace") {
    e.preventDefault();
    emit("remove");
  }
};
</script>

<template>
  <!-- 定位层：网格定位 + 卡片间距（8）；流式布局下填满外层单元 -->
  <div
    ref="slotRef"
    class="dash-slot"
    :class="[flow ? 'dash-slot--flow' : 'dash-slot--grid', { 'dash-slot--dragging': dragging }]"
    :tabindex="movable ? 0 : undefined"
    :role="movable ? 'group' : undefined"
    :aria-label="movable ? t(`pid.${card.pid}`) : undefined"
    :style="{
      ...style,
      transform:
        editing && (dragOffset.x || dragOffset.y)
          ? `translate(${dragOffset.x}px, ${dragOffset.y}px)`
          : undefined,
    }"
    @keydown="onKeydown"
  >
    <!-- 删除按钮（编辑态）：放在卡片外，避免被卡片 overflow 裁掉 -->
    <MdIconButton
      v-if="editing"
      class="dash-slot__remove"
      icon="i-lucide-x"
      :label="t('dashboard.removeCard')"
      variant="filled"
      size="sm"
      @click="emit('remove')"
    />

    <MdCard
      variant="elevated"
      padding="none"
      layout="column"
      class="dash-card"
      :class="[editing ? 'dash-card--editing' : '', { 'dash-card--dragging': dragging }]"
    >
      <!-- 编辑工具栏：左类型切换、右量程/字号 -->
      <div v-if="editing" class="dash-card__toolbar">
        <MdSegmentedButton
          :model-value="card.type"
          :options="typeOptions"
          @update:model-value="onTypeChange"
        />

        <div
          v-if="card.type !== 'value'"
          class="dash-card__range"
          role="group"
          :aria-label="t(`pid.${card.pid}`)"
        >
          <input
            v-model="minText"
            type="number"
            class="dash-card__range-input md-body-small md-mono"
            :placeholder="t('dashboard.auto')"
            @change="applyRange"
          />
          <span class="dash-card__range-sep" aria-hidden="true">—</span>
          <input
            v-model="maxText"
            type="number"
            class="dash-card__range-input md-body-small md-mono"
            :placeholder="t('dashboard.auto')"
            @change="applyRange"
          />
        </div>

        <!-- 数值卡片：字号缩放 -->
        <div v-else class="dash-card__font">
          <button
            v-ripple
            type="button"
            class="dash-card__font-btn md-state-layer md-mono"
            :aria-label="t('dashboard.fontSmaller')"
            :title="t('dashboard.fontSmaller')"
            @click="adjustFont(-0.15)"
          >
            A−
          </button>
          <span class="dash-card__font-value md-label-small md-mono">
            {{ Math.round((card.fontScale ?? 1) * 100) }}%
          </span>
          <button
            v-ripple
            type="button"
            class="dash-card__font-btn md-state-layer md-mono"
            :aria-label="t('dashboard.fontLarger')"
            :title="t('dashboard.fontLarger')"
            @click="adjustFont(0.15)"
          >
            A+
          </button>
        </div>
      </div>

      <!-- 标题行：网格布局下兼作拖拽手柄 -->
      <div
        class="dash-card__title"
        :class="movable ? 'dash-card__title--draggable' : ''"
        @pointerdown="onDragStart"
        @pointermove="onDragMove"
        @pointerup="onDragEnd"
        @pointercancel="onDragEnd"
      >
        <span class="dash-card__title-text md-title-small">{{ t(`pid.${card.pid}`) }}</span>
      </div>

      <!-- 内容区 -->
      <div class="dash-card__body">
        <LineContent v-if="card.type === 'line'" :pid="card.pid" :min="card.min" :max="card.max" />
        <BarContent
          v-else-if="card.type === 'bar'"
          :pid="card.pid"
          :min="card.min"
          :max="card.max"
        />
        <ValueContent v-else :pid="card.pid" :font-scale="card.fontScale" />
      </div>

      <!-- 缩放手柄（编辑态，仅网格布局）；纯指针操作，不进 Tab 序列 -->
      <div
        v-if="movable"
        class="dash-card__resize"
        aria-hidden="true"
        @pointerdown="onResizeStart"
        @pointermove="onResizeMove"
        @pointerup="onResizeEnd"
        @pointercancel="onResizeEnd"
      >
        <span class="dash-card__resize-dot" />
      </div>
    </MdCard>
  </div>
</template>

<style scoped>
/* ---------- 定位层 ---------- */
.dash-slot {
  position: relative;
}

/* 槽位必须是 flex 容器：否则内部的 .dash-card（flex: 1 1 auto）在块级上下文里
   高度由内容撑开，卡片会比槽位高出几十像素、压到下一行卡片上（表现为卡片重叠）。 */
.dash-slot--grid {
  position: absolute;
  display: flex;
  padding: 8px;
}

.dash-slot--flow {
  display: flex;
  width: 100%;
  height: 100%;
}

/* 编辑态删除按钮：压在卡片右上角外沿，层级高于卡片内容。
   画布两侧预留了同宽的 padding，负偏移不会撑出横向滚动条。 */
.dash-slot__remove {
  position: absolute;
  top: -8px;
  right: -8px;
  z-index: var(--md-sys-z-fab);
}

/* 用元素选择器抬一档特异性，稳定压过 MdIconButton 自身的 filled 底色 */
button.dash-slot__remove {
  background: var(--md-sys-color-error);
  color: var(--md-sys-color-on-error);
  --md-state-layer-color: var(--md-sys-color-on-error);
}

/* 拖拽中的卡片抬到最上层，否则会被后续兄弟节点盖住 */
.dash-slot--dragging {
  z-index: var(--md-sys-z-fab);
}

/* 键盘聚焦：编辑态卡片可用方向键微调，需要可见焦点环 */
.dash-slot:focus-visible {
  outline: 2px solid var(--md-sys-color-primary);
  outline-offset: 2px;
  border-radius: var(--md-sys-shape-corner-medium);
}

/* ---------- 卡片外壳 ---------- */
.dash-card {
  flex: 1 1 auto;
  min-height: 0;
  transition: box-shadow var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard);
}

/* 悬停抬升层级；编辑态用描边表达选中，不再叠加阴影变化 */
.dash-card:not(.dash-card--editing):hover {
  box-shadow: var(--md-sys-elevation-level2);
}

/* 用 inset 阴影画描边：不占布局、不会被 overflow 裁出圆角缺口 */
.dash-card--editing {
  box-shadow:
    var(--md-sys-elevation-level1),
    inset 0 0 0 2px var(--md-sys-color-primary);
}

/* 拖拽中：抬高阴影 + 轻微透明，明确「这张正在被搬动」 */
.dash-card--dragging {
  opacity: 0.9;
  box-shadow:
    var(--md-sys-elevation-level3),
    inset 0 0 0 2px var(--md-sys-color-primary);
}

/* ---------- 编辑工具栏 ---------- */
.dash-card__toolbar {
  /* 局部压低分段按钮高度，让工具栏在 96px 行高的卡片里不至于喧宾夺主 */
  --md-comp-button-height: 28px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border-bottom: 1px solid var(--md-sys-color-outline-variant);
  /* 以工具栏自身宽度为容器查询基准：窄卡片自动收紧分段按钮 */
  container-type: inline-size;
}

/* 卡片宽度紧张时只留图标，避免分段按钮溢出被裁 */
.dash-card__toolbar :deep(.md-segmented__item) {
  gap: 4px;
  padding: 0 8px;
}

@container (max-width: 260px) {
  .dash-card__toolbar :deep(.md-segmented__label) {
    display: none;
  }

  .dash-card__toolbar :deep(.md-segmented__item) {
    padding: 0 6px;
  }
}

.dash-card__range,
.dash-card__font {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}

.dash-card__range-input {
  width: 56px;
  height: 28px;
  padding: 0 6px;
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-corner-extra-small);
  background: var(--md-sys-color-surface-container-lowest);
  color: var(--md-sys-color-on-surface);
  text-align: center;
  user-select: text;
  /* 去掉数字微调箭头，56px 宽度留给数值本身 */
  appearance: textfield;
  -moz-appearance: textfield;
}

.dash-card__range-input::-webkit-outer-spin-button,
.dash-card__range-input::-webkit-inner-spin-button {
  margin: 0;
  -webkit-appearance: none;
}

.dash-card__range-input::placeholder {
  color: var(--md-sys-color-on-surface-variant);
}

.dash-card__range-input:focus-visible {
  border-color: var(--md-sys-color-primary);
  outline: 2px solid var(--md-sys-color-primary);
  outline-offset: 0;
}

.dash-card__range-sep {
  color: var(--md-sys-color-on-surface-variant);
}

.dash-card__font-btn {
  position: relative;
  min-width: 28px;
  height: 28px;
  padding: 0 4px;
  border: none;
  border-radius: var(--md-sys-shape-corner-small);
  background: transparent;
  color: var(--md-sys-color-on-surface-variant);
  --md-state-layer-color: var(--md-sys-color-on-surface-variant);
  font-size: var(--md-sys-typescale-label-small-size);
  line-height: var(--md-sys-typescale-label-small-line);
  cursor: pointer;
}

.dash-card__font-value {
  min-width: 40px;
  text-align: center;
  color: var(--md-sys-color-on-surface-variant);
}

/* ---------- 标题行（拖拽手柄） ---------- */
.dash-card__title {
  display: flex;
  align-items: center;
  padding: 10px 12px 2px;
}

.dash-card__title--draggable {
  cursor: grab;
  touch-action: none;
  user-select: none;
}

.dash-card__title--draggable:active {
  cursor: grabbing;
}

.dash-card__title-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--md-sys-color-on-surface);
}

/* ---------- 内容区 ---------- */
.dash-card__body {
  flex: 1 1 auto;
  min-height: 0;
  padding: 0 12px 12px;
}

/* ---------- 缩放手柄 ---------- */
.dash-card__resize {
  position: absolute;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  width: 22px;
  height: 22px;
  padding: 4px;
  cursor: nwse-resize;
  touch-action: none;
}

.dash-card__resize-dot {
  width: 10px;
  height: 10px;
  box-sizing: border-box;
  border: 1px solid var(--md-sys-color-surface-container-lowest);
  border-radius: var(--md-sys-shape-corner-full);
  background: var(--md-sys-color-primary);
}
</style>
