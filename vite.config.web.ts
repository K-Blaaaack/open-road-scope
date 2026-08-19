import { resolve } from "path";
import { readFileSync } from "fs";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { VitePWA } from "vite-plugin-pwa";
import UnoCSS from "unocss/vite";
import AutoImport from "unplugin-auto-import/vite";
import Icons from "unplugin-icons/vite";
import IconsResolver from "unplugin-icons/resolver";
import Components from "unplugin-vue-components/vite";

// 纯 Web 构建（浏览器演示 / 部署）
const pkg = JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf-8"));

export default defineConfig({
  base: "./",
  root: ".",
  define: {
    // electron-vite 在桌面构建自动注入，此处为 Web 构建补齐
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
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
    // PWA / Service Worker：预缓存构建产物实现离线可用（仅 Web 构建，Electron 下不注册）
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "script",
      manifest: {
        name: "OpenRoadScope",
        short_name: "OpenRoadScope",
        description: "行车数据 · OBD-II 仪表盘",
        theme_color: "#0b0f14",
        background_color: "#0b0f14",
        display: "standalone",
        start_url: ".",
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,webmanifest}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
  build: {
    outDir: "dist-web",
    emptyOutDir: true,
    assetsInlineLimit: 16384,
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      input: resolve(__dirname, "index.html"),
      output: {
        // 公共代码提取 / 分包加载：核心框架独立 vendor 块
        manualChunks: {
          vue: ["vue", "vue-router", "pinia", "vue-i18n"],
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      "@shared": resolve(__dirname, "shared"),
    },
  },
});
