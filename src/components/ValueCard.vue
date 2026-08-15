<script setup lang="ts">
const props = defineProps<{
  /** 标题文本 */
  label: string;
  /** 数值 */
  value: number;
  /** 单位文本 */
  unit: string;
  /** 小数位 */
  decimals: number;
}>();

const format = (v: number): string =>
  Number.isFinite(v) ? v.toFixed(v >= 100 ? Math.max(0, props.decimals - 1) : props.decimals) : "—";
</script>

<template>
  <div class="glass-card flex items-center justify-between px-4 py-3">
    <span class="text-secondary text-sm">{{ label }}</span>
    <span class="flex items-baseline gap-1">
      <span class="font-mono text-xl font-semibold text-primary">{{ format(value) }}</span>
      <span class="text-secondary text-xs">{{ unit }}</span>
    </span>
  </div>
</template>
