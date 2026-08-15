/// <reference types="vite/client" />

import type { ObdApi } from "@shared/obd";

declare global {
  /** 构建期注入的应用版本（electron.vite.config.ts，跟随 package.json） */
  const __APP_VERSION__: string;

  interface Window {
    electron: typeof import("@electron-toolkit/preload").electronAPI;
    obd: ObdApi;
    /** splash 动画起点（index.html 内联脚本写入） */
    __splashStart?: number;
  }
}

export {};
