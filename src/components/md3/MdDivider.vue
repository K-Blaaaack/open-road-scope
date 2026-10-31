<script setup lang="ts">
/**
 * MD3 分割线
 *
 * 1dp 高的低对比描边，用于在列表/卡片内分隔内容组。
 * `inset` 用于「列表项有前置图标」的场景：左侧让出 16dp，与文本起始位置对齐。
 */
withDefaults(
  defineProps<{
    /** 左侧内缩 16dp（配合带前置图标的列表使用） */
    inset?: boolean;
  }>(),
  {
    inset: false,
  }
);
</script>

<template>
  <div class="md-divider" :class="inset ? 'md-divider--inset' : ''" role="separator" />
</template>

<style scoped>
.md-divider {
  width: 100%;
  height: 1px;
  flex-shrink: 0;
  border: none;
  background: var(--md-sys-color-outline-variant);
}

.md-divider--inset {
  margin-left: 16px;
  width: calc(100% - 16px);
}
</style>
