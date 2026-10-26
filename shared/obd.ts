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

/* ---------- 数据读取间隔 ---------- */

/**
 * 读取间隔的合法下限（ms）。ELM327 单条 PID 请求在 38400~500000 波特率下
 * 往返约 20~50ms，多个 PID 还需串行排队；间隔再小只会让请求队列积压，
 * 拿到的反而是更旧的数据，因此按适配器吞吐能力取 100ms 为下限。
 */
export const READ_INTERVAL_MIN = 100;
/**
 * 读取间隔的合法上限（ms）。慢速 PID（燃油液位等）自身刷新周期约 1s，
 * 间隔超过 2s 后仪表已失去实时意义，故以 2000ms 封顶。
 */
export const READ_INTERVAL_MAX = 2000;
/** 默认读取间隔（ms）：兼顾实时性与适配器吞吐 */
export const READ_INTERVAL_DEFAULT = 200;
/** 读取间隔调节步进（ms） */
export const READ_INTERVAL_STEP = 50;
/** 设置页档位（ms）：下限、默认、500、1000，与滑块同一套网格 */
export const READ_INTERVAL_PRESETS = [READ_INTERVAL_MIN, READ_INTERVAL_DEFAULT, 500, 1000] as const;

/**
 * 规整读取间隔：非数值回退默认值，其余取整、对齐步进并夹到合法区间
 * @param value - 用户输入、存储值或外部传入的间隔
 * @returns 落在 [READ_INTERVAL_MIN, READ_INTERVAL_MAX] 内的整数 ms
 */
export const clampReadInterval = (value: unknown): number => {
  // 只接受数值与非空数字字符串：null/""/空白串/布尔/对象一律按非法输入回退默认值
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(n)) return READ_INTERVAL_DEFAULT;
  // 步进必须以 READ_INTERVAL_MIN 为锚点：<input type="range"> 的合法值是 min + k*step，
  // 若按 0 为锚点对齐，回写 el.value 时会把滑块拽到相邻格
  const stepped =
    Math.round((n - READ_INTERVAL_MIN) / READ_INTERVAL_STEP) * READ_INTERVAL_STEP +
    READ_INTERVAL_MIN;
  return Math.min(READ_INTERVAL_MAX, Math.max(READ_INTERVAL_MIN, stepped));
};

/* ---------- 具体方法参数/结果 ---------- */

/**
 * 订阅参数。注意越界策略是有意的纵深防御：
 * IPC 边界（本 schema）对越界值 fail fast，让渲染层 bug 立刻暴露；
 * sidecar 侧 clamp_interval 只做防御性兜底（防止绕过渲染层的客户端）。
 */
export const subscribeParamsSchema = z.object({
  pids: z.array(z.enum(PIDS)).min(1),
  interval: z
    .number()
    .int()
    .min(READ_INTERVAL_MIN)
    .max(READ_INTERVAL_MAX)
    .default(READ_INTERVAL_DEFAULT),
});

/** 订阅结果：sidecar / 安卓桥统一返回 subId，渲染层据此释放旧订阅 */
export const subscribeResultSchema = z.object({
  subId: z.number().int().nonnegative(),
  pids: z.array(z.enum(PIDS)),
  interval: z.number().int(),
});

export type SubscribeResult = z.infer<typeof subscribeResultSchema>;

/** IPC / 桥接调用的统一信封：主进程与安卓桥都返回 { ok, error?, result? } */
export interface RpcEnvelope<T = unknown> {
  ok: boolean;
  error?: string;
  result?: T;
}

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

export const serialPortInfoSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  /** 硬件 ID（pyserial hwid），用于排查「枚举不到串口」 */
  hwid: z.string().optional(),
  /** 串口类型：usb 串口 / 蓝牙串口 / 其他；未知取值归为 other */
  type: z.enum(["usb", "bluetooth", "other"]).catch("other"),
});

export const listPortsResultSchema = z.object({
  ports: z.array(serialPortInfoSchema),
});

export type SerialPortInfo = z.infer<typeof serialPortInfoSchema>;
export type ListPortsResult = z.infer<typeof listPortsResultSchema>;

/** 版本检查状态事件 */
export interface UpdateEventParams {
  state: "checking" | "available" | "not-available" | "error";
  /** 新版本号（available 时携带） */
  version?: string;
  message?: string;
}

/** preload 通过 contextBridge 暴露给渲染进程的 API */
export interface ObdApi {
  connect(mode: "sim" | "real", options?: { port?: string; fault?: boolean }): Promise<unknown>;
  disconnect(): Promise<unknown>;
  subscribe(params: { pids: Pid[]; interval: number }): Promise<RpcEnvelope<SubscribeResult>>;
  unsubscribe(subId: number): Promise<unknown>;
  query(cmd: Command): Promise<unknown>;
  status(): Promise<unknown>;
  listPorts(): Promise<unknown>;
  onEvent(callback: (event: RpcEvent) => void): () => void;
  /** 立即重新加载界面（应对突发界面异常） */
  reloadUI(): Promise<unknown>;
  /** 打开 Chromium 开发者工具（独立窗口） */
  openDevTools(): Promise<unknown>;
  /** 检查是否有新版本（electron-updater，仅打包版本可用） */
  checkForUpdates(): Promise<unknown>;
  /** 订阅版本检查状态事件 */
  onUpdateEvent(callback: (event: UpdateEventParams) => void): () => void;
}
