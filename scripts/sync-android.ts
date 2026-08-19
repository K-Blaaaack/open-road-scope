import { cpSync, rmSync } from "node:fs";
import { join } from "node:path";

/**
 * 把安卓专用构建产物（dist-android）同步进 Android 工程 assets，
 * 供 MainActivity 的内嵌本地 HTTP 服务加载。
 */
const root = join(import.meta.dirname, "..");
const from = join(root, "dist-android");
const to = join(root, "android/app/src/main/assets/web");

rmSync(to, { recursive: true, force: true });
cpSync(from, to, { recursive: true });
console.log(`[sync-android] ${from} -> ${to}`);
