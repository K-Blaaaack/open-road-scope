import { z } from "zod";

/** 车辆状态 PID 定义（与 python-obd commands 命名对齐） */
export const PIDS = [
  "SPEED",
  "RPM",
  "COOLANT_TEMP",
  "ENGINE_LOAD",
  "MAF",
  "THROTTLE_POS",
  "FUEL_LEVEL",
  "INTAKE_TEMP",
  "INTAKE_PRESSURE",
  "FUEL_RATE",
  "BAROMETRIC_PRESSURE",
  "AMBIANT_AIR_TEMP",
  "VOLTAGE",
  "RUN_TIME",
  "TIMING_ADVANCE",
  "DISTANCE_SINCE_DTC_CLEAR",
] as const;

export type Pid = (typeof PIDS)[number];

export interface PidMeta {
  label: string;
  unit: string;
  min: number;
  max: number;
  decimals: number;
}

export const PID_META: Record<Pid, PidMeta> = {
  SPEED: { label: "车速", unit: "km/h", min: 0, max: 240, decimals: 1 },
  RPM: { label: "发动机转速", unit: "rpm", min: 0, max: 8000, decimals: 0 },
  COOLANT_TEMP: { label: "冷却液温度", unit: "°C", min: 0, max: 130, decimals: 0 },
  ENGINE_LOAD: { label: "发动机负荷", unit: "%", min: 0, max: 100, decimals: 0 },
  MAF: { label: "空气流量", unit: "g/s", min: 0, max: 200, decimals: 1 },
  THROTTLE_POS: { label: "节气门位置", unit: "%", min: 0, max: 100, decimals: 0 },
  FUEL_LEVEL: { label: "燃油液位", unit: "%", min: 0, max: 100, decimals: 0 },
  INTAKE_TEMP: { label: "进气温度", unit: "°C", min: -40, max: 120, decimals: 0 },
  INTAKE_PRESSURE: { label: "进气压力", unit: "kPa", min: 0, max: 300, decimals: 0 },
  FUEL_RATE: { label: "油耗率", unit: "L/h", min: 0, max: 80, decimals: 2 },
  BAROMETRIC_PRESSURE: { label: "大气压力", unit: "kPa", min: 70, max: 110, decimals: 0 },
  AMBIANT_AIR_TEMP: { label: "环境温度", unit: "°C", min: -40, max: 60, decimals: 0 },
  VOLTAGE: { label: "电瓶电压", unit: "V", min: 6, max: 16, decimals: 1 },
  RUN_TIME: { label: "运行时间", unit: "s", min: 0, max: 65535, decimals: 0 },
  TIMING_ADVANCE: { label: "点火提前角", unit: "°", min: -64, max: 64, decimals: 0 },
  DISTANCE_SINCE_DTC_CLEAR: { label: "清码后里程", unit: "km", min: 0, max: 65535, decimals: 0 },
};

/** 侧车命令（非周期传感器） */
export const COMMANDS = ["GET_DTC", "CLEAR_DTC", "VIN", "GET_FRAME"] as const;
export type Command = (typeof COMMANDS)[number];

/* ---------- JSON-RPC over stdio (JSON Lines) ---------- */

export const rpcRequestSchema = z.object({
  id: z.number().int(),
  method: z.enum(["subscribe", "unsubscribe", "query", "status", "ping", "list_ports"]),
  params: z.unknown().optional(),
});

export const rpcResponseSchema = z.object({
  id: z.number().int(),
  ok: z.boolean(),
  result: z.unknown().optional(),
  error: z.string().optional(),
});

export const rpcEventSchema = z.object({
  event: z.enum(["data", "status", "error", "log"]),
  params: z.unknown(),
});

export type RpcRequest = z.infer<typeof rpcRequestSchema>;
export type RpcResponse = z.infer<typeof rpcResponseSchema>;
export type RpcEvent = z.infer<typeof rpcEventSchema>;

/* ---------- 具体方法参数/结果 ---------- */

export const subscribeParamsSchema = z.object({
  pids: z.array(z.enum(PIDS)).min(1),
  interval: z.number().int().min(50).max(10000).default(500),
});

export const queryParamsSchema = z.object({
  cmd: z.enum(COMMANDS),
});

export interface DataEventParams {
  /** pid -> 数值（物理单位），未就绪或读取失败的 pid 缺省 */
  values: Partial<Record<Pid, number>>;
  /** 本轮读取的时间戳 ms */
  ts: number;
}

export interface StatusEventParams {
  state: "idle" | "connecting" | "connected" | "error";
  mode: "sim" | "real";
  protocol?: string;
  port?: string;
  elmVersion?: string;
  message?: string;
}

export interface ListPortsResult {
  ports: { name: string; description?: string }[];
}

/** preload 通过 contextBridge 暴露给渲染进程的 API */
export interface ObdApi {
  connect(mode: "sim" | "real", options?: { port?: string; fault?: boolean }): Promise<unknown>;
  disconnect(): Promise<unknown>;
  subscribe(params: { pids: Pid[]; interval: number }): Promise<unknown>;
  unsubscribe(subId: number): Promise<unknown>;
  query(cmd: Command): Promise<unknown>;
  status(): Promise<unknown>;
  listPorts(): Promise<unknown>;
  onEvent(callback: (event: RpcEvent) => void): () => void;
  /** 立即重新加载界面（应对突发界面异常） */
  reloadUI(): Promise<unknown>;
}
