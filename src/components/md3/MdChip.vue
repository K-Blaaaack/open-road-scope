<script setup lang="ts">
/**
 * MD3 徽片（chip）
 *
 * 四种变体：assist / filter / input / suggestion。高 32、圆角 8、1px outline-variant 描边。
 * filter 选中态换 secondary-container 底并显示勾选图标（与 MD3 一致：勾选优先于原图标）。
 * input（或显式 removable）时右侧挂一个独立的关闭按钮 —— 不能用「按钮套按钮」，
 * 所以外壳是 div，内部是两个平级 button，各自带状态层与水波纹。
 */
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { vRipple } from "@/directives/ripple";

const props = withDefaults(
  defineProps<{
    /** 显示文案，由页面传入已翻译文案 */
    label: string;
    /** 变体 */
    variant?: "assist" | "filter" | "input" | "suggestion";
    /** 选中态（filter 用 secondary-container 底 + 勾选） */
    selected?: boolean;
    /** 前置图标类名 */
    icon?: string;
    /** 显示右侧关闭按钮（input 变体默认显示） */
    removable?: boolean;
    /** 禁用 */
    disabled?: boolean;
  }>(),
  {
    variant: "assist",
    selected: false,
    icon: undefined,
    removable: false,
    disabled: false,
  }
);

const emit = defineEmits<{
  (e: "click", event: MouseEvent): void;
  (e: "remove"): void;
}>();

const { t } = useI18n();

/** filter 选中时用勾选替掉原图标，其余变体保持传入图标 */
const leadingIcon = computed<string | undefined>(() => {
  if (props.variant === "filter" && props.selected) return "i-lucide-check";
  return props.icon;
});

/** input 变体天然带删除语义，removable 用于其它变体按需开启 */
const showRemove = computed(() => props.removable || props.variant === "input");

const onClick = (event: MouseEvent): void => {
  if (props.disabled) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  emit("click", event);
};

const onRemove = (event: MouseEvent): void => {
  event.stopPropagation();
  if (props.disabled) return;
  emit("remove");
};
</script>

<template>
  <div
    class="md-chip"
    :class="[
      `md-chip--${variant}`,
      selected ? 'md-chip--selected' : '',
      showRemove ? 'md-chip--removable' : '',
      leadingIcon ? 'md-chip--with-icon' : '',
      disabled ? 'md-chip--disabled' : '',
    ]"
  >
    <button
      v-ripple
      type="button"
      class="md-chip__main md-state-layer"
      :disabled="disabled"
      :aria-pressed="variant === 'filter' ? selected : undefined"
      @click="onClick"
    >
      <span v-if="leadingIcon" :class="leadingIcon" class="md-chip__icon" aria-hidden="true" />
      <span class="md-chip__label">{{ label }}</span>
    </button>
    <button
      v-if="showRemove"
      v-ripple
      type="button"
      class="md-chip__remove md-state-layer"
      :disabled="disabled"
      :aria-label="t('common.close')"
      @click="onRemove"
    >
      <span class="i-lucide-x md-chip__remove-icon" aria-hidden="true" />
    </button>
  </div>
</template>

<style scoped>
.md-chip {
  display: inline-flex;
  align-items: stretch;
  max-width: 100%;
  height: 32px;
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-corner-small);
  background: transparent;
  color: var(--md-sys-color-on-surface);
  /* 状态层颜色由外壳统一给出，两个内部按钮都继承，保证与前景色一致 */
  --md-state-layer-color: var(--md-sys-color-on-surface);
  overflow: hidden;
  transition:
    background-color var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard),
    border-color var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard),
    color var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard);
}

.md-chip__main {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 0 12px;
  border: none;
  background: transparent;
  color: inherit;
  font-family: var(--md-sys-typescale-font-family);
  font-size: var(--md-sys-typescale-label-large-size);
  line-height: var(--md-sys-typescale-label-large-line);
  font-weight: var(--md-sys-typescale-label-large-weight);
  letter-spacing: var(--md-sys-typescale-label-large-tracking);
  cursor: pointer;
  white-space: nowrap;
}

.md-chip--with-icon .md-chip__main {
  padding-left: 8px;
}

.md-chip--removable .md-chip__main {
  padding-right: 4px;
}

.md-chip__icon {
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
}

.md-chip__label {
  overflow: hidden;
  text-overflow: ellipsis;
}

.md-chip__remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  align-self: center;
  flex: 0 0 auto;
  width: 24px;
  height: 24px;
  margin-right: 4px;
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  border-radius: var(--md-sys-shape-corner-full);
  cursor: pointer;
}

.md-chip__remove-icon {
  width: 16px;
  height: 16px;
}

/* 外壳 overflow:hidden 会裁掉按钮自身的焦点轮廓，把焦点环画到外壳上 */
.md-chip:has(.md-chip__main:focus-visible),
.md-chip:has(.md-chip__remove:focus-visible) {
  outline: 2px solid var(--md-sys-color-primary);
  outline-offset: 2px;
}

.md-chip__main:focus-visible,
.md-chip__remove:focus-visible {
  outline: none;
}

/* ---------- 变体 ---------- */
.md-chip--assist,
.md-chip--suggestion {
  background: transparent;
}

/* input 变体是「已填值」的展示态，比其它徽片略高一层底，便于和纯按钮区分 */
.md-chip--input {
  background: var(--md-sys-color-surface-container-low);
}

/* ---------- 选中态 ---------- */
.md-chip--selected {
  background: var(--md-sys-color-secondary-container);
  border-color: transparent;
  color: var(--md-sys-color-on-secondary-container);
  --md-state-layer-color: var(--md-sys-color-on-secondary-container);
}

/* ---------- 禁用态 ---------- */
.md-chip--disabled {
  opacity: var(--md-sys-state-disabled-opacity);
}

.md-chip--disabled .md-chip__main,
.md-chip--disabled .md-chip__remove {
  cursor: not-allowed;
}

.md-chip__main:disabled::after,
.md-chip__remove:disabled::after {
  opacity: 0;
}
</style>
