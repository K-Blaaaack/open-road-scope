import {
  clampReadInterval,
  listPortsResultSchema,
  subscribeParamsSchema,
  type Command,
  type ObdApi,
  type Pid,
  type RpcEvent,
  type StatusEventParams,
} from "@shared/obd";
import { i18n } from "@/i18n";
import { Elm327Session, type TransportBridge } from "./elm327";

/**
 * 把原生错误转为当前语言的可读消息。
 * @param error - 原生异常或协议错误码
 * @returns 本地化错误信息
 */
export function mobileError(error: unknown): string {
  const code = error instanceof Error ? error.message : String(error);
  const key = `mobile.${code}`;
  return i18n.global.te(key) ? i18n.global.t(key) : i18n.global.t("mobile.nativeFailure", { code });
}

/**
 * 为 Android 与 HarmonyOS 提供同一套 OBD 生命周期和订阅契约。
 * @param native - 平台字节流传输桥
 * @param platform - 原生宿主平台
 * @returns 与桌面 preload 对齐的 OBD API
 */
export function createMobileApi(
  native: TransportBridge,
  platform: "android" | "harmonyos"
): ObdApi {
  const listeners = new Set<(event: RpcEvent) => void>();
  let session: Elm327Session | null = null;
  let status: StatusEventParams = { state: "idle", mode: "sim" };
  let timer: ReturnType<typeof setTimeout> | undefined;
  let subSeq = 0;
  let activeSubId: number | null = null;
  let generation = 0;
  let connection = 0;
  let lifecycle: Promise<unknown> = Promise.resolve();
  let fault = false;

  /** @param event - 分发给渲染层的事件 */
  const emit = (event: RpcEvent): void => {
    if (event.event === "status") status = event.params as StatusEventParams;
    for (const callback of listeners) callback(event);
  };

  /** @returns 清除当前订阅并使正在等待的采样失效 */
  const stop = (): void => {
    generation++;
    activeSubId = null;
    clearTimeout(timer);
    timer = undefined;
  };

  /** @returns 关闭旧会话，取消尚未发送的协议命令 */
  const close = async (): Promise<void> => {
    session?.dispose();
    session = null;
    await native.close();
  };

  /**
   * 同一条传输只允许一个连接切换操作，旧请求通过世代号失效。
   * @param work - 连接或断开操作
   * @returns 当前操作结果
   */
  const exclusive = <T>(work: () => Promise<T>): Promise<T> => {
    const result = lifecycle.then(work);
    lifecycle = result.catch(() => undefined);
    return result;
  };

  return {
    platform,
    connectionTypes: platform === "harmonyos" ? ["network"] : ["usb", "bluetooth", "network"],
    connect: (mode, options) => {
      const epoch = ++connection;
      stop();
      session?.dispose();
      emit({ event: "status", params: { state: "connecting", mode } });
      return exclusive(async () => {
        if (epoch !== connection) return { ok: false, error: mobileError("cancelled") };
        try {
          await close();
          if (epoch !== connection) throw new Error("cancelled");
          if (mode === "sim") {
            fault = Boolean(options?.fault);
            emit({ event: "status", params: { state: "connected", mode, protocol: "DEMO" } });
            return { ok: true };
          }
          const port = options?.port?.trim();
          if (!port) throw new Error("noDevice");
          const type = /^([\dA-F]{2}:){5}[\dA-F]{2}$/i.test(port)
            ? "bluetooth"
            : port.includes(":")
              ? "tcp"
              : "usb";
          if (platform === "harmonyos" && type !== "tcp") throw new Error("networkOnly");
          if (!(await native.open(type, port))) throw new Error("connectFailed");
          if (epoch !== connection) throw new Error("cancelled");
          const next = new Elm327Session(native);
          session = next;
          await next.init();
          if (epoch !== connection) throw new Error("cancelled");
          emit({
            event: "status",
            params: {
              state: "connected",
              mode,
              port,
              protocol: next.getProtocol(),
              elmVersion: next.getElmVersion(),
            },
          });
          return { ok: true };
        } catch (error) {
          const message = mobileError(error);
          await close().catch(() => undefined);
          if (epoch === connection) {
            emit({ event: "status", params: { state: "error", mode, message } });
          }
          return { ok: false, error: message };
        }
      });
    },
    disconnect: () => {
      connection++;
      stop();
      session?.dispose();
      emit({ event: "status", params: { state: "idle", mode: status.mode } });
      return exclusive(async () => {
        try {
          await close();
          return { ok: true };
        } catch (error) {
          return { ok: false, error: mobileError(error) };
        }
      });
    },
    subscribe: async (params) => {
      const parsed = subscribeParamsSchema.safeParse(params);
      if (!parsed.success) return { ok: false, error: mobileError("invalidSubscription") };
      if (status.state !== "connected") return { ok: false, error: mobileError("notConnected") };
      stop();
      const current = generation;
      const subId = ++subSeq;
      activeSubId = subId;
      const { pids } = parsed.data;
      const interval = clampReadInterval(parsed.data.interval);
      const currentSession = session;
      let phase = 0;
      const tick = async (): Promise<void> => {
        if (current !== generation) return;
        const values: Partial<Record<Pid, number>> = {};
        try {
          if (currentSession) {
            for (const pid of pids) {
              if (current !== generation) return;
              const value = await currentSession.queryPid(pid);
              if (value !== null) values[pid] = value;
            }
          } else {
            phase += 0.015 * (interval / 500);
            const pedal = (Math.sin(phase) + 1) / 2;
            const simulated: Record<Pid, number> = {
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
            };
            for (const pid of pids) values[pid] = simulated[pid];
          }
          if (current !== generation) return;
          if (Object.keys(values).length)
            emit({ event: "data", params: { values, ts: Date.now() } });
          timer = setTimeout(() => void tick(), interval);
        } catch (error) {
          if (current !== generation) return;
          stop();
          emit({
            event: "status",
            params: { ...status, state: "error", message: mobileError(error) },
          });
          await close().catch(() => undefined);
        }
      };
      timer = setTimeout(() => void tick(), interval);
      return { ok: true, result: { subId, pids, interval } };
    },
    unsubscribe: async (subId) => {
      if (subId !== activeSubId) return { ok: false, error: mobileError("unknownSubscription") };
      stop();
      return { ok: true };
    },
    query: async (cmd: Command) => {
      if (status.state !== "connected") return { ok: false, error: mobileError("notConnected") };
      if (cmd === "GET_FRAME") return { ok: false, error: mobileError("unsupported") };
      const currentSession = session;
      const epoch = connection;
      try {
        let result: unknown;
        if (!session) {
          result =
            cmd === "GET_DTC"
              ? fault
                ? ["P0420"]
                : []
              : cmd === "VIN"
                ? "DEMO0000000000001"
                : true;
          if (cmd === "CLEAR_DTC") fault = false;
        } else if (cmd === "GET_DTC") result = await session.queryDtc();
        else if (cmd === "CLEAR_DTC") result = await session.clearDtc();
        else result = await session.queryVin();
        if (result === null) throw new Error("queryFailed");
        return { ok: true, result: { cmd, result } };
      } catch (error) {
        const code = error instanceof Error ? error.message : String(error);
        const message = mobileError(error);
        if (
          code !== "queryFailed" &&
          currentSession &&
          currentSession === session &&
          epoch === connection
        ) {
          stop();
          await close().catch(() => undefined);
          if (epoch === connection) {
            emit({ event: "status", params: { ...status, state: "error", message } });
          }
        }
        return { ok: false, error: message };
      }
    },
    status: async () => ({ ok: true, result: { ...status, port: status.port ?? null } }),
    listPorts: async () => {
      try {
        const result = listPortsResultSchema.parse({ ports: JSON.parse(await native.listPorts()) });
        return { ok: true, result };
      } catch (error) {
        return { ok: false, error: mobileError(error) };
      }
    },
    onEvent: (callback) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    reloadUI: async () => {
      connection++;
      stop();
      try {
        await close();
      } finally {
        window.location.reload();
      }
      return { ok: true };
    },
    openDevTools: async () => ({ ok: false, error: "unsupported" }),
    checkForUpdates: async () => ({ ok: false, error: "unsupported" }),
    onUpdateEvent: () => () => {},
  };
}
