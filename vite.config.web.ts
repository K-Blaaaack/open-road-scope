import { resolve } from "path";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import UnoCSS from "unocss/vite";
import AutoImport from "unplugin-auto-import/vite";
import Icons from "unplugin-icons/vite";
import IconsResolver from "unplugin-icons/resolver";
import Components from "unplugin-vue-components/vite";

// 纯 Web 构建（供 Capacitor 安卓打包 / 浏览器演示）
export default defineConfig({
  base: "./",
  root: ".",
  plugins: [
    vue(),
    UnoCSS(),
    AutoImport({
      imports: ["vue", "pinia", "vue-router", "@vueuse/core", "vue-i18n"],
    }),
    Icons({
      compiler: "vue3",
      scale: 1,
    }),
    Components({
      dirs: ["src/components"],
      resolvers: [IconsResolver({ prefix: "icon" })],
    }),
  ],
  build: {
    outDir: "dist-web",
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, "index.html"),
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      "@shared": resolve(__dirname, "shared"),
    },
  },
});
