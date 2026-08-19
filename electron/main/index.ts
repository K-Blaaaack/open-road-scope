import { join } from "node:path";
import { app, BrowserWindow, ipcMain, shell } from "electron";
import { electronApp, optimizer } from "@electron-toolkit/utils";
import electronUpdater from "electron-updater";
const { autoUpdater } = electronUpdater;
import log from "electron-log/main";

import { registerObdIpc } from "./ipc/obd";
import { SidecarManager } from "./sidecar/manager";
import type { UpdateEventParams } from "../../shared/obd";

const manager = new SidecarManager();
let mainWindow: BrowserWindow | null = null;

/** 安装窗口快捷键与恢复能力：
 * - 渲染进程崩溃自动重载
 * - F5 / Ctrl+R 手动重载
 * - F12 / Ctrl+Shift+I 强制打开内核开发者工具（不受应用内开发者模式限制） */
function setupWindowShortcuts(win: BrowserWindow): void {
  win.webContents.on("render-process-gone", (_event, details) => {
    if (details.reason === "clean-exit") return;
    log.warn(`[hot-reload] renderer gone (${details.reason}), reloading…`);
    setTimeout(() => {
      if (!win.isDestroyed()) win.webContents.reload();
    }, 500);
  });

  win.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    const key = input.key.toLowerCase();
    const isF5 = input.key === "F5";
    const isCtrlR = input.control && key === "r";
    if (isF5 || isCtrlR) {
      event.preventDefault();
      log.info("[hot-reload] manual reload via shortcut");
      win.webContents.reload();
      return;
    }
    // 强制打开内核开发者调试工具（开发者模式关闭时同样可用）
    const isF12 = input.key === "F12";
    const isCtrlShiftI = input.control && input.shift && key === "i";
    if (isF12 || isCtrlShiftI) {
      event.preventDefault();
      log.info("[devtools] opened via shortcut");
      win.webContents.openDevTools();
    }
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 480,
    minHeight: 400,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#0b0f14",
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      sandbox: false,
      contextIsolation: true,
    },
  });

  mainWindow.on("ready-to-show", () => mainWindow?.show());
  setupWindowShortcuts(mainWindow);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId("dev.openroadscope.app");
  app.on("browser-window-created", (_, window) => optimizer.watchWindowShortcuts(window));
  log.initialize();

  registerObdIpc({
    getManager: () => manager,
    getWindow: () => mainWindow,
  });

  /* ---------- 版本检查（electron-updater） ---------- */

  // 不自动下载，只做版本检测，由用户在关于页手动触发
  autoUpdater.autoDownload = false;

  const broadcastUpdate = (event: UpdateEventParams): void => {
    const win = mainWindow;
    if (win && !win.isDestroyed()) {
      win.webContents.send("app:updateEvent", event);
    }
  };

  autoUpdater.on("checking-for-update", () => broadcastUpdate({ state: "checking" }));
  autoUpdater.on("update-available", (info) =>
    broadcastUpdate({ state: "available", version: info.version })
  );
  autoUpdater.on("update-not-available", () => broadcastUpdate({ state: "not-available" }));
  autoUpdater.on("error", (err) => broadcastUpdate({ state: "error", message: String(err) }));

  // 检查更新（关于页按钮触发）
  ipcMain.handle("app:checkForUpdates", async () => {
    // 开发模式未打包，无发布源可查（electron-updater 依赖安装包上下文）
    if (!app.isPackaged) {
      return { ok: false, error: "dev" };
    }
    try {
      const result = await autoUpdater.checkForUpdates();
      return {
        ok: true,
        result: result?.updateInfo ? { version: result.updateInfo.version } : null,
      };
    } catch (err) {
      log.warn("[updater] checkForUpdates failed:", err);
      return { ok: false, error: String(err) };
    }
  });

  // 手动重载界面（设置页按钮触发）
  ipcMain.handle("app:reloadUI", () => {
    const win = mainWindow;
    if (win && !win.isDestroyed()) {
      log.info("[hot-reload] manual reload via button");
      win.webContents.reload();
      return { ok: true };
    }
    return { ok: false, error: "no window" };
  });

  // 打开开发者工具（开发者菜单触发）
  ipcMain.handle("app:openDevTools", () => {
    const win = mainWindow;
    if (win && !win.isDestroyed()) {
      log.info("[devtools] opening DevTools");
      win.webContents.openDevTools();
      return { ok: true };
    }
    log.warn("[devtools] no window, cannot open DevTools");
    return { ok: false, error: "no window" };
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  manager.stop();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  manager.stop();
});
