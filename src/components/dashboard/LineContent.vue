<script setup lang="ts">
/**
 * 仪表盘折线卡内容
 *
 * 只负责内容排版与画布绘制，卡片外观（背景 / 圆角 / 层级）由 DashboardCard 提供。
 * 配色全部取自 MD3 图表颜色角色（--md-sys-color-chart-*），主题切换时经 MutationObserver 重新读取，
 * 画布内不出现任何写死的色值。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";

import { useObdStore } from "@/stores/obd";
import { PID_META, type Pid } from "@shared/obd";

const props = withDefaults(
  defineProps<{
    /** 数据源 PID */
    pid: Pid;
    /** 量程下限，null 为自动 */
    min: number | null;
    /** 量程上限，null 为自动（无最大值） */
    max: number | null;
    /** 是否绘制曲线下方的面积渐变填充 */
    area?: boolean;
  }>(),
  {
    area: true,
  }
);

/** 显示的时间窗口（毫秒） */
const WINDOW_MS = 60000;
/** 画布内边距（上 / 右 / 下） */
const PAD = 8;
/** 左侧刻度文字最小预留宽度（实际按文字实测自适应） */
const AXIS_GUTTER = 34;
/** 刻度文字字体 */
const TICK_FONT = "11px ui-monospace, monospace";
/** 网格等分数 */
const GRID_STEPS = 4;

/** 图表配色角色 */
interface ChartColors {
  /** 主曲线 */
  line: string;
  /** 次级色：最新采样点标记 */
  lineSecondary: string;
  /** 网格线 */
  grid: string;
  /** 刻度文字 */
  axis: string;
  /** 面积渐变起点色 */
  area: string;
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
    lineSecondary: read("--md-sys-color-chart-line-secondary"),
    grid: read("--md-sys-color-chart-grid"),
    axis: read("--md-sys-color-chart-axis"),
    area: read("--md-sys-color-chart-area"),
  };
};

const store = useObdStore();
const canvasRef = ref<HTMLCanvasElement>();
const meta = computed(() => PID_META[props.pid]);

let rafId = 0;
/** 脏标记：只有数据 / 尺寸 / 主题 / 量程变化时才重绘，避免每帧读布局 */
let dirty = true;
/** 配色缓存：主题切换时置空后重读 */
let colors: ChartColors | null = null;
let themeObserver: MutationObserver | null = null;
let sizeObserver: ResizeObserver | null = null;

/** 最新值文本，无数据时显示破折号 */
const display = computed(() => {
  const v = store.latest[props.pid];
  return v === undefined ? "—" : v.toFixed(meta.value.decimals);
});

/** 自动量程：数据范围内外扩 12%，下限不低 0 */
const autoRange = computed(() => {
  const samples = store.history[props.pid].toArray();
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of samples) {
    if (s.v < lo) lo = s.v;
    if (s.v > hi) hi = s.v;
  }
  if (!Number.isFinite(hi)) return { lo: 0, hi: Math.max(meta.value.max, 1) };
  const pad = (hi - lo) * 0.12 || hi * 0.1 || 1;
  return { lo: Math.max(0, lo - pad), hi: hi + pad };
});

const range = computed(() => {
  const lo = props.min ?? autoRange.value.lo;
  const hi = props.max ?? autoRange.value.hi;
  // 量程退化（上下限相等或倒置）时用 PID 默认量程兜底：
  // 否则 span 归零，刻度会连续输出同一个数（例如 4 个 "0.00"），读起来像故障。
  if (hi > lo) return { lo, hi };
  const base = meta.value;
  const top = base.max > base.min ? base.max : base.min + 1;
  return { lo: base.min, hi: top };
});

/** 画布坐标点 */
interface Point {
  x: number;
  y: number;
}

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
 * 用中点二次贝塞尔把折线平滑成曲线（不引入额外依赖）
 * @param ctx - 画布上下文
 * @param points - 按时间顺序排列的画布坐标点
 */
const traceSmoothPath = (ctx: CanvasRenderingContext2D, points: Point[]): void => {
  if (points.length === 0) return;
  ctx.moveTo(points[0].x, points[0].y);
  if (points.length === 1) return;
  for (let i = 1; i < points.length - 1; i += 1) {
    const midX = (points[i].x + points[i + 1].x) / 2;
    const midY = (points[i].y + points[i + 1].y) / 2;
    ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
  }
  const last = points[points.length - 1];
  ctx.lineTo(last.x, last.y);
};

/** 单帧绘制：清屏 → 网格与刻度 → 面积 → 曲线 → 最新点 */
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

  const lo = range.value.lo;
  const hi = range.value.hi;
  const span = hi - lo || 1;

  const plotTop = PAD;
  const plotBottom = height - PAD;
  const plotH = Math.max(0, plotBottom - plotTop);
  if (plotH <= 0) return;

  // 刻度数量随绘图区高度自适应：矮卡片固定 4 等分会让刻度文字挤在一起互相压字
  const steps = Math.max(2, Math.min(GRID_STEPS, Math.floor(plotH / 38)));
  // 行高 11px，刻度间距低于 16px 时文字会上下压叠；此时只画网格线不写数字
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

  // 左侧留白按最宽刻度文字实测：固定 34px 装不下 "80.00" 这类 5 字符标签，
  // 右对齐后首位会被画布左边界裁掉（80.00 看起来就是 0.00），必须自适应。
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

  // 网格线与左侧刻度文字
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
  if (samples.length < 2) {
    drawEmpty(ctx, width, height, palette.axis);
    return;
  }

  const lastT = samples[samples.length - 1].t;
  const startT = lastT - WINDOW_MS;
  const toX = (t: number): number => plotLeft + (plotW * (t - startT)) / WINDOW_MS;
  const toY = (v: number): number => plotTop + plotH * (1 - (v - lo) / span);

  // 只保留落在窗口内的采样点，窗口外的点会把曲线拉出可视区
  const points: Point[] = [];
  for (const s of samples) {
    const x = toX(s.t);
    if (x < plotLeft - 1 || x > plotRight + 1) continue;
    points.push({ x, y: toY(s.v) });
  }
  if (points.length === 0) {
    drawEmpty(ctx, width, height, palette.axis);
    return;
  }

  const first = points[0];
  const tail = points[points.length - 1];

  // 面积渐变：chart-area → 透明（"transparent" 只是 alpha 0，不是固定色值）
  if (props.area && points.length > 1) {
    const gradient = ctx.createLinearGradient(0, plotTop, 0, plotBottom);
    gradient.addColorStop(0, palette.area);
    gradient.addColorStop(1, "transparent");
    ctx.beginPath();
    traceSmoothPath(ctx, points);
    ctx.lineTo(tail.x, plotBottom);
    ctx.lineTo(first.x, plotBottom);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
  }

  // 2px 曲线
  ctx.beginPath();
  traceSmoothPath(ctx, points);
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = palette.line;
  ctx.stroke();

  // 最新采样点：用次级图表色标出"当前时刻"
  ctx.beginPath();
  ctx.arc(tail.x, tail.y, 2.5, 0, Math.PI * 2);
  ctx.fillStyle = palette.lineSecondary;
  ctx.fill();
};

/** 主循环：脏标记为假时直接跳过，不读布局也不重绘 */
const tick = (): void => {
  rafId = requestAnimationFrame(tick);
  if (!dirty) return;
  dirty = false;
  draw();
};

watch(
  () => [store.lastTs, props.pid, props.min, props.max, props.area],
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

  // 尺寸变化只置脏，实际像素尺寸在 draw 内按需同步
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
