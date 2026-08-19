import type { Pid } from "@shared/obd";

/**
 * ELM327 协议引擎（移植自 python-OBD 的核心逻辑，仅支持 ISO 15765-4 CAN 11bit 自动协议）。
 * 运行在 WebView 侧，通过原生传输桥（window.androidObd）读写蓝牙/USB/TCP 字节流。
 */

/** 原生传输桥接口（window.androidObd） */
export interface TransportBridge {
  listPorts(): string;
  open(type: string, target: string): boolean;
  close(): void;
  connected(): boolean;
  write(line: string): void;
  readLine(timeoutMs: number): string;
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

  constructor(bridge: TransportBridge) {
    this.bridge = bridge;
  }

  getElmVersion(): string {
    return this.elmVersion;
  }

  getProtocol(): string {
    return this.protocol;
  }

  /** 发送 AT 初始化序列并探测协议（失败抛错） */
  init(): void {
    // 清空历史缓冲，随后进入初始化序列
    this.command("ATZ", 1500);
    this.command("ATE0", 1000);
    this.command("ATL0", 1000);
    this.command("ATH0", 1000);
    this.command("ATSP0", 2000);
    const protoLines = this.command("ATDP", 1500);
    this.protocol = protoLines.join(" ").trim();
    const versionLines = this.command("ATI", 1000);
    this.elmVersion = versionLines.join(" ").trim();
    // 模式 01 PID 支持列表：确认与 ECU 建立通信
    const support = this.command("0100", 3000);
    if (!support.some((l) => /41\s+00/i.test(l))) {
      throw new Error("无法与 ECU 建立通信（检查点火开关与线束）");
    }
  }

  /** 轮询单个 PID，返回物理单位数值（失败为 null） */
  queryPid(pid: Pid): number | null {
    if (pid === "VOLTAGE") {
      return this.readVoltage();
    }
    const byte = PID_BYTE[pid];
    if (byte === undefined) return null;
    const cmd = `01${byte.toString(16).padStart(2, "0").toUpperCase()}`;
    const lines = this.command(cmd, 2000);
    const data = this.extractPayload(lines);
    if (data.length < 3 || data[0] !== 0x41 || data[1] !== byte) return null;
    return this.decodePid(pid, data.slice(2));
  }

  /** 读取电瓶电压（AT RV），失败为 null */
  readVoltage(): number | null {
    const lines = this.command("ATRV", 1500);
    const m = lines.join(" ").match(/(\d+\.?\d*)\s*V?/i);
    return m ? parseFloat(m[1]) : null;
  }

  /** 读取故障码列表（模式 03），无故障返回空数组，失败返回 null */
  queryDtc(): string[] | null {
    const lines = this.command("03", 3000);
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
      dtcs.push(`${letter}${String(num).padStart(4, "0")}`);
    }
    return dtcs;
  }

  /** 清除故障码（模式 04） */
  clearDtc(): boolean {
    const lines = this.command("04", 3000);
    const payload = this.extractPayload(lines);
    return payload[0] === 0x44 || lines.some((l) => /OK/i.test(l));
  }

  /** 读取 VIN（模式 09 PID 02，支持多帧拼接） */
  queryVin(): string | null {
    const lines = this.command("0902", 4000);
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

  /** 发送命令并收集响应行（读至 ">" 提示符或超时） */
  private command(cmd: string, timeoutMs: number): string[] {
    this.bridge.write(cmd);
    const lines: string[] = [];
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const raw = this.bridge.readLine(120);
      if (!raw) continue;
      const line = raw.trim();
      if (!line) continue;
      if (line === ">") break;
      // 忽略连接过程噪声与常见提示行
      if (/^(SEARCHING|BUS INIT|STOPPED|CAN ERROR|NO DATA|UNABLE TO CONNECT)/i.test(line)) {
        if (/CAN ERROR|UNABLE TO CONNECT|NO DATA/i.test(line)) {
          lines.push(line);
        }
        continue;
      }
      lines.push(line);
    }
    return lines;
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
