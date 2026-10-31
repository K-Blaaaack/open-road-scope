import { defineConfig, presetUno, presetIcons, transformerDirectives } from "unocss";

/**
 * UnoCSS 配置（MD3 版）
 *
 * 只保留「布局原子」与「语义色别名」两类快捷类：
 * - 布局原子：flex/grid 的常用组合，省去长串 class；
 * - 语义色别名：把 --md-sys-color-* 映射成短类名，组件里读起来接近 MD3 角色名。
 * 组件视觉细节（状态层、形状、层级、动效）一律走 tokens.css 的变量，不在这里堆砌。
 */
export default defineConfig({
  presets: [
    presetUno(),
    presetIcons({
      scale: 1.2,
      warn: true,
    }),
  ],
  // 变体分隔符只保留冒号：默认的 "-" 会把 md-page / md-stack / md-surface 这类
  // 以断点名开头的快捷类误判成「md: 变体 + 剩余部分」，导致整批 md-* 快捷类静默失效。
  separators: [":"],
  transformers: [transformerDirectives()],
  shortcuts: {
    /* ---------- 布局原子 ---------- */
    "flex-center": "flex items-center justify-center",
    "flex-between": "flex items-center justify-between",
    "flex-start": "flex items-center",
    "md-page": "mx-auto flex w-full max-w-3xl flex-col gap-4",
    "md-page-wide": "mx-auto flex w-full max-w-5xl flex-col gap-4",
    "md-stack": "flex flex-col gap-3",
    "md-stack-lg": "flex flex-col gap-5",
    "md-row": "flex flex-wrap items-center gap-2",
    "md-row-lg": "flex flex-wrap items-center gap-3",
    "md-fill": "min-h-0 min-w-0 flex-1",

    /* ---------- 语义色别名（MD3 颜色角色） ---------- */
    "md-surface": "bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface)]",
    "md-surface-container": "bg-[var(--md-sys-color-surface-container)]",
    "md-surface-low": "bg-[var(--md-sys-color-surface-container-low)]",
    "md-surface-high": "bg-[var(--md-sys-color-surface-container-high)]",
    "md-surface-highest": "bg-[var(--md-sys-color-surface-container-highest)]",
    "md-text": "text-[var(--md-sys-color-on-surface)]",
    "md-text-variant": "text-[var(--md-sys-color-on-surface-variant)]",
    "md-text-primary": "text-[var(--md-sys-color-primary)]",
    "md-text-error": "text-[var(--md-sys-color-error)]",
    "md-border": "border-[var(--md-sys-color-outline)]",
    "md-border-variant": "border-[var(--md-sys-color-outline-variant)]",
  },
});
