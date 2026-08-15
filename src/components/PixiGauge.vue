<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
// CSP 禁止 unsafe-eval，导入 pixi.js 无 eval 补丁（副作用安装）
import "pixi.js/unsafe-eval";
import { Application, Container, Graphics, Text } from "pixi.js";

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

// 表盘 240° 扫掠：0 值在左下（-150°，钟表 8 点），max 在顶部（90°，钟表 12 点），
// 指针沿顺时针扫过底部（钟表 6 点），符合标准汽车仪表方向
const SWEEP = (240 * Math.PI) / 180;
const START = (-150 * Math.PI) / 180;

let app: Application | null = null;
let pointer: Container | null = null;
let targetValue = props.value;
let rafId = 0;

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
      .fill({ color: 0xf87171, alpha: 0.18 });
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

  // 主刻度数字标签（0 / 中值 / max）
  for (const frac of [0, 0.5, 1]) {
    const angle = START + frac * SWEEP;
    const r = radius - 26;
    const label = new Text({
      text: String(Math.round(props.min + frac * (props.max - props.min))),
      style: { fontFamily: "JetBrains Mono, monospace", fontSize: 11, fill: 0x94a3b8 },
    });
    label.anchor.set(0.5);
    label.position.set(center + Math.cos(angle) * r, center + Math.sin(angle) * r);
    face.addChild(label);
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

  app.stage.addChild(drawFace(size));

  pointer = drawPointer();
  pointer.position.set(size / 2, size / 2);
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
