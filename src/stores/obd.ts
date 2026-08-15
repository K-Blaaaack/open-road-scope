import { defineStore } from "pinia";
import { ref, reactive, computed } from "vue";

import {
  PIDS,
  type Command,
  type ObdApi,
  type Pid,
  type RpcEvent,
  type StatusEventParams,
} from "@shared/obd";
import { RingBuffer } from "@/core/ring-buffer";

/** 历史缓冲时长（秒） */
export const HISTORY_SECONDS = 60;
/** 默认订阅参数（主仪表盘数据源） */
export const DEFAULT_PIDS: Pid[] = [
  "RPM",
  "SPEED",
  "COOLANT_TEMP",
  "ENGINE_LOAD",
  "MAF",
  "THROTTLE_POS",
  "FUEL_LEVEL",
  "INTAKE_TEMP",
  "INTAKE_PRESSURE",
  "FUEL_RATE",
  "VOLTAGE",
];

export interface Sample {
  /** 采样时间戳 ms */
  t: number;
  v: number;
}

/** 无 Electron 环境（纯 Web / 安卓）时的内置演示桥接 */
const startDemoBridge = (
  handleEvent: (event: RpcEvent) => void
): (() => void) => {
  handleEvent({
    event: "status",
    params: { state: "connected", mode: "sim", protocol: "DEMO (内置模拟)" },
  });
  let phase = 0;
  const timer = window.setInterval(() => {
    phase += 0.015;
    const pedal = (Math.sin(phase) + 1) / 2;
    handleEvent({
      event: "data",
      params: {
        values: {
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
        },
        ts: Date.now(),
      },
    });
  }, 500);
  return () => window.clearInterval(timer);
};

export const useObdStore = defineStore("obd", () => {
  const status = ref<StatusEventParams>({
    state: "idle",
    mode: "sim",
  });
  /** 各 PID 最新值 */
  const latest = reactive<Partial<Record<Pid, number>>>({});
  /** 各 PID 历史环形缓冲 */
  const history = reactive<Record<Pid, RingBuffer<Sample>>>(
    Object.fromEntries(
      PIDS.map((p) => [p, new RingBuffer<Sample>(HISTORY_SECONDS * 10)])
    ) as Record<Pid, RingBuffer<Sample>>
  );
  /** 最近一次数据时间戳 */
  const lastTs = ref(0);

  const connected = computed(() => status.value.state === "connected");

  /** 演示模式下是否可用 */
  const isDemo = computed(() => !window.obd);

  /** sidecar 事件处理（数据 / 状态） */
  const handleEvent = (event: RpcEvent): void => {
    if (event.event === "data") {
      const params = event.params as { values: Partial<Record<Pid, number>>; ts: number };
      for (const [pid, value] of Object.entries(params.values)) {
        if (value === undefined || !(pid in history)) continue;
        latest[pid as Pid] = value;
        history[pid as Pid].push({ t: params.ts, v: value });
      }
      lastTs.value = params.ts;
    } else if (event.event === "status") {
      status.value = event.params as StatusEventParams;
    }
  };

  const setup = (): void => {
    if (window.obd) {
      window.obd.onEvent(handleEvent);
    } else {
      // 纯 Web / 安卓环境：启用内置演示数据
      startDemoBridge(handleEvent);
    }
  };

  /**
   * 连接 sidecar
   * @param mode - sim 模拟模式 / real 实车模式
   * @param options - 端口与故障注入选项
   */
  const connect = async (
    mode: "sim" | "real",
    options?: { port?: string; fault?: boolean }
  ): Promise<void> => {
    if (!window.obd) {
      status.value = { state: "connected", mode, protocol: "DEMO (内置模拟)" };
      return;
    }
    const result = (await window.obd.connect(mode, options)) as { ok: boolean; error?: string };
    if (!result.ok) throw new Error(result.error);
  };

  const disconnect = async (): Promise<void> => {
    if (!window.obd) {
      status.value = { state: "idle", mode: status.value.mode };
      return;
    }
    await window.obd.disconnect();
    status.value = { state: "idle", mode: status.value.mode };
  };

  /**
   * 订阅一组 PID，建立仪表盘数据流
   * @param pids - 需要订阅的 PID 列表
   * @param interval - 轮询间隔 ms
   */
  const subscribe = async (pids: Pid[] = DEFAULT_PIDS, interval = 500): Promise<void> => {
    if (!window.obd) return;
    const result = (await window.obd.subscribe({ pids, interval })) as {
      ok: boolean;
      error?: string;
    };
    if (!result.ok) throw new Error(result.error);
  };

  /**
   * 单次命令查询
   * @param cmd - GET_DTC / CLEAR_DTC / VIN
   */
  const query = async (cmd: Command): Promise<unknown> => {
    if (!window.obd) {
      // 演示模式返回固定数据
      if (cmd === "GET_DTC") return ["P0420"];
      if (cmd === "CLEAR_DTC") return true;
      if (cmd === "VIN") return "WEBDEMO000001";
      return null;
    }
    const result = (await window.obd.query(cmd)) as {
      ok: boolean;
      result?: unknown;
      error?: string;
    };
    if (!result.ok) throw new Error(result.error);
    return (result.result as { result?: unknown }).result;
  };

  return {
    status,
    latest,
    history,
    lastTs,
    connected,
    isDemo,
    setup,
    connect,
    disconnect,
    subscribe,
    query,
  };
});

export type { ObdApi };
