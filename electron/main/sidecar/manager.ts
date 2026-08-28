import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { EventEmitter } from "node:events";
import { app } from "electron";
import log from "electron-log/main";
import { is } from "@electron-toolkit/utils";

import { SidecarRpc } from "./rpc";
import { parseListPortsOutput } from "./ports";
import { listPortsResultSchema, type ListPortsResult } from "../../../shared/obd";

/** 串口枚举超时（一次性拉起时需覆盖 PyInstaller 冷启动） */
const LIST_PORTS_TIMEOUT = 10000;

export interface SidecarLaunchOptions {
  mode: "sim" | "real";
  port?: string;
  fault?: boolean;
  drop?: number;
}

/**
 * 管理 sidecar 子进程生命周期：
 * - dev:  直接用 venv python 运行模块（sim 模式零依赖）
 * - prod: 运行 electron-builder extraResources 打包的独立可执行文件
 * - 崩溃自动重启（指数退避），退出码 0 表示正常退出不重启
 */
export class SidecarManager extends EventEmitter {
  readonly rpc = new SidecarRpc();
  private child: ChildProcess | null = null;
  private opts: SidecarLaunchOptions = { mode: "sim" };
  private stopping = false;
  private restartDelay = 1000;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private pingFailures = 0;

  /** 当前 sidecar 是否在运行 */
  get running(): boolean {
    return this.child !== null && !this.child.killed && this.child.exitCode === null;
  }

  start(opts: SidecarLaunchOptions): void {
    this.opts = opts;
    this.stopping = false;
    this.killChild();
    this.launch();
  }

  private killChild(): void {
    this.stopHeartbeat();
    this.rpc.detach();
    if (this.child && !this.child.killed) {
      this.child.kill();
    }
    this.child = null;
  }

  private launch(): void {
    if (this.stopping) return;
    const { command, args, cwd } = this.buildCommand();
    log.info(`[sidecar] launching: ${command} ${args.join(" ")} (cwd=${cwd})`);
    const child = spawn(command, args, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
      windowsHide: true,
    });
    this.child = child;
    this.rpc.removeAllListeners();
    this.rpc.attach(child);
    this.rpc.on("event", (event) => this.emit("event", event));
    this.rpc.on("exit", () => this.onExit());
    this.startHeartbeat();
  }

  private buildCommand(argv?: string[]): { command: string; args: string[]; cwd: string } {
    if (is.dev) {
      const sidecarDir = join(app.getAppPath(), "sidecar");
      const command = this.resolveDevPython(sidecarDir);
      const args = ["-m", "obd_sidecar.main", ...(argv ?? this.launchArgs())];
      return { command, args, cwd: sidecarDir };
    }
    // Windows 下 PyInstaller 产物带 .exe 后缀
    const binName = process.platform === "win32" ? "obd-sidecar.exe" : "obd-sidecar";
    const bin = app.isPackaged
      ? join(process.resourcesPath, binName)
      : join(app.getAppPath(), "resources", binName);
    return { command: bin, args: argv ?? this.launchArgs(), cwd: process.resourcesPath };
  }

  /** dev 模式解析 python：优先 sidecar venv，缺失时退回系统 python */
  private resolveDevPython(sidecarDir: string): string {
    const candidates =
      process.platform === "win32"
        ? [join(sidecarDir, ".venv/Scripts/python.exe"), join(sidecarDir, ".venv/bin/python.exe")]
        : [join(sidecarDir, ".venv/bin/python")];
    const found = candidates.find((candidate) => existsSync(candidate));
    if (found) return found;
    return process.platform === "win32" ? "python" : "python3";
  }

  /** 由当前启动选项拼出 sidecar 命令行参数 */
  private launchArgs(): string[] {
    const args = [this.opts.mode === "sim" ? "--sim" : ""];
    if (this.opts.mode === "real" && this.opts.port) args.push("--port", this.opts.port);
    if (this.opts.fault) args.push("--fault");
    if (this.opts.drop) args.push("--drop", String(this.opts.drop));
    return args.filter(Boolean);
  }

  /**
   * 枚举可用串口。sidecar 已在运行时走 RPC，否则一次性拉起 `--list-ports`
   * 子进程 —— 连接前没有常驻 sidecar，刷新串口不能依赖 RPC 通道。
   * @returns 串口列表
   */
  async listPorts(): Promise<ListPortsResult> {
    if (this.running) {
      const result = await this.rpc.send("list_ports", undefined, LIST_PORTS_TIMEOUT);
      return listPortsResultSchema.parse(result);
    }
    return this.listPortsOneShot();
  }

  /** 一次性子进程枚举串口：读完 stdout 即退出，不影响常驻 sidecar 生命周期 */
  private listPortsOneShot(): Promise<ListPortsResult> {
    return new Promise((resolve, reject) => {
      const { command, args, cwd } = this.buildCommand(["--list-ports"]);
      log.info(`[sidecar] list ports: ${command} ${args.join(" ")}`);
      const child = spawn(command, args, {
        cwd,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, PYTHONUNBUFFERED: "1" },
        windowsHide: true,
      });
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error("list ports timed out"));
      }, LIST_PORTS_TIMEOUT);
      child.stdout?.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr?.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.on("error", (err) => {
        clearTimeout(timer);
        reject(new Error(`failed to launch sidecar (${command}): ${err.message}`));
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          reject(new Error(`sidecar --list-ports exited with ${code}: ${stderr.trim()}`));
          return;
        }
        try {
          resolve(parseListPortsOutput(stdout));
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      });
    });
  }

  private onExit(): void {
    this.stopHeartbeat();
    if (this.stopping) {
      log.info("[sidecar] stopped");
      return;
    }
    log.warn(`[sidecar] exited, restarting in ${this.restartDelay}ms`);
    this.emit("restarting", this.restartDelay);
    setTimeout(() => {
      // 重试期间可能已被新的 start() 接管，避免双重拉起
      if (this.stopping || this.child) return;
      this.restartDelay = Math.min(this.restartDelay * 2, 15000);
      this.launch();
    }, this.restartDelay);
  }

  /** 心跳：连续 2 次 ping 失败视为假死，杀掉重启 */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.pingFailures = 0;
    this.heartbeatTimer = setInterval(() => {
      this.rpc
        .send("ping", undefined, 3000)
        .then(() => {
          this.pingFailures = 0;
          this.restartDelay = 1000;
        })
        .catch(() => {
          this.pingFailures += 1;
          log.warn(`[sidecar] heartbeat failed (${this.pingFailures})`);
          if (this.pingFailures >= 2 && this.child) {
            this.child.kill();
          }
        });
    }, 10000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  stop(): void {
    this.stopping = true;
    this.killChild();
  }
}
