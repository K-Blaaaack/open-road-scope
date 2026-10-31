<script setup lang="ts">
/**
 * MD3 侧边面板
 *
 * 右侧滑入，占满高度；头部标题 + 关闭按钮，正文可滚动、底部 actions 固定。
 * 打开时锁滚动，Esc 与点遮罩关闭，滑入动效走 emphasized-decelerate / medium2。
 */
import { nextTick, onBeforeUnmount, ref, useId, watch } from "vue";
import { useI18n } from "vue-i18n";
import { vRipple } from "@/directives/ripple";

const props = withDefaults(
  defineProps<{
    /** 是否打开 */
    modelValue: boolean;
    /** 标题文案 */
    headline: string;
    /** 面板宽度（CSS 长度），最大不超过 88vw */
    width?: string;
  }>(),
  {
    width: "360px",
  }
);

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
}>();

const { t } = useI18n();

const panelRef = ref<HTMLElement | null>(null);
/** 标题 id 用 useId 生成，避免多实例 aria-labelledby 撞车 */
const headlineId = `md-sheet-headline-${useId()}`;

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

/** 进入打开态：锁滚动、绑键盘、把焦点移进面板 */
const activate = (): void => {
  previousActive = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  previousOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  document.addEventListener("keydown", onKeydown);
  void nextTick(() => panelRef.value?.focus());
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
    <Transition name="md-sheet">
      <div v-if="modelValue" class="md-sheet">
        <div class="md-sheet__scrim" @click="close" />
        <aside
          ref="panelRef"
          class="md-sheet__panel"
          :style="{ width }"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="headlineId"
          tabindex="-1"
        >
          <header class="md-sheet__header">
            <h2 :id="headlineId" class="md-title-large md-sheet__headline">{{ headline }}</h2>
            <button
              v-ripple
              type="button"
              class="md-sheet__close md-state-layer"
              :aria-label="t('common.close')"
              @click="close"
            >
              <span class="i-lucide-x md-sheet__close-icon" aria-hidden="true" />
            </button>
          </header>
          <div class="md-sheet__body">
            <slot />
          </div>
          <div v-if="$slots.actions" class="md-sheet__actions">
            <slot name="actions" />
          </div>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.md-sheet {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  justify-content: flex-end;
}

.md-sheet__scrim {
  position: absolute;
  inset: 0;
  background: var(--md-sys-color-scrim);
  opacity: 0.32;
}

.md-sheet__panel {
  position: relative;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  max-width: 88vw;
  height: 100%;
  border-top-left-radius: var(--md-sys-shape-corner-large);
  border-bottom-left-radius: var(--md-sys-shape-corner-large);
  background: var(--md-sys-color-surface-container-low);
  color: var(--md-sys-color-on-surface);
  box-shadow: var(--md-sys-elevation-level1);
  outline: none;
}

.md-sheet__header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 12px 16px 24px;
}

.md-sheet__headline {
  flex: 1;
  min-width: 0;
  margin: 0;
  color: var(--md-sys-color-on-surface);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.md-sheet__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  padding: 0;
  border: none;
  border-radius: var(--md-sys-shape-corner-full);
  background: transparent;
  color: var(--md-sys-color-on-surface-variant);
  cursor: pointer;
  --md-state-layer-color: var(--md-sys-color-on-surface);
}

.md-sheet__close-icon {
  width: 20px;
  height: 20px;
}

.md-sheet__body {
  flex: 1;
  min-height: 0;
  padding: 0 24px;
  overflow-y: auto;
}

.md-sheet__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 24px 24px;
}

/* 面板滑入：位移交给面板，遮罩只做淡入淡出 */
.md-sheet-enter-active .md-sheet__scrim,
.md-sheet-leave-active .md-sheet__scrim {
  transition: opacity var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard);
}

.md-sheet-enter-from .md-sheet__scrim,
.md-sheet-leave-to .md-sheet__scrim {
  opacity: 0;
}

.md-sheet-enter-active .md-sheet__panel,
.md-sheet-leave-active .md-sheet__panel {
  transition: transform var(--md-sys-motion-duration-medium2)
    var(--md-sys-motion-easing-emphasized-decelerate);
}

.md-sheet-enter-from .md-sheet__panel,
.md-sheet-leave-to .md-sheet__panel {
  transform: translateX(100%);
}
</style>
