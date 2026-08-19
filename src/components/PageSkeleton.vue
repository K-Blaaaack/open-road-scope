<script setup lang="ts">
// 路由懒加载期间的骨架占位（UI 占位），避免切换页面时白屏闪烁
</script>

<template>
  <div class="flex h-full flex-col gap-4" aria-busy="true">
    <div class="skeleton h-6 w-40 rounded-lg" />
    <div class="grid flex-1 grid-cols-2 gap-4 max-sm:grid-cols-1">
      <div v-for="i in 6" :key="i" class="glass-card flex flex-col gap-3 p-4">
        <div class="skeleton h-3 w-24 rounded" />
        <div class="skeleton h-8 w-16 rounded" />
        <div class="skeleton min-h-16 flex-1 rounded" />
      </div>
    </div>
  </div>
</template>
