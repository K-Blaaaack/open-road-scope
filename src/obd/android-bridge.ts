import type { TransportBridge } from "./elm327";
import { createMobileApi } from "./mobile-bridge";

declare global {
  interface Window {
    androidObd?: TransportBridge;
  }
}

/** @returns 在 Android WebView 中安装与桌面契约一致的原生 OBD API */
export function installAndroidBridge(): void {
  if (!window.androidObd || window.obd) return;
  window.obd = createMobileApi(window.androidObd, "android");
}
