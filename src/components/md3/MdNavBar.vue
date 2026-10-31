<script setup lang="ts">
/**
 * MD3 底部导航栏（Navigation Bar）
 *
 * 手机竖屏的主力导航：80dp 高、`surface-container` 底色、顶部 1px 描边。
 * 每项等分宽度，活动指示器 64×32 全圆角胶囊托住 24dp 图标，文字常驻在下方。
 */
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";
import { vRipple } from "@/directives/ripple";
import type { NavItem } from "@/components/md3/MdNavRail.vue";

defineProps<{
  /** 目的地列表 */
  items: NavItem[];
}>();

const { t } = useI18n();
const route = useRoute();

/**
 * 当前路径是否命中该目的地
 * @param path - 目的地路径
 * @returns 命中返回 true
 */
const isActive = (path: string): boolean => route.path === path;
</script>

<template>
  <nav class="md-nav-bar">
    <router-link
      v-for="item in items"
      :key="item.path"
      v-ripple
      :to="item.path"
      class="md-nav-bar__item md-state-layer"
      :class="{ 'md-nav-bar__item--active': isActive(item.path) }"
      :aria-current="isActive(item.path) ? 'page' : undefined"
      :title="t(item.key)"
    >
      <span class="md-nav-bar__icon-box">
        <span class="md-nav-bar__indicator" aria-hidden="true" />
        <span class="md-nav-bar__icon" :class="item.icon" aria-hidden="true" />
      </span>
      <span class="md-nav-bar__label md-label-medium">{{ t(item.key) }}</span>
    </router-link>
  </nav>
</template>

<style scoped>
.md-nav-bar {
  position: relative;
  z-index: var(--md-sys-z-nav);
  display: flex;
  flex-shrink: 0;
  align-items: stretch;
  height: var(--md-comp-nav-bar-height);
  padding: 0 4px;
  background: var(--md-sys-color-surface-container);
  border-top: 1px solid var(--md-sys-color-outline-variant);
}

/* ---------- 目的地 ---------- */
.md-nav-bar__item {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 0;
  border-radius: var(--md-sys-shape-corner-large);
  color: var(--md-sys-color-on-surface-variant);
  text-decoration: none;
  --md-state-layer-color: var(--md-sys-color-on-surface-variant);
}

.md-nav-bar__item--active {
  --md-state-layer-color: var(--md-sys-color-on-secondary-container);
}

.md-nav-bar__icon-box {
  position: relative;
  display: grid;
  flex-shrink: 0;
  place-items: center;
  width: 64px;
  height: 32px;
}

.md-nav-bar__indicator {
  position: absolute;
  inset: 0;
  background: transparent;
  border-radius: var(--md-sys-shape-corner-full);
  transition: background-color var(--md-sys-motion-duration-short4)
    var(--md-sys-motion-easing-standard);
}

.md-nav-bar__item--active .md-nav-bar__indicator {
  background: var(--md-sys-color-secondary-container);
}

.md-nav-bar__icon {
  position: relative;
  z-index: 1;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
}

.md-nav-bar__item--active .md-nav-bar__icon {
  color: var(--md-sys-color-on-secondary-container);
}

.md-nav-bar__label {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.md-nav-bar__item--active .md-nav-bar__label {
  color: var(--md-sys-color-on-surface);
}
</style>
