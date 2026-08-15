/// <reference types="vite/client" />

import type { ObdApi } from "@shared/obd";

declare global {
  interface Window {
    electron: typeof import("@electron-toolkit/preload").electronAPI;
    obd: ObdApi;
  }
}

export {};
