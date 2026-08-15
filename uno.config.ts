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
  },
});
