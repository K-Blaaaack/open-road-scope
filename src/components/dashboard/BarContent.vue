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

/** 显示的时间窗口（毫秒） */
const WINDOW_MS = 30000;
/** 柱数（约每 500ms 一根） */
const BARS = 60;

const meta = computed(() => PID_META[props.pid]);

const autoRange = computed(() => {
  const samples = store.history[props.pid].toArray();
  let hi = -Infinity;
  for (const s of samples) {
    if (s.v > hi) hi = s.v;
  }
  if (!Number.isFinite(hi)) return { lo: 0, hi: Math.max(meta.value.max, 1) };
  return { lo: 0, hi: hi * 1.12 || 1 };
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
  const span = range.value.hi - range.value.lo || 1;
  const pad = 8;
  const plotH = height - pad * 2;
  const plotW = width - pad * 2;
  const now = store.lastTs;

  // 网格线（4 等分）
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

  if (samples.length === 0) return;
  const barW = plotW / BARS;

  // 按时间窗口聚合为固定数量的柱（取每段最后一个采样）
  const bins: (number | null)[] = new Array(BARS).fill(null);
  const startT = now - WINDOW_MS;
  for (const s of samples) {
    if (s.t < startT) continue;
    const idx = Math.min(BARS - 1, Math.floor(((s.t - startT) / WINDOW_MS) * BARS));
    bins[idx] = s.v;
  }

  for (let i = 0; i < BARS; i += 1) {
    const v = bins[i];
    if (v === null) continue;
    const barH = ((v - range.value.lo) / span) * plotH;
    const x = pad + i * barW;
    const y = pad + plotH - barH;
    ctx.fillStyle = i === BARS - 1 ? "#38bdf8" : "rgba(56,189,248,0.55)";
    ctx.fillRect(x + barW * 0.18, y, barW * 0.64, barH);
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
