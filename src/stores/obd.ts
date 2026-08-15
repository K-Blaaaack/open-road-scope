import { defineStore } from "pinia";
import { ref, reactive, computed } from "vue";

import { PIDS, type Pid, type StatusEventParams } from "@shared/obd";
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

  const setup = (): void => {
    window.obd.onEvent((event) => {
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
    });
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
    const result = (await window.obd.connect(mode, options)) as { ok: boolean; error?: string };
    if (!result.ok) throw new Error(result.error);
  };

  const disconnect = async (): Promise<void> => {
    await window.obd.disconnect();
    status.value = { state: "idle", mode: status.value.mode };
  };

  /**
   * 订阅一组 PID，建立仪表盘数据流
   * @param pids - 需要订阅的 PID 列表
   * @param interval - 轮询间隔 ms
   */
  const subscribe = async (pids: Pid[] = DEFAULT_PIDS, interval = 500): Promise<void> => {
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
  const query = async (cmd: "GET_DTC" | "CLEAR_DTC" | "VIN"): Promise<unknown> => {
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
    setup,
    connect,
    disconnect,
    subscribe,
    query,
  };
});
