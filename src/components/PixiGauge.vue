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

/** 生成「好看」的刻度步进（1/2/5 × 10^n），目标约 7 个主刻度 */
const niceStep = (span: number, target = 7): number => {
  const raw = span / target;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const d = raw / pow;
  return (d < 1.5 ? 1 : d < 3 ? 2 : d < 7 ? 5 : 10) * pow;
};

/** 量程内的主刻度值列表（含端点，去重） */
const niceTicks = (min: number, max: number): number[] => {
  const step = niceStep(max - min);
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max - step * 0.001; v += step) {
    out.push(Math.round(v * 1000) / 1000);
  }
  if (out[0] !== min) out.unshift(min);
  if (out[out.length - 1] !== max) out.push(max);
  return out;
};

/** 绘制表盘背景圆、边框环与刻度（全部使用 fill，避开该环境下 stroke 渲染不可靠的问题） */
const drawFace = (size: number): Container => {
  const face = new Container();
  const center = size / 2;
  const radius = size / 2 - 18;

  // 背景圆盘
  const bg = new Graphics();
  bg.circle(0, 0, radius + 6).fill(0x161d26);
  bg.position.set(center, center);
  face.addChild(bg);

  // 表盘边框装饰环（内亮外暗的双环，模拟真实仪表的金属圈）
  const bezel = new Graphics();
  bezel
    .moveTo(Math.cos(0) * (radius - 3), Math.sin(0) * (radius - 3))
    .arc(0, 0, radius - 3, 0, Math.PI * 2)
    .lineTo(Math.cos(Math.PI * 2) * (radius + 1), Math.sin(Math.PI * 2) * (radius + 1))
    .arc(0, 0, radius + 1, Math.PI * 2, 0, true)
    .closePath()
    .fill(0x2b3947);
  bezel.position.set(center, center);
  face.addChild(bezel);

  // 内圈细装饰环
  const innerRing = new Graphics();
  innerRing
    .moveTo(Math.cos(0) * (radius - 30), Math.sin(0) * (radius - 30))
    .arc(0, 0, radius - 30, 0, Math.PI * 2)
    .lineTo(Math.cos(Math.PI * 2) * (radius - 28), Math.sin(Math.PI * 2) * (radius - 28))
    .arc(0, 0, radius - 28, Math.PI * 2, 0, true)
    .closePath()
    .fill({ color: 0x3d4d5e, alpha: 0.6 });
  innerRing.position.set(center, center);
  face.addChild(innerRing);

  // 危险区环带（RPM 表红区），圆环扇形 fill
  if (props.dangerAt !== undefined) {
    const startA = angleOf(props.dangerAt);
    const endA = START + SWEEP;
    const r1 = radius - 4;
    const r2 = radius - 17;
    const arc = new Graphics();
    arc
      .moveTo(Math.cos(startA) * r1, Math.sin(startA) * r1)
      .arc(0, 0, r1, startA, endA)
      .lineTo(Math.cos(endA) * r2, Math.sin(endA) * r2)
      .arc(0, 0, r2, endA, startA, true)
      .closePath()
      .fill({ color: 0xf87171, alpha: 0.3 });
    arc.position.set(center, center);
    face.addChild(arc);
  }

  // 刻度：主刻度（长宽，带红区变色）+ 每段中间一个细分刻度
  const tickCount = 12;
  for (let i = 0; i <= tickCount * 2; i += 1) {
    const frac = i / (tickCount * 2);
    const angle = START + frac * SWEEP;
    const inDanger =
      props.dangerAt !== undefined &&
      frac >= (props.dangerAt - props.min) / (props.max - props.min);
    const major = i % 2 === 0;
    const color = inDanger ? 0xf87171 : major ? 0xcdd7e1 : 0x5b6b7c;
    const len = major ? 15 : 7;
    const w = major ? 3 : 1.5;
    const g = new Graphics();
    g.rect(-w / 2, -(radius - 2) - len, w, len).fill(color);
    g.position.set(center, center);
    g.rotation = angle;
    face.addChild(g);
  }

  return face;
};

/** 指针：细长叶片 + 尾部配重 + 中心轴，绕表盘中心旋转（贴合真实仪表） */
const drawPointer = (size: number): Container => {
  const group = new Container();
  const tipLen = size * 0.44;
  const tailLen = size * 0.1;
  const needle = new Graphics();
  needle
    .moveTo(0, tailLen)
    .lineTo(-5.5, -size * 0.1)
    .lineTo(-2.4, -tipLen)
    .lineTo(0, -tipLen - size * 0.02)
    .lineTo(2.4, -tipLen)
    .lineTo(5.5, -size * 0.1)
    .closePath()
    .fill(0xf43f5e);
  group.addChild(needle);
  const hub = new Graphics();
  hub.circle(0, 0, 5.5).fill(0x0f1419);
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

/** 刻度数字标签的定位（位于刻度环内侧，随容器尺寸自适应） */
const labelPositions = ref<
  { text: string; left: string; top: string; inDanger: boolean; fontSize: number }[]
>([]);

const updateLabels = (): void => {
  const el = containerRef.value;
  if (!el) return;
  const w = el.clientWidth;
  const h = el.clientHeight;
  if (w <= 0 || h <= 0) return;
  const size = Math.min(w, h);
  const r = size * 0.36;
  const cx = w / 2;
  const cy = h / 2;
  const fontSize = Math.max(10, Math.round(size * 0.045));
  const ticks = niceTicks(props.min, props.max);
  labelPositions.value = ticks.map((v) => {
    const frac = (v - props.min) / (props.max - props.min);
    const angle = START + frac * SWEEP;
    const inDanger =
      props.dangerAt !== undefined &&
      frac >= (props.dangerAt - props.min) / (props.max - props.min);
    return {
      text: String(v),
      left: `${((cx + Math.cos(angle) * r) / w) * 100}%`,
      top: `${((cy + Math.sin(angle) * r) / h) * 100}%`,
      inDanger,
      fontSize,
    };
  });
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

  pointer = drawPointer(size);
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
        class="font-mono absolute font-medium"
        :class="label.inDanger ? 'text-red-400/90' : 'text-[#aab8c6]'"
        :style="{
          left: label.left,
          top: label.top,
          transform: 'translate(-50%, -50%)',
          fontSize: `${label.fontSize}px`,
        }"
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
