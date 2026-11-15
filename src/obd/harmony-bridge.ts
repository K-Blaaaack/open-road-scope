import type { TransportBridge } from "./elm327";
import { createMobileApi } from "./mobile-bridge";

export interface HarmonyProxy {
  call(id: number, method: string, paramsJson: string): void;
}

export type HarmonyMessage =
  { id: number; ok: boolean; result?: unknown; error?: string } | { event: "disconnected" };

declare global {
  interface Window {
    harmonyObd?: HarmonyProxy;
    __harmonyObdReceive?: (message: HarmonyMessage) => void;
  }
}

/**
 * 将 ArkWeb 的回调协议转换为有截止时间的 Promise 传输桥。
 * @param proxy - ArkTS 注册的 JavaScript 代理
 * @returns 字节流桥、回执入口及待处理请求清理器
 */
export function createHarmonyTransport(proxy: HarmonyProxy): {
  transport: TransportBridge;
  receive: (message: HarmonyMessage) => void;
  dispose: () => void;
} {
  let sequence = 0;
  let connected = false;
  const pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  /**
   * 发起一次原生调用，先登记回执再调用代理，兼容同步返回的错误。
   * @param method - 传输方法
   * @param params - JSON 参数
   * @param timeoutMs - 桥接回执的最大等待时间
   * @returns 原生结果
   */
  const request = (method: string, params: object = {}, timeoutMs = 10000): Promise<unknown> =>
    new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error("bridgeTimeout"));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      try {
        proxy.call(id, method, JSON.stringify(params));
      } catch (error) {
        clearTimeout(timer);
        pending.delete(id);
        reject(error);
      }
    });

  /** @returns 释放所有等待中的回调；迟到的回执自动丢弃 */
  const dispose = (): void => {
    connected = false;
    for (const entry of pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new Error("disconnected"));
    }
    pending.clear();
  };

  return {
    transport: {
      listPorts: async () => JSON.stringify(await request("listPorts")),
      open: async (type, target) => {
        connected = (await request("open", { type, target }, 15000)) === true;
        return connected;
      },
      close: async () => {
        dispose();
        await request("close");
      },
      connected: () => connected,
      write: async (line) => {
        await request("write", { line });
      },
      readLine: async (timeoutMs) => {
        const result = await request("readLine", { timeoutMs }, timeoutMs + 2000);
        if (typeof result !== "string") throw new Error("invalidResponse");
        return result;
      },
    },
    receive: (message) => {
      if ("event" in message) {
        dispose();
        return;
      }
      const entry = pending.get(message.id);
      if (!entry) return;
      clearTimeout(entry.timer);
      pending.delete(message.id);
      if (message.ok) entry.resolve(message.result);
      else entry.reject(new Error(message.error || "nativeFailure"));
    },
    dispose,
  };
}

/** @returns 在 ArkWeb 本地页面安装 HarmonyOS 原生 OBD API */
export function installHarmonyBridge(): void {
  if (!window.harmonyObd || window.obd) return;
  const bridge = createHarmonyTransport(window.harmonyObd);
  const api = createMobileApi(bridge.transport, "harmonyos");
  window.__harmonyObdReceive = (message) => {
    bridge.receive(message);
    if ("event" in message && message.event === "disconnected") void api.disconnect();
  };
  window.obd = api;
  window.addEventListener("pagehide", () => void api.disconnect());
}
