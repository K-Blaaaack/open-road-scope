import { join } from "node:path";
import { app, BrowserWindow, ipcMain, shell } from "electron";
import { electronApp, optimizer } from "@electron-toolkit/utils";
import log from "electron-log/main";

import { registerObdIpc } from "./ipc/obd";
import { SidecarManager } from "./sidecar/manager";

const manager = new SidecarManager();
let mainWindow: BrowserWindow | null = null;

/** 安装界面恢复能力：渲染进程崩溃自动重载，并拦截 F5 / Ctrl+R 手动重载 */
function setupHotReload(win: BrowserWindow): void {
  win.webContents.on("render-process-gone", (_event, details) => {
    if (details.reason === "clean-exit") return;
    log.warn(`[hot-reload] renderer gone (${details.reason}), reloading…`);
    setTimeout(() => {
      if (!win.isDestroyed()) win.webContents.reload();
    }, 500);
  });

  win.webContents.on("before-input-event", (event, input) => {
    const isF5 = input.type === "keyDown" && input.key === "F5";
    const isCtrlR = input.type === "keyDown" && input.control && input.key.toLowerCase() === "r";
    if (isF5 || isCtrlR) {
      event.preventDefault();
      log.info("[hot-reload] manual reload via shortcut");
      win.webContents.reload();
    }
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
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
  setupHotReload(mainWindow);

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
