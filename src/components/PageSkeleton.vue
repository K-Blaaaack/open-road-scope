<script setup lang="ts">
/**
 * 页面骨架屏
 *
 * 路由懒加载期间的占位（纯 UI），避免切换页面时白屏闪烁。
 * 只用 `.md-skeleton` 的微光动画 + 令牌底色，不承载任何交互。
 */
</script>

<template>
  <div class="skeleton-page" aria-busy="true">
    <div class="md-skeleton skeleton-page__title" />
    <div class="skeleton-page__grid">
      <div v-for="i in 6" :key="i" class="skeleton-page__card">
        <div class="md-skeleton skeleton-page__line skeleton-page__line--wide" />
        <div class="md-skeleton skeleton-page__line skeleton-page__line--short" />
        <div class="md-skeleton skeleton-page__line skeleton-page__line--medium" />
        <div class="md-skeleton skeleton-page__block" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.skeleton-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
}

.skeleton-page__title {
  width: 40%;
  height: 24px;
  border-radius: var(--md-sys-shape-corner-small);
}

.skeleton-page__grid {
  display: grid;
  flex: 1;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.skeleton-page__card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-sizing: border-box;
  padding: 16px;
  border-radius: var(--md-sys-shape-corner-medium);
  background: var(--md-sys-color-surface-container-low);
}

.skeleton-page__line {
  height: 12px;
}

.skeleton-page__line--wide {
  width: 60%;
}

.skeleton-page__line--short {
  width: 30%;
  height: 20px;
}

.skeleton-page__line--medium {
  width: 45%;
}

.skeleton-page__block {
  flex: 1;
  min-height: 64px;
  border-radius: var(--md-sys-shape-corner-medium);
}

/* 窄屏单列，避免卡片被压成细条 */
@media (max-width: 599px) {
  .skeleton-page__grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
