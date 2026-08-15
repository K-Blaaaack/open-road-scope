import { join } from "node:path";
import { app, BrowserWindow, shell } from "electron";
import { electronApp, optimizer } from "@electron-toolkit/utils";
import log from "electron-log/main";

import { registerObdIpc } from "./ipc/obd";
import { SidecarManager } from "./sidecar/manager";

const manager = new SidecarManager();
let mainWindow: BrowserWindow | null = null;

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
