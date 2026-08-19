import { resolve } from "path";
import { readFileSync } from "fs";
import vue from "@vitejs/plugin-vue";
import UnoCSS from "unocss/vite";
import AutoImport from "unplugin-auto-import/vite";
import Icons from "unplugin-icons/vite";
import IconsResolver from "unplugin-icons/resolver";
import Components from "unplugin-vue-components/vite";
import { defineConfig } from "vite";

// 安卓专用构建：原生 WebView + 内嵌本地 HTTP 服务加载。
// 不使用 PWA / 分包等桌面端优化，保证 WebView 下资源加载行为最简单可靠。
const pkg = JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf-8"));

export default defineConfig({
  base: "/",
  root: ".",
  define: {
    // electron-vite 在桌面构建自动注入，此处为安卓构建补齐
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    vue(),
    UnoCSS(),
    AutoImport({ imports: ["vue", "pinia", "vue-router", "@vueuse/core", "vue-i18n"] }),
    Icons({ compiler: "vue3", scale: 1 }),
    Components({ dirs: ["src/components"], resolvers: [IconsResolver({ prefix: "icon" })] }),
  ],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      "@shared": resolve(__dirname, "shared"),
    },
  },
  build: {
    outDir: "dist-android",
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, "index.html"),
    },
  },
});
