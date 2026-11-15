import { connection, socket } from "@kit.NetworkKit";
import { BusinessError } from "@kit.BasicServicesKit";
import { LineReader } from "./LineReader";
import {
  CONNECT_TIMEOUT_MS,
  MAX_BUFFER_BYTES,
  WRITE_TIMEOUT_MS,
  TcpTarget,
  encodeLine,
  parseTarget,
} from "./Protocol";

/**
 * @param operation - 已启动的异步操作。
 * @param timeoutMs - 最长等待时间。
 * @param code - 超时错误码。
 * @returns 在限定时间内返回的操作结果。
 */
async function withTimeout<T>(operation: Promise<T>, timeoutMs: number, code: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer: number = setTimeout(() => reject(new Error(code)), timeoutMs);
    operation.then((value: T) => {
      clearTimeout(timer);
      resolve(value);
    }, (error: Error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

export class TcpTransport {
  private tcp: socket.TCPSocket | undefined = undefined;
  private reader: LineReader = new LineReader();
  private connected: boolean = false;
  private opening: boolean = false;
  private writing: socket.TCPSocket | undefined = undefined;
  private generation: number = 0;
  private disconnected: () => void;

  /**
   * @param disconnected - 非主动断开的通知。
   */
  constructor(disconnected: () => void) {
    this.disconnected = disconnected;
  }

  /** @returns 是否存在正在连接或已连接的 socket。 */
  hasSession(): boolean {
    return this.tcp !== undefined || this.opening;
  }

  /**
   * @param target - host:port 或 [IPv6]:port。
   * @returns 连接成功时返回 true。
   */
  async open(target: string): Promise<boolean> {
    const address: TcpTarget = parseTarget(target);
    if (this.opening) {
      throw new Error("CONNECT_IN_PROGRESS");
    }
    const closing: Promise<void> = this.close();
    const generation: number = this.generation;
    this.opening = true;
    try {
      await closing;
      if (this.generation !== generation) {
        throw new Error("DISCONNECTED");
      }
      const tcp: socket.TCPSocket = socket.constructTCPSocketInstance();
      this.tcp = tcp;
      this.installListeners(tcp);
      await withTimeout(this.connect(tcp, address, generation), CONNECT_TIMEOUT_MS,
        "TCP_CONNECT_FAILED");
      this.assertCurrent(tcp, generation);
      this.connected = true;
      return true;
    } catch (_) {
      if (this.generation === generation) {
        await this.closeQuietly();
        throw new Error("TCP_CONNECT_FAILED");
      }
      throw new Error("DISCONNECTED");
    } finally {
      if (this.generation === generation) {
        this.opening = false;
      }
    }
  }

  /**
   * @param line - 不含回车和换行的 ELM327 命令。
   * @returns 写入完成。
   */
  async write(line: string): Promise<void> {
    const data: string = encodeLine(line);
    const tcp: socket.TCPSocket = this.requireConnected();
    if (this.writing !== undefined) {
      throw new Error("WRITE_IN_PROGRESS");
    }
    this.writing = tcp;
    const generation: number = this.generation;
    try {
      await withTimeout(tcp.send({ data: data }), WRITE_TIMEOUT_MS, "WRITE_TIMEOUT");
      this.assertCurrent(tcp, generation);
    } catch (error) {
      if (this.tcp === tcp) {
        this.fail(tcp, "DISCONNECTED");
        const code: string = (error as Error).message;
        throw new Error(code === "WRITE_TIMEOUT" ? code : "TCP_WRITE_FAILED");
      }
      throw new Error("DISCONNECTED");
    } finally {
      if (this.writing === tcp) {
        this.writing = undefined;
      }
    }
  }

  /**
   * @param timeoutMs - 单次读取最长等待时间。
   * @returns 一行数据、提示符或超时空字符串。
   */
  readLine(timeoutMs: number): Promise<string> {
    this.requireConnected();
    return this.reader.read(timeoutMs);
  }

  /**
   * @param reason - 结束挂起读取的错误码。
   * @returns socket 关闭完成；重复关闭保持幂等。
   */
  async close(reason: string = "DISCONNECTED"): Promise<void> {
    const tcp: socket.TCPSocket | undefined = this.tcp;
    this.tcp = undefined;
    this.generation += 1;
    this.connected = false;
    this.opening = false;
    this.writing = undefined;
    this.reader.reset(reason);
    if (tcp === undefined) {
      return;
    }
    tcp.off("message");
    tcp.off("close");
    tcp.off("error");
    try {
      await withTimeout(tcp.close(), 1000, "TCP_CLOSE_FAILED");
    } catch (_) {
      throw new Error("TCP_CLOSE_FAILED");
    }
  }

  /**
   * @param tcp - 本次连接的 socket。
   * @param target - 经校验的目标。
   * @param generation - 创建连接时的代次。
   * @returns 连接完成。
   */
  private async connect(tcp: socket.TCPSocket, target: TcpTarget,
    generation: number): Promise<void> {
    let address: string = target.address;
    let family: number = target.family;
    if (family === 1 && !/^\d+\.\d+\.\d+\.\d+$/.test(address)) {
      const addresses: connection.NetAddress[] = await connection.getAddressesByName(address);
      if (addresses.length === 0) {
        throw new Error("TCP_CONNECT_FAILED");
      }
      const selected: connection.NetAddress = addresses.find((item: connection.NetAddress) =>
        item.family !== 2) || addresses[0];
      address = selected.address;
      family = selected.family === 2 ? 2 : 1;
    }
    this.assertCurrent(tcp, generation);
    await tcp.bind({ address: family === 2 ? "::" : "0.0.0.0", port: 0, family: family });
    this.assertCurrent(tcp, generation);
    await tcp.connect({
      address: { address: address, port: target.port, family: family },
      timeout: CONNECT_TIMEOUT_MS,
    });
  }

  /**
   * @param tcp - 要监听的 socket。
   * @returns 无。
   */
  private installListeners(tcp: socket.TCPSocket): void {
    tcp.on("message", (message: socket.SocketMessageInfo) => {
      if (this.tcp !== tcp) {
        return;
      }
      if (message.message.byteLength > MAX_BUFFER_BYTES) {
        this.fail(tcp, "BUFFER_OVERFLOW");
        return;
      }
      const bytes: Uint8Array = new Uint8Array(message.message);
      let text: string = "";
      for (let index: number = 0; index < bytes.length; index += 1) {
        text += String.fromCharCode(bytes[index]);
      }
      try {
        this.reader.append(text);
      } catch (_) {
        this.fail(tcp, "BUFFER_OVERFLOW");
      }
    });
    tcp.on("close", () => this.fail(tcp, "DISCONNECTED"));
    tcp.on("error", (_error: BusinessError) => this.fail(tcp, "DISCONNECTED"));
  }

  /**
   * @param tcp - 产生故障的 socket。
   * @param reason - 挂起读取的失败码。
   * @returns 无。
   */
  private fail(tcp: socket.TCPSocket, reason: string): void {
    if (this.tcp !== tcp) {
      return;
    }
    this.closeQuietly(reason);
    this.disconnected();
  }

  /**
   * @param reason - 挂起读取的失败码。
   * @returns 清理完成，清理错误只记录固定错误码。
   */
  private async closeQuietly(reason: string = "DISCONNECTED"): Promise<void> {
    try {
      await this.close(reason);
    } catch (_) {
      console.warn("OpenRoadScope: TCP_CLOSE_FAILED");
    }
  }

  /** @returns 已连接的 socket。 */
  private requireConnected(): socket.TCPSocket {
    if (!this.connected || this.tcp === undefined) {
      throw new Error("NOT_CONNECTED");
    }
    return this.tcp;
  }

  /**
   * @param tcp - 预期仍然有效的 socket。
   * @param generation - 预期代次。
   * @returns 无。
   */
  private assertCurrent(tcp: socket.TCPSocket, generation: number): void {
    if (this.tcp !== tcp || this.generation !== generation) {
      throw new Error("DISCONNECTED");
    }
  }
}
