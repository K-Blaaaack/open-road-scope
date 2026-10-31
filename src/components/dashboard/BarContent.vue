<script setup lang="ts">
/**
 * 仪表盘柱状卡内容
 *
 * 30 秒窗口固定 60 根柱（每根约 500ms，与读取间隔解耦），最新一根用 chart-line 实色，
 * 其余同色降透明度。只负责内容排版与画布绘制，卡片外壳由 DashboardCard 提供。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";

import { useObdStore } from "@/stores/obd";
import { PID_META, type Pid } from "@shared/obd";

const props = defineProps<{
  /** 数据源 PID */
  pid: Pid;
  /** 量程下限，null 为自动 */
  min: number | null;
  /** 量程上限，null 为自动（无最大值） */
  max: number | null;
}>();

/** 显示的时间窗口（毫秒） */
const WINDOW_MS = 30000;
/** 柱数（30s 窗口均分，每根约 500ms） */
const BARS = 60;
/** 柱宽占单根槽位的比例（余下为柱距） */
const BAR_WIDTH_RATIO = 0.64;
/** 柱顶圆角半径 */
const BAR_RADIUS = 2;
/** 非最新柱的不透明度 */
const DIM_ALPHA = 0.55;
/** 画布内边距（上 / 右 / 下） */
const PAD = 8;
/** 左侧刻度文字预留宽度 */
const AXIS_GUTTER = 34;
/** 刻度文字字体 */
const TICK_FONT = "11px ui-monospace, monospace";
/** 网格等分数 */
const GRID_STEPS = 4;

/** 图表配色角色 */
interface ChartColors {
  /** 柱体 */
  line: string;
  /** 网格线 */
  grid: string;
  /** 刻度文字 */
  axis: string;
}

/**
 * 从根元素读取图表配色（CSS 变量 → 画布色值）
 * @returns 当前主题下的图表颜色角色，取不到时回退 currentColor
 */
const readChartColors = (): ChartColors => {
  const styles = getComputedStyle(document.documentElement);
  const read = (name: string): string => styles.getPropertyValue(name).trim() || "currentColor";
  return {
    line: read("--md-sys-color-chart-line"),
    grid: read("--md-sys-color-chart-grid"),
    axis: read("--md-sys-color-chart-axis"),
  };
};

const store = useObdStore();
const canvasRef = ref<HTMLCanvasElement>();
const meta = computed(() => PID_META[props.pid]);

let rafId = 0;
/** 脏标记：只有数据 / 尺寸 / 主题 / 量程变化时才重绘，避免每帧读布局 */
let dirty = true;
/** 配色缓存：主题切换时重读 */
let colors: ChartColors | null = null;
let themeObserver: MutationObserver | null = null;
let sizeObserver: ResizeObserver | null = null;

/** 最新值文本，无数据时显示破折号 */
const display = computed(() => {
  const v = store.latest[props.pid];
  return v === undefined ? "—" : v.toFixed(meta.value.decimals);
});

/** 自动量程：基线 0，上限取数据最大值外扩 12% */
const autoRange = computed(() => {
  const samples = store.history[props.pid].toArray();
  let hi = -Infinity;
  for (const s of samples) {
    if (s.v > hi) hi = s.v;
  }
  if (!Number.isFinite(hi)) return { lo: 0, hi: Math.max(meta.value.max, 1) };
  return { lo: 0, hi: hi * 1.12 || 1 };
});

const range = computed(() => {
  const lo = props.min ?? autoRange.value.lo;
  const hi = props.max ?? autoRange.value.hi;
  // 量程退化时用 PID 默认量程兜底，避免刻度全部输出同一个数
  if (hi > lo) return { lo, hi };
  const base = meta.value;
  const top = base.max > base.min ? base.max : base.min + 1;
  return { lo: base.min, hi: top };
});

/**
 * 无数据占位：画布中央一个长破折号
 * @param ctx - 画布上下文
 * @param width - 画布 CSS 宽度
 * @param height - 画布 CSS 高度
 * @param color - 文字颜色（chart-axis）
 */
const drawEmpty = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  color: string
): void => {
  ctx.fillStyle = color;
  ctx.font = "13px ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("—", width / 2, height / 2);
};

/**
 * 柱形路径：只给顶部两角圆角
 * @param ctx - 画布上下文
 * @param x - 柱左边缘
 * @param y - 柱顶边缘
 * @param w - 柱宽
 * @param h - 柱高
 * @param r - 圆角半径（调用方已按柱高 / 柱宽收敛）
 */
const traceBar = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void => {
  ctx.beginPath();
  // Chromium / WebView 均支持 roundRect；老内核走手绘路径兜底
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, w, h, [r, r, 0, 0]);
    return;
  }
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
};

/** 单帧绘制：清屏 → 网格与刻度 → 按时间窗口聚合 → 逐柱填充 */
const draw = (): void => {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (width === 0 || height === 0) return;

  const dpr = window.devicePixelRatio || 1;
  const pixelWidth = Math.round(width * dpr);
  const pixelHeight = Math.round(height * dpr);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  if (!colors) colors = readChartColors();
  const palette = colors;

  const plotTop = PAD;
  const plotBottom = height - PAD;
  const plotH = Math.max(0, plotBottom - plotTop);
  if (plotH <= 0) return;

  const lo = range.value.lo;
  const hi = range.value.hi;
  const span = hi - lo || 1;

  // 网格线与左侧刻度文字：等分数随高度自适应，矮卡片里固定 4 等分会让文字互相压叠
  const steps = Math.max(2, Math.min(GRID_STEPS, Math.floor(plotH / 38)));
  // 行高 11px，刻度间距低于 16px 时只画网格线不写数字
  const showTickLabels = plotH / steps >= 16;
  let tickDecimals = Math.abs(span) >= 100 ? 0 : meta.value.decimals;
  // 量程很窄时（例如怠速油耗 0.004 L/h）固定小数位会把相邻刻度印成同一个数，
  // 逐位加精度直到上下两条刻度能区分开，避免出现一排 "0.00"
  while (
    tickDecimals < 4 &&
    (hi - span / steps).toFixed(tickDecimals) === hi.toFixed(tickDecimals)
  ) {
    tickDecimals += 1;
  }

  // 左侧留白按最宽刻度文字实测，固定 34px 会把 "80.00" 的首位裁掉
  ctx.font = TICK_FONT;
  let widestTick = 0;
  for (let i = 0; i <= steps; i += 1) {
    const w = ctx.measureText((hi - (span / steps) * i).toFixed(tickDecimals)).width;
    if (w > widestTick) widestTick = w;
  }
  const plotLeft = Math.max(AXIS_GUTTER, Math.ceil(widestTick) + 8);
  const plotRight = width - PAD;
  const plotW = Math.max(0, plotRight - plotLeft);
  if (plotW <= 0) return;

  ctx.strokeStyle = palette.grid;
  ctx.lineWidth = 1;
  ctx.font = TICK_FONT;
  ctx.fillStyle = palette.axis;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let i = 0; i <= steps; i += 1) {
    const y = plotTop + (plotH / steps) * i;
    ctx.beginPath();
    ctx.moveTo(plotLeft, y);
    ctx.lineTo(plotRight, y);
    ctx.stroke();
    if (showTickLabels) {
      ctx.fillText((hi - (span / steps) * i).toFixed(tickDecimals), plotLeft - 6, y);
    }
  }

  const samples = store.history[props.pid].toArray();
  if (samples.length === 0) {
    drawEmpty(ctx, width, height, palette.axis);
    return;
  }

  // 按时间窗口聚合为固定数量的柱（每段取最后一个采样）
  const bins: (number | null)[] = new Array(BARS).fill(null);
  const startT = store.lastTs - WINDOW_MS;
  for (const s of samples) {
    if (s.t < startT) continue;
    const idx = Math.min(BARS - 1, Math.floor(((s.t - startT) / WINDOW_MS) * BARS));
    bins[idx] = s.v;
  }

  // 最新一根 = 最后一个有数据的槽位
  let latestIndex = -1;
  for (let i = BARS - 1; i >= 0; i -= 1) {
    if (bins[i] !== null) {
      latestIndex = i;
      break;
    }
  }
  if (latestIndex < 0) {
    drawEmpty(ctx, width, height, palette.axis);
    return;
  }

  const barSlot = plotW / BARS;
  const barWidth = barSlot * BAR_WIDTH_RATIO;
  const barOffset = (barSlot - barWidth) / 2;
  ctx.fillStyle = palette.line;
  for (let i = 0; i < BARS; i += 1) {
    const v = bins[i];
    if (v === null) continue;
    const barH = Math.max(0, ((v - lo) / span) * plotH);
    if (barH <= 0) continue;
    const x = plotLeft + i * barSlot + barOffset;
    const y = plotBottom - barH;
    const radius = Math.min(BAR_RADIUS, barH / 2, barWidth / 2);
    traceBar(ctx, x, y, barWidth, barH, radius);
    // 降透明度而不是另写一个半透明色值，保证主题切换后仍然跟随令牌
    ctx.globalAlpha = i === latestIndex ? 1 : DIM_ALPHA;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
};

/** 主循环：脏标记为假时直接跳过，不读布局也不重绘 */
const tick = (): void => {
  rafId = requestAnimationFrame(tick);
  if (!dirty) return;
  dirty = false;
  draw();
};

watch(
  () => [store.lastTs, props.pid, props.min, props.max],
  () => {
    dirty = true;
  }
);

onMounted(() => {
  // 主题切换会改写 <html data-theme>，令牌随之变化：重读配色并重绘
  themeObserver = new MutationObserver(() => {
    colors = readChartColors();
    dirty = true;
  });
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });

  const canvas = canvasRef.value;
  if (canvas && typeof ResizeObserver !== "undefined") {
    sizeObserver = new ResizeObserver(() => {
      dirty = true;
    });
    sizeObserver.observe(canvas);
  }

  dirty = true;
  tick();
});

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId);
  themeObserver?.disconnect();
  sizeObserver?.disconnect();
  themeObserver = null;
  sizeObserver = null;
});
</script>

<template>
  <!-- 容器不带卡片外观：卡片外壳由 DashboardCard 负责 -->
  <div class="flex h-full min-h-0 flex-1 flex-col">
    <div class="flex items-baseline justify-end gap-1 pb-1">
      <span class="readout md-mono tabular-nums">{{ display }}</span>
      <span class="readout-unit">{{ meta.unit }}</span>
    </div>
    <canvas
      ref="canvasRef"
      class="chart-canvas min-h-0 w-full flex-1"
      role="img"
      :aria-label="meta.label"
    />
  </div>
</template>

<style scoped>
.readout {
  color: var(--md-sys-color-on-surface);
  font-size: var(--md-sys-typescale-title-medium-size);
  line-height: var(--md-sys-typescale-title-medium-line);
  font-weight: var(--md-sys-typescale-title-medium-weight);
}

.readout-unit {
  color: var(--md-sys-color-on-surface-variant);
  font-size: var(--md-sys-typescale-label-medium-size);
  line-height: var(--md-sys-typescale-label-medium-line);
}

/* canvas 是行内元素，去掉基线空隙以免容器多出几像素 */
.chart-canvas {
  display: block;
}
</style>
