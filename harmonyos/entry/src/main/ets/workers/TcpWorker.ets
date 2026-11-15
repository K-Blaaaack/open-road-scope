import { MessageEvents, ThreadWorkerGlobalScope, worker } from "@kit.ArkTS";
import { BridgeRequest, BridgeResponse, DisconnectEvent, WorkerMessage } from "../bridge/Protocol";
import { RequestHandler } from "../bridge/RequestHandler";
import { TcpTransport } from "../bridge/TcpTransport";

const port: ThreadWorkerGlobalScope = worker.workerPort;
const transport: TcpTransport = new TcpTransport(() => {
  const event: DisconnectEvent = { event: "disconnected" };
  send("event", JSON.stringify(event));
});
const handler: RequestHandler = new RequestHandler(transport);
let stopping: boolean = false;

/**
 * @param kind - 主线程消息类型。
 * @param payload - JSON 编码的消息体。
 * @returns 无。
 */
function send(kind: string, payload: string): void {
  const message: WorkerMessage = { kind: kind, payload: payload };
  port.postMessage(message);
}

/** @returns socket 释放完成。 */
async function shutdown(): Promise<void> {
  stopping = true;
  try {
    await transport.close("DISCONNECTED");
  } catch (_) {
    console.warn("OpenRoadScope: TCP_CLOSE_FAILED");
  }
  send("stopped", "");
  port.close();
}

port.onmessage = (event: MessageEvents): void => {
  const message: WorkerMessage = event.data as WorkerMessage;
  if (message.kind === "shutdown") {
    shutdown();
    return;
  }
  if (stopping || message.kind !== "request") {
    return;
  }
  const request: BridgeRequest = JSON.parse(message.payload) as BridgeRequest;
  handler.handle(request).then((response: BridgeResponse) => {
    if (!stopping) {
      send("response", JSON.stringify(response));
    }
  });
};
