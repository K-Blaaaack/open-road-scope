<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
// CSP 禁止 unsafe-eval，导入 pixi.js 无 eval 补丁（副作用安装）
import "pixi.js/unsafe-eval";
import { Application, Container, Graphics } from "pixi.js";

const props = defineProps<{
  /** 标签文本 */
  label: string;
  /** 当前值 */
  value: number;
  /** 量程下限 */
  min: number;
  /** 量程上限 */
  max: number;
  /** 单位文本 */
  unit: string;
  /** 显示小数位 */
  decimals: number;
  /** 危险区起点（超过该值刻度变红），可选 */
  dangerAt?: number;
}>();

const containerRef = ref<HTMLDivElement>();
const displayValue = ref(props.value);

// 表盘 240° 扫掠：0 值在钟表 8 点方向（-120°，左下方），max 在钟表 12 点方向（0°，正上方），
// 指针扫掠经过底部 6 点（-180°）与右侧 3 点（-270°），符合标准汽车仪表顺时针方向
const SWEEP = (-240 * Math.PI) / 180;
const START = (-120 * Math.PI) / 180;

let app: Application | null = null;
let pointer: Container | null = null;
let face: Container | null = null;
let targetValue = props.value;
let rafId = 0;
let size = 0;

/** 值 → 指针旋转角（弧度） */
const angleOf = (v: number): number => {
  const frac = Math.min(1, Math.max(0, (v - props.min) / (props.max - props.min)));
  return START + frac * SWEEP;
};

/** 绘制表盘背景圆与刻度（全部使用 fill，避开该环境下 stroke 渲染不可靠的问题） */
const drawFace = (size: number): Container => {
  const face = new Container();
  const center = size / 2;
  const radius = size / 2 - 18;

  // 背景圆盘
  const bg = new Graphics();
  bg.circle(0, 0, radius + 6).fill(0x1b2530);
  bg.position.set(center, center);
  face.addChild(bg);

  // 危险区环带（RPM 表红区），圆环扇形 fill
  if (props.dangerAt !== undefined) {
    const startA = angleOf(props.dangerAt);
    const endA = START + SWEEP;
    const r1 = radius - 6;
    const r2 = radius - 16;
    const arc = new Graphics();
    arc
      .moveTo(Math.cos(startA) * r1, Math.sin(startA) * r1)
      .arc(0, 0, r1, startA, endA)
      .lineTo(Math.cos(endA) * r2, Math.sin(endA) * r2)
      .arc(0, 0, r2, endA, startA, true)
      .closePath()
      .fill({ color: 0xf87171, alpha: 0.28 });
    arc.position.set(center, center);
    face.addChild(arc);
  }

  // 刻度：每个刻度是独立矩形 fill + 旋转，12 个主刻度 + 细分
  const tickCount = 12;
  for (let i = 0; i <= tickCount; i += 1) {
    const frac = i / tickCount;
    const angle = START + frac * SWEEP;
    const inDanger =
      props.dangerAt !== undefined &&
      frac >= (props.dangerAt - props.min) / (props.max - props.min);
    const major = i % 2 === 0;
    const color = inDanger ? 0xf87171 : major ? 0x94a3b8 : 0x64748b;
    const len = major ? 14 : 8;
    const w = major ? 3 : 1.5;
    const g = new Graphics();
    g.rect(-w / 2, -(radius - 2) - len, w, len).fill(color);
    g.position.set(center, center);
    g.rotation = angle;
    face.addChild(g);
  }

  return face;
};

/** 指针：菱形表针 + 中心轴，绕表盘中心旋转 */
const drawPointer = (): Container => {
  const group = new Container();
  const needle = new Graphics();
  needle.moveTo(0, 6).lineTo(-5, -22).lineTo(0, -26).lineTo(5, -22).closePath().fill(0xf43f5e);
  group.addChild(needle);
  const hub = new Graphics();
  hub.circle(0, 0, 5).fill(0x1b2530);
  hub.circle(0, 0, 3.5).fill(0xf43f5e);
  group.addChild(hub);
  return group;
};

const ticker = (): void => {
  rafId = requestAnimationFrame(ticker);
  const next = targetValue + (displayValue.value - targetValue) * 0.12;
  displayValue.value = Math.abs(next - targetValue) < 0.01 ? targetValue : next;
  if (pointer && app) {
    pointer.rotation = angleOf(displayValue.value);
  }
};

/** 重建表盘（量程或危险区变化时调用） */
const rebuildFace = (): void => {
  if (!app || size === 0) return;
  if (face) {
    face.destroy({ children: true });
    app.stage.removeChild(face);
  }
  face = drawFace(size);
  app.stage.addChildAt(face, 0);
};

/** 跟随容器尺寸自适应（卡片缩放/布局变化时重建表盘） */
const updateSize = (): void => {
  const el = containerRef.value;
  if (!el || !app) return;
  const next = Math.floor(Math.min(el.clientWidth, el.clientHeight));
  if (next <= 0 || next === size) return;
  size = next;
  app.renderer.resize(size, size);
  app.canvas.style.width = `${size}px`;
  app.canvas.style.height = `${size}px`;
  rebuildFace();
  if (pointer) {
    pointer.position.set(size / 2, size / 2);
    pointer.rotation = angleOf(displayValue.value);
  }
  updateLabels();
};

/** 刻度数字标签的定位（基于方形表盘的半径，避免宽扁容器下溢出） */
const labelPositions = ref<{ text: string; left: string; top: string }[]>([]);

const updateLabels = (): void => {
  const el = containerRef.value;
  if (!el) return;
  const w = el.clientWidth;
  const h = el.clientHeight;
  if (w <= 0 || h <= 0) return;
  const r = Math.min(w, h) * 0.352;
  const cx = w / 2;
  const cy = h / 2;
  const calc = (frac: number): { left: string; top: string } => {
    const angle = START + frac * SWEEP;
    return {
      left: `${((cx + Math.cos(angle) * r) / w) * 100}%`,
      top: `${((cy + Math.sin(angle) * r) / h) * 100}%`,
    };
  };
  labelPositions.value = [
    { text: String(Math.round(props.min)), ...calc(0) },
    { text: String(Math.round((props.min + props.max) / 2)), ...calc(0.5) },
    { text: String(Math.round(props.max)), ...calc(1) },
  ];
};

let ro: ResizeObserver | null = null;

onMounted(async () => {
  const el = containerRef.value;
  if (!el) return;
  size = Math.min(el.clientWidth, el.clientHeight);
  app = new Application();
  await app.init({
    width: size,
    height: size,
    backgroundAlpha: 0,
    antialias: true,
    preserveDrawingBuffer: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });
  app.canvas.style.width = `${size}px`;
  app.canvas.style.height = `${size}px`;
  el.appendChild(app.canvas);

  rebuildFace();

  pointer = drawPointer();
  pointer.position.set(size / 2, size / 2);
  pointer.rotation = angleOf(displayValue.value);
  app.stage.addChild(pointer);

  ro = new ResizeObserver(updateSize);
  ro.observe(el);
  updateLabels();

  ticker();
});

watch(
  () => props.value,
  (v) => {
    targetValue = v;
  }
);

watch([() => props.min, () => props.max, () => props.dangerAt], () => {
  rebuildFace();
  updateLabels();
});

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId);
  ro?.disconnect();
  ro = null;
  if (app) {
    app.destroy(true, { children: true });
    app = null;
  }
});
</script>

<template>
  <div class="relative flex h-full w-full flex-col items-center">
    <div class="text-secondary mb-1 text-xs font-medium tracking-wider">{{ label }}</div>
    <div ref="containerRef" class="relative flex min-h-0 w-full flex-1 items-center justify-center">
      <!-- 主刻度数字标签（DOM 渲染，位置随容器自适应） -->
      <span
        v-for="label in labelPositions"
        :key="label.text"
        class="text-secondary font-mono absolute text-[11px]"
        :style="{ left: label.left, top: label.top, transform: 'translate(-50%, -50%)' }"
      >
        {{ label.text }}
      </span>
      <!-- Pixi 画布挂载点 -->
    </div>
    <div class="pointer-events-none absolute bottom-1 flex items-baseline gap-1">
      <span class="font-mono text-3xl font-semibold text-primary">{{
        displayValue.toFixed(decimals)
      }}</span>
      <span class="text-secondary text-sm">{{ unit }}</span>
    </div>
  </div>
</template>
