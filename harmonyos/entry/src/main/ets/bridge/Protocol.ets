export interface BridgeRequest {
  id: number;
  method: string;
  paramsJson: string;
}

export interface BridgeParams {
  type?: string;
  target?: string;
  line?: string;
  timeoutMs?: number;
}

export interface BridgeResponse {
  id: number;
  ok: boolean;
  result?: boolean | string | string[] | null;
  error?: string;
}

export interface DisconnectEvent {
  event: string;
}

export interface WorkerMessage {
  kind: string;
  payload: string;
}

export interface TcpTarget {
  address: string;
  port: number;
  family: number;
}

export const MAX_REQUEST_BYTES: number = 8192;
export const MAX_LINE_BYTES: number = 1024;
export const MAX_BUFFER_BYTES: number = 65536;
export const MAX_READ_TIMEOUT_MS: number = 60000;
export const CONNECT_TIMEOUT_MS: number = 8000;
export const WRITE_TIMEOUT_MS: number = 5000;
export const LOCAL_PAGE: string = "resource://rawfile/web/index.html";

/**
 * @param value - Web 页面地址。
 * @returns 是否为固定入口或其哈希路由。
 */
export function isTrustedPage(value: string): boolean {
  return value === LOCAL_PAGE || value.startsWith(LOCAL_PAGE + "#");
}

/**
 * @param target - 主机和端口，IPv6 必须使用方括号。
 * @returns 经校验的 TCP 地址。
 */
export function parseTarget(target: string): TcpTarget {
  if (typeof target !== "string" || target.length === 0 || target.length > 260) {
    throw new Error("INVALID_TARGET");
  }
  const ipv6: RegExpMatchArray | null = target.match(/^\[([0-9a-fA-F:]+)\]:(\d{1,5})$/);
  const host: RegExpMatchArray | null = target.match(/^([a-zA-Z0-9.-]+):(\d{1,5})$/);
  const match: RegExpMatchArray | null = ipv6 || host;
  if (match === null) {
    throw new Error("INVALID_TARGET");
  }
  const port: number = Number(match[2]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("INVALID_TARGET");
  }
  return { address: match[1], port: port, family: ipv6 === null ? 1 : 2 };
}

/**
 * @param value - JSON 编码的调用参数。
 * @returns 校验后的参数对象。
 */
export function parseParams(value: string): BridgeParams {
  if (typeof value !== "string" || value.length > MAX_REQUEST_BYTES) {
    throw new Error("INVALID_PARAMS");
  }
  let params: BridgeParams;
  try {
    params = JSON.parse(value) as BridgeParams;
  } catch (_) {
    throw new Error("INVALID_PARAMS");
  }
  if (params === null || typeof params !== "object" || Array.isArray(params)) {
    throw new Error("INVALID_PARAMS");
  }
  return params;
}

/**
 * @param value - 未带终止符的 ELM327 命令。
 * @returns 仅含一个尾随回车的命令。
 */
export function encodeLine(value: string): string {
  if (typeof value !== "string" || value.length > MAX_LINE_BYTES || !/^[\x20-\x7e]*$/.test(value)) {
    throw new Error("INVALID_PARAMS");
  }
  return value + "\r";
}

/**
 * @param value - 请求的读超时，单位毫秒。
 * @returns 校验后的超时值。
 */
export function readTimeout(value: number | undefined): number {
  if (value === undefined) {
    return 1000;
  }
  if (!Number.isInteger(value) || value < 1 || value > MAX_READ_TIMEOUT_MS) {
    throw new Error("INVALID_PARAMS");
  }
  return value;
}
