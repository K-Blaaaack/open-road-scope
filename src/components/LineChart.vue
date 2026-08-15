<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";

import { useObdStore } from "@/stores/obd";

const props = defineProps<{
  /** PID 名称，用于读取历史缓冲 */
  pid: string;
  /** 标题文本 */
  label: string;
  /** 单位文本 */
  unit: string;
  /** 量程下限 */
  min: number;
  /** 量程上限 */
  max: number;
  /** 显示小数位 */
  decimals: number;
}>();

const store = useObdStore();
const canvasRef = ref<HTMLCanvasElement>();
let rafId = 0;

const render = (): void => {
  rafId = requestAnimationFrame(render);
  const canvas = canvasRef.value;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
    canvas.width = width * dpr;
    canvas.height = height * dpr;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const samples = store.history[props.pid as keyof typeof store.history]?.toArray() ?? [];
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
  const span = props.max - props.min || 1;
  const last = samples[samples.length - 1].t;

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
    const v = props.max - (span / 4) * i;
    ctx.fillText(v.toFixed(0), 2, y + 3);
  }

  // 曲线
  const toX = (t: number): number => pad + (plotW * (t - (last - 60000))) / 60000;
  const toY = (v: number): number => pad + plotH * (1 - (v - props.min) / span);

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
  <div class="glass-card flex flex-col p-4">
    <div class="mb-2 flex items-center justify-between">
      <span class="text-secondary text-xs font-medium tracking-wider">{{ label }}</span>
      <span class="font-mono text-lg font-semibold text-primary">
        {{ (store.latest[pid] ?? 0).toFixed(decimals) }}
        <span class="text-secondary text-xs">{{ unit }}</span>
      </span>
    </div>
    <canvas ref="canvasRef" class="h-28 w-full"></canvas>
  </div>
</template>
