import { contextBridge, ipcRenderer } from "electron";
import { electronAPI } from "@electron-toolkit/preload";

import type { ObdApi } from "../../shared/obd";

const obdApi: ObdApi = {
  connect: (mode, options) => ipcRenderer.invoke("obd:connect", mode, options),
  disconnect: () => ipcRenderer.invoke("obd:disconnect"),
  subscribe: (params) => ipcRenderer.invoke("obd:subscribe", params),
  unsubscribe: (subId) => ipcRenderer.invoke("obd:unsubscribe", subId),
  query: (cmd) => ipcRenderer.invoke("obd:query", cmd),
  status: () => ipcRenderer.invoke("obd:status"),
  listPorts: () => ipcRenderer.invoke("obd:listPorts"),
  reloadUI: () => ipcRenderer.invoke("app:reloadUI"),
  onEvent: (callback) => {
    const listener = (_e: unknown, event: unknown): void => callback(event as never);
    ipcRenderer.on("obd:event", listener);
    return () => ipcRenderer.removeListener("obd:event", listener);
  },
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("electron", electronAPI);
    contextBridge.exposeInMainWorld("obd", obdApi);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-ignore define in dts
  window.electron = electronAPI;
  // @ts-ignore define in dts
  window.obd = obdApi;
}
