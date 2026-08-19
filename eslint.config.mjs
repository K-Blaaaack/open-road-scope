import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "@electron-toolkit/eslint-config-ts";
import eslintConfigPrettier from "eslint-config-prettier";
import eslintPluginVue from "eslint-plugin-vue";
import vueParser from "vue-eslint-parser";

export default defineConfig(
  globalIgnores([
    "**/node_modules/",
    "**/dist/",
    "**/out/",
    "**/build/",
    "**/dist-web/",
    "**/dist-android/",
    "**/resources/",
    "**/.venv/",
    "**/.git/",
    "android/**",
    "auto-imports.d.ts",
    "components.d.ts",
  ]),
  tseslint.configs.recommended,
  eslintPluginVue.configs["flat/recommended"],
  {
    files: ["**/*.vue"],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
      },
    },
  },
  {
    files: ["**/*.{ts,mts,tsx,vue}"],
    languageOptions: {
      globals: {
        // 构建期注入（electron.vite.config.ts define）
        __APP_VERSION__: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "vue/multi-word-component-names": "off",
      "vue/require-default-prop": "off",
    },
  },
  eslintConfigPrettier
);
