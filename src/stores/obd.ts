import { defineStore } from "pinia";
import { ref, reactive, computed } from "vue";

import { usePrefsStore } from "@/stores/prefs";
import {
  PIDS,
  clampReadInterval,
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
const startDemoBridge = (handleEvent: (event: RpcEvent) => void): (() => void) => {
  handleEvent({
    event: "status",
    params: { state: "connected", mode: "sim", protocol: "DEMO (内置模拟)" },
  });
  let phase = 0;
  let timer: number | undefined;
  let stopped = false;
  // 每帧重新读取设置里的间隔：改动设置后演示数据流无需重建即可生效
  const tick = (): void => {
    if (stopped) return;
    const interval = clampReadInterval(usePrefsStore().readInterval);
    // 按 500ms 基准缩放相位，保证不同间隔下波形推进速度一致
    phase += 0.015 * (interval / 500);
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
    timer = window.setTimeout(tick, interval);
  };
  timer = window.setTimeout(tick, clampReadInterval(usePrefsStore().readInterval));
  return () => {
    stopped = true;
    window.clearTimeout(timer);
  };
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
  /** 当前数据流订阅号（sidecar 返回的 subId），重订阅前用于释放旧订阅 */
  const subId = ref<number | null>(null);
  /** 订阅世代令牌：并发 subscribe 重叠时只有最新世代能占住 subId，落单订阅自我释放 */
  let subscribeEpoch = 0;

  const connected = computed(() => status.value.state === "connected");

  /** 演示模式：无 Electron 桥接且开发者模式开启时才可用 */
  const isDemo = computed(() => !window.obd && usePrefsStore().devMode);

  /** 无 Electron 桥接时是否允许启用内置演示数据 */
  const demoAllowed = (): boolean => !window.obd && usePrefsStore().devMode;

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
    } else if (demoAllowed()) {
      // 纯 Web / 安卓环境且开启开发者模式：启用内置演示数据
      startDemoBridge(handleEvent);
    }
    // 其他情况（无桥接且开发者模式关闭）：不注入任何数据
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
      if (demoAllowed()) {
        status.value = { state: "connected", mode, protocol: "DEMO (内置模拟)" };
        return;
      }
      throw new Error("OBD 桥接不可用（仅开发者模式下支持内置模拟）");
    }
    const result = (await window.obd.connect(mode, options)) as { ok: boolean; error?: string };
    if (!result.ok) throw new Error(result.error);
    // sidecar 进程已重建，旧订阅号失效
    subId.value = null;
  };

  const disconnect = async (): Promise<void> => {
    if (!window.obd) {
      status.value = { state: "idle", mode: status.value.mode };
      return;
    }
    await window.obd.disconnect();
    status.value = { state: "idle", mode: status.value.mode };
    subId.value = null;
  };

  /**
   * 订阅一组 PID，建立仪表盘数据流
   * @param pids - 需要订阅的 PID 列表
   * @param interval - 轮询间隔 ms，缺省取设置中的读取间隔（已夹到合法区间）
   */
  const subscribe = async (pids: Pid[] = DEFAULT_PIDS, interval?: number): Promise<void> => {
    // 单调递增世代令牌：本调用持有 my，任何后续 subscribe 会使 my 过期
    const my = ++subscribeEpoch;
    const ms = clampReadInterval(interval ?? usePrefsStore().readInterval);
    if (!window.obd) {
      if (demoAllowed()) return;
      throw new Error("OBD 桥接不可用");
    }
    // 必须在首个 await 之前同步取旧值并清空：两个触发源（保存布局、防抖重订阅）重叠时，
    // 都会读到同一个旧 subId 各自释放一次；清空后后来者读到 null 不会重复释放，
    // 世代令牌保证只有最新一次 subscribe 的结果能写入 subId.value
    const old = subId.value;
    subId.value = null;
    if (old !== null && typeof window.obd.unsubscribe === "function") {
      try {
        await window.obd.unsubscribe(old);
      } catch {
        // 旧订阅可能随 sidecar 重启失效，忽略即可
      }
    }
    // 契约层已声明返回 RpcEnvelope<SubscribeResult>，无需再内联断言
    const result = await window.obd.subscribe({ pids, interval: ms });
    if (!result.ok) throw new Error(result.error);
    const newSubId = result.result?.subId ?? null;
    if (my !== subscribeEpoch) {
      // 有更新的订阅正在跑，本次是落单订阅：立即自我释放，避免孤儿泄漏
      if (newSubId !== null && typeof window.obd.unsubscribe === "function") {
        try {
          await window.obd.unsubscribe(newSubId);
        } catch {
          // 释放失败只能忽略，sidecar 侧由重连流程兜底
        }
      }
      return;
    }
    subId.value = newSubId;
  };

  /**
   * 单次命令查询
   * @param cmd - GET_DTC / CLEAR_DTC / VIN
   */
  const query = async (cmd: Command): Promise<unknown> => {
    if (!window.obd) {
      // 仅开发者模式下返回演示数据
      if (demoAllowed()) {
        if (cmd === "GET_DTC") return ["P0420"];
        if (cmd === "CLEAR_DTC") return true;
        if (cmd === "VIN") return "WEBDEMO000001";
        return null;
      }
      throw new Error("OBD 桥接不可用");
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
    subId,
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
