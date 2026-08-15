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

// 表盘扫过 240°，起始角 150°（屏幕左下），顺时针
const SWEEP = (240 * Math.PI) / 180;
const START = (150 * Math.PI) / 180;

let app: Application | null = null;
let pointer: Container | null = null;
let dangerArc: Graphics | null = null;
let targetValue = props.value;
let rafId = 0;

const angleOf = (v: number): number => {
  const frac = Math.min(1, Math.max(0, (v - props.min) / (props.max - props.min)));
  return START + frac * SWEEP;
};

const drawTicks = (g: Graphics, radius: number): void => {
  const ticks = 12;
  g.clear();
  g.circle(0, 0, radius + 6).fill(0x1b2530);
  for (let i = 0; i <= ticks; i += 1) {
    const frac = i / ticks;
    const angle = START + frac * SWEEP;
    const isDanger =
      props.dangerAt !== undefined &&
      frac >= (props.dangerAt - props.min) / (props.max - props.min);
    const major = i % 2 === 0;
    const inner = radius - (major ? 16 : 9);
    g.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner)
      .lineTo(Math.cos(angle) * (radius - 2), Math.sin(angle) * (radius - 2))
      .stroke({ width: major ? 2.5 : 1.2, color: isDanger ? 0xf87171 : 0x475569 });
  }
};

const drawDangerArc = (g: Graphics, radius: number): void => {
  g.clear();
  if (props.dangerAt === undefined) return;
  const frac = Math.min(1, Math.max(0, (props.dangerAt - props.min) / (props.max - props.min)));
  const start = START + frac * SWEEP;
  g.moveTo(Math.cos(start) * (radius - 20), Math.sin(start) * (radius - 20))
    .arc(0, 0, radius - 20, start, START + SWEEP)
    .stroke({ width: 7, color: 0xf87171, alpha: 0.85 });
};

const drawPointer = (): Container => {
  const group = new Container();
  const needle = new Graphics();
  needle.moveTo(-4, 8).lineTo(0, -26).lineTo(4, 8).closePath().fill(0xf43f5e);
  group.addChild(needle);
  group.pivot.set(0, 0);
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

onMounted(async () => {
  const el = containerRef.value;
  if (!el) return;
  const size = Math.min(el.clientWidth, el.clientHeight);
  app = new Application();
  await app.init({
    width: size,
    height: size,
    backgroundAlpha: 0,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });
  app.canvas.style.width = "100%";
  app.canvas.style.height = "100%";
  el.appendChild(app.canvas);

  const center = size / 2;
  const radius = size / 2 - 18;

  const base = new Graphics();
  drawTicks(base, radius);
  base.position.set(center, center);
  app.stage.addChild(base);

  dangerArc = new Graphics();
  drawDangerArc(dangerArc, radius);
  dangerArc.position.set(center, center);
  app.stage.addChild(dangerArc);

  pointer = drawPointer();
  pointer.position.set(center, center);
  pointer.rotation = angleOf(displayValue.value);
  app.stage.addChild(pointer);

  ticker();
});

watch(
  () => props.value,
  (v) => {
    targetValue = v;
  }
);

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId);
  app?.destroy(true, { children: true });
  app = null;
});
</script>

<template>
  <div class="relative flex flex-col items-center">
    <div class="text-secondary mb-1 text-xs font-medium tracking-wider">{{ label }}</div>
    <div ref="containerRef" class="h-44 w-44 sm:h-52 sm:w-52">
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
