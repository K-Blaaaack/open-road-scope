import { ipcMain, type BrowserWindow } from "electron";
import log from "electron-log/main";

import { type Command, COMMANDS, subscribeParamsSchema } from "../../../shared/obd";
import { SidecarManager } from "../sidecar/manager";

const PING_INTERVAL = 5000;
const PING_TIMEOUT = 10000;
const REQUEST_TIMEOUT = 15000;

export interface ObdIpcOptions {
  getManager: () => SidecarManager;
  getWindow: () => BrowserWindow | null;
}

export function registerObdIpc(opts: ObdIpcOptions): void {
  const { getManager, getWindow } = opts;

  const broadcast = (event: unknown): void => {
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send("obd:event", event);
    }
  };

  ipcMain.handle(
    "obd:connect",
    async (_e, mode: string, options?: { port?: string; fault?: boolean }) => {
      try {
        const manager = getManager();
        manager.stop();
        manager.removeAllListeners();
        manager.on("event", broadcast);
        manager.on("restarting", (delay) => {
          broadcast({
            event: "status",
            params: { state: "error", mode, message: `sidecar restarting in ${delay}ms` },
          });
        });
        manager.start({
          mode: mode === "real" ? "real" : "sim",
          port: options?.port,
          fault: options?.fault,
        });
        return { ok: true, mode };
      } catch (err) {
        log.error("[ipc] obd:connect failed", err);
        return { ok: false, error: String(err) };
      }
    }
  );

  ipcMain.handle("obd:disconnect", async () => {
    getManager().stop();
    return { ok: true };
  });

  ipcMain.handle("obd:subscribe", async (_e, params: unknown) => {
    const parsed = subscribeParamsSchema.safeParse(params);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.message };
    }
    const { pids, interval } = parsed.data;
    try {
      const result = await getManager().rpc.send("subscribe", { pids, interval }, REQUEST_TIMEOUT);
      return { ok: true, result };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle("obd:unsubscribe", async (_e, subId: number) => {
    try {
      const result = await getManager().rpc.send("unsubscribe", { subId }, REQUEST_TIMEOUT);
      return { ok: true, result };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle("obd:query", async (_e, cmd: Command) => {
    if (!COMMANDS.includes(cmd)) {
      return { ok: false, error: `unknown command: ${cmd}` };
    }
    try {
      const result = await getManager().rpc.send("query", { cmd }, REQUEST_TIMEOUT);
      return { ok: true, result };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle("obd:status", async () => {
    try {
      const result = await getManager().rpc.send("status", undefined, PING_TIMEOUT);
      return { ok: true, result };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle("obd:listPorts", async () => {
    try {
      const result = await getManager().listPorts();
      // 记录枚举明细：用户报「刷新不到串口」时可直接从日志判断是枚举为空还是分类偏差
      log.info(
        `[ipc] listPorts -> ${result.ports.length} port(s)`,
        result.ports.map((p) => `${p.name}[${p.type}] ${p.hwid ?? ""}`.trim())
      );
      return { ok: true, result };
    } catch (err) {
      log.error("[ipc] obd:listPorts failed", err);
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle("obd:ping", async () => {
    try {
      const result = await getManager().rpc.send("ping", undefined, PING_INTERVAL);
      return { ok: true, result };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });
}
