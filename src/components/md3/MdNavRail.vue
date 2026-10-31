<script lang="ts">
/**
 * 导航目的地（侧栏与底部导航栏共用）
 *
 * 放在普通 `<script>` 里导出，是为了让 `MdNavBar.vue` 直接 `import type` 复用同一份形状，
 * 避免两个组件各自维护一份结构后悄悄漂移。
 */
export interface NavItem {
  /** 目标路由路径，如 /dashboard */
  path: string;
  /** 图标类名（i-lucide-*） */
  icon: string;
  /** i18n 文案键，如 nav.dashboard */
  key: string;
}
</script>

<script setup lang="ts">
/**
 * MD3 导航侧栏（Navigation Rail）
 *
 * 折叠态 80dp 只留图标，展开态 240dp 图标 + 文字左对齐；活动指示器是 56×32 全圆角胶囊，
 * 展开/折叠只改宽度与文字可见性，指示器几何位置不动，切换时不会跳动。
 */
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";
import { vRipple } from "@/directives/ripple";

withDefaults(
  defineProps<{
    /** 目的地列表 */
    items: NavItem[];
    /** 展开：显示文字标签，宽度 240 */
    expanded?: boolean;
  }>(),
  { expanded: false }
);

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
  <nav class="md-nav-rail" :class="{ 'md-nav-rail--expanded': expanded }">
    <div class="md-nav-rail__items">
      <router-link
        v-for="item in items"
        :key="item.path"
        v-ripple
        :to="item.path"
        class="md-nav-rail__item md-state-layer"
        :class="{ 'md-nav-rail__item--active': isActive(item.path) }"
        :aria-current="isActive(item.path) ? 'page' : undefined"
        :aria-label="expanded ? undefined : t(item.key)"
        :title="t(item.key)"
      >
        <span class="md-nav-rail__icon-box">
          <span class="md-nav-rail__indicator" aria-hidden="true" />
          <span class="md-nav-rail__icon" :class="item.icon" aria-hidden="true" />
        </span>
        <span class="md-nav-rail__label md-label-large">{{ t(item.key) }}</span>
      </router-link>
    </div>

    <!-- 底部区域：放设置开关等次级入口 -->
    <div v-if="$slots.default" class="md-nav-rail__footer">
      <slot />
    </div>
  </nav>
</template>

<style scoped>
.md-nav-rail {
  position: relative;
  display: flex;
  flex-shrink: 0;
  flex-direction: column;
  gap: 4px;
  width: var(--md-comp-nav-rail-width);
  padding-top: 8px;
  overflow-x: hidden;
  background: var(--md-sys-color-surface);
  border-right: 1px solid var(--md-sys-color-outline-variant);
  transition: width var(--md-sys-motion-duration-medium2) var(--md-sys-motion-easing-emphasized);
}

.md-nav-rail--expanded {
  width: var(--md-comp-nav-rail-expanded-width);
}

.md-nav-rail__items {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0 4px;
}

/* ---------- 目的地 ---------- */
.md-nav-rail__item {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 56px;
  padding: 0 4px;
  border-radius: var(--md-sys-shape-corner-full);
  color: var(--md-sys-color-on-surface-variant);
  text-decoration: none;
  --md-state-layer-color: var(--md-sys-color-on-surface-variant);
}

.md-nav-rail__item--active {
  --md-state-layer-color: var(--md-sys-color-on-secondary-container);
}

/* 图标盒固定 56×32，指示器与图标都锚在这里，折叠/展开时位置不变 */
.md-nav-rail__icon-box {
  position: relative;
  display: grid;
  flex-shrink: 0;
  place-items: center;
  width: 56px;
  height: 32px;
}

.md-nav-rail__indicator {
  position: absolute;
  inset: 0;
  background: transparent;
  border-radius: var(--md-sys-shape-corner-full);
  transition: background-color var(--md-sys-motion-duration-short4)
    var(--md-sys-motion-easing-standard);
}

.md-nav-rail__item--active .md-nav-rail__indicator {
  background: var(--md-sys-color-secondary-container);
}

.md-nav-rail__icon {
  position: relative;
  z-index: 1;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
}

.md-nav-rail__item--active .md-nav-rail__icon {
  color: var(--md-sys-color-on-secondary-container);
}

.md-nav-rail__label {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.md-nav-rail__item--active .md-nav-rail__label {
  color: var(--md-sys-color-on-surface);
}

/* 折叠态：文字隐藏，可访问名称交给链接上的 aria-label / title */
.md-nav-rail:not(.md-nav-rail--expanded) .md-nav-rail__label {
  display: none;
}

/* ---------- 底部 ---------- */
.md-nav-rail__footer {
  margin-top: auto;
  padding: 8px 4px 16px;
}
</style>
