import { resolve } from "path";
import { defineConfig } from "electron-vite";
import UnoCSS from "unocss/vite";
import vue from "@vitejs/plugin-vue";
import AutoImport from "unplugin-auto-import/vite";
import Icons from "unplugin-icons/vite";
import IconsResolver from "unplugin-icons/resolver";
import RekaResolver from "reka-ui/resolver";
import Components from "unplugin-vue-components/vite";
import pkg from "./package.json" with { type: "json" };

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "electron/main/index.ts"),
        },
      },
    },
    resolve: {
      alias: {
        "@main": resolve(__dirname, "electron/main"),
        "@shared": resolve(__dirname, "shared"),
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "electron/preload/index.ts"),
        },
      },
    },
  },
  renderer: {
    root: ".",
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    server: {
      port: 14559,
    },
    build: {
      assetsInlineLimit: 16384,
      chunkSizeWarningLimit: 800,
      rollupOptions: {
        input: {
          index: resolve(__dirname, "index.html"),
        },
        output: {
          // 公共代码提取 / 分包加载：核心框架独立 vendor 块，便于增量缓存与并行加载
          manualChunks: {
            vue: ["vue", "vue-router", "pinia", "vue-i18n"],
          },
        },
      },
    },
    resolve: {
      alias: {
        "@": resolve("src"),
        "@shared": resolve(__dirname, "shared"),
      },
    },
    plugins: [
      vue(),
      UnoCSS(),
      AutoImport({
        imports: ["vue", "pinia", "vue-router", "@vueuse/core", "vue-i18n"],
        eslintrc: {
          enabled: true,
          filepath: "./auto-eslint.mjs",
        },
      }),
      Icons({
        compiler: "vue3",
        scale: 1,
      }),
      Components({
        dirs: ["src/components"],
        resolvers: [RekaResolver(), IconsResolver({ prefix: "icon" })],
      }),
    ],
  },
});
