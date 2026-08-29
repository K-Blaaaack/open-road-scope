import { defineConfig, presetUno, presetIcons, transformerDirectives } from "unocss";

export default defineConfig({
  presets: [
    presetUno(),
    presetIcons({
      scale: 1.2,
      warn: true,
    }),
  ],
  transformers: [transformerDirectives()],
  shortcuts: {
    "flex-center": "flex items-center justify-center",
    "glass-card":
      "bg-[var(--color-card)]/80 backdrop-blur-md border border-[var(--color-border)] rounded-xl",
    "text-primary": "text-[var(--color-text-primary)]",
    "text-secondary": "text-[var(--color-text-secondary)]",

    /* ---------- 按钮 ---------- */
    // 基座：统一圆角/字重/过渡/禁用与键盘焦点表现（配色由具体变体给出）
    btn: "inline-flex items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-colors duration-200 outline-none select-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] disabled:cursor-not-allowed disabled:opacity-50",
    // 尺寸（含边框，保证有边框与无边框变体等高）
    "btn-xs": "px-2 py-1 text-xs",
    "btn-sm": "px-3 py-1.5",
    "btn-md": "px-4 py-2",
    "btn-lg": "px-4 py-2.5",
    "btn-icon": "h-8 w-8 shrink-0 p-0",
    "btn-icon-sm": "h-7 w-7 shrink-0 p-0",
    // 次要按钮：细描边 + 半透明底，深浅主题各自取色
    "btn-ghost":
      "btn border border-[var(--color-btn-border)] bg-[var(--color-btn)] text-[var(--color-text-secondary)] hover:bg-[var(--color-btn-hover)] hover:text-[var(--color-text-primary)] active:bg-[var(--color-btn-active)]",
    // 无描边的轻按钮：用于卡片工具栏等密集处
    "btn-quiet":
      "btn border border-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-btn-hover)] hover:text-[var(--color-text-primary)]",
    // 主按钮：实心强调色 + 白字
    "btn-primary":
      "btn border border-transparent bg-[var(--color-primary)] text-white shadow-sm hover:bg-[var(--color-primary-hover)]",
    "btn-danger":
      "btn border border-transparent bg-[var(--color-danger-solid)] text-white hover:bg-[var(--color-danger-hover)]",
    "btn-warning":
      "btn border border-transparent bg-[var(--color-warning-solid)] text-white hover:bg-[var(--color-warning-hover)]",
    // 分段选择的选中态（叠加在 btn-ghost 上）
    "btn-selected":
      "!border-[var(--color-accent)]/45 !bg-[var(--color-accent-soft)] !text-[var(--color-accent-text)]",

    /* ---------- 开关 ---------- */
    "switch-track":
      "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] disabled:cursor-not-allowed disabled:opacity-50",
    "switch-knob":
      "pointer-events-none absolute left-0.5 h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.35)] transition-transform duration-200 ease-out",

    /* ---------- 徽标与提示块 ---------- */
    badge: "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium leading-none",
    "badge-warning": "badge bg-[var(--color-warning-soft)] text-[var(--color-warning-text)]",
    "badge-success": "badge bg-[var(--color-success-soft)] text-[var(--color-success-text)]",
    "badge-danger": "badge bg-[var(--color-danger-soft)] text-[var(--color-danger-text)]",
    note: "rounded-lg border px-3 py-2 text-xs leading-relaxed",
    "note-warning":
      "note border-[var(--color-warning-border)] bg-[var(--color-warning-soft)] text-[var(--color-warning-text)]",
    "note-danger":
      "note border-[var(--color-danger-border)] bg-[var(--color-danger-soft)] text-[var(--color-danger-text)]",
  },
});
