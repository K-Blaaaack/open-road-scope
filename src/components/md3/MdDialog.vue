<script setup lang="ts">
/**
 * MD3 对话框
 *
 * 遮罩 32% scrim + 居中面板（surface-container-high / 28 圆角 / 层级 3）。
 * 打开时锁滚动、聚焦面板内首个可聚焦元素；关闭时还原焦点，Esc 与点遮罩均可关闭。
 */
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from "vue";

const props = withDefaults(
  defineProps<{
    /** 是否打开 */
    modelValue: boolean;
    /** 标题文案 */
    headline: string;
    /** 标题图标类名（i-lucide-*），不传则不显示图标区 */
    icon?: string;
    /** 图标底色语气 */
    iconTone?: "primary" | "error" | "warning" | "tertiary";
    /** 宽度档位：sm 最大 400，md 最大 560 */
    width?: "sm" | "md";
  }>(),
  {
    icon: undefined,
    iconTone: "primary",
    width: "md",
  }
);

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
}>();

const panelRef = ref<HTMLDivElement | null>(null);
/** 标题 id 用 useId 生成，避免多实例 aria-labelledby 撞车 */
const headlineId = `md-dialog-headline-${useId()}`;

const widthClass = computed(() => `md-dialog__panel--${props.width}`);
const toneClass = computed(() => `md-dialog__icon--${props.iconTone}`);

/** 可聚焦元素选择器：聚焦顺序与浏览器 Tab 序一致 */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** 打开前的焦点宿主，关闭后归还 */
let previousActive: HTMLElement | null = null;
/** 打开前的 body overflow，关闭后恢复原值 */
let previousOverflow = "";

/** 关闭并通知父级 */
const close = (): void => {
  emit("update:modelValue", false);
};

/** Esc 关闭：监听 document，避免焦点意外逃逸后按 Esc 失效 */
const onKeydown = (event: KeyboardEvent): void => {
  if (event.key !== "Escape") return;
  event.stopPropagation();
  close();
};

/** 聚焦面板内首个可聚焦元素，没有则聚焦面板本身 */
const focusFirst = (): void => {
  const panel = panelRef.value;
  if (!panel) return;
  const target = panel.querySelector<HTMLElement>(FOCUSABLE);
  (target ?? panel).focus();
};

/** 点遮罩关闭（点在面板内部不触发） */
const onScrimClick = (): void => {
  close();
};

/** 进入打开态：锁滚动、绑键盘、抢焦点 */
const activate = (): void => {
  previousActive = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  previousOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  document.addEventListener("keydown", onKeydown);
  void nextTick(focusFirst);
};

/** 退出打开态：恢复滚动、解绑键盘、还原焦点 */
const deactivate = (): void => {
  document.body.style.overflow = previousOverflow;
  document.removeEventListener("keydown", onKeydown);
  if (previousActive?.isConnected) previousActive.focus();
  previousActive = null;
};

watch(
  () => props.modelValue,
  (open) => (open ? activate() : deactivate()),
  { immediate: true }
);

onBeforeUnmount(deactivate);
</script>

<template>
  <Teleport to="body">
    <Transition name="md-dialog">
      <div v-if="modelValue" class="md-dialog">
        <div class="md-dialog__scrim" @click="onScrimClick" />
        <div
          ref="panelRef"
          class="md-dialog__panel"
          :class="widthClass"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="headlineId"
          tabindex="-1"
        >
          <div class="md-dialog__header">
            <span v-if="icon" class="md-dialog__icon" :class="toneClass">
              <span :class="icon" class="md-dialog__icon-glyph" aria-hidden="true" />
            </span>
            <h2 :id="headlineId" class="md-headline-small md-dialog__headline">
              {{ headline }}
            </h2>
          </div>
          <div class="md-body-medium md-dialog__body">
            <slot />
          </div>
          <div v-if="$slots.actions" class="md-dialog__actions">
            <slot name="actions" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.md-dialog {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.md-dialog__scrim {
  position: absolute;
  inset: 0;
  background: var(--md-sys-color-scrim);
  opacity: 0.32;
}

.md-dialog__panel {
  position: relative;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  padding: 24px;
  border-radius: var(--md-sys-shape-corner-extra-large);
  background: var(--md-sys-color-surface-container-high);
  color: var(--md-sys-color-on-surface);
  box-shadow: var(--md-sys-elevation-level3);
  outline: none;
}

/* 宽度区间 320–560，窄屏自动让位 */
.md-dialog__panel--md {
  width: min(560px, calc(100vw - 48px));
  min-width: min(320px, calc(100vw - 48px));
}

.md-dialog__panel--sm {
  width: min(400px, calc(100vw - 48px));
  min-width: min(280px, calc(100vw - 48px));
}

.md-dialog__header {
  display: flex;
  align-items: center;
  gap: 16px;
}

.md-dialog__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border-radius: var(--md-sys-shape-corner-full);
}

.md-dialog__icon-glyph {
  width: 24px;
  height: 24px;
}

.md-dialog__icon--primary {
  background: var(--md-sys-color-primary-container);
  color: var(--md-sys-color-on-primary-container);
}

.md-dialog__icon--error {
  background: var(--md-sys-color-error-container);
  color: var(--md-sys-color-on-error-container);
}

.md-dialog__icon--warning {
  background: var(--md-sys-color-warning-container);
  color: var(--md-sys-color-on-warning-container);
}

.md-dialog__icon--tertiary {
  background: var(--md-sys-color-tertiary-container);
  color: var(--md-sys-color-on-tertiary-container);
}

.md-dialog__headline {
  margin: 0;
  color: var(--md-sys-color-on-surface);
}

.md-dialog__body {
  margin-top: 16px;
  color: var(--md-sys-color-on-surface-variant);
}

.md-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 24px;
}
</style>
