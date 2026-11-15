import { BridgeParams, BridgeRequest, BridgeResponse, parseParams, readTimeout } from "./Protocol";
import { TcpTransport } from "./TcpTransport";

export class RequestHandler {
  private transport: TcpTransport;

  /**
   * @param transport - 当前 Worker 独占的 TCP 传输。
   */
  constructor(transport: TcpTransport) {
    this.transport = transport;
  }

  /**
   * @param request - 前端 RPC 请求。
   * @returns JSON 可序列化的成功或错误响应。
   */
  async handle(request: BridgeRequest): Promise<BridgeResponse> {
    try {
      const params: BridgeParams = parseParams(request.paramsJson);
      switch (request.method) {
        case "open":
          if (params.type !== "tcp") {
            throw new Error("UNSUPPORTED_TRANSPORT");
          }
          if (typeof params.target !== "string") {
            throw new Error("INVALID_PARAMS");
          }
          return { id: request.id, ok: true, result: await this.transport.open(params.target) };
        case "close":
          await this.transport.close();
          return { id: request.id, ok: true, result: null };
        case "write":
          if (typeof params.line !== "string") {
            throw new Error("INVALID_PARAMS");
          }
          await this.transport.write(params.line);
          return { id: request.id, ok: true, result: null };
        case "readLine":
          return {
            id: request.id,
            ok: true,
            result: await this.transport.readLine(readTimeout(params.timeoutMs)),
          };
        case "listPorts":
          return { id: request.id, ok: true, result: [] };
        default:
          throw new Error("UNSUPPORTED_METHOD");
      }
    } catch (error) {
      return { id: request.id, ok: false, error: (error as Error).message };
    }
  }
}
