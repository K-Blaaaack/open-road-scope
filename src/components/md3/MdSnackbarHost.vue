<script setup lang="ts">
/**
 * MD3 提示条宿主
 *
 * 挂在 App 根部即可工作：内容来自模块级单例 useSnackbar，
 * 页面任意位置调用 `useSnackbar().show("…")` 就能弹出提示。
 */
import { useSnackbarState } from "@/composables/useSnackbar";

const { current, runAction } = useSnackbarState();

/** 动作按钮：先执行回调，再关闭提示条 */
const onAction = (): void => {
  runAction();
};
</script>

<template>
  <Transition name="snackbar">
    <div
      v-if="current"
      :key="current.id"
      class="md-snackbar md-body-medium"
      role="status"
      aria-live="polite"
    >
      <span class="md-snackbar__text">{{ current.message }}</span>
      <button
        v-if="current.actionLabel"
        type="button"
        class="md-snackbar__action md-label-large"
        @click="onAction"
      >
        {{ current.actionLabel }}
      </button>
    </div>
  </Transition>
</template>

<style scoped>
.md-snackbar {
  position: fixed;
  right: 0;
  bottom: 96px;
  left: 0;
  z-index: var(--md-sys-z-snackbar);
  display: flex;
  align-items: center;
  gap: 8px;
  box-sizing: border-box;
  width: fit-content;
  max-width: min(480px, calc(100vw - 32px));
  margin: 0 auto;
  padding: 14px 16px;
  border-radius: var(--md-sys-shape-corner-extra-small);
  background: var(--md-sys-color-inverse-surface);
  color: var(--md-sys-color-on-inverse-surface);
  box-shadow: var(--md-sys-elevation-level3);
  font-family: var(--md-sys-typescale-font-family);
}

/* 文案允许换行，动作按钮不参与压缩 */
.md-snackbar__text {
  flex: 1 1 auto;
  min-width: 0;
  overflow-wrap: anywhere;
}

.md-snackbar__action {
  flex: none;
  padding: 6px 10px;
  border: none;
  border-radius: var(--md-sys-shape-corner-full);
  background: transparent;
  color: var(--md-sys-color-inverse-primary);
  font-family: var(--md-sys-typescale-font-family);
  cursor: pointer;
  transition: background-color var(--md-sys-motion-duration-short4)
    var(--md-sys-motion-easing-standard);
}

.md-snackbar__action:hover {
  background: color-mix(in srgb, var(--md-sys-color-inverse-primary) 12%, transparent);
}

/* 窄屏给底部导航条留位，宽屏贴底显示 */
@media (min-width: 600px) {
  .md-snackbar {
    bottom: 24px;
  }
}
</style>
