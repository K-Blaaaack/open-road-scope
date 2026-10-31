<script setup lang="ts">
/**
 * MD3 图标按钮
 *
 * 四种变体：standard（无底，选中态 secondary-container）/ filled / tonal / outlined。
 * 尺寸 40dp（sm 32dp），全圆角，图标 24dp（sm 20dp）。
 *
 * 关于 filled / tonal 的开关语义：MD3 里这两个变体的「未选中」是容器底 + 主色图标，
 * 「选中」才落到 primary / secondary-container。为了不破坏非开关场景（例如顶栏关闭按钮）
 * 的契约配色，只在 toggle=true 且未选中时才退回容器底。
 */
import { computed } from "vue";
import { vRipple } from "@/directives/ripple";

const props = withDefaults(
  defineProps<{
    /** 图标类名（如 i-lucide-x） */
    icon: string;
    /** 无障碍名（aria-label）：图标按钮没有可见文字，由使用方传入已翻译文案 */
    label: string;
    /** 变体 */
    variant?: "standard" | "filled" | "tonal" | "outlined";
    /** 尺寸：sm 32dp / md 40dp */
    size?: "sm" | "md";
    /** 选中态（standard / outlined 用 secondary-container 底） */
    selected?: boolean;
    /** 开关型按钮：额外输出 aria-pressed，读屏软件才知道可切换 */
    toggle?: boolean;
    /** 禁用 */
    disabled?: boolean;
  }>(),
  {
    variant: "standard",
    size: "md",
    selected: false,
    toggle: false,
    disabled: false,
  }
);

const emit = defineEmits<{
  (e: "click", event: MouseEvent): void;
}>();

const variantClass = computed(() => `md-icon-btn--${props.variant}`);
const sizeClass = computed(() => `md-icon-btn--${props.size}`);
/** 开关型且未选中：filled / tonal 退回容器底 */
const isToggleOff = computed(() => props.toggle && !props.selected);

/** 非开关型不输出 aria-pressed，否则读屏软件会误报「可切换」 */
const ariaPressed = computed<boolean | undefined>(() =>
  props.toggle ? props.selected : undefined
);

const onClick = (event: MouseEvent): void => {
  if (props.disabled) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  emit("click", event);
};
</script>

<template>
  <button
    v-ripple
    type="button"
    class="md-icon-btn md-state-layer"
    :class="[
      variantClass,
      sizeClass,
      selected ? 'md-icon-btn--selected' : '',
      isToggleOff ? 'md-icon-btn--toggle-off' : '',
    ]"
    :disabled="disabled"
    :aria-label="label"
    :aria-pressed="ariaPressed"
    @click="onClick"
  >
    <span :class="icon" class="md-icon-btn__icon" aria-hidden="true" />
  </button>
</template>

<style scoped>
.md-icon-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--md-sys-shape-corner-full);
  background: transparent;
  color: var(--md-sys-color-on-surface-variant);
  cursor: pointer;
  transition:
    background-color var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard),
    color var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard),
    border-color var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard);
}

/* ---------- 尺寸 ---------- */
.md-icon-btn--md {
  width: var(--md-comp-icon-button-size);
  height: var(--md-comp-icon-button-size);
}

.md-icon-btn--sm {
  width: 32px;
  height: 32px;
}

.md-icon-btn__icon {
  width: 24px;
  height: 24px;
  flex: 0 0 auto;
}

.md-icon-btn--sm .md-icon-btn__icon {
  width: 20px;
  height: 20px;
}

/* ---------- 变体 ---------- */
.md-icon-btn--standard {
  color: var(--md-sys-color-on-surface-variant);
  --md-state-layer-color: var(--md-sys-color-on-surface-variant);
}

.md-icon-btn--standard.md-icon-btn--selected {
  background: var(--md-sys-color-secondary-container);
  color: var(--md-sys-color-on-secondary-container);
  --md-state-layer-color: var(--md-sys-color-on-secondary-container);
}

.md-icon-btn--filled {
  background: var(--md-sys-color-primary);
  color: var(--md-sys-color-on-primary);
  --md-state-layer-color: var(--md-sys-color-on-primary);
}

.md-icon-btn--filled.md-icon-btn--toggle-off {
  background: var(--md-sys-color-surface-container-highest);
  color: var(--md-sys-color-primary);
  --md-state-layer-color: var(--md-sys-color-primary);
}

.md-icon-btn--tonal {
  background: var(--md-sys-color-secondary-container);
  color: var(--md-sys-color-on-secondary-container);
  --md-state-layer-color: var(--md-sys-color-on-secondary-container);
}

.md-icon-btn--tonal.md-icon-btn--toggle-off {
  background: var(--md-sys-color-surface-container-highest);
  color: var(--md-sys-color-on-surface-variant);
  --md-state-layer-color: var(--md-sys-color-on-surface-variant);
}

.md-icon-btn--outlined {
  border-color: var(--md-sys-color-outline);
  color: var(--md-sys-color-on-surface-variant);
  --md-state-layer-color: var(--md-sys-color-on-surface-variant);
}

.md-icon-btn--outlined.md-icon-btn--selected {
  border-color: transparent;
  background: var(--md-sys-color-secondary-container);
  color: var(--md-sys-color-on-secondary-container);
  --md-state-layer-color: var(--md-sys-color-on-secondary-container);
}

/* ---------- 禁用态 ---------- */
.md-icon-btn:disabled {
  cursor: not-allowed;
  background: color-mix(in srgb, var(--md-sys-color-on-surface) 12%, transparent);
  border-color: transparent;
  color: color-mix(in srgb, var(--md-sys-color-on-surface) 38%, transparent);
}

.md-icon-btn:disabled::after {
  opacity: 0;
}
</style>
