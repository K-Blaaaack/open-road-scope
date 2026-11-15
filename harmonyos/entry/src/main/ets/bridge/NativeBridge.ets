import { ErrorEvent, MessageEvents, worker } from "@kit.ArkTS";
import { webview } from "@kit.ArkWeb";
import {
  BridgeRequest,
  BridgeResponse,
  DisconnectEvent,
  MAX_REQUEST_BYTES,
  WorkerMessage,
  isTrustedPage,
} from "./Protocol";

const MAX_PENDING: number = 32;

export class NativeBridge {
  private controller: webview.WebviewController | undefined = undefined;
  private tcpWorker: worker.ThreadWorker | undefined = undefined;
  private pending: Map<number, string> = new Map<number, string>();
  private queued: string[] = [];
  private trusted: boolean = false;
  private ready: boolean = false;
  private foreground: boolean = true;
  private sessionRequested: boolean = false;

  /**
   * @param controller - 仅属于当前本地页面的控制器。
   * @returns 无。
   */
  attach(controller: webview.WebviewController): void {
    this.controller = controller;
    this.trusted = false;
    this.ready = false;
  }

  /**
   * @param url - 开始加载的主文档地址。
   * @returns 无。
   */
  pageBegin(url: string): void {
    this.stop("DISCONNECTED", false);
    this.queued = [];
    this.ready = false;
    this.trusted = isTrustedPage(url);
  }

  /**
   * @param url - 已加载的主文档地址。
   * @returns 无。
   */
  pageEnd(url: string): void {
    this.trusted = isTrustedPage(url);
    this.ready = this.trusted;
    const queued: string[] = this.queued;
    this.queued = [];
    queued.forEach((payload: string) => this.emit(payload));
  }

  /**
   * @param active - Ability 当前是否在前台。
   * @returns 无。
   */
  setForeground(active: boolean): void {
    this.foreground = active;
    if (!active) {
      this.stop("APP_BACKGROUND", true);
    }
  }

  /**
   * @param id - 前端请求的正整数 ID。
   * @param method - 受支持的传输方法。
   * @param paramsJson - JSON 编码的参数。
   * @returns 无，结果异步送到 __harmonyObdReceive。
   */
  call(id: number, method: string, paramsJson: string): void {
    if (!Number.isSafeInteger(id) || id < 1) {
      return;
    }
    if (!this.trusted || this.controller === undefined) {
      return;
    }
    if (!this.foreground) {
      this.respondError(id, "APP_BACKGROUND");
      return;
    }
    if (typeof method !== "string" || typeof paramsJson !== "string" ||
      method.length > 32 || paramsJson.length > MAX_REQUEST_BYTES) {
      this.respondError(id, "INVALID_REQUEST");
      return;
    }
    if (this.pending.has(id)) {
      return;
    }
    if (this.pending.size >= MAX_PENDING) {
      this.respondError(id, "BRIDGE_BUSY");
      return;
    }
    const request: BridgeRequest = { id: id, method: method, paramsJson: paramsJson };
    try {
      const tcpWorker: worker.ThreadWorker = this.ensureWorker();
      this.pending.set(id, method);
      if (method === "open") {
        this.sessionRequested = true;
      } else if (method === "close") {
        this.sessionRequested = false;
      }
      const message: WorkerMessage = { kind: "request", payload: JSON.stringify(request) };
      tcpWorker.postMessage(message);
    } catch (_) {
      this.pending.delete(id);
      this.respondError(id, "WORKER_FAILED");
      this.stop("WORKER_FAILED", true);
    }
  }

  /** @returns 无。 */
  detach(): void {
    this.stop("DISCONNECTED", true);
    this.controller = undefined;
    this.trusted = false;
    this.ready = false;
    this.queued = [];
  }

  /**
   * @param reason - 要发给挂起请求的错误码。
   * @param notify - 是否通知意外断开。
   * @returns 无。
   */
  private stop(reason: string, notify: boolean): void {
    const tcpWorker: worker.ThreadWorker | undefined = this.tcpWorker;
    this.tcpWorker = undefined;
    this.pending.forEach((_method: string, id: number) => this.respondError(id, reason));
    this.pending.clear();
    if (notify && this.sessionRequested) {
      const event: DisconnectEvent = { event: "disconnected" };
      this.emit(JSON.stringify(event));
    }
    this.sessionRequested = false;
    if (tcpWorker === undefined) {
      return;
    }
    // 先让 Worker 关闭 socket；异常 Worker 由有限等待后的终止兜底。
    const timer: number = setTimeout(() => tcpWorker.terminate(), 1500);
    tcpWorker.onexit = () => clearTimeout(timer);
    tcpWorker.onmessage = (event: MessageEvents) => {
      const message: WorkerMessage = event.data as WorkerMessage;
      if (message.kind === "stopped") {
        clearTimeout(timer);
        tcpWorker.terminate();
      }
    };
    try {
      const message: WorkerMessage = { kind: "shutdown", payload: "" };
      tcpWorker.postMessage(message);
    } catch (_) {
      clearTimeout(timer);
      tcpWorker.terminate();
    }
  }

  /** @returns 当前 Worker，首次请求时延迟创建。 */
  private ensureWorker(): worker.ThreadWorker {
    if (this.tcpWorker !== undefined) {
      return this.tcpWorker;
    }
    const tcpWorker: worker.ThreadWorker = new worker.ThreadWorker(
      "entry/ets/workers/TcpWorker.ets"
    );
    this.tcpWorker = tcpWorker;
    tcpWorker.onmessage = (event: MessageEvents) => {
      if (this.tcpWorker !== tcpWorker) {
        return;
      }
      const message: WorkerMessage = event.data as WorkerMessage;
      if (message.kind === "response") {
        const response: BridgeResponse = JSON.parse(message.payload) as BridgeResponse;
        const method: string | undefined = this.pending.get(response.id);
        if (this.pending.delete(response.id)) {
          if (method === "open" && !response.ok && response.error !== "CONNECT_IN_PROGRESS") {
            this.sessionRequested = false;
          }
          this.emit(message.payload);
        }
      } else if (message.kind === "event") {
        this.sessionRequested = false;
        this.emit(message.payload);
      }
    };
    tcpWorker.onerror = (_event: ErrorEvent) => {
      if (this.tcpWorker === tcpWorker) {
        this.stop("WORKER_FAILED", true);
      }
    };
    tcpWorker.onmessageerror = () => {
      if (this.tcpWorker === tcpWorker) {
        this.stop("WORKER_FAILED", true);
      }
    };
    tcpWorker.onexit = () => {
      if (this.tcpWorker === tcpWorker) {
        this.stop("WORKER_FAILED", true);
      }
    };
    return tcpWorker;
  }

  /**
   * @param id - 请求 ID。
   * @param error - 稳定错误码，由 Web 的 i18n 映射文案。
   * @returns 无。
   */
  private respondError(id: number, error: string): void {
    const response: BridgeResponse = { id: id, ok: false, error: error };
    this.emit(JSON.stringify(response));
  }

  /**
   * @param payload - 原生序列化出的响应或事件。
   * @returns 无。
   */
  private emit(payload: string): void {
    const controller: webview.WebviewController | undefined = this.controller;
    if (!this.trusted || controller === undefined) {
      return;
    }
    if (!this.ready) {
      if (this.queued.length < MAX_PENDING) {
        this.queued.push(payload);
      }
      return;
    }
    // JSON 先作为字符串字面量进入脚本，避免数据中的引号及换行改变调用结构。
    const literal: string = JSON.stringify(payload).replace(/\u2028/g, "\\u2028")
      .replace(/\u2029/g, "\\u2029");
    const script: string = "if(typeof window.__harmonyObdReceive==='function'){" +
      "window.__harmonyObdReceive(JSON.parse(" + literal + "));}";
    try {
      controller.runJavaScript(script).catch(() => {
        console.warn("OpenRoadScope: WEB_RESPONSE_FAILED");
      });
    } catch (_) {
      console.warn("OpenRoadScope: WEB_RESPONSE_FAILED");
    }
  }
}

export const nativeBridge: NativeBridge = new NativeBridge();

export class HarmonyObdProxy {
  /**
   * @param id - 请求 ID。
   * @param method - 传输方法。
   * @param paramsJson - 参数 JSON。
   * @returns 无。
   */
  call(id: number, method: string, paramsJson: string): void {
    nativeBridge.call(id, method, paramsJson);
  }
}
