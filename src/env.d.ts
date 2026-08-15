/// <reference types="vite/client" />

import type { ObdApi } from "@shared/obd";

declare global {
  interface Window {
    electron: typeof import("@electron-toolkit/preload").electronAPI;
    obd: ObdApi;
    /** splash 动画起点（index.html 内联脚本写入） */
    __splashStart?: number;
  }
}

export {};
