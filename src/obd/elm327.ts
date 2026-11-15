import type { Pid } from "@shared/obd";

/**
 * ELM327 协议引擎（移植自 python-OBD 的核心逻辑，仅支持 ISO 15765-4 CAN 11bit 自动协议）。
 * 运行在 WebView 侧，同时接纳 Android 同步桥和 HarmonyOS 异步桥。
 */

/** 原生传输桥：异步传输不会占住 ArkWeb 的界面线程。 */
export interface TransportBridge {
  listPorts(): string | Promise<string>;
  open(type: string, target: string): boolean | Promise<boolean>;
  close(): void | Promise<void>;
  connected(): boolean | Promise<boolean>;
  write(line: string): void | Promise<void>;
  readLine(timeoutMs: number): string | Promise<string>;
}

/** PID -> 模式 01 请求字节 */
export const PID_BYTE: Partial<Record<Pid, number>> = {
  ENGINE_LOAD: 0x04,
  COOLANT_TEMP: 0x05,
  INTAKE_PRESSURE: 0x0b,
  RPM: 0x0c,
  SPEED: 0x0d,
  TIMING_ADVANCE: 0x0e,
  INTAKE_TEMP: 0x0f,
  MAF: 0x10,
  THROTTLE_POS: 0x11,
  RUN_TIME: 0x1f,
  FUEL_LEVEL: 0x2f,
  DISTANCE_SINCE_DTC_CLEAR: 0x31,
  BAROMETRIC_PRESSURE: 0x33,
  AMBIANT_AIR_TEMP: 0x46,
  FUEL_RATE: 0x5e,
};

export class Elm327Session {
  private bridge: TransportBridge;
  private elmVersion = "";
  private protocol = "";
  private commandQueue: Promise<unknown> = Promise.resolve();
  private disposed = false;

  /** @returns 使排队和执行中的请求失效，传输由宿主负责关闭 */
  dispose(): void {
    this.disposed = true;
  }

  constructor(bridge: TransportBridge) {
    this.bridge = bridge;
  }

  getElmVersion(): string {
    return this.elmVersion;
  }

  getProtocol(): string {
    return this.protocol;
  }

  /**
   * 发送 AT 初始化序列并探测协议。
   * @returns ECU 握手完成后兑现，失败时抛出错误码
   */
  async init(): Promise<void> {
    await this.command("ATZ", 1500);
    await this.command("ATE0", 1000);
    await this.command("ATL0", 1000);
    await this.command("ATH0", 1000);
    await this.command("ATSP0", 2000);
    const protoLines = await this.command("ATDP", 1500);
    this.protocol = protoLines.join(" ").trim();
    const versionLines = await this.command("ATI", 1000);
    this.elmVersion = versionLines.join(" ").trim();
    const support = await this.command("0100", 3000);
    if (!support.some((line) => /4100/i.test(line.replace(/\s/g, "")))) {
      throw new Error("ecuUnavailable");
    }
  }

  /** 轮询单个 PID，返回物理单位数值（失败为 null） */
  async queryPid(pid: Pid): Promise<number | null> {
    if (pid === "VOLTAGE") {
      return this.readVoltage();
    }
    const byte = PID_BYTE[pid];
    if (byte === undefined) return null;
    const cmd = `01${byte.toString(16).padStart(2, "0").toUpperCase()}`;
    const lines = await this.command(cmd, 2000);
    const data = this.extractPayload(lines);
    if (data.length < 3 || data[0] !== 0x41 || data[1] !== byte) return null;
    return this.decodePid(pid, data.slice(2));
  }

  /** 读取电瓶电压（AT RV），失败为 null */
  async readVoltage(): Promise<number | null> {
    const lines = await this.command("ATRV", 1500);
    const m = lines.join(" ").match(/(\d+\.?\d*)\s*V?/i);
    return m ? parseFloat(m[1]) : null;
  }

  /** 读取故障码列表（模式 03），无故障返回空数组，失败返回 null */
  async queryDtc(): Promise<string[] | null> {
    const lines = await this.command("03", 3000);
    const payload = this.extractPayload(lines);
    if (payload.length === 0) return null;
    if (payload[0] !== 0x43) return [];
    const dtcs: string[] = [];
    const letters = ["P", "C", "B", "U"];
    // 可选的第 2 字节为 DTC 计数（<=0x0F 时跳过）
    let i = payload.length > 4 && payload[1] <= 0x0f ? 2 : 1;
    for (; i + 1 < payload.length; i += 2) {
      const b0 = payload[i];
      const b1 = payload[i + 1];
      if (b0 === 0 && b1 === 0) break;
      const letter = letters[(b0 & 0xc0) >> 6];
      const num = ((b0 & 0x3f) << 8) | b1;
      dtcs.push(`${letter}${num.toString(16).toUpperCase().padStart(4, "0")}`);
    }
    return dtcs;
  }

  /** 清除故障码（模式 04） */
  async clearDtc(): Promise<boolean> {
    const lines = await this.command("04", 3000);
    const payload = this.extractPayload(lines);
    return payload[0] === 0x44 || lines.some((l) => /OK/i.test(l));
  }

  /** 读取 VIN（模式 09 PID 02，支持多帧拼接） */
  async queryVin(): Promise<string | null> {
    const lines = await this.command("0902", 4000);
    const payload = this.extractPayload(lines);
    let asciiStart = -1;
    for (let i = 0; i + 2 < payload.length; i++) {
      if (payload[i] === 0x49 && payload[i + 1] === 0x02 && payload[i + 2] === 0x01) {
        asciiStart = i + 3;
        break;
      }
    }
    if (asciiStart < 0) return null;
    const chars = payload
      .slice(asciiStart)
      .map((b) => String.fromCharCode(b))
      .join("")
      .replace(/\0/g, "");
    return chars.slice(0, 17) || null;
  }

  /**
   * 串行发送整条命令，避免异步轮询和诊断互相消费响应。
   * @param cmd - ELM327 命令
   * @param timeoutMs - 单条命令超时毫秒数
   * @returns 去除回显与提示符的响应行
   */
  private command(cmd: string, timeoutMs: number): Promise<string[]> {
    const result = this.commandQueue.then(() => this.exchange(cmd, timeoutMs));
    this.commandQueue = result.catch(() => undefined);
    return result;
  }

  /**
   * 完成一次读写；缺少提示符时关闭传输，避免下一条命令读取迟到的响应。
   * @param cmd - ELM327 命令
   * @param timeoutMs - 响应截止时间
   * @returns 完整响应行
   */
  private async exchange(cmd: string, timeoutMs: number): Promise<string[]> {
    if (this.disposed) throw new Error("cancelled");
    await this.bridge.write(cmd);
    if (this.disposed) throw new Error("cancelled");
    const lines: string[] = [];
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (this.disposed) throw new Error("cancelled");
      const raw = await this.bridge.readLine(Math.min(120, deadline - Date.now()));
      if (this.disposed) throw new Error("cancelled");
      const prompt = raw.includes(">");
      const line = raw.replace(/>/g, "").trim();
      if (line && line !== cmd && !/^(SEARCHING|BUS INIT|STOPPED)/i.test(line)) {
        lines.push(line);
      }
      if (prompt) return lines;
      // 同步桥可能立即返回空行，主动让出事件循环，异步桥也共享此退让路径。
      if (!raw) await new Promise((resolve) => setTimeout(resolve, 5));
    }
    this.disposed = true;
    await this.bridge.close();
    throw new Error("commandTimeout");
  }

  /** 合并响应行为字节载荷：剥离 CAN 序号前缀 / 多帧头（10/21） */
  private extractPayload(lines: string[]): number[] {
    const bytes: number[] = [];
    let first = true;
    for (const line of lines) {
      if (/^(CAN ERROR|UNABLE TO CONNECT|NO DATA)/i.test(line)) continue;
      const tokens = line
        .replace(/^\d+:\s*/, "")
        .split(/[^0-9A-Fa-f]+/)
        .filter((t) => /^[0-9A-Fa-f]{2}$/.test(t));
      if (tokens.length === 0) continue;
      if (first) {
        const firstToken = tokens[0].toUpperCase();
        if (firstToken === "10") {
          // 多帧首帧：去掉类型与总长度
          tokens.splice(0, 2);
        } else if (/^2[0-9A-F]$/i.test(firstToken) || /^1[0-9A-F]$/i.test(firstToken)) {
          tokens.shift();
        } else if (!/^(41|43|44|49|62|61|7[0-9A-F]{2})$/.test(firstToken)) {
          tokens.shift();
        }
        first = false;
      } else {
        if (/^2[0-9A-F]$/i.test(tokens[0]) || /^1[0-9A-F]$/i.test(tokens[0])) {
          tokens.shift();
        }
      }
      for (const t of tokens) {
        bytes.push(parseInt(t, 16));
      }
    }
    return bytes;
  }

  /** PID 物理单位解码（公式与 python-OBD 对齐） */
  private decodePid(pid: Pid, data: number[]): number | null {
    const d = (i: number): number => (i < data.length ? data[i] : 0);
    switch (pid) {
      case "RPM":
        return (d(0) * 256 + d(1)) / 4;
      case "SPEED":
        return d(0);
      case "COOLANT_TEMP":
        return d(0) - 40;
      case "ENGINE_LOAD":
        return (d(0) * 100) / 255;
      case "MAF":
        return (d(0) * 256 + d(1)) / 100;
      case "THROTTLE_POS":
        return (d(0) * 100) / 255;
      case "FUEL_LEVEL":
        return (d(0) * 100) / 255;
      case "INTAKE_TEMP":
        return d(0) - 40;
      case "INTAKE_PRESSURE":
        return d(0);
      case "FUEL_RATE":
        return (d(0) * 256 + d(1)) * 0.05;
      case "BAROMETRIC_PRESSURE":
        return d(0);
      case "AMBIANT_AIR_TEMP":
        return d(0) - 40;
      case "RUN_TIME":
        return d(0) * 256 + d(1);
      case "TIMING_ADVANCE":
        return d(0) / 2 - 64;
      case "DISTANCE_SINCE_DTC_CLEAR":
        return d(0) * 256 + d(1);
      default:
        return null;
    }
  }
}
