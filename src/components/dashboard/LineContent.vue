<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

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

const store = useObdStore();
const canvasRef = ref<HTMLCanvasElement>();
let rafId = 0;

const meta = computed(() => PID_META[props.pid]);

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

const range = computed(() => ({
  lo: props.min ?? autoRange.value.lo,
  hi: props.max ?? autoRange.value.hi,
}));

const render = (): void => {
  rafId = requestAnimationFrame(render);
  const canvas = canvasRef.value;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (width === 0 || height === 0) return;
  if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
    canvas.width = width * dpr;
    canvas.height = height * dpr;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const samples = store.history[props.pid].toArray();
  if (samples.length < 2) {
    ctx.fillStyle = "#8b98a9";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("—", width / 2, height / 2);
    return;
  }

  const pad = 8;
  const plotH = height - pad * 2;
  const plotW = width - pad * 2;
  const span = range.value.hi - range.value.lo || 1;
  const last = samples[samples.length - 1].t;

  // 网格线（4 等分）+ 刻度值
  ctx.strokeStyle = "rgba(148,163,184,0.12)";
  ctx.lineWidth = 1;
  ctx.font = "10px sans-serif";
  ctx.fillStyle = "#64748b";
  for (let i = 0; i <= 4; i += 1) {
    const y = pad + (plotH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(width - pad, y);
    ctx.stroke();
    const v = range.value.hi - (span / 4) * i;
    ctx.fillText(v.toFixed(0), 2, y + 3);
  }

  // 曲线
  const toX = (t: number): number => pad + (plotW * (t - (last - 60000))) / 60000;
  const toY = (v: number): number => pad + plotH * (1 - (v - range.value.lo) / span);

  ctx.beginPath();
  let started = false;
  for (const s of samples) {
    const x = toX(s.t);
    if (x < pad - 1 || x > width + 1) continue;
    const y = toY(s.v);
    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else {
      ctx.lineTo(x, y);
    }
  }
  if (started) {
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#38bdf8";
    ctx.stroke();
  }
};

onMounted(() => render());
onBeforeUnmount(() => cancelAnimationFrame(rafId));
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="flex items-baseline justify-end">
      <span class="font-mono text-base font-semibold text-primary">
        {{ (store.latest[pid] ?? 0).toFixed(meta.decimals) }}
        <span class="text-secondary text-xs">{{ meta.unit }}</span>
      </span>
    </div>
    <canvas ref="canvasRef" class="min-h-0 flex-1 w-full"></canvas>
  </div>
</template>
