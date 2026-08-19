import type { Command, ObdApi, Pid, RpcEvent, StatusEventParams } from "@shared/obd";

import { Elm327Session, type TransportBridge } from "@/obd/elm327";

declare global {
  interface Window {
    androidObd?: TransportBridge;
  }
}

/**
 * 安卓原生 OBD 桥：WebView 下 window.androidObd 存在而 Electron preload 缺失时，
 * 安装与桌面端一致的 window.obd 实现（协议解析在 ELM327 引擎，传输走原生桥）。
 * 轮询在主线程分批调度（每次空闲查 1 个 PID），避免同步串口读阻塞界面。
 */

/** sim 模式演示数据刷新间隔 */
const SIM_INTERVAL_MS = 500;

const SIM_VALUES = (phase: number, pedal: number): Partial<Record<Pid, number>> => ({
  SPEED: pedal * 118,
  RPM: 750 + pedal * 6200,
  COOLANT_TEMP: 88 + Math.sin(phase / 4) * 3,
  ENGINE_LOAD: 12 + pedal * 75,
  MAF: 1.5 + pedal * 40,
  THROTTLE_POS: pedal * 80,
  FUEL_LEVEL: Math.max(0, 60 - phase * 0.15),
  INTAKE_TEMP: 24 + Math.sin(phase / 6),
  INTAKE_PRESSURE: 28 + pedal * 45,
  FUEL_RATE: 0.7 + pedal * 6,
  BAROMETRIC_PRESSURE: 101.3,
  AMBIANT_AIR_TEMP: 26,
  VOLTAGE: 14.1,
  RUN_TIME: phase * 100,
  TIMING_ADVANCE: 4 + pedal * 20,
  DISTANCE_SINCE_DTC_CLEAR: 12.3,
});

/** 判断端口字符串属于哪种原生传输 */
const resolveTarget = (
  port: string
): { type: "bluetooth" | "usb" | "tcp"; target: string } | null => {
  if (/^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/.test(port)) {
    return { type: "bluetooth", target: port };
  }
  if (port.includes(":")) {
    return { type: "tcp", target: port };
  }
  if (port) {
    return { type: "usb", target: port };
  }
  return null;
};

export function installAndroidBridge(): void {
  const native = window.androidObd;
  if (!native || window.obd) return;
  window.obd = createAndroidApi(native);
}

const createAndroidApi = (native: TransportBridge): ObdApi => {
  const listeners = new Set<(event: RpcEvent) => void>();
  let session: Elm327Session | null = null;
  let pollTimer: number | undefined;
  let simTimer: number | undefined;
  let currentStatus: StatusEventParams = { state: "idle", mode: "sim" };

  const emit = (event: RpcEvent): void => {
    if (event.event === "status") {
      currentStatus = event.params as StatusEventParams;
    }
    for (const cb of listeners) cb(event);
  };

  const clearTimers = (): void => {
    if (pollTimer !== undefined) window.clearTimeout(pollTimer);
    if (simTimer !== undefined) window.clearInterval(simTimer);
    pollTimer = undefined;
    simTimer = undefined;
  };

  const stopPolling = (): void => {
    if (pollTimer !== undefined) {
      window.clearTimeout(pollTimer);
      pollTimer = undefined;
    }
  };

  /** 分批轮询：每次空闲查一个 PID，全部完成后发出 data 事件 */
  const startPolling = (pids: Pid[], interval: number): void => {
    stopPolling();
    const tick = (index: number, values: Partial<Record<Pid, number>>): void => {
      if (index >= pids.length) {
        if (Object.keys(values).length > 0) {
          emit({ event: "data", params: { values, ts: Date.now() } });
        }
        pollTimer = window.setTimeout(() => tick(0, {}), interval);
        return;
      }
      const pid = pids[index];
      // 同步查询有耗时上限，交还给事件循环让界面保持响应
      pollTimer = window.setTimeout(() => {
        if (!session) {
          stopPolling();
          return;
        }
        try {
          const v = session.queryPid(pid);
          if (v !== null && v !== undefined) values[pid] = v;
        } catch {
          // 单点失败跳过，不中断轮询
        }
        tick(index + 1, values);
      }, 0);
    };
    tick(0, {});
  };

  /** sim 模式演示数据流 */
  const startSim = (): void => {
    clearTimers();
    emit({
      event: "status",
      params: { state: "connected", mode: "sim", protocol: "DEMO (内置模拟)" },
    });
    let phase = 0;
    simTimer = window.setInterval(() => {
      phase += 0.015;
      const pedal = (Math.sin(phase) + 1) / 2;
      emit({ event: "data", params: { values: SIM_VALUES(phase, pedal), ts: Date.now() } });
    }, SIM_INTERVAL_MS);
  };

  return {
    connect: async (mode, options) => {
      if (mode === "sim") {
        startSim();
        return { ok: true };
      }
      if (!options?.port) {
        return { ok: false, error: "未选择设备" };
      }
      const target = resolveTarget(options.port);
      if (!target) {
        return { ok: false, error: "无法识别的设备地址" };
      }
      emit({ event: "status", params: { state: "connecting", mode: "real" } });
      if (!native.open(target.type, target.target)) {
        emit({
          event: "status",
          params: { state: "error", mode: "real", message: "无法连接设备，请检查电源与配对状态" },
        });
        return { ok: false, error: "无法连接设备" };
      }
      session = new Elm327Session(native);
      try {
        session.init();
      } catch (err) {
        native.close();
        session = null;
        emit({
          event: "status",
          params: {
            state: "error",
            mode: "real",
            message: err instanceof Error ? err.message : "OBD 初始化失败",
          },
        });
        return { ok: false, error: "OBD 初始化失败" };
      }
      emit({
        event: "status",
        params: {
          state: "connected",
          mode: "real",
          protocol: session.getProtocol() || undefined,
          port: options.port,
          elmVersion: session.getElmVersion() || undefined,
        },
      });
      return { ok: true };
    },

    disconnect: async () => {
      clearTimers();
      if (session) {
        native.close();
        session = null;
      }
      emit({ event: "status", params: { state: "idle", mode: currentStatus.mode } });
      return { ok: true };
    },

    subscribe: async (params) => {
      if (!session) return { ok: false, error: "未连接" };
      startPolling(params.pids, params.interval);
      return { ok: true };
    },

    unsubscribe: async () => {
      stopPolling();
      return { ok: true };
    },

    query: async (cmd: Command) => {
      if (!session) return { ok: false, error: "未连接" };
      let result: unknown = null;
      try {
        if (cmd === "GET_DTC") result = session.queryDtc();
        else if (cmd === "CLEAR_DTC") result = session.clearDtc();
        else if (cmd === "VIN") result = session.queryVin();
      } catch {
        return { ok: false, error: "命令执行失败" };
      }
      if (result === null) result = [];
      return { ok: true, result: { cmd, result } };
    },

    status: async () => {
      const port = currentStatus.port;
      return { ok: true, result: { ...currentStatus, port: port ?? null } };
    },

    listPorts: async () => {
      try {
        const raw = native.listPorts();
        const ports = JSON.parse(raw) as { name: string; description?: string; type: string }[];
        return { ok: true, result: { ports } };
      } catch {
        return { ok: false, error: "设备枚举失败" };
      }
    },

    onEvent: (callback) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },

    reloadUI: async () => {
      window.location.reload();
      return { ok: true };
    },

    openDevTools: async () => ({ ok: false, error: "unsupported" }),

    checkForUpdates: async () => ({ ok: false, error: "unsupported" }),

    onUpdateEvent: () => () => {},
  };
};
