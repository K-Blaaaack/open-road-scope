import { mergeConfig } from "vite";
import mobileConfig from "./vite.config.android";

// ArkWeb 从 rawfile 加载，资源必须相对 index.html 定位。
export default mergeConfig(mobileConfig, {
  base: "./",
  plugins: [
    {
      name: "harmonyos-local-scripts",
      transformIndexHtml: {
        order: "post",
        handler: (html: string) =>
          html
            .replace(/<script type="module" crossorigin/g, "<script defer")
            .replace(/<link rel="stylesheet" crossorigin/g, '<link rel="stylesheet"')
            .replace("default-src 'self';", "default-src 'self'; frame-src 'none';"),
      },
    },
  ],
  build: {
    outDir: "dist-harmonyos",
    target: "es2020",
    cssCodeSplit: false,
    modulePreload: false,
    // rawfile 的跨源规则因 ArkWeb 版本而异，单脚本避免 ES module 与动态导入依赖。
    rollupOptions: {
      output: { format: "iife", inlineDynamicImports: true },
    },
  },
});
