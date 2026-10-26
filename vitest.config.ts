import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: "happy-dom",
    // shared/ 下的测试用 node:test 编写，由 `pnpm test:node`（tsx --test）执行；
    // vitest 只收 src/，避免两套运行器互相抢同一批文件
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": "/src",
      "@shared": "/shared",
    },
  },
});
