<script setup lang="ts">
/**
 * MD3 徽标
 *
 * tone 决定色系，variant 决定填充方式。配色用行内 CSS 变量
 * （--badge-bg / --badge-fg / --badge-border）传入，避免动态拼接类名失效。
 */
import { computed } from "vue";

type BadgeTone = "primary" | "secondary" | "tertiary" | "error" | "success" | "warning" | "neutral";

type BadgeVariant = "filled" | "tonal" | "outlined";

const props = withDefaults(
  defineProps<{
    /** 徽标文案 */
    label: string;
    /** 色系 */
    tone?: BadgeTone;
    /** 填充方式 */
    variant?: BadgeVariant;
  }>(),
  {
    tone: "primary",
    variant: "tonal",
  }
);

/** 每个色系对应的令牌后缀：底色 / 容器底 / 其上文字 / 容器上文字 / 描边 */
const TONE_TOKENS: Record<
  BadgeTone,
  { base: string; container: string; onBase: string; onContainer: string; outline: string }
> = {
  primary: {
    base: "primary",
    container: "primary-container",
    onBase: "on-primary",
    onContainer: "on-primary-container",
    outline: "primary",
  },
  secondary: {
    base: "secondary",
    container: "secondary-container",
    onBase: "on-secondary",
    onContainer: "on-secondary-container",
    outline: "secondary",
  },
  tertiary: {
    base: "tertiary",
    container: "tertiary-container",
    onBase: "on-tertiary",
    onContainer: "on-tertiary-container",
    outline: "tertiary",
  },
  error: {
    base: "error",
    container: "error-container",
    onBase: "on-error",
    onContainer: "on-error-container",
    outline: "error",
  },
  success: {
    base: "success",
    container: "success-container",
    onBase: "on-success",
    onContainer: "on-success-container",
    outline: "success",
  },
  warning: {
    base: "warning",
    container: "warning-container",
    onBase: "on-warning",
    onContainer: "on-warning-container",
    outline: "warning",
  },
  neutral: {
    base: "surface-container-highest",
    container: "surface-container-highest",
    onBase: "on-surface-variant",
    onContainer: "on-surface-variant",
    outline: "on-surface-variant",
  },
};

/** 由 tone × variant 推导出三个行内 CSS 变量 */
const badgeStyle = computed<Record<string, string>>(() => {
  const tokens = TONE_TOKENS[props.tone];
  if (props.variant === "filled") {
    return {
      "--badge-bg": `var(--md-sys-color-${tokens.base})`,
      "--badge-fg": `var(--md-sys-color-${tokens.onBase})`,
      "--badge-border": "transparent",
    };
  }
  if (props.variant === "tonal") {
    return {
      "--badge-bg": `var(--md-sys-color-${tokens.container})`,
      "--badge-fg": `var(--md-sys-color-${tokens.onContainer})`,
      "--badge-border": "transparent",
    };
  }
  return {
    "--badge-bg": "transparent",
    "--badge-fg": `var(--md-sys-color-${tokens.outline})`,
    "--badge-border": `var(--md-sys-color-${tokens.outline})`,
  };
});
</script>

<template>
  <span class="md-badge md-label-small" :style="badgeStyle">{{ label }}</span>
</template>

<style scoped>
.md-badge {
  display: inline-flex;
  align-items: center;
  box-sizing: border-box;
  height: 20px;
  padding: 0 8px;
  border: 1px solid var(--badge-border, transparent);
  border-radius: var(--md-sys-shape-corner-full);
  background: var(--badge-bg, var(--md-sys-color-surface-container-highest));
  color: var(--badge-fg, var(--md-sys-color-on-surface-variant));
  font-family: var(--md-sys-typescale-font-family);
  white-space: nowrap;
  vertical-align: middle;
}
</style>
